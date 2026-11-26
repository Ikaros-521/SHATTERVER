/**
 * The WeChat mini-game channel: the leaderboard behind the screen when the game runs as a 微信小游戏.
 * The third sibling of `cloud.ts` (CheddaBoards) and `toychannel.ts` (B站 Toy), shaped by what the
 * platform provides:
 *
 * - **Identity is a silent openid.** The cloud function reads `OPENID` from the call context — no
 *   login dialog, and no nickname either (`wx.getUserProfile` is too locked down to rely on), so
 *   the player types a name and this channel owns the whole rename flow, Chinese included.
 * - **The backend is ours.** 微信云开发 (cloud functions + database) answers through
 *   `wx.cloud.callFunction`, which rides WeChat's internal channel and therefore needs no ICP-filed
 *   request domain — the reason CheddaBoards cannot be reused here: `api.cheddaboards.com` can
 *   never enter the request whitelist. The contract lives in `docs/wechat-cloud-leaderboard.md`
 *   and its reference implementation in `wechat/cloudfunctions/board`.
 * - **Scores are raw.** The database is ours; there is no Toy-style 16 777 215 ceiling, so no
 *   `clampToyScore` compression anywhere on this path.
 *
 * Compile-time gating: the whole module is reachable only under `__WECHAT__` (see
 * `net/wxglobal.d.ts`); web and Toy builds tree-shake it away together with the `wx` references.
 */

import { t } from '../core/i18n';
import type { RunRecord } from '../core/storage';
import { wxStorageRead, wxStorageWrite } from '../core/wxstorage';
import type { BoardEntry, BoardInfo, BoardView, PlayerRank } from './cheddaboards';
import type { CloudOutcome, NicknameOutcome } from './cloud';
import { FANOUT_BOARDS } from './cloud';
import type { Leaderboard } from './leaderboard';
import { cleanNickname, isBlockedName, isReservedName } from './nickname';

/** How long a board read is reused; matches the other two channels (reads cost cloud quota). */
const BOARD_TTL_MS = 30_000;
/** How long one cloud call may take before it is given up on as an ordinary failure. */
const CALL_TIMEOUT_MS = 8_000;

/** The cloud function's name, as deployed from `wechat/cloudfunctions/board`. */
const BOARD_FUNCTION = 'board';

/**
 * True when the game runs inside the WeChat mini-game runtime. That runtime has no `location` and
 * no document; its `wx` global is the fingerprint. `typeof wx` is the only safe probe — a bare
 * reference would throw wherever `wx` is undeclared — and `wx.cloud` must exist for this channel
 * to work at all.
 */
export function isWeChatRuntime(): boolean {
  return typeof wx !== 'undefined' && typeof wx.cloud !== 'undefined';
}
/** Where the manually entered nickname and its sync state survive between sessions. */
const NICKNAME_KEY = 'shatterverse.wx.nickname';

/**
 * What the device remembers about the player's chosen name. `pending` means the name has not been
 * accepted by the server yet — either never submitted, or waiting on the first scored run — and
 * must ride the next submit. Without persisting this flag, a restart could not tell "chose a
 * name, never scored" from "scored already" and would get the submit payload wrong.
 */
export interface StoredIdentity {
  nickname: string;
  pending: boolean;
}

/** Reads back the stored identity document, treating anything malformed as "no name yet". */
export function parseIdentity(raw: string | null): StoredIdentity {
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<StoredIdentity>;
      if (typeof parsed.nickname === 'string' && typeof parsed.pending === 'boolean') {
        return { nickname: parsed.nickname, pending: parsed.pending };
      }
    } catch {
      // Not a document — fall through to the fresh state.
    }
  }
  return { nickname: '', pending: true };
}

/** WeChat nicknames are free-script; length is the only hard bound. */
export const WX_NICKNAME_MIN = 2;
export const WX_NICKNAME_MAX = 12;

/**
 * The cloud environment id. Empty means the account's default environment — enough for a single
 * game on a single account, which is exactly the plan (one free environment per account). A fork
 * with its own environment overrides it at build time with `VITE_WX_CLOUD_ENV`.
 */
const env = (import.meta as { env?: Record<string, string | undefined> }).env ?? {};
const WX_CLOUD_ENV = env.VITE_WX_CLOUD_ENV ?? '';

/** Boards on the server; the tab ids stay the Chedda ones so the shared UI works verbatim. */
type WxBoard = 'overall' | 'endless' | 'campaign' | 'abyss';

function boardForTab(tab: string): WxBoard | null {
  switch (tab) {
    case 'all-time':
    case 'weekly':
    case 'daily':
      return 'overall';
    case 'mode-endless':
      return 'endless';
    case 'mode-campaign':
      return 'campaign';
    case 'diff-abyss':
      return 'abyss';
    default:
      return null;
  }
}

/** Which slice of time a tab reads; the server derives the concrete week/day from its own clock. */
function windowForTab(tab: string): 'all' | 'week' | 'day' {
  if (tab === 'weekly') return 'week';
  if (tab === 'daily') return 'day';
  return 'all';
}

function modeTab(mode: RunRecord['mode']): string {
  return mode === 'campaign' ? 'mode-campaign' : 'mode-endless';
}

/** Tabs beyond the fan-out trio, in display order. Ids keep the Chedda naming for the shared UI. */
const CATEGORY_TABS: readonly BoardInfo[] = [
  { scoreboardId: 'mode-endless', name: '无尽榜' },
  { scoreboardId: 'mode-campaign', name: '战役榜' },
  { scoreboardId: 'diff-abyss', name: '深渊榜' },
];

/** The server's failure vocabulary, as this game words it. Never a thrown error. */
function submitFailureMessage(reason: string): string {
  if (reason === 'rate-limited') return t('net.scoreRateLimited');
  if (reason === 'invalid') return t('net.scoreRejected');
  if (reason === 'offline' || reason === 'timeout') return t('net.scoreOffline');
  return t('net.scoreFailed');
}

function renameFailureMessage(reason: string): string {
  if (reason === 'rate-limited') return t('net.renameRateLimited');
  if (reason === 'offline' || reason === 'timeout') return t('net.renameOffline');
  return t('net.renameFailed', { error: reason });
}

// ───────────────────────────── host data coercion ─────────────────────────────

/** One `list` entry from the server, or null when it is not shaped like an entry. */
function coerceEntry(raw: unknown, index: number): BoardEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const e = raw as { rank?: unknown; nickname?: unknown; score?: unknown; streak?: unknown };
  if (typeof e.nickname !== 'string' || typeof e.score !== 'number' || !Number.isFinite(e.score)) {
    return null;
  }
  return {
    rank: typeof e.rank === 'number' && e.rank > 0 ? Math.floor(e.rank) : index + 1,
    nickname: e.nickname.slice(0, WX_NICKNAME_MAX),
    score: Math.max(0, Math.round(e.score)),
    streak: typeof e.streak === 'number' && Number.isFinite(e.streak) ? Math.max(0, Math.round(e.streak)) : 0,
  };
}

/** A whole `list` answer as a `BoardView`, or null when the payload is not one. Exported for tests. */
export function coerceBoardView(scoreboardId: string, raw: unknown): BoardView | null {
  if (!raw || typeof raw !== 'object') return null;
  const shaped = raw as { entries?: unknown; total?: unknown };
  if (!Array.isArray(shaped.entries)) return null;
  const entries: BoardEntry[] = [];
  for (const item of shaped.entries) {
    const entry = coerceEntry(item, entries.length);
    if (entry) entries.push(entry);
  }
  return {
    scoreboardId,
    entries,
    ...(Number.isFinite(shaped.total) ? { totalEntries: Math.max(0, shaped.total as number) } : {}),
  };
}

// ───────────────────────────── nickname policy ─────────────────────────────

/**
 * The WeChat nickname check. Same two layers as `checkNickname`, minus the ASCII-only rule (the
 * database takes any script): fold invisibles, bound the length, then the shared blocklist and
 * reserved-name rules — which fold to ASCII letters, so a Chinese name reduces to nothing there
 * and passes unless its Latin part trips a term. Messages reuse the existing four-language keys;
 * the length message interpolates this channel's own bounds.
 */
export function checkWeChatNickname(
  raw: string,
): { ok: true; value: string } | { ok: false; message: string } {
  const value = cleanNickname(raw);
  if (value.length === 0) return { ok: false, message: t('net.nickEmpty') };
  if (value.length < WX_NICKNAME_MIN || value.length > WX_NICKNAME_MAX) {
    return { ok: false, message: t('net.nickLength', { min: WX_NICKNAME_MIN, max: WX_NICKNAME_MAX }) };
  }
  if (isBlockedName(value)) return { ok: false, message: t('net.nickBlocked') };
  if (isReservedName(value)) return { ok: false, message: t('net.nickReserved') };
  return { ok: true, value };
}

// ───────────────────────────── the channel ─────────────────────────────

/** The slice of the wx runtime this channel touches; injected so tests need no globals. */
export interface WeChatChannelDeps {
  /** One cloud call: an action plus its data. Defaults to the real `wx.cloud` path. */
  call?: (action: string, data: Record<string, unknown>) => Promise<unknown>;
  /** Identity persistence; defaults to wx sync storage as one JSON document. */
  readIdentity?: () => StoredIdentity | null;
  writeIdentity?: (identity: StoredIdentity) => void;
  now?: () => number;
}

export class WeChatChannel implements Leaderboard {
  readonly kind = 'wechat' as const;
  /** Not a real id — the openid never leaves the server side of the cloud call. */
  readonly playerId = 'wechat';
  /** The manually entered nickname; empty until the player picks one. */
  nickname: string;

  private readonly call: (action: string, data: Record<string, unknown>) => Promise<unknown>;
  private readonly readIdentity: () => StoredIdentity | null;
  private readonly writeIdentity: (identity: StoredIdentity) => void;
  private readonly now: () => number;
  /** True until a score has accepted the chosen name — it rides along with that first submit. */
  private pending: boolean;
  private readonly cache = new Map<string, { at: number; view: BoardView }>();
  private rankCache: { at: number; value: PlayerRank | null } | null = null;
  private rankInflight: Promise<PlayerRank | null> | null = null;

  constructor(deps: WeChatChannelDeps = {}) {
    this.call = deps.call ?? defaultCloudCall;
    this.readIdentity = deps.readIdentity ?? (() => parseIdentity(wxStorageRead(NICKNAME_KEY)));
    this.writeIdentity =
      deps.writeIdentity ?? ((identity) => wxStorageWrite(NICKNAME_KEY, JSON.stringify(identity)));
    this.now = deps.now ?? (() => Date.now());
    const stored = this.readIdentity();
    this.nickname = stored?.nickname ?? '';
    this.pending = stored?.pending ?? true;
  }

  /** Writes the current nickname and sync state through the injected/storage path. */
  private remember(): void {
    this.writeIdentity({ nickname: this.nickname, pending: this.pending });
  }

  // ───────────────────────────── run lifecycle ─────────────────────────────

  beginRun(): void {} // No session concept: the cloud function rate-limits by openid instead.
  abandonRun(): void {}

  // ───────────────────────────── identity ─────────────────────────────

  get nicknamePending(): boolean {
    return this.pending;
  }

  /**
   * Sets the manually entered nickname. The name is stored on this device now and sent with the
   * next submit (a rename before any score) — or immediately, by the server rewriting the player's
   * existing documents, once a score has landed before.
   */
  async rename(raw: string): Promise<NicknameOutcome> {
    const check = checkWeChatNickname(raw);
    if (!check.ok)
      return { ok: false, nickname: this.nickname, pending: this.pending, message: check.message };

    const applied: string = check.value;
    const previous = this.nickname;
    this.nickname = applied;
    this.remember();
    let message = this.pending
      ? t('net.renamePending', { name: applied })
      : t('net.renameApplied', { name: applied });
    let ok = true;
    if (!this.pending) {
      // A score already exists on the server: rewrite its documents so the board shows the new
      // name now, not after the next run. A refusal rolls the local name back — with no pending
      // flag left, a later submit would stop carrying the name, and the board would keep the old
      // one forever. The player retries a failed rename the same way they typed it.
      const result = await this.invoke('rename', { nickname: applied });
      if (result.ok === false) {
        const reason = typeof result.reason === 'string' ? result.reason : 'error';
        ok = false;
        message = renameFailureMessage(reason);
        this.nickname = previous;
        this.remember();
      }
    }
    return { ok, nickname: this.nickname, pending: this.pending, message };
  }

  // ───────────────────────────── submission ─────────────────────────────

  /**
   * Reports a finished run: one cloud call. The server fans the score out to the overall board's
   * three time windows plus the mode and abyss boards, all keep-best, and answers with the
   * overall/all rank. Never throws.
   */
  async finishRun(record: RunRecord): Promise<CloudOutcome> {
    const score = Math.max(0, Math.round(record.score));
    if (score <= 0) return { ok: false, message: t('net.scoreZero'), boards: [] };

    const result = await this.invoke('submit', {
      score,
      streak: Math.max(0, Math.round(record.combo)),
      mode: record.mode,
      difficulty: record.difficulty,
      ...(this.nickname && this.pending ? { nickname: this.nickname } : {}),
    });
    this.invalidate();
    if (result.ok === false) {
      const reason = typeof result.reason === 'string' ? result.reason : 'error';
      return { ok: false, message: submitFailureMessage(reason), boards: [] };
    }

    this.pending = false;
    const rank = typeof result.rank === 'number' && result.rank > 0 ? result.rank : null;
    const total = typeof result.total === 'number' && result.total >= 0 ? result.total : 0;
    return {
      ok: true,
      message: rank !== null ? t('net.uploadedRank', { rank, total }) : t('net.uploaded'),
      boards: ['all-time', 'weekly', 'daily', modeTab(record.mode)],
      ...(record.difficulty === 'abyss'
        ? { boards: ['all-time', 'weekly', 'daily', modeTab(record.mode), 'diff-abyss'] }
        : {}),
      ...(rank !== null ? { rank: { rank, total } } : {}),
    };
  }

  // ───────────────────────────── reads for the UI ─────────────────────────────

  /** Every tab this channel serves; the ids are the ones the shared screen already knows. */
  async knownBoards(): Promise<BoardInfo[]> {
    return [...FANOUT_BOARDS, ...CATEGORY_TABS];
  }

  /** A tab's entries, from a 30-second cache. Null when unreadable — never an exception. */
  async board(scoreboardId: string, limit = 100): Promise<BoardView | null> {
    const board = boardForTab(scoreboardId);
    if (board === null) return null;
    const cached = this.cache.get(scoreboardId);
    if (cached && this.now() - cached.at < BOARD_TTL_MS) return cached.view;

    const result = await this.invoke('list', {
      board,
      window: windowForTab(scoreboardId),
      limit: Math.min(50, Math.max(1, limit)),
    });
    if (result.ok === false) return cached?.view ?? null;
    const view = coerceBoardView(scoreboardId, result);
    if (view) this.cache.set(scoreboardId, { at: this.now(), view });
    return view ?? cached?.view ?? null;
  }

  /**
   * This player's position on the overall board, from a 30-second cache so repeated panel opens
   * spend one cloud call, not two.
   */
  async myRank(): Promise<PlayerRank | null> {
    const cached = this.rankCache;
    if (cached && this.now() - cached.at < BOARD_TTL_MS) return cached.value;
    if (this.rankInflight) return this.rankInflight;
    this.rankInflight = this.readMyRank().finally(() => {
      this.rankInflight = null;
    });
    return this.rankInflight;
  }

  private async readMyRank(): Promise<PlayerRank | null> {
    const result = await this.invoke('myRank', { board: 'overall', window: 'all' });
    if (result.ok === false) return null;
    if (result.ranked !== true || typeof result.score !== 'number') return null;
    const value: PlayerRank = {
      rank: typeof result.rank === 'number' && result.rank > 0 ? result.rank : 0,
      score: Math.max(0, Math.round(result.score)),
      streak: 0, // The rank line shows none; the streak lives on the board rows.
      totalPlayers: typeof result.total === 'number' ? result.total : 0,
    };
    this.rankCache = { at: this.now(), value };
    return value;
  }

  /** Forgets cached reads, so opening the leaderboard always shows the latest submit. */
  invalidate(): void {
    this.cache.clear();
    this.rankCache = null;
    this.rankInflight = null;
  }

  // ───────────────────────────── transport ─────────────────────────────

  /**
   * One call, with the failure envelope folded: every server answer and every transport failure
   * (timeout included) resolves to a plain object the callers above already know how to word.
   */
  private async invoke(
    action: string,
    data: Record<string, unknown>,
  ): Promise<Record<string, unknown> & { ok?: boolean | undefined; reason?: string }> {
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      const raw = await Promise.race([
        this.call(action, data),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error('timeout')), CALL_TIMEOUT_MS);
        }),
      ]);
      if (raw && typeof raw === 'object') return raw as Record<string, unknown>;
      return { ok: false, reason: 'invalid' };
    } catch {
      return { ok: false, reason: 'offline' };
    } finally {
      if (timer !== null) clearTimeout(timer);
    }
  }
}

/** wx.cloud is initialized at most once, on the first call that needs it. */
let cloudReady = false;

/** The real transport: `wx.cloud.callFunction` against the `board` function. */
async function defaultCloudCall(action: string, data: Record<string, unknown>): Promise<unknown> {
  if (!wx.cloud) throw new Error('wx.cloud unavailable');
  if (!cloudReady) {
    wx.cloud.init(WX_CLOUD_ENV.length > 0 ? { env: WX_CLOUD_ENV } : undefined);
    cloudReady = true;
  }
  const response = await wx.cloud.callFunction({ name: BOARD_FUNCTION, data: { action, ...data } });
  return response.result;
}

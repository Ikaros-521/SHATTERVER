/**
 * The B站 Toy channel: the game-facing leaderboard service behind the screen when the game runs
 * as a Bilibili Toy. The counterpart of `cloud.ts`, deliberately much smaller, because most of
 * what `Cloud` does here has a platform answer:
 *
 * - **Identity** is the B站 account (`getUserProfile`), so there is no rename flow, no pending
 *   state and no local identity file. Chinese nicknames work because they are the platform's own.
 * - **Sessions** do not exist — the platform validates submits server-side — so `beginRun` and
 *   `abandonRun` are no-ops.
 * - **Board slots** are the five numbered boards of {@link TOY_BOARDS}; the fan-out trio rides
 *   board 1's free `period` parameter, so the screen's tabs keep their Chedda ids and the UI code
 *   is shared verbatim.
 *
 * One thing this channel adds that Chedda does not have: a read-only mirror of the CheddaBoards
 * global board (the「全球榜」tab). The service echoes any Origin in CORS — verified — so a Toy
 * page may read it, and when the read fails for any reason the tab degrades to the screen's
 * ordinary "unreadable" message. Submits are never mirrored: the two services rank different
 * player populations, and writing both would double-count nobody while confusing everyone.
 */

import type { RunRecord } from '../core/storage';
import type { RunMode } from '../game/run';
import type { BoardInfo, BoardView, CloudApi, PlayerRank } from './cheddaboards';
import type { CloudOutcome, NicknameOutcome } from './cloud';
import { FANOUT_BOARDS } from './cloud';
import type { Leaderboard } from './leaderboard';
import { TOY_BOARDS, ToyBoards, loadToySdk, type ToyFailure, type ToyLike } from './toy';

/** How long one board read is reused. Matches the Chedda edge cache; Toy reads cost quota. */
const BOARD_TTL_MS = 30_000;

/** Toy `period` for each fan-out tab. They all live on board 1. */
const PERIOD_BY_TAB: Record<string, 'all' | 'week' | 'day'> = {
  'all-time': 'all',
  weekly: 'week',
  daily: 'day',
};

/** Tabs beyond the fan-out trio, in display order. Ids keep the Chedda naming for the shared UI. */
const CATEGORY_TABS: readonly BoardInfo[] = [
  { scoreboardId: 'mode-endless', name: '无尽榜' },
  { scoreboardId: 'mode-campaign', name: '战役榜' },
  { scoreboardId: 'diff-abyss', name: '深渊榜' },
  { scoreboardId: 'cb-global', name: '全球榜' },
];

function boardSlot(tab: string): number | null {
  switch (tab) {
    case 'all-time':
    case 'weekly':
    case 'daily':
      return TOY_BOARDS.overall;
    case 'mode-endless':
      return TOY_BOARDS.endless;
    case 'mode-campaign':
      return TOY_BOARDS.campaign;
    case 'diff-abyss':
      return TOY_BOARDS.abyss;
    default:
      return null;
  }
}

function modeTab(mode: RunMode): string {
  return mode === 'campaign' ? 'mode-campaign' : 'mode-endless';
}

function submitFailure(failure: ToyFailure): string {
  if (failure.kind === 'not-logged-in') return '还未登录B站，成绩已保存在本地。';
  if (failure.kind === 'rate-limited') return '提交太频繁，本局成绩下次再传。';
  return '成绩未上传到B站，已保存在本地。';
}

export interface ToyChannelDeps {
  /** Resolves to the SDK. Defaults to the real loader; tests inject a resolved fake. */
  sdk?: () => Promise<ToyLike | null>;
  /** Read-only client for the Chedda global-board mirror. Null drops the「全球榜」tab data. */
  chedda?: Pick<CloudApi, 'getBoard'>;
  now?: () => number;
}

export class ToyChannel implements Leaderboard {
  readonly kind = 'toy' as const;
  /** Not a real id — the Toy platform does not expose one this game may keep. */
  readonly playerId = 'toy';
  /** The B站 nickname once `loadNickname` has resolved; empty before that. */
  nickname = '';

  private readonly sdkLoader: () => Promise<ToyLike | null>;
  private readonly chedda: Pick<CloudApi, 'getBoard'> | null;
  private readonly now: () => number;
  private client: ToyBoards | null = null;
  private readonly cache = new Map<string, { at: number; view: BoardView }>();

  constructor(deps: ToyChannelDeps = {}) {
    this.sdkLoader = deps.sdk ?? loadToySdk;
    this.chedda = deps.chedda ?? null;
    this.now = deps.now ?? (() => Date.now());
  }

  /** Resolves the SDK once and keeps it; null means the script never loaded or never defined it. */
  private async boards(): Promise<ToyBoards | null> {
    if (this.client) return this.client;
    const sdk = await this.sdkLoader();
    if (!sdk) return null;
    this.client = new ToyBoards(sdk);
    return this.client;
  }

  // ───────────────────────────── run lifecycle ─────────────────────────────

  beginRun(): void {} // No session concept: the platform validates submits itself.
  abandonRun(): void {}

  // ───────────────────────────── identity ─────────────────────────────

  /**
   * Fetches the player's B站 nickname for the screen's "you" highlight. Must run inside a user
   * gesture (the panel opens from a click) because the platform may show its data-consent dialog
   * on first use. A refusal or an unsupported environment leaves the nickname empty — that costs
   * the highlight, nothing else.
   */
  async loadNickname(): Promise<string | null> {
    if (this.nickname) return this.nickname; // One fetch per session: quota is shared by the Toy.
    const client = await this.boards();
    if (!client) return null;
    const result = await client.profile();
    if (result.ok && result.data) {
      this.nickname = result.data.nickname;
      return this.nickname;
    }
    return null;
  }

  /** The Toy channel never renames: the board shows the B站 nickname. */
  async rename(_raw: string): Promise<NicknameOutcome> {
    return {
      ok: false,
      nickname: this.nickname,
      pending: false,
      message: 'B站端使用你的B站昵称（支持中文），无需设置。',
    };
  }

  get nicknamePending(): boolean {
    return false;
  }

  // ───────────────────────────── submission ─────────────────────────────

  /**
   * Submits a finished run: the fan-out board slot, then the mode and abyss slots that apply.
   * Each slot keeps the player's historical best, so the three submits of one run agree by
   * construction. Never throws.
   */
  async finishRun(record: RunRecord): Promise<CloudOutcome> {
    const score = Math.max(0, Math.round(record.score));
    if (score <= 0) return { ok: false, message: '本局没有得分，未上传。', boards: [] };

    const client = await this.boards();
    if (!client) return { ok: false, message: 'B站组件不可用，成绩已保存在本地。', boards: [] };

    const landed: string[] = [];
    const fanout = await client.submit(TOY_BOARDS.overall, score);
    if (!fanout.ok) {
      // Every slot shares the same login and the same rate budget: if the fan-out submit was
      // refused, the extras can only fail the same way, and trying them would spend quota on
      // three identical refusals.
      this.invalidate();
      return { ok: false, message: submitFailure(fanout), boards: [] };
    }
    landed.push('all-time', 'weekly', 'daily');

    // The extra slots are best-effort, exactly like the category boards on Chedda: one rejected
    // slot must not turn a finished run into an error.
    const extras = [
      {
        id: modeTab(record.mode),
        slot: record.mode === 'campaign' ? TOY_BOARDS.campaign : TOY_BOARDS.endless,
      },
      ...(record.difficulty === 'abyss' ? [{ id: 'diff-abyss', slot: TOY_BOARDS.abyss }] : []),
    ];
    for (const extra of extras) {
      const result = await client.submit(extra.slot, score);
      if (result.ok) landed.push(extra.id);
    }
    this.invalidate();

    if (!fanout.ok) {
      return { ok: false, message: submitFailure(fanout), boards: landed };
    }
    const rank = await client.myRank(TOY_BOARDS.overall, 'all');
    const placed = rank.ok && rank.data.ranked ? rank.data.rank : null;
    return {
      ok: true,
      message: placed !== null ? `已上传B站云榜 · 第 ${placed} 名` : '已上传B站云榜',
      boards: landed,
      ...(placed !== null ? { rank: { rank: placed, total: 0 } } : {}),
    };
  }

  // ───────────────────────────── reads for the UI ─────────────────────────────

  /** Every tab this channel can serve; the ids are the ones the shared screen already knows. */
  async knownBoards(): Promise<BoardInfo[]> {
    return [...FANOUT_BOARDS, ...CATEGORY_TABS];
  }

  /** A tab's entries, from a 30-second cache. Null when unreadable — never an exception. */
  async board(scoreboardId: string, limit = 100): Promise<BoardView | null> {
    const cached = this.cache.get(scoreboardId);
    if (cached && this.now() - cached.at < BOARD_TTL_MS) return cached.view;

    let view: BoardView | null = null;
    if (scoreboardId === 'cb-global') {
      view = this.chedda ? await this.cheddaBoard(limit) : null;
    } else {
      const slot = boardSlot(scoreboardId);
      const client = slot !== null ? await this.boards() : null;
      if (client && slot !== null) {
        const period = PERIOD_BY_TAB[scoreboardId] ?? 'all';
        const result = await client.rankList(slot, period, limit);
        if (result.ok) {
          view = {
            scoreboardId,
            entries: result.data.map((item) => ({
              rank: item.rank,
              nickname: item.nickname,
              score: item.score,
              streak: 0, // The platform does not carry our streak metadata; the row shows none.
            })),
          };
        }
      }
    }
    if (view) this.cache.set(scoreboardId, { at: this.now(), view });
    return view ?? cached?.view ?? null;
  }

  /** This player's position on the fan-out board. The platform gives no total, so none is shown. */
  async myRank(): Promise<PlayerRank | null> {
    const client = await this.boards();
    if (!client) return null;
    const result = await client.myRank(TOY_BOARDS.overall, 'all');
    if (!result.ok || !result.data.ranked) return null;
    return { rank: result.data.rank, score: result.data.score, streak: 0, totalPlayers: 0 };
  }

  invalidate(): void {
    this.cache.clear();
  }

  private async cheddaBoard(limit: number): Promise<BoardView | null> {
    if (!this.chedda) return null;
    const result = await this.chedda.getBoard('all-time', limit);
    return result.ok ? result.data : null;
  }
}

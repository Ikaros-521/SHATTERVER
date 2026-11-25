/**
 * The cloud side of a run: identity, play sessions, submission, and the reads the UI needs.
 *
 * One rule shapes everything here — **a leaderboard must never cost the player a run**. Every call
 * is fire-and-forget from the game loop's point of view: a dead network, a rate limit or a
 * rejected score becomes a line on the results screen, never an exception, a freeze or a retry
 * storm. The local leaderboard is the source of truth for "what I did"; this is a mirror.
 *
 * Two platform constraints are handled honestly rather than hidden:
 *
 * - **No metadata field.** `POST /scores` carries a score and a streak, nothing else, so
 *   difficulty and mode cannot ride along with it. The only supported way to split the board is a
 *   *targeted* board, which an operator creates in the developer console — see
 *   {@link CATEGORY_BOARDS}. Until those boards exist, the game degrades to the three fan-out
 *   boards (`all-time`, `weekly`, `daily`) and says so in one place instead of failing per run.
 * - **ASCII handles only.** Enforced in `nickname.ts`; the reason is a hard 400 from the server.
 */

import type { RunRecord } from '../core/storage';
import type { DifficultyId } from '../game/difficulty';
import type { RunMode } from '../game/run';
import {
  type BoardInfo,
  type BoardView,
  type CbFailure,
  type CloudApi,
  type GameInfo,
  type PlayerProfile,
  type PlayerRank,
} from './cheddaboards';
import { checkNickname } from './nickname';

/**
 * The targeted boards this game addresses. They must be created in the developer console
 * (Scoreboards → Board Type: **Targeted**) before they accept writes — a submit never creates one.
 * Ids are fixed here so the console only has to match them, and a missing board is quietly skipped
 * instead of retried.
 */
export const CATEGORY_BOARDS = {
  mode: { campaign: 'mode-campaign', endless: 'mode-endless' },
  difficulty: {
    standard: 'diff-standard',
    advanced: 'diff-advanced',
    hard: 'diff-hard',
    nightmare: 'diff-nightmare',
    abyss: 'diff-abyss',
  },
} as const satisfies Record<string, Record<string, string>>;

/** How long a board read is reused. The platform edge-caches for ~30 s, so this matches it. */
const BOARD_TTL_MS = 30_000;
/** Game metadata changes only when the operator changes it; a slow refresh is enough. */
const GAME_TTL_MS = 5 * 60_000;
/** How long a submit waits for the play-session start before going ahead without a token. */
const SESSION_WAIT_MS = 4000;

export interface NicknameOutcome {
  ok: boolean;
  /** The name the board will actually show (the server may have suffixed it). */
  nickname: string;
  pending: boolean;
  message: string;
  error?: string;
}

export interface CloudOutcome {
  ok: boolean;
  /** One line for the results screen. */
  message: string;
  /** Boards the score landed on, by id. */
  boards: string[];
  rank?: { rank: number; total: number };
  error?: string;
}

export interface CloudDeps {
  client: CloudApi;
  playerId: string;
  nickname: string;
  /** Restored from the save: a rename chosen last session may still be waiting for a score. */
  pending?: boolean;
  /** Restored from the save: a score has been accepted before, so a profile exists. */
  scored?: boolean;
  /** Persists an identity change. Injected so tests do not need localStorage. */
  save?: (nickname: string, pending: boolean, scored: boolean) => void;
  now?: () => number;
}

/** Fan-out boards, in the order the UI shows them. */
export const FANOUT_BOARDS: readonly BoardInfo[] = [
  { scoreboardId: 'all-time', name: '总榜', period: 'allTime' },
  { scoreboardId: 'weekly', name: '本周', period: 'weekly' },
  { scoreboardId: 'daily', name: '今日', period: 'daily' },
];

export class Cloud {
  /** The channel marker: this class is the CheddaBoards-backed service. */
  readonly kind = 'chedda' as const;
  readonly playerId: string;
  /** The name the board shows. Empty until the player picks one. */
  nickname: string;
  /** A rename is held for the first submit (new player, no profile yet). */
  private pending: boolean;
  private scored: boolean;

  private readonly client: CloudApi;
  private readonly save: (nickname: string, pending: boolean, scored: boolean) => void;
  private readonly now: () => number;

  private game: GameInfo | null = null;
  private gameAt = 0;
  private readonly boardCache = new Map<string, { at: number; view: BoardView }>();
  /** Boards the server has told us do not exist. Never asked twice in one session. */
  private readonly missing = new Set<string>();
  /** The in-flight play session for the run that is on screen. */
  private session: Promise<string | null> | null = null;
  private sessionToken: string | null = null;

  constructor(deps: CloudDeps) {
    this.client = deps.client;
    this.playerId = deps.playerId;
    this.nickname = deps.nickname;
    this.pending = deps.pending === true;
    this.scored = deps.scored === true;
    this.save = deps.save ?? (() => undefined);
    this.now = deps.now ?? (() => Date.now());
  }

  // ───────────────────────────── identity ─────────────────────────────

  /**
   * Renames the player. Returns the name actually applied: a taken name comes back with a numeric
   * suffix, and a brand-new player's name is held (`pending`) until the first score creates the
   * profile. The caller shows `nickname`, never what was typed.
   */
  async rename(raw: string): Promise<NicknameOutcome> {
    const check = checkNickname(raw);
    if (!check.ok)
      return { ok: false, nickname: this.nickname, pending: this.pending, message: check.message };
    const result = await this.client.setNickname(this.playerId, check.value);
    if (!result.ok) {
      return {
        ok: false,
        nickname: this.nickname,
        pending: this.pending,
        message: renameFailureMessage(result),
        error: result.error,
      };
    }
    const applied = result.data.nickname || check.value;
    this.nickname = applied;
    this.pending = result.data.pending === true;
    if (!this.pending) this.scored = true;
    this.remember();
    return {
      ok: true,
      nickname: applied,
      pending: this.pending,
      message: this.pending
        ? `已保存「${applied}」，会在第一次提交成绩后出现在云榜上。`
        : `昵称已更新为「${applied}」。`,
    };
  }

  /** True while a chosen name is waiting for the first score. */
  get nicknamePending(): boolean {
    return this.pending;
  }

  // ───────────────────────────── run lifecycle ─────────────────────────────

  /**
   * Opens the server-side window for a run. Called the moment a scoring run starts; the request
   * runs in the background so it can never delay the first frame.
   */
  beginRun(): void {
    this.endSession(); // a previous run that was abandoned must not be reused
    this.session = this.client
      .startPlaySession(this.playerId)
      .then((result) => {
        this.sessionToken = result.ok ? result.data.ok : null;
        return this.sessionToken;
      })
      .catch(() => null);
  }

  /** Closes the session of a run the player walked away from. No score is submitted. */
  abandonRun(): void {
    this.endSession();
  }

  private endSession(): void {
    const token = this.sessionToken;
    this.sessionToken = null;
    this.session = null;
    if (token) void this.client.endPlaySession(token);
  }

  // ───────────────────────────── submission ─────────────────────────────

  /**
   * Submits a finished run: the fan-out submit (which moves the player's profile bests and the
   * three standard boards), then the per-mode and per-difficulty boards when the operator has
   * created them. Never throws.
   */
  async finishRun(record: RunRecord): Promise<CloudOutcome> {
    const score = Math.max(0, Math.round(record.score));
    if (score <= 0) return { ok: false, message: '本局没有得分，未上传。', boards: [] };

    const token = await this.sessionTokenForSubmit();
    const game = await this.gameInfo();
    const boards = await this.existingBoards(game);

    const landed: string[] = [];
    const fanout = await this.client.submitScore({
      playerId: this.playerId,
      score,
      streak: Math.max(0, Math.round(record.combo)),
      ...(token ? { playSessionToken: token } : {}),
    });
    if (fanout.ok) landed.push('all-time', 'weekly', 'daily');

    // Category boards are best-effort: a run must not be reported as failed because the operator
    // has not created one of them yet.
    for (const boardId of [this.modeBoard(record.mode), this.difficultyBoard(record.difficulty)]) {
      if (!boardId || !boards.has(boardId) || this.missing.has(boardId) || landed.includes(boardId)) {
        continue;
      }
      const result = await this.client.submitScore({
        playerId: this.playerId,
        score,
        streak: Math.max(0, Math.round(record.combo)),
        scoreboardId: boardId,
        ...(token ? { playSessionToken: token } : {}),
      });
      if (result.ok) landed.push(boardId);
      else if (result.kind === 'missing-board') this.missing.add(boardId);
    }

    this.endSession();

    if (fanout.ok) {
      this.scored = true;
      this.remember();
      void this.reconcileNickname();
    }

    const rank = fanout.ok ? await this.myRank() : null;
    return {
      ok: fanout.ok,
      message: fanout.ok
        ? rank
          ? `已上传云榜 · 全球第 ${rank.rank} / ${rank.totalPlayers}`
          : '已上传云榜'
        : submitFailureMessage(fanout),
      boards: landed,
      ...(rank ? { rank: { rank: rank.rank, total: rank.totalPlayers } } : {}),
      ...(fanout.ok ? {} : { error: fanout.error }),
    };
  }

  /**
   * The token for this run's submit. Waits for a start that is still in flight, but only briefly:
   * the results screen should not sit on "uploading" for the full request budget, and a score
   * submitted without a token is still accepted while time validation is off.
   */
  private async sessionTokenForSubmit(): Promise<string | null> {
    if (this.sessionToken) return this.sessionToken;
    if (!this.session) return null;
    return Promise.race([
      this.session,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), SESSION_WAIT_MS)),
    ]);
  }

  private modeBoard(mode: RunMode): string | null {
    return mode === 'campaign' ? CATEGORY_BOARDS.mode.campaign : CATEGORY_BOARDS.mode.endless;
  }

  private difficultyBoard(difficulty: DifficultyId): string | null {
    return (CATEGORY_BOARDS.difficulty as Record<string, string>)[difficulty] ?? null;
  }

  /**
   * A name chosen before the first score is held by the server; if it was taken in the meantime,
   * the profile is created as `Player_N` instead. The SDKs re-send the rename at that point and so
   * does this: read the profile once after the first accepted score, and rename again if the name
   * that landed is not the one that was asked for.
   */
  private async reconcileNickname(): Promise<void> {
    if (!this.pending || !this.nickname) return;
    const profile = await this.client.getProfile(this.playerId);
    if (!profile.ok) return;
    const landed = profile.data.nickname ?? '';
    if (landed && landed !== this.nickname) {
      // Someone else owns the name; ask again so the player gets the suffixed version.
      const retry = await this.client.setNickname(this.playerId, this.nickname);
      if (retry.ok) {
        this.nickname = retry.data.nickname || this.nickname;
        this.pending = retry.data.pending === true;
        this.remember();
        return;
      }
    }
    this.pending = false;
    this.remember();
  }

  private remember(): void {
    this.save(this.nickname, this.pending, this.scored);
  }

  // ───────────────────────────── reads for the UI ─────────────────────────────

  /** Game metadata, cached for a few minutes. Null when the service cannot be reached. */
  async gameInfo(force = false): Promise<GameInfo | null> {
    const fresh = this.game !== null && this.now() - this.gameAt < GAME_TTL_MS;
    if (fresh && !force) return this.game;
    const result = await this.client.getGame();
    if (!result.ok) return this.game;
    this.game = result.data;
    this.gameAt = this.now();
    if (result.data.scoreboards) {
      for (const board of result.data.scoreboards) this.missing.delete(board.scoreboardId);
    }
    return this.game;
  }

  /** Boards that exist for this game, including the fan-out trio when metadata is unavailable. */
  async knownBoards(): Promise<BoardInfo[]> {
    const game = await this.gameInfo();
    const listed = game?.scoreboards ?? [];
    const byId = new Map<string, BoardInfo>();
    for (const board of FANOUT_BOARDS) byId.set(board.scoreboardId, board);
    for (const board of listed) {
      // The three fan-out boards keep this game's own labels; anything the operator created keeps
      // the name they gave it in the console.
      const known = byId.get(board.scoreboardId);
      byId.set(board.scoreboardId, {
        ...board,
        name: known?.name ?? board.name ?? board.scoreboardId,
      });
    }
    return [...byId.values()];
  }

  /** Which of our category boards the operator has actually created. */
  async existingBoards(game: GameInfo | null): Promise<Set<string>> {
    if (!game) return new Set();
    return new Set((game.scoreboards ?? []).map((board) => board.scoreboardId));
  }

  /** Whether time validation is on, so the UI can explain a rejected score. */
  async timeValidation(): Promise<boolean> {
    const game = await this.gameInfo();
    return game?.timeValidationEnabled === true;
  }

  /** A board's entries, served from a 30-second cache. Null when unreadable. */
  async board(scoreboardId: string, limit = 100): Promise<BoardView | null> {
    if (this.missing.has(scoreboardId)) return null;
    const cached = this.boardCache.get(scoreboardId);
    if (cached && this.now() - cached.at < BOARD_TTL_MS) return cached.view;
    const result = await this.client.getBoard(scoreboardId, limit);
    if (!result.ok) {
      if (result.kind === 'missing-board') this.missing.add(scoreboardId);
      return cached?.view ?? null;
    }
    this.boardCache.set(scoreboardId, { at: this.now(), view: result.data });
    return result.data;
  }

  /** This player's position on the game-wide board. Null until a score has created the profile. */
  async myRank(): Promise<PlayerRank | null> {
    if (!this.scored) return null;
    const result = await this.client.myRank(this.playerId);
    return result.ok ? result.data : null;
  }

  /** The player's profile, used to learn the name the server applied to a pending rename. */
  async profile(): Promise<PlayerProfile | null> {
    const result = await this.client.getProfile(this.playerId);
    return result.ok ? result.data : null;
  }

  /** Forgets cached board reads, so opening the leaderboard always shows the latest submit. */
  invalidate(): void {
    this.boardCache.clear();
    this.gameAt = 0;
  }
}

function renameFailureMessage(failure: CbFailure): string {
  if (failure.kind === 'nickname') {
    // The server's own wording is precise; the local check should have caught it, so show it as-is
    // with a short Chinese hint.
    return `昵称被拒绝：${failure.error}`;
  }
  if (failure.kind === 'rate-limited') return '操作太频繁，请稍后再试。';
  if (failure.kind === 'network' || failure.kind === 'timeout') return '连不上云榜，昵称只保存在本机。';
  return `昵称未能保存：${failure.error}`;
}

function submitFailureMessage(failure: CbFailure): string {
  if (failure.kind === 'rejected') return '成绩未通过校验，已保存在本地。';
  if (failure.kind === 'rate-limited') return '提交太频繁，本局成绩下次再传。';
  if (failure.kind === 'network' || failure.kind === 'timeout') return '连不上云榜，成绩已保存在本地。';
  return '成绩未上传，已保存在本地。';
}

/**
 * CheddaBoards REST client — the game's only contact with the leaderboard service.
 *
 * Deliberately total: every call resolves to a result object and none of them throw. A run in
 * progress must never be interrupted by a dead network, a rate limit or a rejected nickname, so
 * the caller gets a typed failure it can show (or ignore) instead of an exception.
 *
 * The API key is not a secret. It ships inside every build of every CheddaBoards game, cannot
 * read private data and cannot change the game; all score validation runs server-side. That is
 * why it lives in `config.ts` as a plain constant.
 *
 * Only anonymous play is wired up: the device-code sign-in flow (Google / Apple) is out of scope,
 * so every request authenticates with `X-API-Key` and never with `X-Session-Token`.
 */

/** How long one request may take before it is abandoned. A slow board read must not stall a run. */
const TIMEOUT_MS = 8000;

/** Which branch of the board a submit should land on, from the reader's point of view. */
export interface BoardInfo {
  scoreboardId: string;
  name: string;
  /** `allTime`, `daily`, `weekly`, `monthly`, `custom` — set by the dashboard. */
  period?: string;
}

export interface GameInfo {
  gameId: string;
  name?: string;
  totalPlayers?: number;
  totalPlays?: number;
  /** When on, a submit without a play-session token is rejected before any score check runs. */
  timeValidationEnabled?: boolean;
  scoreboards?: BoardInfo[];
}

export interface BoardEntry {
  rank: number;
  nickname: string;
  score: number;
  streak: number;
  /** Nanoseconds since the epoch, when the entry's best was set. */
  submittedAt?: number;
  authType?: string;
}

export interface BoardView {
  scoreboardId: string;
  config?: { name?: string; description?: string; period?: string; sortBy?: string };
  entries: BoardEntry[];
  totalEntries?: number;
}

export interface PlayerProfile {
  nickname: string;
  /** Null until the player's first score creates their server-side profile. */
  gameProfile: { score: number; streak: number; playCount?: number } | null;
  /** True when a rename is being held for the first submit (new player, no score yet). */
  pending?: boolean;
}

export interface PlayerRank {
  rank: number;
  score: number;
  streak: number;
  totalPlayers: number;
}

export interface SubmitInput {
  playerId: string;
  score: number;
  streak: number;
  /**
   * Presence is meaning: including it renames the player (silently ignored when taken). Only send
   * it right after the player chose a name — never on every run. See `cloud.ts`.
   */
  nickname?: string;
  playSessionToken?: string;
  /** Targets one category board. Omit for the normal fan-out submit. */
  scoreboardId?: string;
}

export type CbErrorKind =
  | 'network'
  | 'timeout'
  | 'rate-limited'
  | 'missing-board'
  | 'nickname'
  | 'rejected'
  | 'session'
  | 'bad-input'
  | 'server'
  | 'unknown';

export interface CbFailure {
  ok: false;
  /** The server's own message when there was one, else a short description of what happened. */
  error: string;
  /** HTTP status, or 0 when the request never reached the server. */
  status: number;
  kind: CbErrorKind;
  /** Set when the failure was a submit addressed to a board that does not exist. */
  board?: string;
  /** Seconds to wait, from a `Retry-After` header. */
  retryAfter?: number;
}

export type CbResult<T> = { ok: true; data: T } | CbFailure;

export interface CbConfig {
  gameId: string;
  apiKey: string;
  /** Overridable for tests and for reads straight from the canister. */
  base?: string;
}

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/**
 * The slice of the client the rest of the game depends on. `Cloud` talks to this interface so its
 * tests can drive a plain object instead of a live network.
 */
export interface CloudApi {
  getGame(): Promise<CbResult<GameInfo>>;
  getBoard(scoreboardId: string, limit?: number): Promise<CbResult<BoardView>>;
  getProfile(playerId: string): Promise<CbResult<PlayerProfile>>;
  myRank(playerId: string, sort?: 'score' | 'streak'): Promise<CbResult<PlayerRank>>;
  setNickname(playerId: string, nickname: string): Promise<CbResult<PlayerProfile>>;
  startPlaySession(playerId: string): Promise<CbResult<{ ok: string }>>;
  endPlaySession(token: string): Promise<CbResult<{ message?: string }>>;
  submitScore(input: SubmitInput): Promise<CbResult<{ message?: string; scoreboardId?: string }>>;
}

const NICKNAME_ERRORS = [
  'Nickname must be at least 3 characters',
  'Nickname must be 16 characters or less',
  'Nickname can only contain letters, numbers, and underscores',
];

/**
 * Turns the server's error string into something the caller can branch on without matching prose
 * in a dozen places. Substrings only, because the server sometimes wraps the message.
 */
function classify(message: string, status: number): Pick<CbFailure, 'kind' | 'board'> {
  if (status === 429) return { kind: 'rate-limited' };
  const missing = /Scoreboard '([^']+)' not found/i.exec(message);
  if (missing?.[1]) return { kind: 'missing-board', board: missing[1] };
  if (NICKNAME_ERRORS.some((text) => message.includes(text))) return { kind: 'nickname' };
  if (/rejected by game validation rules/i.test(message)) return { kind: 'rejected' };
  if (status === 401 || status === 403) return { kind: 'session' };
  if (/\bsession\b|play session|time validation/i.test(message)) return { kind: 'rejected' };
  if (status >= 500) return { kind: 'server' };
  if (status === 400 || status === 404) return { kind: 'bad-input' };
  return { kind: 'unknown' };
}

export class CheddaBoards implements CloudApi {
  private readonly base: string;

  constructor(
    private readonly config: CbConfig,
    private readonly fetchImpl: FetchLike = (input, init) => fetch(input, init),
  ) {
    this.base = (config.base ?? 'https://api.cheddaboards.com').replace(/\/+$/, '');
  }

  // ───────────────────────────── reads ─────────────────────────────

  /** Game metadata, including whether time validation is on and which boards exist. */
  getGame(): Promise<CbResult<GameInfo>> {
    return this.get<GameInfo>('/game');
  }

  /** One board's ranked entries. Edge-cached for ~30 s: do not poll faster than that. */
  getBoard(scoreboardId: string, limit = 100): Promise<CbResult<BoardView>> {
    return this.get<BoardView>(
      `/games/${encodeURIComponent(this.config.gameId)}/scoreboards/${encodeURIComponent(scoreboardId)}`,
      { limit: String(Math.max(1, Math.min(1000, Math.floor(limit)))) },
    );
  }

  /** A player's public profile: the stored nickname and their bests for this game. */
  getProfile(playerId: string): Promise<CbResult<PlayerProfile>> {
    return this.get<PlayerProfile>(`/players/${encodeURIComponent(playerId)}/profile`);
  }

  /** A player's position on the game-wide board. */
  myRank(playerId: string, sort: 'score' | 'streak' = 'score'): Promise<CbResult<PlayerRank>> {
    return this.get<PlayerRank>(`/players/${encodeURIComponent(playerId)}/rank`, { sort });
  }

  // ───────────────────────────── writes ─────────────────────────────

  /**
   * Sets the name the board will show. Unlike a submit, this reports the name actually applied:
   * a taken name comes back suffixed (`Chedz` → `Chedz_1`). For a player with no profile yet the
   * server holds the name and answers `pending: true`; it lands on the first score.
   */
  setNickname(playerId: string, nickname: string): Promise<CbResult<PlayerProfile>> {
    return this.send<PlayerProfile>('PUT', `/players/${encodeURIComponent(playerId)}/nickname`, {
      nickname,
    });
  }

  /** Opens the server-side window around one run. Needed the day time validation is switched on. */
  startPlaySession(playerId: string): Promise<CbResult<{ ok: string }>> {
    return this.send<{ ok: string }>('POST', '/play-sessions/start', {
      gameId: this.config.gameId,
      playerId,
    });
  }

  /** Closes the window. Sessions are capped per player, so this is not optional politeness. */
  endPlaySession(token: string): Promise<CbResult<{ message?: string }>> {
    return this.send<{ message?: string }>('POST', '/play-sessions/end', { playSessionToken: token });
  }

  /**
   * Submits one finished run. Without `scoreboardId` the score fans out to every standard board
   * and moves the player's profile bests; with it, exactly one category board is written.
   */
  submitScore(input: SubmitInput): Promise<CbResult<{ message?: string; scoreboardId?: string }>> {
    return this.send('POST', '/scores', { gameId: this.config.gameId, ...input });
  }

  // ───────────────────────────── transport ─────────────────────────────

  private get<T>(path: string, query?: Record<string, string>): Promise<CbResult<T>> {
    const search = query ? `?${new URLSearchParams(query).toString()}` : '';
    return this.send<T>('GET', `${path}${search}`);
  }

  private async send<T>(method: string, path: string, body?: unknown): Promise<CbResult<T>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.base}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-Game-ID': this.config.gameId,
          'X-API-Key': this.config.apiKey,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timer);
      const aborted = controller.signal.aborted || (error as Error | null)?.name === 'AbortError';
      return {
        ok: false,
        error: aborted ? 'timeout' : 'network',
        status: 0,
        kind: aborted ? 'timeout' : 'network',
      };
    }

    // The timer stays armed through the body read: headers can arrive while the body never does,
    // and a response that hangs there must end as a timeout like any other phase. Cleared exactly
    // once per path — here or in the catch above.
    let envelope: CbResult<T>;
    try {
      envelope = await readEnvelope<T>(response);
    } finally {
      clearTimeout(timer);
    }
    if (controller.signal.aborted) {
      return { ok: false, error: 'timeout', status: 0, kind: 'timeout' };
    }

    const retryAfter = Number(response.headers.get('Retry-After'));
    if (envelope.ok) return envelope;
    const message = envelope.error;
    return {
      ok: false,
      error: message,
      status: response.status,
      ...classify(message, response.status),
      ...(Number.isFinite(retryAfter) && retryAfter > 0 ? { retryAfter } : {}),
    };
  }
}

/**
 * Parses `{ok, data}` / `{ok:false, error}`. A body that is not that envelope (a proxy error page,
 * a truncated response) becomes an `unknown` failure rather than a thrown exception.
 */
async function readEnvelope<T>(response: Response): Promise<CbResult<T>> {
  let text: string;
  try {
    text = await response.text();
  } catch {
    return { ok: false, error: 'unreadable response', status: response.status, kind: 'unknown' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      ok: false,
      error: `HTTP ${response.status}`,
      status: response.status,
      kind: response.status === 429 ? 'rate-limited' : 'unknown',
    };
  }
  if (parsed && typeof parsed === 'object' && 'ok' in parsed) {
    const envelope = parsed as { ok: boolean; data?: T; error?: unknown };
    if (envelope.ok) return { ok: true, data: (envelope.data ?? {}) as T };
    const message = typeof envelope.error === 'string' ? envelope.error : `HTTP ${response.status}`;
    return { ok: false, error: message, status: response.status, kind: 'unknown' };
  }
  return { ok: false, error: 'unexpected response', status: response.status, kind: 'unknown' };
}

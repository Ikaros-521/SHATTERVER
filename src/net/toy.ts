/**
 * B站 Toy SDK client — the leaderboard channel used when the game runs as a Bilibili Toy.
 *
 * Mirrors `cheddaboards.ts` in shape: every call resolves to a result object and none of them
 * throw, because a finished run must never be interrupted by a login prompt, a rate limit or a
 * missing SDK. The differences that matter are structural, and each one changes the design:
 *
 * - **Identity is the platform's.** The player is whoever B站 says they are (`getUserProfile`),
 *   nicknames are native B站 nicknames (Chinese included, content-safety handled by the platform),
 *   so this channel has no rename flow and no local identity file.
 * - **Boards are numbered slots, not named boards.** Five slots (1–5) per Toy is the whole budget,
 *   so the mapping lives in {@link TOY_BOARDS} and the time dimension rides the free `period`
 *   parameter instead of separate boards.
 * - **The SDK arrives at runtime.** It is a script the package itself includes, so it is loaded
 *   through {@link loadToySdk} rather than bundled — this project ships no runtime npm
 *   dependencies — and only inside a Toy, so no other host ever requests it.
 *
 * A score is fitted to the platform's 0..16 777 215 integer range before leaving this file
 * ({@link clampToyScore}): stored as scored wherever the range allows, log-compressed above
 * that so deep endless runs still rank against each other instead of tying at the ceiling.
 */
import { t } from '../core/i18n';

/** Where the platform says the SDK lives. Loaded only inside the Toy environment. */
export const TOY_SDK_SRC = 'https://s1.hdslb.com/bfs/seed/toy/app/sdk/toy-sdk.js';

/**
 * Hosts the Toy platform serves an uploaded package from. The Toy page on bilibili.com is only a
 * shell: it frames the package from one of these, so they are the `location` the game itself runs
 * on. The same list is what `toy-host.js` accepts SDK messages from — its closing `rs()` is the
 * place to re-check if the platform ever adds a package host.
 */
const TOY_PACKAGE_HOSTS: ReadonlySet<string> = new Set([
  'www.bilibilitoy.com',
  'www.bebox.net',
  'uat-www.bebox.net',
  'pre-www.bebox.net',
]);

/**
 * True when the game runs as a Bilibili Toy. The URL decides the channel — not `window.toy`, which
 * only appears after the SDK script loads and would make the choice asynchronous and racy.
 *
 * What the package sees is its own address on a package host, not the Toy page's: the shell at
 * `https://www.bilibili.com/toy/<slug>/` frames it with `referrerpolicy="no-referrer"`, so
 * neither the shell's hostname nor a referrer is visible from inside. A page served on
 * bilibili.com under `/toy/` counts as well, so the rule still holds if the platform ever hosts a
 * package itself.
 */
export function isToyEnvironment(loc: { hostname: string; pathname: string } = location): boolean {
  const host = loc.hostname.toLowerCase();
  if (TOY_PACKAGE_HOSTS.has(host)) return true;
  if (host !== 'www.bilibili.com' && !host.endsWith('.bilibili.com')) return false;
  return loc.pathname.startsWith('/toy/');
}

/** The slice of `window.toy` this game uses. Nothing else is touched. */
export interface ToyRankItem {
  rank: number;
  score: number;
  nickname: string;
  avatar?: string;
}

export interface ToyProfile {
  nickname: string;
  avatar?: string;
  /** Stable per-Toy pseudonymous id; never written to logs or used as a key here. */
  toyOpenId?: string;
}

export interface ToyLike {
  isSupport(ability: string): Promise<boolean>;
  submitScore(req: { board?: number; score: number }): Promise<{ score: number }>;
  getRankList(req?: {
    board?: number;
    period?: 'all' | 'month' | 'week' | 'day';
    limit?: number;
  }): Promise<ToyRankItem[]>;
  getMyRank(req?: {
    board?: number;
    period?: 'all' | 'month' | 'week' | 'day';
  }): Promise<{ ranked: boolean; rank: number; score: number }>;
  getUserProfile?(): Promise<ToyProfile>;
}

/**
 * The five board slots and what this game puts in them. The fan-out trio (总榜/本周/今日) is one
 * slot — board 1 — because `period` splits it for free; the remaining slots go to the modes and
 * the flagship difficulty. Remapping here is all it takes to change the split.
 */
export const TOY_BOARDS = {
  overall: 1,
  endless: 2,
  campaign: 3,
  abyss: 4,
  /** Slot 5 is deliberately unused: a future board should not move the others. */
} as const;

/** The platform's documented score ceiling; scores are integers and never exceed this. */
const TOY_SCORE_LIMIT = 16_777_215;

/**
 * Board value up to which a score is stored exactly as the game awarded it. As close to the
 * ceiling as leaves the log segment room to work: headless runs score a campaign win at
 * 0.5–13M (abyss at the top of that), and with the per-brick cap (`SCORE_BRICK_CAP`) standard
 * endless reaches 9M by level 22 and passes this line around level 28. Everything under the
 * line is shown on the board exactly as it is in the HUD.
 */
const TOY_LINEAR_MAX = 16_000_000;

/**
 * Score the log segment is sized for: about an endless run of level 700. Boss parts compound
 * two geometric growths (`hpUnit` × `bossScale`), so the score climbs tenfold every ~7.5 levels
 * and a level-400 run is already near 1e60. At or beyond the sized-for score every run shares
 * the ceiling — the one place two different scores can still tie.
 */
const TOY_COMPRESSED_MAX = 1e100;

/**
 * Maps a run score onto the platform's 0..16 777 215 integer range.
 *
 * Identity up to {@link TOY_LINEAR_MAX}; above it a strictly increasing log segment, because
 * endless score grows geometrically with the level and only a log keeps pace. Runs more than
 * about 0.03% apart always land on different board values, so deep runs sort apart instead of
 * all clamping to one shared ceiling. Monotonic over the whole domain, constant time.
 */
export function clampToyScore(score: number): number {
  if (!(score > 0)) return 0;
  if (score <= TOY_LINEAR_MAX) return Math.round(score);
  if (score >= TOY_COMPRESSED_MAX) return TOY_SCORE_LIMIT;
  const perNat = (TOY_SCORE_LIMIT - TOY_LINEAR_MAX) / Math.log(TOY_COMPRESSED_MAX / TOY_LINEAR_MAX);
  return Math.min(TOY_SCORE_LIMIT, Math.round(TOY_LINEAR_MAX + perNat * Math.log(score / TOY_LINEAR_MAX)));
}

export type ToyFailureKind = 'rate-limited' | 'not-logged-in' | 'unsupported' | 'invalid' | 'error';

export interface ToyFailure {
  ok: false;
  kind: ToyFailureKind;
  /** The SDK's own message when there was one, else a short description. */
  error: string;
}

export type ToyResult<T> = { ok: true; data: T } | ToyFailure;

/**
 * Turns a rejected SDK promise into something the caller can branch on without matching prose.
 * The SDK rejects with `{type, code, message}`-shaped errors; `code: 307044` is the platform's
 * shared rate limit for storage and boards, and login problems are the only rejection a score
 * submit needs to explain to the player.
 */
export function classifyToyError(error: unknown): ToyFailure {
  const shaped = (error ?? null) as { type?: unknown; code?: unknown; message?: unknown } | null;
  const type = typeof shaped?.type === 'string' ? shaped.type : '';
  const message =
    typeof shaped?.message === 'string' && shaped.message.length > 0
      ? shaped.message
      : error instanceof Error
        ? error.message
        : t('net.toyApiFailed');
  if (shaped?.code === 307044 || /307044|请求过于频繁|too frequent/i.test(message)) {
    return { ok: false, kind: 'rate-limited', error: message };
  }
  if (/login|logged/i.test(type) || /登录/.test(message)) {
    return { ok: false, kind: 'not-logged-in', error: message };
  }
  if (type === 'unsupported') return { ok: false, kind: 'unsupported', error: message };
  if (type === 'invalid_param') return { ok: false, kind: 'invalid', error: message };
  return { ok: false, kind: 'error', error: message };
}

type ToyWindow = { toy?: ToyLike };

/**
 * Loads the Toy SDK by script tag and resolves to `window.toy`. Idempotent: concurrent callers
 * share one injection, and a load that fails resets itself so a later call (the next run, the
 * next panel open) can retry — a transient network failure must not kill the channel forever.
 * Resolves `null` when the script fails to load or defines nothing; it is only ever requested
 * inside a Toy, see {@link isToyEnvironment}.
 */
export function loadToySdk(doc: Document = document): Promise<ToyLike | null> {
  const win = doc.defaultView as (Window & ToyWindow) | null;
  if (win?.toy) return Promise.resolve(win.toy);

  let pending = loadToySdkState.pending;
  if (!pending) {
    pending = new Promise<ToyLike | null>((resolve) => {
      const script = doc.createElement('script');
      script.src = TOY_SDK_SRC;
      script.async = true;
      script.onload = () => {
        loadToySdkState.pending = null;
        resolve((doc.defaultView as (Window & ToyWindow) | null)?.toy ?? null);
      };
      script.onerror = () => {
        loadToySdkState.pending = null;
        resolve(null);
      };
      doc.head.appendChild(script);
    });
    loadToySdkState.pending = pending;
  }
  return pending;
}
/** Module-level loader promise, kept off the closure so retries can clear it. */
const loadToySdkState: { pending: Promise<ToyLike | null> | null } = { pending: null };

/**
 * The typed, never-throwing view of the SDK. Everything the channel does goes through here, so
 * the failure handling is written once instead of once per call site.
 */
export class ToyBoards {
  constructor(private readonly sdk: ToyLike) {}

  /**
   * Reports one finished run to a board slot. The platform keeps the player's historical best per
   * slot, so a lower later score is harmless; the caller still submits once per run event only,
   * because every call spends the Toy's shared rate budget.
   */
  async submit(board: number, score: number): Promise<ToyResult<{ score: number }>> {
    try {
      return { ok: true, data: await this.sdk.submitScore({ board, score: clampToyScore(score) }) };
    } catch (error) {
      return classifyToyError(error);
    }
  }

  async rankList(
    board: number,
    period: 'all' | 'month' | 'week' | 'day',
    limit: number,
  ): Promise<ToyResult<ToyRankItem[]>> {
    try {
      return { ok: true, data: await this.sdk.getRankList({ board, period, limit }) };
    } catch (error) {
      return classifyToyError(error);
    }
  }

  async myRank(
    board: number,
    period: 'all' | 'month' | 'week' | 'day',
  ): Promise<ToyResult<{ ranked: boolean; rank: number; score: number }>> {
    try {
      return { ok: true, data: await this.sdk.getMyRank({ board, period }) };
    } catch (error) {
      return classifyToyError(error);
    }
  }

  /**
   * The player's B站 identity. The platform shows its own confirmation dialog on first use, so
   * this must be called from a user gesture (the leaderboard screen opening from a click is one);
   * an unsupported environment or a refusal resolves to `data: null` — the board simply shows no
   * "you" highlight rather than blocking the screen.
   */
  async profile(): Promise<ToyResult<ToyProfile | null>> {
    try {
      if (typeof this.sdk.getUserProfile !== 'function') return { ok: true, data: null };
      if (!(await this.sdk.isSupport('getUserProfile'))) return { ok: true, data: null };
      return { ok: true, data: await this.sdk.getUserProfile() };
    } catch (error) {
      return classifyToyError(error);
    }
  }
}

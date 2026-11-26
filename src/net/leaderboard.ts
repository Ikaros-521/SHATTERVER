/**
 * The surface the game and the leaderboard screen use, independent of which service backs it.
 *
 * Environment detection picks the channel once, at startup: inside a Bilibili Toy the page runs
 * {@link ./toychannel.ts | ToyChannel} against the platform's boards, inside a WeChat minigame
 * {@link ./wechatchannel.ts | WeChatChannel} against the project's own 微信云开发 function, and
 * everywhere else it runs the CheddaBoards-backed `Cloud`. Nothing downstream branches on the
 * service — it branches on `kind` only where they genuinely differ (the nickname UI, which the Toy
 * channel lacks because identity is the platform's, and which the WeChat channel owns because
 * identity there is a silent openid plus a name the player types).
 */

import type { RunRecord } from '../core/storage';
import type { BoardInfo, BoardView, PlayerRank } from './cheddaboards';
import type { CloudOutcome, NicknameOutcome } from './cloud';
import type { WalletMirror } from './toywallet';

export interface Leaderboard {
  /** Which backing service this is. */
  readonly kind: 'chedda' | 'toy' | 'wechat';
  /** Debug/automation handle; on Toy this is a placeholder, not a real id. */
  readonly playerId: string;
  /** The name the board shows. Empty until known; on Toy it is the player's B站 nickname. */
  nickname: string;
  /** True while a chosen name is waiting for the first score (Chedda only). */
  readonly nicknamePending: boolean;
  /** Opens the server-side window for a run; a no-op where the platform has no session concept. */
  beginRun(): void;
  /** Closes the window of a run the player walked away from. */
  abandonRun(): void;
  /** Mirrors a finished run. Never throws; the outcome message is shown as-is. */
  finishRun(record: RunRecord): Promise<CloudOutcome>;
  /** Forgets cached reads, so the next open shows the latest submit. */
  invalidate(): void;
  /** Boards the screen should show tabs for, in order. */
  knownBoards(): Promise<BoardInfo[]>;
  /** A board's entries, or null when unreadable. */
  board(scoreboardId: string, limit?: number): Promise<BoardView | null>;
  /** This player's position on the main board, or null when not ranked / unknown. */
  myRank(): Promise<PlayerRank | null>;
  /** Sets a custom nickname (Chedda). On Toy this always declines; the UI hides the input. */
  rename(raw: string): Promise<NicknameOutcome>;
  /**
   * Toy only: asks the platform for the player's B站 nickname, resolving null when unavailable.
   * Omitted on Chedda, where the nickname is chosen in-game.
   */
  loadNickname?(): Promise<string | null>;
  /**
   * Toy only: best-effort mirror of the 星尘 wallet in the platform's per-user cloud storage, so
   * the shop follows the player across devices. Omitted where the backing service has no storage.
   */
  readonly wallet?: WalletMirror;
}

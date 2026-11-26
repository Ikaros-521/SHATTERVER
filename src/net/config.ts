/**
 * CheddaBoards credentials for this build.
 *
 * The API key is **not a secret**, by design: every CheddaBoards game ships it inside the binary
 * where anyone can read it, and it cannot read private data, change the game or move another
 * player's score. All validation runs server-side. What it *can* do is submit scores for this
 * game, so a fork that wants its own leaderboard should register its own game and replace both
 * values below.
 *
 * `VITE_CB_GAME_ID` / `VITE_CB_API_KEY` override the defaults at build time, which is how a fork
 * points at its own game without editing source. An empty key turns the whole cloud feature off;
 * the game then behaves exactly as it did before the leaderboard existed.
 */

const env = (import.meta as { env?: Record<string, string | undefined> }).env ?? {};

export const CLOUD_CONFIG = {
  gameId: env.VITE_CB_GAME_ID ?? 'shatterver',
  apiKey: env.VITE_CB_API_KEY ?? 'cb_shatterver_915f7bc029691dc360ed342597680fa2',
} as const;

/** False when the build has no key: the UI hides the cloud screens and no request is made. */
export function cloudEnabled(): boolean {
  return CLOUD_CONFIG.gameId.length > 0 && CLOUD_CONFIG.apiKey.length > 0;
}

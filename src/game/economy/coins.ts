/**
 * 星尘（Stardust）— the meta-progression currency. It is earned only by playing: every finished
 * run pays a time share (showing up is rewarded), a score share (playing well is rewarded, but
 * with a square root, because measured runs differ ~30× in score while all lasting 4–7 minutes)
 * and a campaign clear bonus. It buys nothing during a run — the in-run currency stays 碎晶.
 *
 * Run earnings pass through a daily soft cap: full price up to the cap, half beyond it. It
 * slows farming scripts without ever zeroing out a session, and one-time rewards (first-use
 * bonuses, milestones) bypass it entirely.
 */

/** Seconds of play per coin of the time share. */
export const COIN_SECONDS = 10;
/** √score divided by this is the score share. ×4 score is only ×2 coins. */
export const COIN_SCORE_DIVISOR = 16;
/** Paid once per finished winning campaign run. */
export const CAMPAIGN_CLEAR_BONUS = 60;
/** Daily soft cap for run earnings; beyond it the remainder pays half. */
export const DAILY_RUN_SOFT_CAP = 1500;
/** First finished run after the shop exists, whatever the outcome. */
export const FIRST_GIFT = 250;
/** Paid the first time a run carries each upgrade kind. The pool has 56 upgrades. */
export const FIRST_USE_REWARD = 15;

export interface RunEarnings {
  timeCoins: number;
  scoreCoins: number;
  /** Campaign clear bonus, 0 elsewhere. */
  clearBonus: number;
  total: number;
}

/** The run share of a finished run's payout, before the daily cap. */
export function runCoins(seconds: number, score: number, campaignWon: boolean): RunEarnings {
  const timeCoins = Math.floor(Math.max(0, seconds) / COIN_SECONDS);
  const scoreCoins = Math.floor(Math.sqrt(Math.max(0, score)) / COIN_SCORE_DIVISOR);
  const clearBonus = campaignWon ? CAMPAIGN_CLEAR_BONUS : 0;
  return { timeCoins, scoreCoins, clearBonus, total: timeCoins + scoreCoins + clearBonus };
}

/**
 * Applies the daily soft cap to run earnings. `alreadyToday` counts only capped run earnings;
 * one-time rewards never touch it. Full price inside the room, exactly half beyond it.
 */
export function applyDailyHalving(earned: number, alreadyToday: number): number {
  const room = Math.max(0, DAILY_RUN_SOFT_CAP - Math.max(0, alreadyToday));
  const paid = Math.min(Math.max(0, earned), room);
  const over = Math.max(0, earned - room);
  return Math.floor(paid + over / 2);
}

/** Local calendar-day key for the soft cap, `YYYY-MM-DD`. */
export function dayKey(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

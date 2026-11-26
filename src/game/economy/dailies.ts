import { hashString, RNG } from '../../core/rng';
import type { EconomyState } from '../../core/storage';
import type { LevelRecord, Run } from '../run';
import { SWIFT_SECONDS } from './milestones';

/**
 * The daily loop — a reason to come back tomorrow without a reason to stay up tonight.
 *
 * Three moving parts, all keyed by the local calendar day (`dayKey`):
 *
 * - the first scoring run of the day has its run share doubled (before the daily soft cap, so the
 *   cap still bites; one-time rewards never double);
 * - three daily missions drawn deterministically from a fixed pool — the same date deals the same
 *   hand to every player, no real randomness anywhere;
 * - mission rewards settle automatically like milestones and bypass the soft cap entirely: they
 *   are one-time by nature and capped by the daily reset itself.
 *
 * Missions only ever read what a finished `Run` already carries plus their own per-day progress;
 * they are judged per run and accumulate across the day's runs (sum, except the combo goal which
 * keeps the day's maximum). Copy lives in the UI dictionaries under `shop.daily.<id>`, with {n}
 * filled by the caller as `progress/target`.
 */

/** Stardust per completed mission. Three missions, so a full day pays 180. */
export const DAILY_MISSION_REWARD = 60;
/** How many missions a day deals out of the pool. */
export const DAILY_MISSION_PICK = 3;

export interface DailyMissionDef {
  id: string;
  /** Progress at which the mission completes. */
  target: number;
  /** What one finished run contributes. Judged per run, summed across the day unless `max`. */
  contribution: (run: Run, won: boolean) => number;
  /** `max` keeps the day's best contribution instead of summing (the combo goal). */
  aggregate?: 'max';
}

const levelCount = (run: Run, predicate: (level: LevelRecord) => boolean): number =>
  run.history.filter(predicate).length;

/**
 * The fixed pool. Ten missions, ids stable forever — a save stores them, so renaming one is a
 * data migration, not an edit.
 */
export const DAILY_MISSIONS: DailyMissionDef[] = [
  { id: 'kills', target: 600, contribution: (run) => run.kills },
  { id: 'perfects', target: 15, contribution: (run) => run.perfects },
  { id: 'overdrives', target: 6, contribution: (run) => run.overdrives },
  { id: 'reactions', target: 10, contribution: (run) => run.reactionTriggers },
  { id: 'bosses', target: 2, contribution: (run) => run.bosses },
  {
    id: 'flawless',
    target: 3,
    contribution: (run) => levelCount(run, (level) => level.damageTaken <= 0),
  },
  {
    id: 'swift',
    target: 2,
    contribution: (run) => levelCount(run, (level) => level.time > 0 && level.time < SWIFT_SECONDS),
  },
  { id: 'runs', target: 3, contribution: () => 1 },
  { id: 'win', target: 1, contribution: (run, won) => (won && run.mode === 'campaign' ? 1 : 0) },
  { id: 'combo', target: 100, contribution: (run) => run.maxCombo, aggregate: 'max' },
];

export const DAILY_MISSION_MAP: Record<string, DailyMissionDef> = Object.fromEntries(
  DAILY_MISSIONS.map((mission) => [mission.id, mission]),
);

export function isDailyMissionId(value: unknown): value is string {
  return typeof value === 'string' && Object.hasOwn(DAILY_MISSION_MAP, value);
}

/** The day's hand: three missions drawn from the pool by the date alone, in canonical order. */
export function dailyMissionsFor(date: string): DailyMissionDef[] {
  const order = DAILY_MISSIONS.map((_mission, index) => index);
  new RNG(hashString(date)).shuffle(order);
  return order
    .slice(0, DAILY_MISSION_PICK)
    .sort((a, b) => a - b)
    .map((index) => DAILY_MISSIONS[index]!);
}

/**
 * Lazes the daily state onto today: a new date (or a state whose missions do not match the day's
 * draw — a repaired or hand-edited save) re-draws the pool, zeroes the progress and re-arms the
 * first-run double. Call before reading or folding anything daily.
 */
export function rollDaily(state: EconomyState, date: string): void {
  const daily = state.daily;
  const drawn = dailyMissionsFor(date);
  const matches =
    daily.date === date &&
    daily.missions.length === drawn.length &&
    daily.missions.every((mission, i) => mission.id === drawn[i]!.id);
  if (matches) return;
  state.daily = {
    date,
    doubled: false,
    runs: 0,
    missions: drawn.map((mission) => ({ id: mission.id, progress: 0, done: false })),
  };
}

/**
 * Doubles the run share of the day's first scoring run and arms the flag; later runs pass
 * through untouched. Apply before `applyDailyHalving`, and never to one-time rewards.
 */
export function doubleFirstRun(state: EconomyState, earned: number): number {
  if (state.daily.doubled) return earned;
  state.daily.doubled = true;
  return earned * 2;
}

/**
 * Folds one finished scoring run into today's missions and settles whatever crossed the line.
 * Rewards report back for the caller to book; like milestones, there is no claim step. Progress
 * clamps at the target so a finished row always reads `target/target`.
 */
export function advanceDaily(
  state: EconomyState,
  run: Run,
  won: boolean,
): { missionReward: number; settled: number } {
  const daily = state.daily;
  daily.runs += 1;
  let missionReward = 0;
  let settled = 0;
  for (const mission of daily.missions) {
    const def = DAILY_MISSION_MAP[mission.id];
    if (!def || mission.done) continue;
    const value = Math.max(0, Math.floor(def.contribution(run, won)));
    mission.progress =
      def.aggregate === 'max' ? Math.max(mission.progress, value) : mission.progress + value;
    if (mission.progress >= def.target) {
      mission.progress = def.target;
      mission.done = true;
      missionReward += DAILY_MISSION_REWARD;
      settled += 1;
    }
  }
  return { missionReward, settled };
}

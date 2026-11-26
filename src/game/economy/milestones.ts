import type { Records, EconomyState } from '../../core/storage';

/**
 * Milestones — one-time 星尘 rewards for records and play patterns. They settle automatically:
 * there is no claim button, because "forgot to claim" is a dead-end screen, not a hook. The
 * exploration milestones double as a tutorial (first perfect catch, first capsule, first
 * reaction …), so the first week is dotted with small surprises that teach the game.
 *
 * Copy lives in the UI dictionaries under `shop.ms.<id>` as `名称｜描述`, locale parity enforced
 * by the i18n tests; this module only carries ids, rewards and conditions.
 */

export interface MilestoneDef {
  id: string;
  reward: number;
  check: (records: Records, economy: EconomyState) => boolean;
}

/** A sector cleared inside this many seconds counts as a swift clear. */
export const SWIFT_SECONDS = 20;

const counter = (economy: EconomyState, key: keyof EconomyState['counters']): number =>
  economy.counters[key];

/** Every free starter has finished a campaign run under the player's hand. */
const playedAllStyles = (economy: EconomyState): boolean =>
  ['blank', 'barrage', 'battery', 'element'].every((id) => (economy.winsByStarter[id] ?? 0) > 0);

export const MILESTONES: MilestoneDef[] = [
  // Exploration — they teach, then they pay.
  { id: 'perfect', reward: 20, check: (_r, e) => counter(e, 'perfects') > 0 },
  { id: 'capsule', reward: 20, check: (_r, e) => counter(e, 'capsules') > 0 },
  { id: 'overdrive', reward: 20, check: (_r, e) => counter(e, 'overdrives') > 0 },
  { id: 'reaction', reward: 30, check: (_r, e) => counter(e, 'reactions') > 0 },
  { id: 'boss', reward: 50, check: (_r, e) => counter(e, 'bosses') > 0 },
  { id: 'flawless', reward: 30, check: (_r, e) => counter(e, 'flawless') > 0 },
  { id: 'swift', reward: 30, check: (_r, e) => counter(e, 'swift') > 0 },
  // Variety — the four free protocols each finish a campaign.
  { id: 'styles', reward: 120, check: (_r, e) => playedAllStyles(e) },
  // Wins.
  { id: 'win1', reward: 50, check: (r) => r.wins >= 1 },
  { id: 'win5', reward: 100, check: (r) => r.wins >= 5 },
  { id: 'win15', reward: 300, check: (r) => r.wins >= 15 },
  // Difficulty first-clears, campaign only.
  { id: 'diff-standard', reward: 300, check: (_r, e) => (e.winsByDifficulty['standard'] ?? 0) > 0 },
  { id: 'diff-advanced', reward: 400, check: (_r, e) => (e.winsByDifficulty['advanced'] ?? 0) > 0 },
  { id: 'diff-hard', reward: 600, check: (_r, e) => (e.winsByDifficulty['hard'] ?? 0) > 0 },
  { id: 'diff-nightmare', reward: 900, check: (_r, e) => (e.winsByDifficulty['nightmare'] ?? 0) > 0 },
  { id: 'diff-abyss', reward: 1500, check: (_r, e) => (e.winsByDifficulty['abyss'] ?? 0) > 0 },
  // Endless depth.
  { id: 'end10', reward: 100, check: (r) => r.bestEndless >= 10 },
  { id: 'end15', reward: 200, check: (r) => r.bestEndless >= 15 },
  { id: 'end20', reward: 400, check: (r) => r.bestEndless >= 20 },
  { id: 'end30', reward: 800, check: (r) => r.bestEndless >= 30 },
  { id: 'end50', reward: 1600, check: (r) => r.bestEndless >= 50 },
  // Combo peaks.
  { id: 'combo100', reward: 50, check: (_r, e) => e.bestCombo >= 100 },
  { id: 'combo300', reward: 200, check: (_r, e) => e.bestCombo >= 300 },
  { id: 'combo1000', reward: 500, check: (_r, e) => e.bestCombo >= 1000 },
  // Volume.
  { id: 'runs10', reward: 100, check: (r) => r.runs >= 10 },
  { id: 'runs30', reward: 300, check: (r) => r.runs >= 30 },
  { id: 'runs100', reward: 600, check: (r) => r.runs >= 100 },
  { id: 'runs300', reward: 2000, check: (r) => r.runs >= 300 },
  { id: 'bricks1k', reward: 100, check: (r) => r.bricks >= 1000 },
  { id: 'bricks10k', reward: 400, check: (r) => r.bricks >= 10000 },
  { id: 'bricks100k', reward: 2000, check: (r) => r.bricks >= 100000 },
];

export const MILESTONE_MAP: Record<string, MilestoneDef> = Object.fromEntries(
  MILESTONES.map((milestone) => [milestone.id, milestone]),
);

/** Sum of every milestone reward — the lifetime ceiling of milestone income. */
export const MILESTONE_TOTAL = MILESTONES.reduce((sum, milestone) => sum + milestone.reward, 0);

/**
 * Awards every milestone whose condition now holds and that has not been awarded before.
 * Returns the newly earned ids and their total reward; call it after the run's aggregates
 * (wins, counters, best combo) have been folded in, so clearing a difficulty pays on the run
 * that cleared it.
 */
export function settleMilestones(
  records: Records,
  economy: EconomyState,
): { earned: string[]; reward: number } {
  const earned: string[] = [];
  let reward = 0;
  for (const milestone of MILESTONES) {
    if (economy.milestones.includes(milestone.id)) continue;
    if (!milestone.check(records, economy)) continue;
    economy.milestones.push(milestone.id);
    earned.push(milestone.id);
    reward += milestone.reward;
  }
  return { earned, reward };
}

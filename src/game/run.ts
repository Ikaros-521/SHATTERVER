import { MAX_HP_BASE } from './config';
import type { DifficultyId } from './difficulty';
import type { ReactionId } from './levels/definitions';
import { defaultStats, type BuildStats } from './upgrades/stats';

export type RunMode = 'campaign' | 'endless';

export interface LevelRecord {
  level: number;
  name: string;
  time: number;
  killed: number;
  maxCombo: number;
  damageTaken: number;
}

/** Everything that persists from level to level within one run. */
export interface Run {
  mode: RunMode;
  seed: number;
  /** Difficulty tier the run was started on. */
  difficulty: DifficultyId;
  /** 1-based index of the level currently being played. */
  level: number;
  levelsCleared: number;
  /** upgrade id → level */
  upgrades: Record<string, number>;
  stats: BuildStats;
  hp: number;
  maxHp: number;
  /** Extra shield capacity from a carried supply, on top of upgrades. 0 without one. */
  bonusHp: number;
  /** 「续战核心」 is single-use per run; the flag lives here because worlds are per level. */
  secondWindUsed: boolean;
  crystals: number;
  score: number;
  time: number;
  kills: number;
  totalDamage: number;
  maxCombo: number;
  damageTaken: number;
  history: LevelRecord[];
  /** Elemental reactions discovered this run. */
  reactions: ReactionId[];
  /** Run-wide play counters, folded from each level at its end. Milestone food. */
  perfects: number;
  capsules: number;
  overdrives: number;
  reactionTriggers: number;
  bosses: number;
}

export function createRun(mode: RunMode, seed: number): Run {
  return {
    mode,
    seed,
    difficulty: 'standard',
    level: 1,
    levelsCleared: 0,
    upgrades: {},
    stats: defaultStats(),
    hp: MAX_HP_BASE,
    maxHp: MAX_HP_BASE,
    bonusHp: 0,
    secondWindUsed: false,
    crystals: 0,
    score: 0,
    time: 0,
    kills: 0,
    totalDamage: 0,
    maxCombo: 0,
    damageTaken: 0,
    history: [],
    reactions: [],
    perfects: 0,
    capsules: 0,
    overdrives: 0,
    reactionTriggers: 0,
    bosses: 0,
  };
}

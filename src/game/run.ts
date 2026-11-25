import { MAX_HP_BASE } from './config';
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
  /** 1-based index of the level currently being played. */
  level: number;
  levelsCleared: number;
  /** upgrade id → level */
  upgrades: Record<string, number>;
  stats: BuildStats;
  hp: number;
  maxHp: number;
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
}

export function createRun(mode: RunMode, seed: number): Run {
  return {
    mode,
    seed,
    level: 1,
    levelsCleared: 0,
    upgrades: {},
    stats: defaultStats(),
    hp: MAX_HP_BASE,
    maxHp: MAX_HP_BASE,
    crystals: 0,
    score: 0,
    time: 0,
    kills: 0,
    totalDamage: 0,
    maxCombo: 0,
    damageTaken: 0,
    history: [],
    reactions: [],
  };
}

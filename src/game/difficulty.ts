/**
 * Difficulty tiers, chosen before a run starts.
 *
 * The roguelite build curve outruns the level curve quickly — a stacked build wins without
 * moving. Each tier turns a different set of screws so "stronger" never means "free":
 * faster descent, more bricks, thinner paddle, slower balls, denser bullet fire, bricks that
 * eat balls, and (at the top) a periodic purge of surplus balls. Higher tiers pay out a score
 * multiplier, so the local leaderboard is climbed by climbing the tiers.
 */

export type DifficultyId = 'standard' | 'advanced' | 'hard' | 'nightmare' | 'abyss';

export interface Difficulty {
  id: DifficultyId;
  name: string;
  en: string;
  /** One line for the selector. */
  desc: string;
  color: number;
  /** Every point of score is multiplied by this. */
  scoreMult: number;
  /** Brick-field descent speed multiplier (boss levels have no descent). */
  descentMult: number;
  /** Brick and boss hit-point multiplier. */
  hpMult: number;
  /** Rows of extra bricks stacked above the level's pattern. Never on boss levels. */
  extraRows: number;
  /** Paddle width multiplier. */
  paddleMult: number;
  /** Ball speed multiplier. */
  ballSpeedMult: number;
  /** Turret and boss fire-rate multiplier. */
  bulletMult: number;
  /** Fraction of plain bricks replaced with ball-eating eraser bricks. */
  eraserChance: number;
  /** Seconds between purges that void one surplus ball; 0 disables the purge. */
  purgePeriod: number;
  /** Bullet points shown on the selector and the run-start banner. */
  detail: string[];
}

export const DIFFICULTIES: readonly Difficulty[] = [
  {
    id: 'standard',
    name: '标准',
    en: 'STANDARD',
    desc: '原版体验。构筑成型后会越来越轻松。',
    color: 0x7dffe0,
    scoreMult: 1,
    descentMult: 1,
    hpMult: 1,
    extraRows: 0,
    paddleMult: 1,
    ballSpeedMult: 1,
    bulletMult: 1,
    eraserChance: 0,
    purgePeriod: 0,
    detail: ['关卡与原版一致'],
  },
  {
    id: 'advanced',
    name: '进阶',
    en: 'ADVANCED',
    desc: '墙更厚、沉得更快。强度开始有意义。',
    color: 0x9ff3ff,
    scoreMult: 1.5,
    descentMult: 1.2,
    hpMult: 1.15,
    extraRows: 1,
    paddleMult: 1,
    ballSpeedMult: 1,
    bulletMult: 1,
    eraserChance: 0,
    purgePeriod: 0,
    detail: ['砖块血量 +25%', '下沉速度 +30%', '额外 1 行砖'],
  },
  {
    id: 'hard',
    name: '困难',
    en: 'HARD',
    desc: '挡板变窄，弹幕变密，出现会吃球的湮灭砖。',
    color: 0xffd24a,
    scoreMult: 2.2,
    descentMult: 1.3,
    hpMult: 1.25,
    extraRows: 2,
    paddleMult: 0.95,
    ballSpeedMult: 1,
    bulletMult: 1.1,
    eraserChance: 0.04,
    purgePeriod: 0,
    detail: ['砖块血量 +30%', '下沉速度 +40%', '额外 2 行砖', '挡板 −5%', '弹幕 +10%', '4% 湮灭砖'],
  },
  {
    id: 'nightmare',
    name: '噩梦',
    en: 'NIGHTMARE',
    desc: '球速被压制，湮灭砖成排。留给离谱构筑的考场。',
    color: 0xff5c8a,
    scoreMult: 3,
    descentMult: 1.5,
    hpMult: 1.4,
    extraRows: 3,
    paddleMult: 0.9,
    ballSpeedMult: 0.96,
    bulletMult: 1.2,
    eraserChance: 0.07,
    purgePeriod: 0,
    detail: ['砖块血量 +50%', '下沉速度 +60%', '额外 3 行砖', '挡板 −10%', '球速 −4%', '弹幕 +20%', '7% 湮灭砖'],
  },
  {
    id: 'abyss',
    name: '深渊',
    en: 'ABYSS',
    desc: '界外之物。每 16 秒，多出的球会被抹掉一个。',
    color: 0xff2fb0,
    scoreMult: 4,
    descentMult: 1.75,
    hpMult: 1.6,
    extraRows: 4,
    paddleMult: 0.85,
    ballSpeedMult: 0.92,
    bulletMult: 1.4,
    eraserChance: 0.1,
    purgePeriod: 16,
    detail: [
      '砖块血量 +75%',
      '下沉速度 +90%',
      '额外 4 行砖',
      '挡板 −22%',
      '球速 −10%',
      '弹幕 +50%',
      '12% 湮灭砖',
      '每 16 秒抹除一个多余的球',
    ],
  },
];

export const DIFFICULTY_MAP: Record<DifficultyId, Difficulty> = Object.fromEntries(
  DIFFICULTIES.map((d) => [d.id, d]),
) as Record<DifficultyId, Difficulty>;

export const DEFAULT_DIFFICULTY: DifficultyId = 'standard';

export function isDifficultyId(value: unknown): value is DifficultyId {
  return typeof value === 'string' && value in DIFFICULTY_MAP;
}

export function difficultyOf(id: unknown): Difficulty {
  return isDifficultyId(id) ? DIFFICULTY_MAP[id] : DIFFICULTY_MAP[DEFAULT_DIFFICULTY];
}

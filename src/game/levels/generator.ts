import { bossScale, DANGER_Y, GRID, hpUnit } from '../config';
import { mixHex } from '../../core/math';
import type { RNG } from '../../core/rng';
import { ERASER_COLOR, type BossRole, type BrickType } from '../entities';
import { difficultyOf, type Difficulty } from '../difficulty';
import { BOSSES, CHAPTERS, MODIFIERS, type BossDef, type ModifierDef } from './definitions';
import * as P from './patterns';
import type { Cell } from './patterns';

export const BOSS_EVERY = 5;
export const CAMPAIGN_LENGTH = BOSS_EVERY * CHAPTERS.length;

export interface LevelCell {
  col: number;
  row: number;
  type: BrickType;
  role: BossRole | null;
  color: number;
}

/** Everything the simulation needs to instantiate one level. Built deterministically from a seed. */
export interface LevelPlan {
  index: number;
  /** 0-based index into CHAPTERS. */
  chapter: number;
  /** e.g. "1-3" */
  code: string;
  name: string;
  modifier: ModifierDef | null;
  boss: BossDef | null;
  /** Hit points of a plain brick; other types scale from it. */
  hpUnit: number;
  cells: LevelCell[];
  /** Steady descent speed of the brick field in world units per second. 0 on boss levels. */
  descent: number;
  /** Seconds of calm before the field starts accelerating. */
  parTime: number;
  speedMult: number;
  damageMult: number;
  /** Multiplier applied to every boss part's HP. Only meaningful when `boss` is set. */
  bossScale: number;
}

type Recipe = (rng: RNG) => Cell[];

/** Hand-picked shapes for the campaign. Boss levels (5/10/15) are not listed. */
const CAMPAIGN: Record<number, Recipe> = {
  1: () => P.checker(5),
  2: () => P.checker(5),
  3: () => P.pyramid(6),
  4: () => [...P.diagonals(5), ...P.offsetCells(P.solid(1), 0, 6)],
  6: () => P.diamond(9),
  7: () => [...P.sprite('invader'), ...P.offsetCells(P.solid(2), 0, 9)],
  8: () => P.wave(4),
  9: () => P.cross(9),
  11: () => [...P.sprite('skull'), ...P.offsetCells(P.checker(2), 0, 9)],
  12: () => [...P.sprite('heart'), ...P.offsetCells(P.solid(2), 0, 8)],
  13: () => [...P.funnel(7), ...P.offsetCells(P.frame(3), 0, 9)],
  14: () => [...P.sprite('ship'), ...P.offsetCells(P.stripes(3), 0, 9)],
};

/** Building blocks for the endless mode, where layouts are stacked at random. */
const SHAPES: Recipe[] = [
  () => P.solid(3),
  () => P.solid(4),
  () => P.checker(6),
  () => P.pyramid(6),
  () => P.funnel(6),
  () => P.diamond(7),
  () => P.diagonals(6),
  () => P.cross(9),
  () => P.frame(4),
  () => P.wave(4),
  () => P.sprite('invader'),
  () => P.sprite('skull'),
  () => P.sprite('heart'),
  () => P.sprite('ship'),
  () => P.sprite('bot'),
];

const SPECIAL_COLORS: Record<string, number> = {
  gold: 0xffc93c,
  explosive: 0xff6b1a,
  elite: 0xff2d6f,
  turret: 0xc8ff3d,
  eraser: ERASER_COLOR,
};

const at = <T>(items: readonly T[], index: number): T =>
  items[((index % items.length) + items.length) % items.length] as T;

export function chapterOf(level: number): number {
  return Math.floor((level - 1) / BOSS_EVERY) % CHAPTERS.length;
}

/** 0 during the campaign, then 1, 2, … each time the endless mode wraps around. */
export function cycleOf(level: number): number {
  return Math.floor((level - 1) / CAMPAIGN_LENGTH);
}

export function isBossLevel(level: number): boolean {
  return level % BOSS_EVERY === 0;
}

/**
 * How much of a tier's pressure applies at a given level: a fresh build with a handful of picks
 * should breathe, while a maxed one meets the tier at full strength from sector 9 on.
 */
export function difficultyRamp(level: number): number {
  return Math.min(1, 0.3 + (level - 1) / 16);
}

/** Deepest lattice row that still leaves breathing room above the danger line. */
export const SAFE_MAX_ROW = Math.floor((DANGER_Y - 200 - GRID.y0 - GRID.brickH / 2) / GRID.pitchY);

function compose(level: number, rng: RNG): Cell[] {
  const recipe = CAMPAIGN[level];
  if (recipe) return recipe(rng);
  // Endless: stack two random shapes with a gap between them.
  const first = rng.pick(SHAPES)(rng);
  const second = rng.pick(SHAPES)(rng);
  return [...first, ...P.offsetCells(second, 0, P.maxRow(first) + 2)];
}

/**
 * Turns a shape into real bricks: elites and turrets are placed first (guaranteed counts),
 * then gold, then everything else is rolled for armour and explosives.
 */
function decorate(
  cells: Cell[],
  level: number,
  chapter: number,
  rng: RNG,
  modifier: ModifierDef | null,
  eraserChance = 0,
): LevelCell[] {
  const palette = CHAPTERS[chapter]?.bricks ?? CHAPTERS[0].bricks;
  const out: LevelCell[] = rng.shuffle([...cells]).map((c) => ({
    ...c,
    type: 'normal' as BrickType,
    role: null,
    color: at(palette, c.row),
  }));

  let cursor = 0;
  const take = (): LevelCell | null => {
    while (cursor < out.length && out[cursor]?.type !== 'normal') cursor++;
    return out[cursor++] ?? null;
  };
  const place = (type: BrickType, count: number): void => {
    for (let i = 0; i < count; i++) {
      const cell = take();
      if (!cell) return;
      cell.type = type;
      cell.color = SPECIAL_COLORS[type] ?? cell.color;
    }
  };

  place('elite', Math.min(4, level >= 6 ? 1 + Math.floor((level - 6) / 4) : 0));
  place(
    'turret',
    modifier?.id === 'flak' ? 5 : chapter >= 1 ? Math.min(3, 1 + Math.floor((level - 6) / 5)) : 0,
  );
  // Erasers feed on plain bricks before gold gets its share, so economy bricks stay economy.
  if (eraserChance > 0) {
    place('eraser', Math.max(1, Math.round(out.length * eraserChance)));
  }
  place('gold', modifier?.id === 'gold' ? Math.round(out.length * 0.18) : 2 + Math.floor(level / 3));

  const armoredChance = Math.min(0.2, 0.03 + 0.012 * level);
  const toughChance = Math.min(0.5, 0.12 + 0.02 * level);
  for (const cell of out) {
    if (cell.type !== 'normal') continue;
    const roll = rng.next();
    if (level >= 4 && roll < armoredChance) {
      cell.type = 'armored';
      cell.color = mixHex(cell.color, 0xdfe8ff, 0.55);
    } else if (level >= 2 && roll < toughChance) {
      cell.type = 'tough';
    } else if (roll > 0.94) {
      cell.type = 'explosive';
      cell.color = SPECIAL_COLORS.explosive as number;
    }
  }
  return out;
}

function bossCells(boss: BossDef): LevelCell[] {
  const cells: LevelCell[] = [];
  boss.rows.forEach((line, r) => {
    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      if (ch !== '#' && ch !== '@' && ch !== 't') continue;
      const role: BossRole = ch === '@' ? 'core' : ch === 't' ? 'turret' : 'armor';
      cells.push({
        col: c,
        row: r + 1,
        type: 'normal',
        role,
        color:
          role === 'core'
            ? boss.coreColor
            : role === 'turret'
              ? mixHex(boss.color, 0xffffff, 0.55)
              : boss.color,
      });
    }
  });
  return cells;
}

/**
 * Builds the plan for a 1-based level index. Same (level, rng state) → same level; the chosen
 * difficulty only ever scales what comes out, so a seed's geography stays reproducible.
 */
export function buildLevel(
  index: number,
  rng: RNG,
  difficulty: Difficulty = difficultyOf('standard'),
): LevelPlan {
  const level = Math.max(1, Math.floor(index));
  const chapter = chapterOf(level);
  const cycle = cycleOf(level);
  const boss = isBossLevel(level) ? at(BOSSES, level / BOSS_EVERY - 1) : null;
  const modifier = !boss && level >= 3 && rng.chance(0.45) ? rng.pick(MODIFIERS) : null;
  const rush = modifier?.id === 'rush';
  const info = CHAPTERS[chapter] ?? CHAPTERS[0];

  // Difficulty pressure ramps in over the first third of the campaign; see `difficultyRamp`.
  const ramp = difficultyRamp(level);
  const eraserChance = boss ? 0 : difficulty.eraserChance * Math.min(1, level / 6);
  // The name draw comes before compose on purpose: it keeps this file's rng consumption in the
  // original order, so standard-tier plans stay byte-identical to the pre-difficulty ones.
  const name = boss ? boss.name : (rng.pick(info.places) ?? info.name);
  const cells = compose(level, rng);
  // Extra rows sit above the pattern, pushing it down — but never past the danger line's
  // breathing room, which deep endless stacks can already approach on their own.
  const extraRows = boss
    ? 0
    : Math.max(0, Math.min(Math.round(difficulty.extraRows * ramp), SAFE_MAX_ROW - P.maxRow(cells)));
  const stacked = extraRows > 0 ? [...topRows(extraRows, rng), ...P.offsetCells(cells, 0, extraRows)] : cells;

  return {
    index: level,
    chapter,
    code: `${chapter + 1 + cycle * CHAPTERS.length}-${((level - 1) % BOSS_EVERY) + 1}`,
    name,
    modifier,
    boss,
    hpUnit: Math.round(hpUnit(level) * (1 + cycle * 1.8) * (1 + (difficulty.hpMult - 1) * ramp)),
    cells: boss ? bossCells(boss) : decorate(stacked, level, chapter, rng, modifier, eraserChance),
    descent: boss ? 0 : (5 + level * 1.1) * (rush ? 1.5 : 1) * (1 + (difficulty.descentMult - 1) * ramp),
    parTime: Math.min(50, 26 + level),
    speedMult: rush ? 1.25 : 1,
    damageMult: rush ? 1.25 : 1,
    bossScale: bossScale(level) * (1 + (difficulty.hpMult - 1) * ramp),
  };
}

/** Sparse filler rows above the pattern: dense enough to matter, loose enough to stay readable. */
function topRows(count: number, rng: RNG): Cell[] {
  const cells: Cell[] = [];
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < 12; col++) {
      if (rng.chance(0.62)) cells.push({ col, row });
    }
  }
  return cells;
}

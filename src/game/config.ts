import type { Rarity } from './upgrades/types';

/**
 * Tuning constants. The simulation runs in a fixed logical space ("world units"); the renderer
 * scales that space uniformly to whatever window it is given.
 */
export const ARENA_W = 720;
export const ARENA_H = 960;
export const WALL = 6;

/** Brick lattice. 12 columns fit inside the walls with a symmetric margin. */
export const GRID = {
  cols: 12,
  x0: 8,
  y0: 70,
  pitchX: 59,
  pitchY: 30,
  brickW: 55,
  brickH: 26,
} as const;

export const PADDLE_Y = ARENA_H - 70;
export const PADDLE_H = 16;
export const PADDLE_W = 124;

/** Bricks that sink past this line breach the shield and cost a life. */
export const DANGER_Y = ARENA_H - 200;

export const BALL_RADIUS = 8;
export const BALL_SPEED = 700;
/**
 * Anti-stall. A ball that has not touched a brick for a while is nudged off a purely vertical
 * path: first when the paddle returns it, then continuously in flight. The ball never wastes the player's time.
 */
export const BALL_DRY_NUDGE = 2.5;
export const BALL_ANTI_STALL = 4;

/** How far (radians) a paddle-edge hit deflects the return angle from vertical. */
export const PADDLE_BOUNCE_SPREAD = 1.05;

/** Ceilings for how far buffs can stretch the paddle and swell the ball, on top of a maxed build. */
export const MAX_PADDLE_HALF = 290;
export const MAX_BALL_RADIUS = 34;

/** Catch offset from the paddle's centre (fraction of its half-width) that still counts as perfect. */
export const PERFECT_WINDOW = 0.16;
export const PERFECT_ENERGY = 7;
export const CATCH_ENERGY = 2.5;

/**
 * Temporary buffs (「增益胶囊」). A level's first capsule is due a few seconds in, so every level
 * has one; after that they settle into a slower rhythm. "Due" means the next brick shattered
 * drops it — a capsule has to come from somewhere.
 */
export const BUFF_FIRST_MIN = 3.5;
export const BUFF_FIRST_MAX = 6;
export const BUFF_INTERVAL_MIN = 13;
export const BUFF_INTERVAL_MAX = 19;
/** Terminal fall speed of a power-up capsule: fast enough to matter, slow enough to chase. */
export const CAPSULE_FALL_SPEED = 520;

/** 「球体分裂」: each ball in flight forks into two twins, splayed by this angle either side. */
export const SPLIT_ANGLE = 0.38;
export const SPLIT_CLONE_MULT = 0.7;
export const SPLIT_CLONE_RADIUS = 0.85;
/** Twins on the field at once, whatever the ball list could still hold. */
export const MAX_CLONES = 48;

/** 「弹幕屏障」: the line under the paddle where bullets are swallowed. */
export const AEGIS_Y = PADDLE_Y + PADDLE_H / 2 + 10;

/** 永动引擎: overdrive energy gained while a buff is running. */
export const PERPETUUM_GAIN = 3;

/** 雷云: the automatic strike's rhythm, and its damage as a multiple of attack power. */
export const THUNDER_INTERVAL = 2.5;
export const THUNDER_DAMAGE = 3;

/** 临界质量: bricks shattered per extension, and how much Overdrive can grow in total. */
export const CRITICAL_MASS_KILLS = 5;
export const CRITICAL_MASS_BONUS = 0.5;
export const CRITICAL_MASS_CAP = 6;

/** 过载余波: the shockwave reaches every brick, and what it deals as a multiple of attack power. */
export const AFTERGLOW_RADIUS = 1500;
export const AFTERGLOW_DAMAGE = 2;

export const PLAGUE_RADIUS = 150;
export const WILDFIRE_RADIUS = 140;
/** 棱镜: how far a refracted beam looks for its brick, and its damage as a fraction of attack power. */
export const PRISM_RANGE = 240;
export const PRISM_DAMAGE = 0.5;

/**
 * Capsules read the field. The wall's pressure is 0 until its lowest brick enters this band above
 * the danger line, and 1 at the line — the same reading the line's glow uses.
 */
export const DANGER_BAND = 260;
/** A sinking field is offered more of what tears it down, and less of what only guards the paddle. */
export const PRESSURE_OFFENCE = 1.5;
export const PRESSURE_TIMESTOP = 2;
export const PRESSURE_COVER = 0.4;
/** A low shield sees repair capsules that much more often, at one shield left. */
export const HURT_REPAIR = 1.5;

/** Damage of a completely unupgraded ball, per hit. */
export const BASE_DMG = 10;
export const MAX_HP_BASE = 4;

/**
 * Base score one brick is worth at most, before combo, level and difficulty.
 *
 * Brick HP grows 16% a level and boss parts compound a second geometric growth on top, so a
 * score paid per point of damage reached 1e18 by endless level 100. A brick whose HP is at most
 * this times its weight (`BRICK_HP` / `BOSS_HP`) still scores exactly the damage dealt; a bigger
 * one is scaled down so the whole brick is worth what a brick at the line is. Score then grows
 * about linearly with the level and stays near 1e10 at level 400.
 *
 * Every campaign brick on every difficulty sits under the line — the toughest, an abyss
 * level-15 boss core, has 1919 hit points against its weight-scaled line of 8 × 300 = 2400 —
 * and standard endless only crosses it at level 18, so every campaign score is exactly what it
 * was before the cap existed.
 */
export const SCORE_BRICK_CAP = 300;

export const OVERDRIVE_DURATION = 6;
/** Seconds of typical play needed to fill the overdrive meter, whatever the hit rate is. */
export const OVERDRIVE_FILL_SECONDS = 11;
export const COMBO_TIME = 2.6;

/**
 * Wave sectors (`levels/generator.ts` → `wavesInLevel`). Past the campaign the endless mode pairs
 * consecutive ordinary levels into sectors of this many waves: the next wave opens as soon as one
 * falls, with no draft between them, and the sector pays at its end.
 *
 * Every wave is still a level in its own right — the same brick toughness, its own place on the
 * boss roster, its own draft when the sector settles — so difficulty climbs exactly as it did
 * when every level drafted on its own. What does change is that a sector's first draft arrives
 * one wall late, a small cost the sector bonus below pays back. And it is two because it has to
 * divide the four ordinary levels between two bosses, or a sector would straddle a boss.
 */
export const ENDLESS_WAVES = 2;

/**
 * What clearing a wave sector pays on top of the drafts its waves earned (`session.ts`): one
 * crystal share per wave, the share growing with depth, and a point of shield back. The crystals
 * are sized against a reroll — the benchmark for what crystals buy mid-run — so a cleared sector
 * is worth about seventy per cent of one.
 */
export const SECTOR_CLEAR_CRYSTALS_BASE = 8;
export const SECTOR_CLEAR_CRYSTALS_PER_LEVEL = 2;
export const SECTOR_CLEAR_SHIELD = 1;

/**
 * What it costs to ban one offered card off the draft for the rest of the run (`session.ts`): a
 * base price by the card's rarity, plus an escalation that climbs with every ban already made
 * this run. A ban is worth more than a reroll — it is permanent and aimed, not a fresh roll that
 * may deal the same card again — so its base starts around twice a reroll's; the escalation is
 * the real limiter: three bans in, the next one costs as much as a handful of rerolls, which
 * keeps a crystal-rich run from scrubbing the pool clean.
 */
export const BAN_COST_BASE: Record<Rarity, number> = {
  common: 30,
  rare: 40,
  epic: 50,
  legendary: 65,
  mythic: 80,
};
export const BAN_COST_ESCALATION = 30;

/** Safety valves. They should never bind in normal play; they exist so a runaway build cannot freeze the frame. */
export const MAX_BALLS = 180;
export const MAX_BULLETS = 36;
export const MAX_HOLES = 6;
export const MAX_DEATHS_PER_FLUSH = 4000;

/**
 * Base hit points of a plain brick at a given level.
 *
 * It grows ~16% per level on purpose — slower than a typical build's damage — so ordinary bricks
 * stay one- or two-hit all run and the challenge comes from count, pace, hazards and boss HP.
 */
export function hpUnit(level: number): number {
  return Math.round(10 * Math.pow(1.16, Math.max(1, level) - 1));
}

/**
 * Boss HP multiplier per level.
 *
 * Balls hit a compact boss far less often than they hit a full brick field, so on top of
 * `hpUnit` bosses scale with a small base that grows about as fast as a decent build's DPS:
 * fights stay comparable in length, and a runaway synergy build still melts them.
 */
export function bossScale(level: number): number {
  return 0.13 * Math.pow(1.17, Math.max(1, level) - 1);
}

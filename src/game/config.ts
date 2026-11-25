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
 * Every point of score is multiplied by this once, in `applyDamage` — the only place score is
 * awarded. The Bilibili Toy leaderboards store scores as integers up to 2^24 − 1 = 16 777 215,
 * and deep endless runs used to earn 10⁷–10⁹ raw points, so entire boards piled up clamped at
 * the ceiling. Dividing by 100 keeps a hard-mode campaign win around 20–40K and pushes the
 * ceiling past ~level 40 standard / ~level 35 abyss, beyond any normal run; the client-side
 * clamp in `net/toy.ts` stays as the last-resort safety valve.
 */
export const SCORE_SCALE = 0.01;

export const OVERDRIVE_DURATION = 6;
/** Seconds of typical play needed to fill the overdrive meter, whatever the hit rate is. */
export const OVERDRIVE_FILL_SECONDS = 11;
export const COMBO_TIME = 2.6;

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

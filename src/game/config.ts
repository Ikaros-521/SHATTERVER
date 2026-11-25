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

/** Damage of a completely unupgraded ball, per hit. */
export const BASE_DMG = 10;
export const MAX_HP_BASE = 4;

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

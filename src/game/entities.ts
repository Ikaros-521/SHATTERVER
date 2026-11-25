import { GRID } from './config';

let nextId = 1;
export const allocId = (): number => nextId++;

export type BrickType = 'normal' | 'tough' | 'armored' | 'gold' | 'explosive' | 'elite' | 'turret';
export type BossRole = 'armor' | 'core' | 'turret';

/**
 * Relative hit points of each brick type, before the per-level unit is applied.
 * Kept low on purpose: multi-hit bricks are speed bumps, not sponges — a brick that takes more
 * than a handful of hits drains the fun out of a level.
 */
export const BRICK_HP: Record<BrickType, number> = {
  normal: 1,
  tough: 2.2,
  armored: 4.5,
  gold: 1.6,
  explosive: 1,
  elite: 14,
  turret: 3,
};

/**
 * Boss part HP relative to a plain brick of the same level. Each armour piece should feel chunky
 * (a few hits with an unupgraded ball) without turning the boss into a slog; see `bossScale`.
 */
export const BOSS_HP: Record<BossRole, number> = {
  armor: 3,
  core: 8,
  turret: 2,
};

export interface Brick {
  id: number;
  type: BrickType;
  /** Lattice coordinates, used for layout and adjacency. */
  col: number;
  row: number;
  x: number;
  y: number;
  /** Position before field descent / boss sway is applied. */
  baseX: number;
  baseY: number;
  w: number;
  h: number;
  hp: number;
  maxHp: number;
  /** 0xRRGGBB. */
  color: number;
  /** 1 for a plain brick, higher = beefier. Drives how loudly the brick explodes. */
  tier: number;
  // --- presentation state (harmless to simulate headlessly) ---
  flash: number;
  scale: number;
  kx: number;
  ky: number;
  seed: number;
  // --- statuses ---
  burnT: number;
  burnDps: number;
  /** Attack power that applied the burn, so a burn kill credits the right proc strength. */
  burnPower: number;
  poisonT: number;
  poisonRatio: number;
  poisonPower: number;
  frostT: number;
  tickT: number;
  shockCd: number;
  reactCd: number;
  // --- behaviour ---
  dead: boolean;
  /** Cloaked bricks cannot be targeted by homing and are nearly invisible until hit. */
  cloaked: boolean;
  /** Self-descent speed for bricks that were summoned mid-level. */
  vy: number;
  shootCd: number;
  boss: boolean;
  bossRole: BossRole | null;
}

export interface BrickInit {
  col: number;
  row: number;
  type: BrickType;
  hp: number;
  color: number;
  seed: number;
  bossRole?: BossRole | null;
}

export function makeBrick(init: BrickInit): Brick {
  const x = GRID.x0 + init.col * GRID.pitchX + GRID.brickW / 2;
  const y = GRID.y0 + init.row * GRID.pitchY + GRID.brickH / 2;
  const bossRole = init.bossRole ?? null;
  return {
    id: allocId(),
    type: init.type,
    col: init.col,
    row: init.row,
    x,
    y,
    baseX: x,
    baseY: y,
    w: GRID.brickW,
    h: GRID.brickH,
    hp: init.hp,
    maxHp: init.hp,
    color: init.color,
    tier: BRICK_HP[init.type] + (bossRole ? BOSS_HP[bossRole] : 0),
    flash: 0,
    scale: 1,
    kx: 0,
    ky: 0,
    seed: init.seed,
    burnT: 0,
    burnDps: 0,
    burnPower: 0,
    poisonT: 0,
    poisonRatio: 0,
    poisonPower: 0,
    frostT: 0,
    tickT: 0,
    shockCd: 0,
    reactCd: 0,
    dead: false,
    cloaked: false,
    vy: 0,
    shootCd: 1.5,
    boss: bossRole !== null,
    bossRole,
  };
}

export interface Ball {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
  radius: number;
  /** Damage relative to a standard ball: children and mirror ghosts hit for less. */
  mult: number;
  /** Damage bonus banked during this flight (momentum / phantom lance). Reset by the paddle. */
  momentum: number;
  /** Seconds of "charged return" bonus remaining. */
  emp: number;
  alive: boolean;
  docked: boolean;
  /** Seconds until a lost ball is re-launched from the paddle. */
  respawnT: number;
  ttl: number;
  ghost: boolean;
  child: boolean;
  /** brick id → world time until which the ball no longer collides with that brick. */
  ignore: Map<number, number>;
  // --- presentation state ---
  squash: number;
  /** Lattice slot used while docked on the paddle. */
  dock: number;
  solarT: number;
  stallT: number;
  /** Seconds since this ball last touched a brick. Drives the anti-stall nudges. */
  dryT: number;
}

export interface BallInit {
  x: number;
  y: number;
  angle: number;
  speed: number;
  radius: number;
  mult: number;
  ghost?: boolean;
  child?: boolean;
  ttl?: number;
  dock?: number;
}

export function makeBall(init: BallInit): Ball {
  return {
    id: allocId(),
    x: init.x,
    y: init.y,
    vx: Math.cos(init.angle) * init.speed,
    vy: Math.sin(init.angle) * init.speed,
    speed: init.speed,
    radius: init.radius,
    mult: init.mult,
    momentum: 0,
    emp: 0,
    alive: true,
    docked: false,
    respawnT: 0,
    ttl: init.ttl ?? Infinity,
    ghost: init.ghost ?? false,
    child: init.child ?? false,
    ignore: new Map(),
    squash: 0,
    dock: init.dock ?? 0,
    solarT: 0,
    stallT: 0,
    dryT: 0,
  };
}

export type PickupKind = 'crystal' | 'heart';

export interface Pickup {
  id: number;
  kind: PickupKind;
  value: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Homing speed once the pickup starts tracking the paddle. */
  spd: number;
  t: number;
  dead: boolean;
}

export interface Bullet {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  dead: boolean;
}

/** A temporary gravity well that chews bricks and bends ball trajectories. */
export interface Hole {
  x: number;
  y: number;
  r: number;
  life: number;
  maxLife: number;
  power: number;
  tick: number;
  dead: boolean;
}

/** Burning ground left behind by Meltdown. */
export interface FirePool {
  x: number;
  y: number;
  r: number;
  life: number;
  power: number;
  tick: number;
  dead: boolean;
}

/** Shrapnel projectile fired when a brick shatters. */
export interface Shard {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  power: number;
  color: number;
  dead: boolean;
}

/** Convert a lattice row to a world Y centre. */
export const rowToY = (row: number): number => GRID.y0 + row * GRID.pitchY + GRID.brickH / 2;

import { clamp } from '../core/math';
import {
  ARENA_H,
  ARENA_W,
  BASE_DMG,
  MAX_BALLS,
  MAX_HOLES,
  PADDLE_H,
  PLAGUE_RADIUS,
  PRISM_DAMAGE,
  PRISM_RANGE,
  WILDFIRE_RADIUS,
} from './config';
import { makeBall, MIN_FREE_BALLS, type Ball, type Brick, type Hole } from './entities';
import { REACTIONS, type ReactionDef, type ReactionId } from './levels/definitions';
import type { World } from './world';

/**
 * Where damage came from.
 *
 * - `ball`: a direct ball hit. The only source that can crit, execute (Reaper) or trigger on-hit procs.
 * - `secondary`: procs — explosions, lightning, echoes, lasers, shrapnel. Builds combo, never re-triggers on-hit effects.
 * - `dot`: burn / corrosion ticks.
 * - `area`: lingering zones (black holes, fire pools, auras). Does not build combo.
 */
export type DamageSource = 'ball' | 'secondary' | 'dot' | 'area';

export interface DamageCtx {
  x: number;
  y: number;
  /** Attack power behind the damage — what the procs it triggers scale from. */
  power: number;
  source: DamageSource;
  ball: Ball | null;
  crit: boolean;
  /** True when the damage came from an explosion. Gates Chain Reaction. */
  explosion: boolean;
}

export type ExplosionKind = 'normal' | 'nova' | 'ice' | 'hole' | 'summon' | 'brick';

const DOT_PERIOD = 0.4;
const BURN_TIME = 3;
const FROST_TIME = 1.6;
const POISON_TIME = 4;
/** Per-brick cooldown for elemental reactions, so they pop rhythmically instead of every single hit. */
const REACT_CD = 0.6;
const CHAIN_RANGE = 250;
const FROST_BONUS = 1.3;
/** Fire + lightning: radius and damage (as a fraction of attack power) of the Overload blast. */
const OVERLOAD_RADIUS = 80;
const OVERLOAD_DAMAGE = 0.45;

export const LASER_INTERVAL = 0.9;
export const LASER_DAMAGE = 0.6;
export const ORBITAL_INTERVAL = 4;
export const HOLE_TICK = 0.12;
export const POOL_TICK = 0.25;
export const SOLAR_PERIOD = 0.15;

const makeCtx = (
  x: number,
  y: number,
  power: number,
  source: DamageSource,
  patch: Partial<DamageCtx> = {},
): DamageCtx => ({
  x,
  y,
  power,
  source,
  ball: null,
  crit: false,
  explosion: false,
  ...patch,
});

/** Attack power shared by everything that is not a specific ball (lasers, procs after a DoT kill…). */
export function basePower(world: World): number {
  const s = world.live;
  let power = BASE_DMG * s.damageMult * world.level.damageMult;
  if (s.comboDamagePer10 > 0) power *= 1 + Math.floor(world.combo / 10) * s.comboDamagePer10;
  if (world.odActive) power *= 2 * s.odDamageBonus;
  if (world.timeStop > 0) power *= 2;
  return power;
}

export function ballPower(world: World, ball: Ball): number {
  let power = basePower(world) * ball.mult;
  if (ball.emp > 0) power *= 1 + world.live.empowerBonus;
  return power * (1 + ball.momentum);
}

// ───────────────────────────── damage pipeline ─────────────────────────────

/**
 * Applies damage to one brick and runs whatever follows: combo, energy, feedback events and —
 * if this blow was fatal — the brick's death procs (explosions, splits, shatters…).
 * Returns the damage actually dealt (clamped to remaining HP).
 */
export function applyDamage(world: World, brick: Brick, amount: number, ctx: DamageCtx): number {
  if (brick.dead || !(amount > 0) || !Number.isFinite(amount)) return 0;
  const s = world.live;

  let dmg = amount;
  let execute = false;
  if (
    ctx.source === 'ball' &&
    s.reaperRatio > 0 &&
    brick.bossRole !== 'core' &&
    brick.hp <= brick.maxHp * s.reaperRatio
  ) {
    dmg = brick.hp;
    execute = true;
  }
  if (brick.frostT > 0) dmg *= FROST_BONUS;

  const dealt = Math.min(brick.hp, dmg);
  brick.hp -= dmg;
  brick.cloaked = false;
  brick.flash = 1;
  brick.scale = Math.min(1.35, brick.scale + 0.16);

  world.totalDamage += dealt;
  world.run.score += dealt * (1 + world.combo * 0.01) * (1 + world.level.index * 0.25) * world.diff.scoreMult;
  if (ctx.source === 'ball' || ctx.source === 'secondary') world.addCombo();

  world.events.emit('hit', {
    x: ctx.x,
    y: ctx.y,
    dmg: dealt,
    crit: ctx.crit,
    execute,
    source: ctx.source,
    brick,
  });

  if (brick.hp <= 0) world.killBrick(brick, ctx);
  return dealt;
}

/**
 * A ball touched a brick. Returns true when the ball phased through instead of bouncing.
 *
 * Order matters: the hit itself first (it may kill, which runs death procs synchronously),
 * then on-hit procs only if the brick survived them.
 */
export function onBallHitBrick(
  world: World,
  ball: Ball,
  brick: Brick,
  nx: number,
  ny: number,
  cx: number,
  cy: number,
): boolean {
  const s = world.live;
  const power = ballPower(world, ball);
  const crit = world.rng.chance(s.critChance);
  const pierce = world.rng.chance(s.pierceChance);
  ball.dryT = 0;

  // Eraser bricks trade a ball for the hit — but never the last few, so a playable core always
  // remains. The ball still deals its damage; the price is the ball itself, not the punch.
  if (brick.type === 'eraser' && world.freeBallCount() > MIN_FREE_BALLS) {
    applyDamage(
      world,
      brick,
      power * (crit ? s.critMult : 1),
      makeCtx(cx, cy, power, 'ball', { ball, crit }),
    );
    world.voidBall(ball);
    return false;
  }

  applyDamage(world, brick, power * (crit ? s.critMult : 1), makeCtx(cx, cy, power, 'ball', { ball, crit }));
  if (!brick.dead) applyOnHit(world, brick, power);

  if (s.momentumPerHit > 0) ball.momentum = Math.min(s.momentumMax, ball.momentum + s.momentumPerHit);

  if (pierce) {
    if (s.pierceBonus > 0) ball.momentum = Math.min(s.momentumMax, ball.momentum + s.pierceBonus);
    ball.ignore.set(brick.id, world.time + Math.max(0.25, 160 / ball.speed));
    world.events.emit('pierce', { x: cx, y: cy, nx, ny, brick });
  } else {
    ball.ignore.set(brick.id, world.time + 0.05);
  }
  brick.kx -= nx * 5;
  brick.ky -= ny * 5;
  return pierce;
}

function applyOnHit(world: World, brick: Brick, power: number): void {
  const s = world.live;
  if (s.poison > 0) applyStatus(world, brick, 'poison', power);
  if (brick.dead) return;
  if (s.fire > 0) applyStatus(world, brick, 'burn', power);
  if (brick.dead) return;
  if (s.frost > 0 && world.rng.chance(s.freezeChance)) applyStatus(world, brick, 'frost', power);
  if (brick.dead) return;
  if (s.shock > 0 && brick.shockCd <= 0) {
    brick.shockCd = 0.3;
    chainLightning(world, brick, power);
  }
  if (s.echoChance > 0 && world.rng.chance(s.echoChance)) {
    world.after(s.echoDelay, () => {
      if (!brick.dead) {
        applyDamage(world, brick, power * s.echoDamage, makeCtx(brick.x, brick.y, power, 'secondary'));
        world.events.emit('echo', { x: brick.x, y: brick.y });
      }
    });
  }
}

// ───────────────────────────── statuses & reactions ─────────────────────────────

function react(world: World, brick: Brick, id: ReactionId): void {
  brick.reactCd = REACT_CD;
  const first = world.discoverReaction(id);
  world.events.emit('reaction', { id, x: brick.x, y: brick.y, first });
}

/** Applies one elemental status, resolving any reaction with statuses already on the brick. */
function applyStatus(world: World, brick: Brick, kind: 'burn' | 'frost' | 'poison', power: number): void {
  if (brick.dead) return;
  const s = world.live;
  const melt = (): void => {
    react(world, brick, 'melt');
    brick.frostT = 0;
    brick.burnT = 0;
    applyDamage(world, brick, power * 1.2, makeCtx(brick.x, brick.y, power, 'secondary'));
  };
  const venom = (): void => {
    react(world, brick, 'venom');
    brick.burnT = 0;
    brick.poisonT = 0;
    explode(world, brick.x, brick.y, 110, power, 0x8dff5a, 'normal');
  };

  if (kind === 'burn') {
    if (brick.reactCd <= 0 && brick.frostT > 0) melt();
    if (!brick.dead && brick.reactCd <= 0 && brick.poisonT > 0) venom();
    if (brick.dead) return;
    const dps = power * s.burnRatio * s.fire;
    if (dps >= brick.burnDps || brick.burnT <= 0) {
      brick.burnDps = dps;
      brick.burnPower = power;
    }
    brick.burnT = BURN_TIME;
  } else if (kind === 'frost') {
    if (brick.reactCd <= 0 && brick.burnT > 0) melt();
    if (brick.dead) return;
    if (brick.frostT <= 0) world.events.emit('freeze', { x: brick.x, y: brick.y });
    brick.frostT = FROST_TIME;
  } else {
    if (brick.reactCd <= 0 && brick.burnT > 0) venom();
    if (brick.dead) return;
    brick.poisonRatio = Math.max(brick.poisonRatio, s.poisonRatio);
    brick.poisonPower = Math.max(brick.poisonPower, power);
    brick.poisonT = POISON_TIME;
  }
}

/** Lightning falls on `origin` for `amount`, then jumps on as the build's chain. */
export function strikeLightning(world: World, origin: Brick, amount: number, power: number): void {
  applyDamage(world, origin, amount, makeCtx(origin.x, origin.y, power, 'secondary'));
  if (!origin.dead) chainLightning(world, origin, power);
}

/** Lightning jumps from the struck brick to its nearest neighbours. */
function chainLightning(world: World, origin: Brick, power: number): void {
  const s = world.live;
  // Frost is applied before shock on the same hit, so owning both elements upgrades every chain.
  const superconduct = origin.frostT > 0;
  const jumps = s.shockChains + (superconduct ? 2 : 0);
  const color = superconduct ? 0x9be8ff : 0xffe14d;

  const targets: { d2: number; brick: Brick }[] = [];
  for (const brick of world.bricks) {
    if (brick.dead || brick === origin) continue;
    const dx = brick.x - origin.x;
    const dy = brick.y - origin.y;
    const d2 = dx * dx + dy * dy;
    if (d2 <= CHAIN_RANGE * CHAIN_RANGE) targets.push({ d2, brick });
  }
  targets.sort((a, b) => a.d2 - b.d2);

  const damage = power * (superconduct ? 0.9 : s.shockDamage);
  // Overload: lightning discharging through a brick that is already burning detonates it.
  if (origin.burnT > 0 && origin.reactCd <= 0) {
    react(world, origin, 'overload');
    explode(world, origin.x, origin.y, OVERLOAD_RADIUS, power * OVERLOAD_DAMAGE, 0xffe14d, 'normal');
  }
  for (const { brick } of targets.slice(0, jumps)) {
    world.events.emit('bolt', { x0: origin.x, y0: origin.y, x1: brick.x, y1: brick.y, color });
    applyDamage(world, brick, damage, makeCtx(brick.x, brick.y, power, 'secondary'));
    if (brick.dead) continue;
    if (superconduct) applyStatus(world, brick, 'frost', power);
    if (!brick.dead && brick.burnT > 0 && brick.reactCd <= 0) {
      react(world, brick, 'overload');
      explode(world, brick.x, brick.y, OVERLOAD_RADIUS, power * OVERLOAD_DAMAGE, 0xffe14d, 'normal');
    }
  }
}

/** Advances timers and ticks damage-over-time. Runs even during time stop: it is the player's damage. */
export function tickStatuses(world: World, dt: number): void {
  for (const brick of world.bricks) {
    if (brick.dead) continue;
    if (brick.shockCd > 0) brick.shockCd -= dt;
    if (brick.reactCd > 0) brick.reactCd -= dt;
    if (brick.frostT > 0) brick.frostT -= dt;
    const burning = brick.burnT > 0;
    const poisoned = brick.poisonT > 0;
    if (burning) brick.burnT -= dt;
    if (poisoned) brick.poisonT -= dt;
    if (!burning && !poisoned) continue;

    brick.tickT -= dt;
    if (brick.tickT > 0) continue;
    brick.tickT = DOT_PERIOD;

    let amount = 0;
    let power = 0;
    if (burning) {
      amount += brick.burnDps * DOT_PERIOD;
      power = brick.burnPower;
    }
    if (poisoned) {
      amount += brick.maxHp * brick.poisonRatio * DOT_PERIOD;
      power = Math.max(power, brick.poisonPower);
    }
    applyDamage(world, brick, amount, makeCtx(brick.x, brick.y, power, 'dot'));
  }
}

// ───────────────────────────── death & procs ─────────────────────────────

/**
 * Everything that happens because a brick died. Called by the world from its death queue, so
 * procs that kill more bricks (chain reactions) are iterative rather than recursive.
 */
export function processDeath(world: World, brick: Brick, ctx: DamageCtx): void {
  const s = world.live;
  const power = ctx.power || basePower(world);
  world.killed++;
  world.dropLoot(brick);
  world.events.emit('kill', { brick, big: brick.tier >= 9 || brick.boss });

  if (
    ctx.ball &&
    s.splitChance > 0 &&
    (!ctx.ball.child || s.splitChildren) &&
    world.rng.chance(s.splitChance)
  ) {
    spawnChild(world, brick.x, brick.y, ctx.ball);
  }
  if (brick.type === 'explosive') explode(world, brick.x, brick.y, 120, power * 1.5, 0xffa63d, 'brick');
  // Contagion: a brick that shatters while corroding or burning hands its ailment to its neighbours.
  if (s.plague && brick.poisonT > 0) spreadStatus(world, brick.x, brick.y, PLAGUE_RADIUS, 'poison', power);
  if (s.wildfire && brick.burnT > 0) spreadStatus(world, brick.x, brick.y, WILDFIRE_RADIUS, 'burn', power);
  if (s.explosionDamage > 0 && (!ctx.explosion || s.explosionChain)) {
    const dmg = power * (ctx.explosion ? Math.max(1, s.explosionDamage) : s.explosionDamage);
    explode(world, brick.x, brick.y, s.explosionRadius, dmg, 0xff5c2b, 'normal');
  }
  if (s.iceBurst && brick.frostT > 0) explode(world, brick.x, brick.y, 130, power * 1.2, 0x9be8ff, 'ice');
  if (s.shatterCount > 0)
    spawnShards(world, brick.x, brick.y, s.shatterCount, power * s.shatterDamage, brick.color);
  if (s.voidChance > 0 && world.rng.chance(s.voidChance * (brick.boss ? 3 : 1)))
    spawnHole(world, brick.x, brick.y, power);
}

/** Radial damage with no falloff — every brick inside takes the full amount. */
export function explode(
  world: World,
  x: number,
  y: number,
  radius: number,
  dmg: number,
  color: number,
  kind: ExplosionKind,
): void {
  const s = world.live;
  let reach = radius * s.explosionRadiusMult;
  let amount = dmg;
  if (kind === 'normal' && s.supernova > 0 && world.rng.chance(s.supernova)) {
    reach *= 3.5;
    amount *= 3;
    kind = 'nova';
  }
  world.events.emit('explode', { x, y, radius: reach, color, kind });

  for (const brick of world.bricks) {
    if (brick.dead) continue;
    const dx = brick.x - x;
    const dy = brick.y - y;
    // Pad by part of the brick's size so edge bricks count as "inside" rather than being missed by a hair.
    const limit = reach + Math.min(brick.w, brick.h) * 0.4;
    if (dx * dx + dy * dy <= limit * limit) {
      applyDamage(
        world,
        brick,
        amount,
        makeCtx(brick.x, brick.y, amount, 'secondary', { explosion: true, power: dmg }),
      );
    }
  }
  if (s.firePool && kind === 'normal' && world.pools.length < 24) {
    world.pools.push({
      x,
      y,
      r: reach * 0.85,
      life: 2,
      power: dmg / Math.max(0.01, s.explosionDamage),
      tick: 0,
      dead: false,
    });
  }
}

/** Hands an ailment from a shattered brick to every brick around it. */
function spreadStatus(
  world: World,
  x: number,
  y: number,
  radius: number,
  kind: 'burn' | 'frost' | 'poison',
  power: number,
): void {
  const r2 = radius * radius;
  for (const brick of world.bricks) {
    if (brick.dead) continue;
    const dx = brick.x - x;
    const dy = brick.y - y;
    if (dx * dx + dy * dy <= r2) applyStatus(world, brick, kind, power);
  }
}

// ───────────────────────────── spawners ─────────────────────────────

function spawnChild(world: World, x: number, y: number, parent: Ball): void {
  if (world.balls.length >= MAX_BALLS) return;
  const child = makeBall({
    x,
    y,
    angle: world.rng.range(0, Math.PI * 2),
    speed: parent.speed,
    radius: parent.radius * 0.72,
    mult: 0.45,
    child: true,
    ttl: 4,
  });
  world.balls.push(child);
  world.events.emit('split', { x, y });
}

export function spawnShards(
  world: World,
  x: number,
  y: number,
  count: number,
  power: number,
  color: number,
): void {
  if (world.shards.length > 400) return;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + world.rng.range(-0.4, 0.4);
    const speed = world.rng.range(700, 1050);
    world.shards.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: world.rng.range(0.35, 0.6),
      power,
      color,
      dead: false,
    });
  }
}

export function spawnHole(world: World, x: number, y: number, power: number): void {
  if (world.holes.length >= MAX_HOLES) return;
  const s = world.live;
  // Keep the lens fully on screen so its post-process distortion reads as a circle, not a clipped arc.
  x = clamp(x, 120, ARENA_W - 120);
  y = clamp(y, 120, ARENA_H - 120);
  const life = 1.3 * s.holeDurationMult;
  const hole: Hole = { x, y, r: 72 * s.holeRadiusMult, life, maxLife: life, power, tick: 0, dead: false };
  world.holes.push(hole);
  world.events.emit('hole', { hole, phase: 'spawn' });
}

export function hitShard(world: World, brick: Brick, x: number, y: number, power: number): void {
  applyDamage(world, brick, power, makeCtx(x, y, power, 'secondary'));
}

// ───────────────────────────── paddle-mounted weapons ─────────────────────────────

/** Lasers rise from the paddle and hit the first brick in their lane. They also clear bullets. */
export function fireLasers(world: World): void {
  const s = world.live;
  const paddle = world.paddle;
  const power = basePower(world);
  const n = s.laserLevel;

  for (let i = 0; i < n; i++) {
    const x = n === 1 ? paddle.x : paddle.x + ((i / (n - 1)) * 2 - 1) * paddle.halfW * 0.7;
    let target: Brick | null = null;
    let reach = paddle.y;
    for (const brick of world.bricks) {
      if (brick.dead || Math.abs(brick.x - x) > brick.w / 2) continue;
      const bottom = brick.y + brick.h / 2;
      if (bottom < reach) {
        reach = bottom;
        target = brick;
      }
    }
    for (const bullet of world.bullets) {
      if (!bullet.dead && bullet.y < paddle.y && Math.abs(bullet.x - x) < 12) {
        bullet.dead = true;
        world.events.emit('bulletPop', { x: bullet.x, y: bullet.y, blocked: false });
      }
    }
    world.events.emit('laser', { x0: x, y0: paddle.y - PADDLE_H / 2, x1: x, y1: reach });
    if (target) {
      applyDamage(world, target, power * LASER_DAMAGE * n, makeCtx(x, reach, power, 'secondary'));
      if (s.prism) refract(world, x, reach, power);
    }
  }
}

/** Prism: a laser that lands splits sideways, into the nearest brick on either side of the hit. */
function refract(world: World, x: number, y: number, power: number): void {
  for (const side of [-1, 1]) {
    let target: Brick | null = null;
    let best = PRISM_RANGE;
    for (const brick of world.bricks) {
      if (brick.dead) continue;
      const gap = (brick.x - x) * side - brick.w / 2;
      // Only bricks level with the hit: a beam bending up or down the wall would not read as a refraction.
      if (gap <= 0 || gap >= best || Math.abs(brick.y - y) > brick.h) continue;
      best = gap;
      target = brick;
    }
    if (!target) continue;
    world.events.emit('laser', { x0: x, y0: y, x1: target.x, y1: target.y });
    applyDamage(world, target, power * PRISM_DAMAGE, makeCtx(target.x, target.y, power, 'secondary'));
  }
}

/** Orbital lances: vertical beams that pierce every brick in a column. */
export function fireOrbital(world: World): void {
  const s = world.live;
  const alive = world.bricks.filter((b) => !b.dead);
  if (alive.length === 0) return;
  const power = basePower(world);

  for (let i = 0; i < s.orbitalCount; i++) {
    const x = world.rng.pick(alive).x;
    world.events.emit('beam', { x, color: 0xffe14d, width: 30 });
    for (const brick of alive) {
      if (brick.dead || Math.abs(brick.x - x) > brick.w / 2 + 16) continue;
      applyDamage(world, brick, power * s.orbitalDamage, makeCtx(x, brick.y, power, 'secondary'));
    }
  }
}

/** Reaction metadata by id, for the codex and toasts. */
export const REACTION_INFO: Record<ReactionId, ReactionDef> = Object.fromEntries(
  REACTIONS.map((r) => [r.id, r]),
) as Record<ReactionId, ReactionDef>;

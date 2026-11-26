import { describe, expect, it } from 'vitest';
import { RNG } from '../src/core/rng';
import {
  ARENA_W,
  BALL_ANTI_STALL,
  BALL_SPEED,
  BASE_DMG,
  DANGER_Y,
  PADDLE_H,
  PADDLE_Y,
  WALL,
} from '../src/game/config';
import { applyDamage, basePower } from '../src/game/combat';
import type { Ball, Brick } from '../src/game/entities';
import { buildLevel } from '../src/game/levels/generator';
import { createRun } from '../src/game/run';
import { UPGRADES } from '../src/game/upgrades/defs';
import { computeStats } from '../src/game/upgrades/stats';
import { World } from '../src/game/world';
import { worldIsFinite } from './sim';

const DT = 1 / 60;

interface WorldOptions {
  level?: number;
  seed?: number;
  bot?: boolean;
  hp?: number;
  /** Real balls on the field at the start of the level. */
  balls?: number;
}

function makeWorld(upgrades: Record<string, number>, options: WorldOptions = {}): World {
  const seed = options.seed ?? 1;
  const run = createRun('endless', seed);
  Object.assign(run.upgrades, upgrades);
  run.stats = computeStats(run.upgrades, 0);
  if (options.balls !== undefined) run.stats.ballCount = options.balls;
  if (options.hp !== undefined) {
    run.hp = options.hp;
    run.maxHp = Math.max(run.maxHp, options.hp);
  }
  const rng = new RNG(seed * 31 + (options.level ?? 1));
  return new World(run, buildLevel(options.level ?? 1, rng), rng.fork(), { bot: options.bot ?? true });
}

/** Steps the world until `predicate` holds or `seconds` of game time pass. Returns the elapsed game time. */
function runUntil(world: World, predicate: () => boolean, seconds: number, eachFrame?: () => void): number {
  let t = 0;
  while (!predicate() && t < seconds) {
    world.update(DT);
    t += DT;
    eachFrame?.();
  }
  return t;
}

function startPlaying(world: World): void {
  runUntil(world, () => world.state === 'playing', 3);
  expect(world.state).toBe('playing');
}

/** Parks every brick far above the arena so tests can exercise balls and paddle in an empty court. */
function clearCourt(world: World): void {
  for (const brick of world.bricks) {
    brick.baseY = -5000;
    brick.y = -5000;
  }
}

function assertBallsLegal(world: World): void {
  // A ball may leave the arena only by falling out of the bottom, which immediately marks it lost.
  const tolerance = 0.75;
  for (const ball of world.balls) {
    if (!ball.alive || ball.docked) continue;
    expect(ball.x, 'ball x').toBeGreaterThanOrEqual(WALL + ball.radius - tolerance);
    expect(ball.x, 'ball x').toBeLessThanOrEqual(ARENA_W - WALL - ball.radius + tolerance);
    expect(ball.y, 'ball y').toBeGreaterThanOrEqual(WALL + ball.radius - tolerance);
    expect(Math.hypot(ball.vx, ball.vy), 'ball speed').toBeCloseTo(ball.speed, 3);
  }
}

describe('world: lifecycle', () => {
  it('launches every ball, real and mirror, after the countdown', () => {
    const world = makeWorld({ multiball: 2, mirror: 1 });
    expect(world.state).toBe('intro');
    expect(world.balls).toHaveLength(12);
    expect(world.balls.filter((ball) => ball.ghost)).toHaveLength(6);
    expect(world.balls.every((ball) => ball.docked)).toBe(true);
    let launched = 0;
    world.events.on('launch', (event) => (launched = event.count));
    startPlaying(world);
    expect(launched).toBe(12);
    expect(world.balls.every((ball) => !ball.docked && ball.vy < 0)).toBe(true);
  });

  it('clears level 1 with the bot paddle and loses no life', () => {
    const world = makeWorld({});
    const total = world.bricks.length;
    startPlaying(world);
    const elapsed = runUntil(
      world,
      () => world.state !== 'playing',
      120,
      () => {
        assertBallsLegal(world);
        expect(worldIsFinite(world)).toBe(true);
      },
    );
    expect(world.state).toBe('clearing');
    expect(world.killed).toBe(total);
    expect(world.hp).toBe(4);
    expect(elapsed, 'level 1 is the hook: it must be quick').toBeLessThan(30);
  });

  it('costs exactly one life when a whole field sinks past the danger line', () => {
    const world = makeWorld({});
    startPlaying(world);
    let hurts = 0;
    world.events.on('hurt', () => hurts++);
    world.fieldOffset = DANGER_Y;
    world.update(DT);
    expect(hurts).toBe(1);
    expect(world.hp).toBe(3);
    // Invulnerability frames absorb the rest of the row.
    expect(world.bricks.length).toBe(0);
    expect(world.state).toBe('clearing');
  });

  it('ends the run at zero hp', () => {
    const world = makeWorld({}, { hp: 1 });
    startPlaying(world);
    let dead = false;
    world.events.on('dead', () => (dead = true));
    world.fieldOffset = DANGER_Y;
    world.update(DT);
    expect(world.state).toBe('dying');
    runUntil(world, () => dead, 5);
    expect(dead).toBe(true);
    expect(world.state).toBe('dead');
  });
});

describe('world: paddle & balls', () => {
  it('returns a centred catch straight up and calls it perfect', () => {
    const world = makeWorld({});
    startPlaying(world);
    clearCourt(world);
    const paddle = world.paddle;
    const ball = world.balls[0]!;

    let perfect = false;
    world.events.on('paddle', (event) => (perfect = event.perfect));
    ball.x = paddle.x + 10;
    ball.y = PADDLE_Y - 30;
    ball.vx = 0;
    ball.vy = ball.speed;
    runUntil(world, () => perfect, 2);
    expect(perfect).toBe(true);
    expect(ball.vy).toBeLessThan(0);
    expect(ball.y).toBeLessThan(PADDLE_Y);
    expect(Math.abs(ball.vx)).toBeLessThan(80);
  });

  it('angles edge catches away from the paddle centre', () => {
    const world = makeWorld({});
    startPlaying(world);
    const paddle = world.paddle;
    const ball = world.balls[0]!;

    ball.x = paddle.x + paddle.halfW * 0.9;
    ball.vx = 0;
    ball.vy = ball.speed;
    world.paddleBounce(ball);
    expect(ball.vx).toBeGreaterThan(ball.speed * 0.5);

    ball.x = paddle.x - paddle.halfW * 0.9;
    world.paddleBounce(ball);
    expect(ball.vx).toBeLessThan(-ball.speed * 0.5);
  });

  it('re-launches a lost ball instead of ending the run', () => {
    const world = makeWorld({}, { bot: false });
    startPlaying(world);
    clearCourt(world);
    world.input.x = 40;
    const ball = world.balls[0]!;
    ball.x = ARENA_W - 60;
    ball.y = 500;
    ball.vx = 0;
    ball.vy = ball.speed;

    let misses = 0;
    world.events.on('miss', (event) => {
      if (!event.child) misses++;
    });
    runUntil(world, () => misses > 0, 5);
    expect(misses).toBe(1);
    expect(ball.alive).toBe(false);
    runUntil(world, () => ball.alive, 3);
    expect(ball.alive).toBe(true);
    expect(ball.vy).toBeLessThan(0);
    expect(world.hp).toBe(4);
  });

  it('keeps every ball inside the arena at constant speed, whatever the build', () => {
    const builds: Record<string, number>[] = [
      { multiball: 5, speed: 5, bigball: 3, homing: 3 },
      { multiball: 5, pierce: 4, phantom: 1, speed: 5 },
      { multiball: 5, split: 4, recursion: 1, mirror: 2 },
      { multiball: 4, speed: 5, magnet: 2, empower: 4 },
    ];
    builds.forEach((build, i) => {
      const world = makeWorld(build, { level: 4, seed: i + 1 });
      startPlaying(world);
      runUntil(
        world,
        () => world.state !== 'playing',
        25,
        () => assertBallsLegal(world),
      );
      expect(world.state, `build ${i}`).toBe('clearing');
    });
  });

  it('applies speed upgrades to the ball from the first frame', () => {
    const world = makeWorld({ speed: 3 });
    startPlaying(world);
    const ball = world.balls[0]!;
    const expected = BALL_SPEED * (1 + 0.14 * 3);
    expect(ball.speed).toBeCloseTo(expected);
    expect(Math.hypot(ball.vx, ball.vy)).toBeCloseTo(expected, 5);
  });

  it('nudges a dry ball off a purely vertical loop', () => {
    const world = makeWorld({}, { bot: false });
    startPlaying(world);
    // One brick, far to the left; the ball will be bouncing on the right with nothing to hit.
    const keep = world.bricks.reduce((a, b) => (a.x < b.x ? a : b));
    for (const brick of world.bricks) if (brick !== keep) brick.dead = true;
    keep.baseY = 150;
    keep.y = 150;
    const ball = world.balls[0]!;
    world.paddle.x = 640;
    world.paddle.targetX = 640;
    ball.x = 640;
    ball.y = 400;
    ball.vx = 0;
    ball.vy = -ball.speed;

    runUntil(world, () => Math.abs(ball.vx) > ball.speed * 0.15, 14);
    expect(Math.abs(ball.vx), 'return angle should open up').toBeGreaterThan(ball.speed * 0.15);
  });

  it('is deterministic for a given seed', () => {
    const build = { multiball: 3, fire: 2, explosive: 2, split: 2 };
    const snapshot = (): string => {
      const world = makeWorld(build, { level: 4, seed: 9 });
      startPlaying(world);
      runUntil(world, () => false, 12);
      return JSON.stringify({
        combo: world.combo,
        score: Math.round(world.score),
        killed: world.killed,
        balls: world.balls.map((b) => [b.x.toFixed(4), b.y.toFixed(4)]),
        bricks: world.bricks.map((b) => b.hp.toFixed(4)),
      });
    };
    expect(snapshot()).toBe(snapshot());
  });

  it('behaves at 30, 60 and 144 frames per second', () => {
    for (const fps of [30, 60, 144]) {
      const world = makeWorld({ multiball: 2, speed: 3 }, { level: 3, seed: 5 });
      startPlaying(world);
      let frames = 0;
      while (world.state === 'playing' && frames++ < fps * 90) {
        world.update(1 / fps);
        expect(worldIsFinite(world), `${fps}fps`).toBe(true);
      }
      expect(world.state, `${fps}fps`).toBe('clearing');
    }
  });
});

describe('world: launch', () => {
  /** Runs the countdown with the paddle headed for `x`. Returns each ball as it left the paddle. */
  function launchFrom(
    x: number,
    upgrades: Record<string, number> = {},
    options: WorldOptions = {},
  ): { world: World; left: Ball[] } {
    const world = makeWorld(upgrades, { ...options, bot: false });
    world.input.x = x;
    const left: Ball[] = [];
    world.events.on('launch', () => left.push(...world.balls.map((ball) => ({ ...ball }))));
    startPlaying(world);
    return { world, left };
  }

  it('parks the balls on the paddle, a lone one dead centre', () => {
    const lone = makeWorld({}, { bot: false, balls: 1 });
    const ball = lone.balls[0]!;
    lone.input.x = 480;
    runUntil(lone, () => Math.abs(lone.paddle.x - 480) < 0.01, 0.5);
    expect(lone.state, 'still waiting on the countdown').toBe('intro');
    expect(ball.x).toBeCloseTo(lone.paddle.x, 6);
    expect(ball.y).toBeCloseTo(PADDLE_Y - PADDLE_H / 2 - ball.radius, 6);

    // A stack fills rows of nine, each centred on the paddle, and stays inside its width.
    const stack = makeWorld({}, { bot: false, balls: 10 });
    stack.update(DT);
    expect(stack.balls).toHaveLength(10);
    const bottom = stack.balls.filter((ball) => ball.y === Math.max(...stack.balls.map((b) => b.y)));
    expect(bottom).toHaveLength(9);
    const offsets = bottom.map((ball) => ball.x - stack.paddle.x).sort((a, b) => a - b);
    expect(new Set(offsets).size, 'one ball per slot').toBe(9);
    for (let i = 0; i < 9; i++) expect(offsets[i]!).toBeCloseTo(-offsets[8 - i]!, 6);
    expect(Math.max(...offsets.map(Math.abs))).toBeLessThan(stack.paddle.halfW);
    const above = stack.balls.filter((ball) => !bottom.includes(ball));
    expect(above).toHaveLength(1);
    expect(above[0]!.x).toBeCloseTo(stack.paddle.x, 6);
    expect(above[0]!.y).toBeCloseTo(bottom[0]!.y - 20, 6);
  });

  it('sends an unguided stack straight up from wherever the paddle was parked', () => {
    const { left } = launchFrom(300, { multiball: 1 });
    expect(left).toHaveLength(5);
    for (const ball of left) {
      expect(Math.abs(ball.vx), 'no sideways drift').toBeLessThan(1e-9);
      expect(ball.vy).toBeLessThan(0);
      expect(Math.hypot(ball.vx, ball.vy)).toBeCloseTo(ball.speed, 5);
    }
    // The volley is centred on the paddle: where the player parked it is where the balls go up.
    const centre = left.reduce((sum, ball) => sum + ball.x, 0) / left.length;
    expect(centre).toBeCloseTo(300, 3);
  });

  it('hits the brick the paddle was parked under', () => {
    const world = makeWorld({}, { bot: false });
    // The lowest brick among the columns the paddle can reach: nothing in its way but empty court.
    const target = world.bricks
      .filter((brick) => brick.col >= 2 && brick.col <= 9)
      .reduce((lowest, brick) => (brick.y > lowest.y ? brick : lowest));
    world.input.x = target.x;
    const hits: Brick[] = [];
    world.events.on('hit', (event) => hits.push(event.brick));
    startPlaying(world);
    expect(hits, 'nothing is hit before the countdown ends').toHaveLength(0);
    runUntil(world, () => hits.length > 0, 5);
    expect(hits.length, 'the volley found something').toBeGreaterThan(0);
    expect(hits[0]).toBe(target);
  });

  it('still fans a guided stack out, so each ball can pick a brick of its own', () => {
    const { left } = launchFrom(360, { homing: 1 });
    expect(left).toHaveLength(4);
    const vx = left.map((ball) => ball.vx).sort((a, b) => a - b);
    expect(vx[0]).toBeLessThan(-left[0]!.speed * 0.3);
    expect(vx[vx.length - 1]).toBeGreaterThan(left[0]!.speed * 0.3);
    expect(left.every((ball) => ball.vy < 0 && ball.lock === 0)).toBe(true);
  });

  it('re-launches a lost ball straight up, however long it had gone without a brick', () => {
    const world = makeWorld({}, { bot: false, balls: 1 });
    startPlaying(world);
    clearCourt(world);
    world.input.x = 200;
    runUntil(world, () => Math.abs(world.paddle.x - 200) < 0.01, 0.5);
    const ball = world.balls[0]!;
    ball.dryT = BALL_ANTI_STALL + 3;
    world.loseBall(ball);
    runUntil(world, () => ball.alive, 3);
    expect(ball.alive).toBe(true);
    expect(ball.x).toBeCloseTo(200, 2);
    expect(ball.dryT, 'a fresh trip: the anti-stall clock starts over').toBe(0);
    expect(Math.abs(ball.vx)).toBeLessThan(1e-9);

    // Nothing overhead and nothing steering: it climbs dead straight until the top wall turns it.
    let widest = 0;
    runUntil(
      world,
      () => ball.vy > 0,
      3,
      () => {
        if (ball.vy < 0) widest = Math.max(widest, Math.abs(ball.vx));
      },
    );
    expect(ball.vy, 'rebounded off the top wall').toBeGreaterThan(0);
    expect(widest, 'straight all the way up').toBeLessThan(1e-9);
  });

  it('lets the SEEKER capsule choose the relaunch angle, as guidance chooses the launch', () => {
    const world = makeWorld({}, { bot: false, balls: 1 });
    startPlaying(world);
    clearCourt(world);
    expect(world.activateBuff('homing')).toBe(true);
    const ball = world.balls[0]!;
    let tilted = 0;
    for (let i = 0; i < 6; i++) {
      world.loseBall(ball);
      runUntil(world, () => ball.alive, 3);
      if (Math.abs(ball.vx) > ball.speed * 0.05) tilted++;
    }
    expect(tilted, 'a guided relaunch is not pinned to vertical').toBeGreaterThan(0);
  });
});

describe('world: combat systems', () => {
  it('only fires overdrive on a full meter, and doubles damage while it lasts', () => {
    const world = makeWorld({});
    startPlaying(world);
    expect(world.tryOverdrive()).toBe(false);
    world.energy = 100;
    const phases: string[] = [];
    world.events.on('overdrive', (phase) => phases.push(phase));
    expect(world.tryOverdrive()).toBe(true);
    expect(world.odActive).toBe(true);
    expect(basePower(world)).toBeCloseTo(2 * BASE_DMG);
    runUntil(world, () => !world.odActive, 10);
    expect(world.odActive).toBe(false);
    expect(phases).toEqual(['start', 'end']);
  });

  it('never lets the overdrive meter drain below empty', () => {
    const world = makeWorld({}, { bot: false, balls: 1 });
    startPlaying(world);
    const ball = world.balls[0]!;

    // A miss right after Overdrive ended lands on an empty meter — it must stay at 0.
    world.energy = 0;
    world.loseBall(ball);
    expect(world.energy).toBe(0);

    // A drain on a partly filled meter still takes its full price.
    runUntil(world, () => ball.alive, 3);
    world.energy = 5;
    world.loseBall(ball);
    expect(world.energy).toBe(2);
  });

  it('applies burn on hit and lets it tick', () => {
    const world = makeWorld({ fire: 5 }, { level: 12 });
    const found = runUntil(world, () => world.bricks.some((b) => b.burnT > 0 && b.burnDps > 0), 30) < 30;
    expect(found).toBe(true);
    const before = world.bricks.reduce((sum, b) => sum + b.hp, 0);
    // Park the balls so only the burn can deal damage.
    for (const b of world.balls) b.docked = true;
    runUntil(world, () => false, 1.5);
    const after = world.bricks.reduce((sum, b) => sum + b.hp, 0);
    expect(after).toBeLessThan(before);
  });

  it('discovers each elemental reaction exactly once', () => {
    const world = makeWorld({ fire: 1, shock: 1, multiball: 3 }, { level: 12 });
    const firsts: boolean[] = [];
    world.events.on('reaction', (event) => firsts.push(event.first));
    startPlaying(world);
    runUntil(world, () => firsts.length >= 4 || world.state !== 'playing', 90);
    expect(firsts.length).toBeGreaterThanOrEqual(3);
    expect(firsts.filter((first) => first)).toHaveLength(1);
    expect(world.run.reactions).toEqual(['overload']);
  });

  it('discovers superconduct when lightning chains through a frozen brick', () => {
    const world = makeWorld({ frost: 3, shock: 2, absolutezero: 1, power: 3 }, { level: 9 });
    const firsts: string[] = [];
    let superconducts = 0;
    world.events.on('reaction', (event) => {
      if (event.id === 'superconduct') superconducts++;
      if (event.first) firsts.push(event.id);
    });
    startPlaying(world);
    runUntil(world, () => world.run.reactions.includes('superconduct') || world.state !== 'playing', 30);
    expect(superconducts, 'the reaction fires, not just the effect').toBeGreaterThan(0);
    expect(world.run.reactions.filter((id) => id === 'superconduct')).toHaveLength(1);
    expect(firsts.filter((id) => id === 'superconduct')).toHaveLength(1);
  });

  it('freezes with Absolute Zero and bursts ice when frozen bricks die', () => {
    const world = makeWorld({ frost: 3, shock: 2, absolutezero: 1, power: 3 }, { level: 9 });
    let ice = 0;
    let freezes = 0;
    world.events.on('explode', (event) => {
      if (event.kind === 'ice') ice++;
    });
    world.events.on('freeze', () => freezes++);
    startPlaying(world);
    runUntil(world, () => world.state !== 'playing', 90);
    expect(freezes).toBeGreaterThan(5);
    expect(ice).toBeGreaterThan(3);
  });

  it('chain reactions stay finite and clear the field', () => {
    const world = makeWorld({ explosive: 5, chainreaction: 1, meltdown: 1, supernova: 1 }, { level: 3 });
    const total = world.bricks.length;
    startPlaying(world);
    const elapsed = runUntil(
      world,
      () => world.state !== 'playing',
      120,
      () => expect(worldIsFinite(world)).toBe(true),
    );
    expect(world.state).toBe('clearing');
    expect(world.killed).toBe(total);
    expect(elapsed).toBeLessThan(30);
  });

  it('executes low-health bricks with Reaper, but never boss cores', () => {
    const world = makeWorld({ reaper: 4 }, { level: 5 });
    startPlaying(world);
    const core = world.bricks.find((b) => b.bossRole === 'core');
    const armor = world.bricks.find((b) => b.bossRole === 'armor');
    expect(core).toBeDefined();
    expect(armor).toBeDefined();
    expect(world.stats.reaperRatio).toBeCloseTo(0.24);

    // Both are below the execute threshold. A 1-damage tap could not possibly kill either…
    core!.hp = core!.maxHp * 0.15;
    armor!.hp = armor!.maxHp * 0.15;
    expect(armor!.hp).toBeGreaterThan(1);
    expect(core!.hp).toBeGreaterThan(1);
    let executed = 0;
    world.events.on('hit', (event) => {
      if (event.execute) executed++;
    });

    const hit = { x: 0, y: 0, power: 1, source: 'ball' as const, ball: null, crit: false, explosion: false };
    applyDamage(world, armor!, 1, { ...hit, x: armor!.x, y: armor!.y });
    applyDamage(world, core!, 1, { ...hit, x: core!.x, y: core!.y });

    // …but the armour is executed outright, while the core merely loses that one point.
    expect(armor!.dead).toBe(true);
    expect(core!.dead).toBe(false);
    expect(core!.hp).toBeCloseTo(core!.maxHp * 0.15 - 1);
    expect(executed).toBe(1);
  });
});

describe('world: robustness across the whole upgrade pool', () => {
  it('runs cleanly with each upgrade at max level', () => {
    for (const def of UPGRADES) {
      const world = makeWorld({ [def.id]: def.maxLevel }, { level: 6, seed: 3 });
      startPlaying(world);
      let frames = 0;
      while (world.state === 'playing' && frames++ < 60 * 20) {
        world.update(DT);
        if (!worldIsFinite(world)) throw new Error(`${def.id} produced non-finite state`);
      }
      expect(world.totalDamage, `${def.id} should deal damage`).toBeGreaterThan(0);
    }
  });

  it('handles a fully maxed build on the final boss within frame budget', () => {
    const all = Object.fromEntries(UPGRADES.map((u) => [u.id, u.maxLevel]));
    const world = makeWorld(all, { level: 15, seed: 7 });
    startPlaying(world);
    let frames = 0;
    let worst = 0;
    let peakBalls = 0;
    const t0 = performance.now();
    while (world.state === 'playing' && frames < 60 * 240) {
      const start = performance.now();
      world.update(DT);
      worst = Math.max(worst, performance.now() - start);
      frames++;
      peakBalls = Math.max(peakBalls, world.balls.length);
      if (!worldIsFinite(world)) throw new Error('maxed build produced non-finite state');
    }
    const average = (performance.now() - t0) / frames;
    console.log(
      `[maxed build] boss killed in ${(frames / 60).toFixed(1)}s · avg ${(average * 1000).toFixed(0)}µs/frame · worst ${worst.toFixed(1)}ms · peak balls ${peakBalls} · max combo ${world.maxCombo}`,
    );
    expect(world.state).toBe('clearing');
    expect(average).toBeLessThan(8);
  });
});

describe('world: enemy bullets', () => {
  /** Injects one bullet just inside the given wall moving into it, and returns it. */
  function injectAtWall(world: World, side: 'left' | 'right'): { id: number } {
    const r = 7;
    const id = 900_001;
    const left = side === 'left';
    world.bullets.push({
      id,
      x: left ? WALL + r + 4 : ARENA_W - WALL - r - 4,
      y: 300,
      vx: left ? -400 : 400,
      vy: 60,
      r,
      dead: false,
    });
    return { id };
  }

  function bulletById(world: World, id: number) {
    return world.bullets.find((b) => b.id === id)!;
  }

  it('bounces off the left wall instead of leaving the field', () => {
    const world = makeWorld({}, { level: 1, seed: 1 });
    startPlaying(world);
    clearCourt(world);
    const { id } = injectAtWall(world, 'left');
    const bullet = bulletById(world, id);

    world.update(DT);
    // One frame at 400 u/s covers the 4-unit gap, so the clamp and flip must already have happened.
    expect(bullet.dead, 'still alive after the bounce').toBe(false);
    expect(bullet.vx).toBeGreaterThan(0);
    expect(bullet.x).toBeGreaterThanOrEqual(WALL + bullet.r - 0.001);

    for (let frames = 0; frames < 90 && !bullet.dead; frames++) {
      world.update(DT);
      expect(bullet.x, 'bullet x').toBeGreaterThanOrEqual(WALL + bullet.r - 0.001);
      expect(bullet.x, 'bullet x').toBeLessThanOrEqual(ARENA_W - WALL - bullet.r + 0.001);
    }
  });

  it('bounces off the right wall instead of leaving the field', () => {
    const world = makeWorld({}, { level: 1, seed: 1 });
    startPlaying(world);
    clearCourt(world);
    const { id } = injectAtWall(world, 'right');
    const bullet = bulletById(world, id);

    world.update(DT);
    expect(bullet.dead, 'still alive after the bounce').toBe(false);
    expect(bullet.vx).toBeLessThan(0);
    expect(bullet.x).toBeLessThanOrEqual(ARENA_W - WALL - bullet.r + 0.001);

    for (let frames = 0; frames < 90 && !bullet.dead; frames++) {
      world.update(DT);
      expect(bullet.x, 'bullet x').toBeGreaterThanOrEqual(WALL + bullet.r - 0.001);
      expect(bullet.x, 'bullet x').toBeLessThanOrEqual(ARENA_W - WALL - bullet.r + 0.001);
    }
  });
});

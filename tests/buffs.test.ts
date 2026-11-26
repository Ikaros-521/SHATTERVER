import { describe, expect, it } from 'vitest';
import { RNG } from '../src/core/rng';
import { ARENA_H, ARENA_W, BASE_DMG, DANGER_Y, PADDLE_Y, WALL } from '../src/game/config';
import { applyDamage, fireLasers, type DamageCtx } from '../src/game/combat';
import { BUFFS, BUFF_MAP, COVER, OFFENCE, type BuffId } from '../src/game/buffs/defs';
import { withBuffs } from '../src/game/buffs/live';
import { buildLevel } from '../src/game/levels/generator';
import { createRun } from '../src/game/run';
import { computeStats, defaultStats } from '../src/game/upgrades/stats';
import { World } from '../src/game/world';

const DT = 1 / 60;

interface WorldOptions {
  level?: number;
  seed?: number;
  bot?: boolean;
  hp?: number;
}

function makeWorld(upgrades: Record<string, number>, options: WorldOptions = {}): World {
  const seed = options.seed ?? 1;
  const run = createRun('endless', seed);
  Object.assign(run.upgrades, upgrades);
  run.stats = computeStats(run.upgrades, 0);
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
    expect(finite(world), 'world state stayed finite').toBe(true);
    eachFrame?.();
  }
  return t;
}

/** True when every number that matters in the world is finite. */
function finite(world: World): boolean {
  const ok =
    Number.isFinite(world.hp) && Number.isFinite(world.paddle.x) && Number.isFinite(world.fieldOffset);
  return (
    ok &&
    world.balls.every((ball) => [ball.x, ball.y, ball.vx, ball.vy, ball.radius].every(Number.isFinite)) &&
    world.bricks.every((brick) => [brick.x, brick.y, brick.hp].every(Number.isFinite))
  );
}

function startPlaying(world: World): void {
  runUntil(world, () => world.state === 'playing', 3);
  expect(world.state).toBe('playing');
}

/** Parks every brick far above the arena so tests can exercise balls and the paddle in an empty court. */
function clearCourt(world: World): void {
  for (const brick of world.bricks) {
    brick.baseY = -5000;
    brick.y = -5000;
  }
}

/** Parks every ball on the paddle: only what a test unleashes itself is in flight. */
function parkBalls(world: World): void {
  for (const ball of world.balls) ball.docked = true;
}

/** Real balls on the field: children, clones and mirror ghosts do not count. */
const realBalls = (world: World): number =>
  world.balls.filter((ball) => ball.alive && !ball.child && !ball.ghost).length;

function assertBallsLegal(world: World): void {
  const tolerance = 0.75;
  for (const ball of world.balls) {
    if (!ball.alive || ball.docked) continue;
    expect(ball.x, 'ball x').toBeGreaterThanOrEqual(WALL + ball.radius - tolerance);
    expect(ball.x, 'ball x').toBeLessThanOrEqual(ARENA_W - WALL - ball.radius + tolerance);
    expect(Math.hypot(ball.vx, ball.vy), 'ball speed').toBeCloseTo(ball.speed, 3);
  }
}

/** Puts a capsule on the field by hand, already falling, so its descent can be watched. */
function dropCapsule(world: World, id: BuffId, x = world.paddle.x, y = 320): void {
  world.pickups.push({
    id: 0,
    kind: 'buff',
    value: 0,
    buff: id,
    x,
    y,
    vx: 0,
    vy: 0,
    spd: 200,
    t: 0.6, // past the pop: it is already on the way down
    dead: false,
  });
}

const hit: DamageCtx = { x: 0, y: 0, power: 10, source: 'ball', ball: null, crit: false, explosion: false };
/** Shatters `brick` outright, as a ball would. */
const shatter = (world: World, brick: NonNullable<World['bricks'][number]>): void => {
  applyDamage(world, brick, 1e6, { ...hit, x: brick.x, y: brick.y });
};

describe('withBuffs', () => {
  const withOne = (id: BuffId): ReturnType<typeof withBuffs> =>
    withBuffs(defaultStats(), [{ id, t: 1, max: 1 }]);

  it('leaves the build block alone', () => {
    const base = defaultStats();
    const before = JSON.stringify(base);
    const live = withBuffs(
      base,
      BUFFS.filter((def) => def.duration > 0).map((def) => ({ id: def.id, t: 1, max: 1 })),
    );
    expect(JSON.stringify(base)).toBe(before);
    expect(live).not.toBe(base);
    expect(live.buffDurationMult).toBe(base.buffDurationMult);
  });

  it("changes the stats each buff's card promises", () => {
    const base = defaultStats();
    expect(withOne('giant').ballRadius).toBeCloseTo(base.ballRadius * 2.2);
    expect(withOne('giant').damageMult).toBeCloseTo(base.damageMult * 1.6);
    expect(withOne('turbo').ballSpeed).toBeCloseTo(base.ballSpeed * 1.4);
    expect(withOne('turbo').damageMult).toBeCloseTo(base.damageMult * 1.4);
    expect(withOne('rage').damageMult).toBeCloseTo(base.damageMult * 2);
    expect(withOne('wide').paddleWidth).toBeCloseTo(base.paddleWidth * 1.8);
    expect(withOne('laser').laserLevel).toBe(base.laserLevel + 3);
    expect(withOne('magnet').magnetRadius).toBeGreaterThanOrEqual(300);
    expect(withOne('ghost').pierceChance).toBe(1);
    expect(withOne('ghost').momentumMax).toBeGreaterThanOrEqual(3);
    expect(withOne('homing').homing).toBeGreaterThanOrEqual(7);
    expect(withOne('aegis').aegis).toBe(true);
    expect(withOne('gold').crystalChance).toBe(1);
    expect(withOne('gold').crystalMult).toBeCloseTo(base.crystalMult * 2);
    expect(withOne('deadeye').critChance).toBe(1);
    expect(withOne('blast').explosionDamage).toBeGreaterThanOrEqual(1.2);
    expect(withOne('blast').explosionRadius).toBeGreaterThanOrEqual(110);
    const storm = withOne('storm');
    expect(storm.fire).toBeGreaterThanOrEqual(1);
    expect(storm.frost).toBeGreaterThanOrEqual(1);
    expect(storm.shock).toBeGreaterThanOrEqual(1);
    expect(storm.poison).toBeGreaterThanOrEqual(1);
    expect(storm.freezeChance).toBeGreaterThan(0);
  });

  it('stacks, and keeps whatever the build already had that is stronger', () => {
    const base = defaultStats();
    const live = withBuffs(base, [
      { id: 'giant', t: 1, max: 1 },
      { id: 'rage', t: 1, max: 1 },
      { id: 'homing', t: 1, max: 1 },
    ]);
    expect(live.damageMult).toBeCloseTo(base.damageMult * 1.6 * 2);
    expect(live.homing).toBe(7);
    expect(withBuffs({ ...base, homing: 7.2 }, [{ id: 'homing', t: 1, max: 1 }]).homing).toBe(7.2);
  });

  it('reads Adrenaline only while something runs', () => {
    const base = { ...defaultStats(), buffDamage: 0.4, buffSpeed: 0.2 };
    // Split and time stop change no stat themselves, but they still count as "a buff is running".
    const live = withBuffs(base, [{ id: 'split', t: 1, max: 1 }]);
    expect(live.damageMult).toBeCloseTo(base.damageMult * 1.4);
    expect(live.ballSpeed).toBeCloseTo(base.ballSpeed * 1.2);
    expect(live.ballRadius).toBe(base.ballRadius);
  });
});

describe('world: live stats', () => {
  it('is the build itself until a buff runs, and again once none do', () => {
    const world = makeWorld({ power: 2 });
    startPlaying(world);
    clearCourt(world);
    expect(world.live).toBe(world.stats);
    expect(world.activateBuff('rage')).toBe(true);
    expect(world.live).not.toBe(world.stats);
    expect(world.live.damageMult).toBeCloseTo(1.6 * 2);
    expect(world.stats.damageMult).toBeCloseTo(1.6);
    runUntil(world, () => world.buffs.length === 0, 9);
    expect(world.live).toBe(world.stats);
  });

  it('eases the paddle and the balls to their new size instead of snapping', () => {
    const world = makeWorld({});
    startPlaying(world);
    const halfW = world.paddle.halfW;
    const radius = world.balls[0]!.radius;
    world.activateBuff('wide');
    world.activateBuff('giant');
    world.update(DT);
    expect(world.paddle.halfW).toBeGreaterThan(halfW);
    expect(world.paddle.halfW).toBeLessThan(halfW * 1.8);
    expect(world.balls[0]!.radius).toBeGreaterThan(radius);
    runUntil(world, () => false, 1);
    expect(world.paddle.halfW).toBeCloseTo(halfW * 1.8, 2);
    expect(world.balls[0]!.radius).toBeCloseTo(radius * 2.2, 2);
    expect(world.balls[0]!.radius).toBeLessThanOrEqual(34);
  });
});

describe('capsules: cadence and choice', () => {
  /** Calls `dropLoot` on a brick at a chosen level time. Returns how many capsules that produced. */
  function capsulesAt(world: World, time: number): number {
    const before = world.pickups.filter((pickup) => pickup.kind === 'buff').length;
    world.time = time;
    world.dropLoot(world.bricks[0]!);
    return world.pickups.filter((pickup) => pickup.kind === 'buff').length - before;
  }

  const carried = (world: World): BuffId[] =>
    world.pickups.filter((pickup) => pickup.kind === 'buff').map((pickup) => pickup.buff as BuffId);

  it('schedules the first capsule a few seconds into every level', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const world = makeWorld({}, { seed });
      startPlaying(world);
      expect(capsulesAt(world, 3.4), `seed ${seed} too soon`).toBe(0);
      // The due time is the world's own: probe for it. One capsule restarts the clock, so the
      // later probes in this window cannot produce a second one.
      let first = -1;
      for (let t = 3.5; t <= 6.2 && first < 0; t += 0.05) if (capsulesAt(world, t) > 0) first = t;
      expect(first, `seed ${seed}`).toBeGreaterThanOrEqual(3.49);
      expect(first, `seed ${seed}`).toBeLessThanOrEqual(6.06);
    }
  });

  it('then spaces them out — sooner with a Gain Antenna', () => {
    for (let seed = 1; seed <= 25; seed++) {
      for (const [build, gap] of [
        [{}, [13, 19.2]],
        [{ antenna: 2 }, [6.4, 9.6]],
      ] as const) {
        const world = makeWorld(build, { seed });
        startPlaying(world);
        expect(capsulesAt(world, 7)).toBe(1);
        expect(capsulesAt(world, 7)).toBe(0); // the clock only restarted with that capsule
        expect(capsulesAt(world, 7 + gap[0] - 0.2), `seed ${seed} too soon`).toBe(0);
        expect(capsulesAt(world, 7 + gap[1]), `seed ${seed} too late`).toBe(1);
      }
    }
  });

  it('never offers a buff that would be wasted right now', () => {
    const rolled = (
      build: Record<string, number>,
      level: number,
      setup: (world: World) => void,
      seeds: number,
    ): Set<BuffId> => {
      const seen = new Set<BuffId>();
      for (let seed = 1; seed <= seeds; seed++) {
        const world = makeWorld(build, { seed, level });
        startPlaying(world);
        setup(world);
        for (let t = 7, rolls = 0; rolls < 5; t += 25) rolls += capsulesAt(world, t);
        for (const id of carried(world)) seen.add(id);
      }
      return seen;
    };
    // Level 1 has nothing that shoots, the shield is full and the meter is full: three are off the table.
    const wasted = rolled(
      {},
      1,
      (world) => {
        world.energy = 100;
      },
      60,
    );
    expect(wasted.has('aegis')).toBe(false);
    expect(wasted.has('repair')).toBe(false);
    expect(wasted.has('overcharge')).toBe(false);
    expect(wasted.size).toBeGreaterThan(10);
    // …and with the shield down and the meter empty, all three are back (level 5's boss has turrets).
    const useful = rolled(
      {},
      5,
      (world) => {
        world.hp = 1;
        world.energy = 0;
      },
      60,
    );
    expect(useful.has('repair')).toBe(true);
    expect(useful.has('overcharge')).toBe(true);
    expect(useful.has('aegis')).toBe(true);
  });

  it('never sends the same buff twice running', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const world = makeWorld({}, { seed, level: 6 });
      startPlaying(world);
      for (let t = 7, rolls = 0; rolls < 5; t += 25) rolls += capsulesAt(world, t);
      const order = carried(world);
      expect(order).toHaveLength(5);
      for (let i = 1; i < order.length; i++) expect(order[i], `seed ${seed}`).not.toBe(order[i - 1]);
    }
  });

  it('reads the field: a sinking wall is offered what tears it down, a low shield is offered repair', () => {
    /** Shares of each capsule family over many rolls, in whatever state `setup` leaves the field. */
    const shares = (setup: (world: World) => void): Record<'offence' | 'cover' | 'repair', number> => {
      const counts = { offence: 0, cover: 0, repair: 0 };
      let total = 0;
      for (let seed = 1; seed <= 60; seed++) {
        const world = makeWorld({}, { seed, level: 6 }); // a level with turrets, so the cover buffs are on the table
        startPlaying(world);
        world.energy = 0;
        setup(world);
        for (let t = 7, rolls = 0; rolls < 5; t += 25) rolls += capsulesAt(world, t);
        for (const id of carried(world)) {
          total++;
          if (OFFENCE.has(id)) counts.offence++;
          else if (COVER.has(id)) counts.cover++;
          else if (id === 'repair') counts.repair++;
        }
      }
      return {
        offence: counts.offence / total,
        cover: counts.cover / total,
        repair: counts.repair / total,
      };
    };
    const calm = shares(() => undefined);
    // The whole field dropped to just above the danger line.
    const pressed = shares((world) => {
      let lowest = -Infinity;
      for (const brick of world.bricks) lowest = Math.max(lowest, brick.baseY + brick.h / 2);
      world.fieldOffset = DANGER_Y - 20 - lowest;
      for (const brick of world.bricks) brick.y = brick.baseY + world.fieldOffset;
    });
    const hurting = shares((world) => {
      world.hp = 1;
    });
    expect(calm.offence).toBeGreaterThan(0.45);
    expect(calm.offence).toBeLessThan(0.65);
    expect(pressed.offence).toBeGreaterThan(calm.offence + 0.15);
    expect(pressed.cover).toBeLessThan(calm.cover * 0.6);
    // Repair is never offered to a full shield, and comes round twice as often at one shield left.
    expect(calm.repair).toBe(0);
    expect(pressed.repair).toBe(0);
    expect(hurting.repair).toBeGreaterThan(0.05);
    expect(hurting.repair).toBeLessThan(0.16);
  });

  it('keeps splitting off the table as the ball list fills', () => {
    const world = makeWorld({}, { seed: 4, level: 6 });
    startPlaying(world);
    world.balls = Array.from({ length: 180 }, () => world.balls[0]!);
    for (let t = 7, rolls = 0; rolls < 12; t += 25) rolls += capsulesAt(world, t);
    expect(carried(world).includes('split')).toBe(false);
  });
});

describe('capsules: collection', () => {
  it('falls onto the paddle and starts its buff', () => {
    for (const def of BUFFS.filter((entry) => entry.duration > 0)) {
      const world = makeWorld({}, { seed: 3, bot: false, level: 5 });
      startPlaying(world);
      clearCourt(world);
      parkBalls(world);
      const started: BuffId[] = [];
      world.events.on('buff', (event) => started.push(event.id));
      dropCapsule(world, def.id);
      runUntil(world, () => started.length > 0, 6);
      expect(started, def.id).toEqual([def.id]);
      expect(world.hasBuff(def.id)).toBe(true);
      expect(world.buffs[0]!.t).toBeCloseTo(def.duration, 1);
    }
  });

  it('applies the instant ones on the spot, with nothing left running', () => {
    const world = makeWorld({}, { seed: 3, bot: false, hp: 3 });
    startPlaying(world);
    clearCourt(world);
    parkBalls(world);
    const meter: string[] = [];
    world.events.on('overdrive', (phase) => meter.push(phase));
    world.energy = 0;
    dropCapsule(world, 'repair');
    runUntil(world, () => world.hp === 4, 6);
    expect(world.hp).toBe(4);
    dropCapsule(world, 'overcharge');
    runUntil(world, () => world.energy >= 100, 6);
    expect(world.energy).toBe(100);
    expect(meter).toEqual(['ready']);
    expect(world.buffs).toHaveLength(0);
  });

  it('is lost when it lands where the paddle is not', () => {
    const world = makeWorld({}, { seed: 3, bot: false });
    startPlaying(world);
    clearCourt(world);
    parkBalls(world);
    const started: BuffId[] = [];
    const lost: number[] = [];
    world.events.on('buff', (event) => started.push(event.id));
    world.events.on('capsuleLost', (event) => lost.push(event.x));
    dropCapsule(world, 'rage', 60); // the idle paddle sits mid-arena
    runUntil(world, () => world.pickups.length === 0, 4);
    expect(started).toEqual([]);
    expect(lost).toHaveLength(1);
    expect(lost[0]).toBeCloseTo(60, 0);
    expect(world.hasBuff('rage')).toBe(false);
  });

  it('a magnetic field pulls falling capsules in', () => {
    const world = makeWorld({}, { seed: 3, bot: false });
    startPlaying(world);
    clearCourt(world);
    parkBalls(world);
    // The SUPER MAGNET buff: its field reaches far around the paddle, well past the drop.
    expect(world.activateBuff('magnet')).toBe(true);
    expect(world.live.magnetRadius).toBeGreaterThanOrEqual(300);
    const started: BuffId[] = [];
    world.events.on('buff', (event) => started.push(event.id));
    dropCapsule(world, 'rage', 60);
    runUntil(world, () => started.length > 0, 4);
    expect(started).toEqual(['rage']);
    expect(world.pickups.length).toBe(0);
  });

  it('does nothing for a level that is not being played', () => {
    const world = makeWorld({});
    expect(world.activateBuff('rage')).toBe(false); // still in its launch countdown
    expect(world.buffs).toHaveLength(0);
  });

  it('clearBuffs takes everything back at once, as a finished run must', () => {
    const world = makeWorld({}, { seed: 3 });
    startPlaying(world);
    world.activateBuff('giant');
    world.activateBuff('rage');
    expect(world.buffs).toHaveLength(2);
    expect(world.live).not.toBe(world.stats);
    world.clearBuffs();
    expect(world.buffs).toHaveLength(0);
    expect(world.live).toBe(world.stats);
    // A second clear on an empty list is a no-op, not an error.
    world.clearBuffs();
    expect(world.buffs).toHaveLength(0);
  });
});

describe('buffs: time', () => {
  it('runs a buff for its duration, then takes it back', () => {
    const world = makeWorld({});
    startPlaying(world);
    clearCourt(world);
    const ended: BuffId[] = [];
    world.events.on('buffEnd', (event) => ended.push(event.id));
    world.activateBuff('rage');
    runUntil(world, () => false, BUFF_MAP.rage.duration - 0.2);
    expect(world.hasBuff('rage')).toBe(true);
    expect(world.live.damageMult).toBe(2);
    runUntil(world, () => ended.length > 0, 1);
    expect(ended).toEqual(['rage']);
    expect(world.hasBuff('rage')).toBe(false);
    expect(world.live.damageMult).toBe(1);
  });

  it('tops a running buff up rather than shortening or doubling it', () => {
    const world = makeWorld({});
    startPlaying(world);
    clearCourt(world);
    world.activateBuff('wide');
    runUntil(world, () => false, 7);
    const left = world.buffs[0]!.t;
    expect(left).toBeLessThan(3.5);
    world.activateBuff('wide');
    expect(world.buffs).toHaveLength(1);
    expect(world.buffs[0]!.t).toBeCloseTo(10, 5);
  });

  it('stretches every timed buff with a Resonance Coil', () => {
    const world = makeWorld({ resonator: 2 }, { seed: 2 });
    startPlaying(world);
    world.activateBuff('giant');
    expect(world.buffs[0]!.t).toBeCloseTo(8 * 1.7, 5);
  });

  it('lets Twin Resonance echo each capsule as a second, shorter buff', () => {
    const world = makeWorld({ twinresonance: 1 }, { seed: 5 });
    startPlaying(world);
    clearCourt(world);
    // A full shield and meter keep the instant buffs out of the echo pool.
    world.energy = 100;
    const started: BuffId[] = [];
    world.events.on('buff', (event) => started.push(event.id));
    world.activateBuff('wide');
    expect(started).toEqual(['wide']);
    runUntil(world, () => started.length > 1, 2);
    expect(started).toHaveLength(2);
    const echo = BUFF_MAP[started[1]!];
    expect(echo.id).not.toBe('wide');
    expect(echo.duration).toBeGreaterThan(0);
    expect(world.buffs.find((buff) => buff.id === echo.id)!.t).toBeCloseTo(echo.duration * 0.5, 1);
    // The echo is not a capsule: it does not echo further.
    runUntil(world, () => false, 1);
    expect(started).toHaveLength(2);
  });
});

describe('buffs: what they do in play', () => {
  it('splits every real ball in flight into two twins, and the twins leave with it', () => {
    const world = makeWorld({});
    startPlaying(world);
    clearCourt(world);
    const before = world.balls.length;
    expect(realBalls(world)).toBe(before);
    world.activateBuff('split');
    world.update(DT);
    const twins = world.balls.filter((ball) => ball.clone);
    expect(twins).toHaveLength(before * 2);
    for (const twin of twins) {
      expect(twin.child).toBe(true);
      expect(twin.alive).toBe(true);
      expect(twin.mult).toBeCloseTo(0.7);
      expect(twin.ttl).toBeCloseTo(10, 1);
    }
    // Twins are not real balls: they neither count towards the protected core nor outlive the buff.
    expect(realBalls(world)).toBe(before);
    runUntil(
      world,
      () => world.balls.every((ball) => !ball.clone),
      13,
      () => assertBallsLegal(world),
    );
    expect(world.balls).toHaveLength(before);
    expect(world.hasBuff('split')).toBe(false);
  });

  it('waits to split until a real ball is actually in flight', () => {
    const world = makeWorld({}, { seed: 8, bot: false });
    startPlaying(world);
    clearCourt(world);
    parkBalls(world);
    world.activateBuff('split');
    world.update(DT);
    expect(world.balls.filter((ball) => ball.clone)).toHaveLength(0);
    const ball = world.balls[0]!;
    Object.assign(ball, { docked: false, x: world.paddle.x, y: 500, vx: 0, vy: -ball.speed });
    runUntil(world, () => world.balls.some((entry) => entry.clone), 1);
    expect(world.balls.filter((entry) => entry.clone)).toHaveLength(2);
  });

  it('keeps the twins within their budget, however often the capsule comes back', () => {
    const world = makeWorld({ multiball: 5, mirror: 2 });
    startPlaying(world);
    clearCourt(world);
    for (let i = 0; i < 6; i++) {
      world.activateBuff('split');
      world.update(DT);
    }
    const twins = world.balls.filter((ball) => ball.clone);
    expect(twins.length).toBeGreaterThan(0);
    expect(twins).toHaveLength(48);
    runUntil(
      world,
      () => false,
      1,
      () => assertBallsLegal(world),
    );
  });

  it('lets a ghost ball walk straight through a brick', () => {
    const fly = (ghost: boolean): { pierces: number; above: boolean; vy: number } => {
      const world = makeWorld({}, { bot: false, level: 1 });
      startPlaying(world);
      clearCourt(world);
      parkBalls(world);
      const brick = world.bricks[0]!;
      Object.assign(brick, { baseX: 300, x: 300, baseY: 300, y: 300 });
      const ball = world.balls[0]!;
      Object.assign(ball, { docked: false, x: 300, y: 440, vx: 0, vy: -ball.speed });
      if (ghost) world.activateBuff('ghost');
      let pierces = 0;
      world.events.on('pierce', () => pierces++);
      runUntil(world, () => ball.y < 280 || ball.vy > 0, 2);
      return { pierces, above: ball.y < 280, vy: ball.vy };
    };
    // The ball shatters the brick either way; only the ghost keeps going upwards through it.
    expect(fly(false)).toMatchObject({ pierces: 0, above: false });
    expect(fly(true)).toMatchObject({ pierces: 1, above: true });
    expect(fly(true).vy).toBeLessThan(0);
  });

  it('stops every bullet that slips past the paddle while Aegis stands', () => {
    const fire = (aegis: boolean): { hp: number; caught: number[] } => {
      // No bot: left to itself it would hurry over and block the bullet with the paddle instead.
      const world = makeWorld({}, { bot: false });
      startPlaying(world);
      clearCourt(world);
      parkBalls(world);
      if (aegis) world.activateBuff('aegis');
      expect(world.live.aegis).toBe(aegis);
      const caught: number[] = [];
      world.events.on('aegis', (event) => caught.push(event.x));
      // Aimed well clear of the paddle, which sits in the middle of an empty court.
      world.bullets.push({ id: 0, x: 60, y: world.paddle.y - 200, vx: 0, vy: 300, r: 7, dead: false });
      runUntil(world, () => caught.length > 0 || world.hp < world.maxHp, 3);
      return { hp: world.hp, caught };
    };
    expect(fire(true)).toMatchObject({ hp: 4, caught: [60] });
    expect(fire(false)).toMatchObject({ hp: 3, caught: [] });
  });

  it('holds the world still for exactly the time-stop buff, then lets go', () => {
    const world = makeWorld({}, { level: 4 });
    startPlaying(world);
    const phases: string[] = [];
    world.events.on('timeStop', (phase) => phases.push(phase));
    const before = world.fieldOffset;
    world.activateBuff('timestop');
    runUntil(world, () => false, 3);
    expect(phases).toEqual(['start']);
    expect(world.timeStop).toBeGreaterThan(0);
    expect(world.fieldOffset).toBeCloseTo(before, 6);
    runUntil(world, () => world.timeStop <= 0, 3);
    expect(phases).toEqual(['start', 'end']);
    expect(world.hasBuff('timestop')).toBe(false);
    const held = world.fieldOffset;
    runUntil(world, () => false, 1);
    expect(world.fieldOffset).toBeGreaterThan(held);
  });

  it("resumes the time-stop upgrade's own cycle once the buff is gone", () => {
    const world = makeWorld({ timestop: 2 }, { level: 4 });
    startPlaying(world);
    clearCourt(world); // the wait outlasts a level; keep this one open
    const phases: string[] = [];
    world.events.on('timeStop', (phase) => phases.push(phase));
    world.activateBuff('timestop');
    runUntil(world, () => false, 0.5);
    expect(phases).toEqual(['start']);
    // Four seconds of buff, give or take the frame in which the world let go.
    const held = runUntil(world, () => world.timeStop <= 0, 6);
    expect(0.5 + held).toBeGreaterThan(4);
    expect(0.5 + held).toBeLessThan(4.3);
    expect(phases).toEqual(['start', 'end']);
    // To the upgrade, a stop is a stop: the next one is due a full interval after the buff's ended.
    const resumed = runUntil(world, () => world.timeStop > 0, 25);
    expect(phases).toEqual(['start', 'end', 'start']);
    expect(resumed).toBeGreaterThan(19.5);
    expect(resumed).toBeLessThan(20.5);
  });

  it('rains crystals from every brick while Gold Rush lasts', () => {
    const world = makeWorld({}, { seed: 6, level: 6 });
    startPlaying(world);
    parkBalls(world);
    // Explosive bricks never drop crystals of their own.
    const brick = world.bricks[0]!;
    brick.type = 'explosive';
    world.dropLoot(brick);
    expect(world.pickups.filter((pickup) => pickup.kind === 'crystal')).toHaveLength(0);
    world.activateBuff('gold');
    world.dropLoot(brick);
    const drops = world.pickups.filter((pickup) => pickup.kind === 'crystal');
    expect(drops).toHaveLength(1);
    expect(drops[0]!.value).toBeGreaterThanOrEqual(2);
  });

  it('blows up every brick shattered while Demolition lasts', () => {
    const world = makeWorld({}, { level: 6 });
    startPlaying(world);
    parkBalls(world);
    const blasts: string[] = [];
    world.events.on('explode', (event) => blasts.push(event.kind));
    const plain = (): NonNullable<World['bricks'][number]> =>
      world.bricks.find((brick) => !brick.dead && !brick.boss && brick.type !== 'explosive')!;
    shatter(world, plain());
    expect(blasts).toEqual([]);
    world.activateBuff('blast');
    shatter(world, plain());
    expect(blasts).toEqual(['normal']);
  });

  it('plays cleanly with every buff, alone and all at once', () => {
    for (const def of BUFFS) {
      const world = makeWorld({ multiball: 2, laser: 1, fire: 1, shock: 1 }, { level: 8, seed: 4 });
      startPlaying(world);
      expect(world.activateBuff(def.id), def.id).toBe(true);
      runUntil(
        world,
        () => world.state !== 'playing',
        def.duration + 1,
        () => assertBallsLegal(world),
      );
    }
    const world = makeWorld(
      { multiball: 3, explosive: 3, laser: 2, fire: 2, frost: 2, shock: 2, poison: 2 },
      { level: 14, seed: 9 },
    );
    startPlaying(world);
    for (const def of BUFFS) world.activateBuff(def.id);
    expect(world.buffs).toHaveLength(BUFFS.filter((def) => def.duration > 0).length);
    runUntil(
      world,
      () => world.state !== 'playing',
      8,
      () => assertBallsLegal(world),
    );
    expect(world.totalDamage).toBeGreaterThan(0);
  });
});

describe('upgrades: the resonance school', () => {
  it('Adrenaline raises damage and speed only while something runs', () => {
    const world = makeWorld({ adrenaline: 1 });
    startPlaying(world);
    clearCourt(world);
    const damage = world.live.damageMult;
    const speed = world.live.ballSpeed;
    world.activateBuff('wide');
    expect(world.live.damageMult).toBeCloseTo(damage * 1.4);
    expect(world.live.ballSpeed).toBeCloseTo(speed * 1.2);
    runUntil(world, () => world.buffs.length === 0, 12);
    expect(world.live.damageMult).toBeCloseTo(damage);
    expect(world.live.ballSpeed).toBeCloseTo(speed);
  });

  it('Perpetuum freezes the buff clocks while Overdrive runs', () => {
    const world = makeWorld({ perpetuum: 1 });
    startPlaying(world);
    clearCourt(world);
    world.activateBuff('rage');
    world.energy = 100;
    expect(world.tryOverdrive()).toBe(true);
    runUntil(world, () => false, 2);
    expect(world.odActive).toBe(true);
    expect(world.buffs[0]!.t).toBeCloseTo(7, 5);
    runUntil(world, () => !world.odActive, 10);
    const left = world.buffs[0]!.t;
    expect(left).toBeGreaterThan(6.9);
    runUntil(world, () => false, 1);
    expect(world.buffs[0]!.t).toBeLessThan(left - 0.9);
  });
});

describe('upgrades: everything else that is new', () => {
  /** Energy one centred catch grants, measured in an otherwise empty court. */
  function catchEnergy(build: Record<string, number>, prep?: (world: World) => void): number {
    const world = makeWorld(build, { bot: false });
    startPlaying(world);
    clearCourt(world);
    parkBalls(world);
    prep?.(world);
    const ball = world.balls[0]!;
    Object.assign(ball, {
      docked: false,
      dryT: 0,
      x: world.paddle.x,
      y: PADDLE_Y - 30,
      vx: 0,
      vy: ball.speed,
    });
    const before = world.energy;
    let caught = false;
    world.events.on('paddle', () => (caught = true));
    runUntil(world, () => caught, 2);
    expect(caught).toBe(true);
    return world.energy - before;
  }

  it('Trampoline returns a lost ball from the floor once per trip', () => {
    const world = makeWorld({ trampoline: 1 }, { bot: false });
    startPlaying(world);
    clearCourt(world);
    parkBalls(world);
    const ball = world.balls[0]!;
    const bounces: number[] = [];
    const misses: number[] = [];
    world.events.on('floorBounce', (event) => bounces.push(event.x));
    world.events.on('miss', (event) => {
      if (!event.child) misses.push(1);
    });
    Object.assign(ball, { docked: false, x: 60, y: ARENA_H - 120, vx: 0, vy: ball.speed });
    runUntil(world, () => bounces.length > 0, 2);
    expect(bounces).toHaveLength(1);
    expect(bounces[0]).toBeCloseTo(60, 0);
    expect(misses).toHaveLength(0);
    expect(ball.alive).toBe(true);
    expect(ball.vy).toBeLessThan(0);
    expect(ball.y).toBeLessThanOrEqual(ARENA_H);
    // The floor only gives once: the next fall is a real miss.
    runUntil(world, () => misses.length > 0, 4);
    expect(misses).toHaveLength(1);
    expect(bounces).toHaveLength(1);
  });

  it('Trampoline rests its bounce whenever the paddle returns the ball', () => {
    const world = makeWorld({ trampoline: 1 }, { bot: false });
    startPlaying(world);
    const ball = world.balls[0]!;
    Object.assign(ball, { floor: 1, dryT: 0, x: world.paddle.x, vy: ball.speed });
    world.paddleBounce(ball);
    expect(ball.floor).toBe(0);
  });

  it('Evade turns aside a share of hits, and a dodged hit costs nothing', () => {
    let dodges = 0;
    let hits = 0;
    for (let seed = 1; seed <= 240; seed++) {
      const world = makeWorld({ evade: 2 }, { seed });
      startPlaying(world);
      world.combo = 40;
      world.energy = 50;
      const before = world.hp;
      const dodged: number[] = [];
      world.events.on('dodge', (event) => dodged.push(event.x));
      world.damagePlayer(1);
      if (world.hp === before) {
        dodges++;
        expect(dodged).toHaveLength(1);
        expect(world.combo).toBe(40);
        expect(world.energy).toBe(50);
        // A dodge still claims the grace window: a row sinking together is one roll, not several.
        world.damagePlayer(1);
        expect(world.hp).toBe(before);
      } else {
        hits++;
        expect(dodged).toHaveLength(0);
      }
    }
    const share = dodges / (dodges + hits);
    expect(share).toBeGreaterThan(0.25);
    expect(share).toBeLessThan(0.55);
  });

  it('Slow Field takes its fraction off the wall, the summoned bricks and the bullets alike', () => {
    const plain = makeWorld({}, { level: 6, bot: false });
    const slowed = makeWorld({ slowfield: 2 }, { level: 6, bot: false });
    startPlaying(plain);
    startPlaying(slowed);
    expect(slowed.live.slowField).toBeCloseTo(0.3);
    const drift = (world: World): number => {
      const brick = world.bricks.find((entry) => entry.vy > 0) ?? world.bricks[0]!;
      brick.vy = 40;
      const before = brick.baseY;
      world.update(DT);
      return brick.baseY - before;
    };
    expect(drift(slowed) / drift(plain)).toBeCloseTo(0.7, 4);
    const start = [plain.fieldOffset, slowed.fieldOffset];
    runUntil(plain, () => false, 4);
    runUntil(slowed, () => false, 4);
    const wall = [plain.fieldOffset - start[0]!, slowed.fieldOffset - start[1]!];
    expect(wall[0]).toBeGreaterThan(0);
    expect(wall[1]! / wall[0]!).toBeCloseTo(0.7, 2);
    // Level 6 fields a turret: its next shot shows the bullets' speed.
    const bulletSpeed = (world: World): number => {
      runUntil(world, () => world.bullets.length > 0, 6);
      return Math.hypot(world.bullets[0]!.vx, world.bullets[0]!.vy);
    };
    expect(bulletSpeed(slowed) / bulletSpeed(plain)).toBeCloseTo(0.7, 5);
  });

  it('Calibration widens what counts as a perfect catch', () => {
    const perfectAt = (build: Record<string, number>, offset: number): boolean | null => {
      const world = makeWorld(build, { bot: false });
      startPlaying(world);
      const ball = world.balls[0]!;
      Object.assign(ball, { dryT: 0, x: world.paddle.x + world.paddle.halfW * offset });
      let perfect: boolean | null = null;
      world.events.on('paddle', (event) => {
        perfect = event.perfect;
      });
      world.paddleBounce(ball);
      return perfect;
    };
    expect(perfectAt({}, 0.1)).toBe(true);
    expect(perfectAt({}, 0.2)).toBe(false);
    expect(perfectAt({ calibration: 1 }, 0.2)).toBe(true);
    expect(perfectAt({ calibration: 1 }, 0.4)).toBe(false);
  });

  it('judges a perfect catch by where the ball landed, not where the anti-stall sends it', () => {
    const world = makeWorld({}, { bot: false });
    startPlaying(world);
    const ball = world.balls[0]!;
    Object.assign(ball, { dryT: 99, x: world.paddle.x + 1 });
    let perfect: boolean | null = null;
    world.events.on('paddle', (event) => {
      perfect = event.perfect;
    });
    world.paddleBounce(ball);
    expect(perfect).toBe(true);
  });

  it('Capacitor multiplies the charge of a catch; Perpetuum does so again while a buff runs', () => {
    expect(catchEnergy({})).toBeCloseTo(7, 5);
    expect(catchEnergy({ capacitor: 1 })).toBeCloseTo(7 * 1.3, 5);
    expect(catchEnergy({ perpetuum: 1 })).toBeCloseTo(7, 5);
    expect(catchEnergy({ perpetuum: 1, capacitor: 1 }, (world) => world.activateBuff('wide'))).toBeCloseTo(
      7 * 1.3 * 3,
      4,
    );
  });

  it('Afterglow sweeps the whole field when Overdrive runs its course', () => {
    const world = makeWorld({ afterglow: 1 }, { level: 4 });
    startPlaying(world);
    parkBalls(world);
    world.energy = 100;
    expect(world.tryOverdrive()).toBe(true);
    const untouched = (): number =>
      world.bricks.filter((brick) => !brick.dead && brick.hp >= brick.maxHp).length;
    expect(untouched()).toBe(world.bricks.length);
    runUntil(world, () => !world.odActive, 7.5);
    expect(world.odActive).toBe(false);
    expect(untouched()).toBe(0);
  });

  it('Critical Mass keeps Overdrive alive while bricks keep falling', () => {
    const world = makeWorld({ criticalmass: 1, power: 3 }, { level: 9 });
    startPlaying(world);
    world.energy = 100;
    expect(world.tryOverdrive()).toBe(true);
    const elapsed = runUntil(world, () => !world.odActive, 20);
    // Six seconds of Overdrive, stretched by half a second per five bricks — and never by more than six.
    expect(world.killed).toBeGreaterThanOrEqual(5);
    expect(elapsed).toBeGreaterThan(6.2);
    expect(elapsed).toBeLessThan(12.4);
  });

  it('Thunderhead strikes the brick nearest the danger line, on a steady clock', () => {
    const world = makeWorld({ thunderhead: 1 }, { level: 6, bot: false });
    startPlaying(world);
    parkBalls(world);
    const strikes: number[] = [];
    let aimed = true;
    world.events.on('strike', (event) => {
      strikes.push(world.time);
      aimed &&= world.bricks.every((brick) => brick.dead || brick.y <= event.y + 1e-6);
    });
    const hp = (): number => world.bricks.reduce((sum, brick) => sum + brick.hp, 0);
    const before = hp();
    runUntil(world, () => strikes.length >= 2, 8);
    expect(strikes).toHaveLength(2);
    expect(aimed).toBe(true);
    expect(strikes[1]! - strikes[0]!).toBeCloseTo(2.5, 1); // the clock is read once a frame
    expect(before - hp()).toBeGreaterThan(3 * BASE_DMG);
  });

  it('Corrosion spread hands corrosion to the neighbours of a corroded brick', () => {
    const spread = (build: Record<string, number>): [boolean, boolean] => {
      const world = makeWorld({ poison: 3, ...build }, { level: 6 });
      const plain = (): NonNullable<World['bricks'][number]>[] => world.bricks.filter((brick) => !brick.boss);
      const victim = plain()[0]!;
      const distance = (brick: NonNullable<World['bricks'][number]>): number =>
        Math.hypot(brick.x - victim.x, brick.y - victim.y);
      const near = plain().find((brick) => brick !== victim && distance(brick) < 100)!;
      const far = plain().reduce((best, brick) => (distance(brick) > distance(best) ? brick : best));
      expect(distance(far)).toBeGreaterThan(150);
      victim.poisonT = 2;
      shatter(world, victim);
      expect(victim.dead).toBe(true);
      return [near.poisonT > 0, far.poisonT > 0];
    };
    expect(spread({})).toEqual([false, false]);
    expect(spread({ plague: 1 })).toEqual([true, false]);
  });

  it('Wildfire sets the neighbours of a burning brick alight', () => {
    const spread = (build: Record<string, number>): [boolean, boolean] => {
      const world = makeWorld({ fire: 3, ...build }, { level: 6 });
      const plain = (): NonNullable<World['bricks'][number]>[] => world.bricks.filter((brick) => !brick.boss);
      const victim = plain()[0]!;
      const distance = (brick: NonNullable<World['bricks'][number]>): number =>
        Math.hypot(brick.x - victim.x, brick.y - victim.y);
      const near = plain().find((brick) => brick !== victim && distance(brick) < 100)!;
      const far = plain().reduce((best, brick) => (distance(brick) > distance(best) ? brick : best));
      expect(distance(far)).toBeGreaterThan(140);
      victim.burnT = 2;
      shatter(world, victim);
      return [near.burnT > 0, far.burnT > 0];
    };
    expect(spread({})).toEqual([false, false]);
    expect(spread({ wildfire: 1 })).toEqual([true, false]);
  });

  it('Prism bends each laser hit sideways, into the next brick along', () => {
    const damageByBrick = (build: Record<string, number>): number[] => {
      const world = makeWorld(build, { level: 1, bot: false });
      startPlaying(world);
      clearCourt(world);
      parkBalls(world);
      const row = world.bricks.slice(0, 3);
      row.forEach((brick, i) => {
        Object.assign(brick, { baseX: 300 + i * 100, x: 300 + i * 100, hp: 1000, maxHp: 1000 });
      });
      for (const brick of world.bricks.slice(3)) brick.dead = true;
      world.paddle.x = 300;
      fireLasers(world);
      return row.map((brick) => 1000 - brick.hp);
    };
    expect(damageByBrick({ laser: 1 })).toEqual([6, 0, 0]);
    expect(damageByBrick({ laser: 1, prism: 1 })).toEqual([6, 5, 0]);
  });

  it('folds the plain stat upgrades into their numbers', () => {
    expect(computeStats({ recycler: 3 }, 0).crystalMult).toBeCloseTo(2.2);
    expect(computeStats({ antenna: 2 }, 0).buffRate).toBeCloseTo(1);
    expect(computeStats({ capacitor: 3 }, 0).odGain).toBeCloseTo(0.9);
    expect(computeStats({ calibration: 2 }, 0).perfectWindow).toBeCloseTo(0.192);
    expect(computeStats({ calibration: 2 }, 0).perfectEnergy).toBeCloseTo(0.5);
    expect(computeStats({ trampoline: 2 }, 0).floorBounces).toBe(2);
    expect(computeStats({ thunderhead: 2 }, 0).shockChains).toBe(4);
    expect(computeStats({}, 0).crystalChance).toBe(0.2);
  });
});

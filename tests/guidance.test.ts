import { describe, expect, it } from 'vitest';
import { RNG } from '../src/core/rng';
import { angleDelta, clamp } from '../src/core/math';
import { ARENA_W, BALL_ANTI_STALL, BALL_RADIUS, BALL_SPEED, PADDLE_Y, WALL } from '../src/game/config';
import { makeBall, makeBrick, type Ball, type Brick } from '../src/game/entities';
import {
  ANTI_STALL_TURN,
  guide,
  isGuided,
  pickTarget,
  routeTo,
  turnToward,
  type Route,
} from '../src/game/guidance';
import { buildLevel } from '../src/game/levels/generator';
import { createRun } from '../src/game/run';
import { computeStats } from '../src/game/upgrades/stats';
import { World } from '../src/game/world';

const DT = 1 / 60;
const UP = -Math.PI / 2;
/** Guidance 1: the widest turning circle the upgrade ever gives a ball. */
const WIDE = 2.4;
const ROUTE: Route = { x: 0, y: 0, path: 0, reachable: false, bank: false };

function ballAt(x: number, y: number, angle: number): Ball {
  return makeBall({ x, y, angle, speed: BALL_SPEED, radius: BALL_RADIUS, mult: 1 });
}

function brickAt(x: number, y: number): Brick {
  const brick = makeBrick({ col: 0, row: 0, type: 'normal', hp: 1, color: 0x27e0ff, seed: 0 });
  brick.baseX = x;
  brick.baseY = y;
  brick.x = x;
  brick.y = y;
  return brick;
}

const headingOf = (ball: Ball): number => Math.atan2(ball.vy, ball.vx);

/** Flies a ball towards a point exactly as the guidance steers, one pixel at a time. Returns the distance covered. */
function flyTowards(ball: Ball, turn: number, tx: number, ty: number): number {
  let path = 0;
  for (let i = 0; i < 4000 && Math.hypot(tx - ball.x, ty - ball.y) > 1; i++) {
    turnToward(ball, tx, ty, turn / ball.speed);
    ball.x += ball.vx / ball.speed;
    ball.y += ball.vy / ball.speed;
    path++;
  }
  return path;
}

/** Flies a route the way the game would: steered at the aim point, rebounded off the walls, on to the brick. */
function flyRoute(ball: Ball, turn: number, aimX: number, aimY: number, brick: Brick): number {
  const edge = WALL + ball.radius;
  const right = ARENA_W - edge;
  let x = ball.x;
  let y = ball.y;
  let heading = headingOf(ball);
  let path = 0;
  for (let i = 0; i < 4000 && Math.hypot(brick.x - x, brick.y - y) > 1; i++) {
    const maxTurn = turn / ball.speed;
    heading += clamp(angleDelta(heading, Math.atan2(aimY - y, aimX - x)), -maxTurn, maxTurn);
    x += Math.cos(heading);
    y += Math.sin(heading);
    path++;
    // A rebound leaves the ball on the mirrored line, which runs through the brick itself.
    if (x >= right || x <= edge) {
      x = clamp(x, edge, right);
      heading = Math.PI - heading;
      aimX = brick.x;
      aimY = brick.y;
    } else if (y <= edge) {
      y = edge;
      heading = -heading;
      aimX = brick.x;
      aimY = brick.y;
    }
  }
  return path;
}

describe('guidance: routes', () => {
  it('measures a head-on route as the path the steering actually flies', () => {
    // [angle off the heading, distance]: from dead ahead to almost beside the ball.
    const cases: [number, number][] = [
      [0, 600],
      [0.3, 500],
      [0.8, 450],
      [1.2, 300],
    ];
    for (const [bearing, dist] of cases) {
      const x = 360 + dist * Math.sin(bearing);
      const y = 800 - dist * Math.cos(bearing);
      const brick = brickAt(x, y);
      routeTo(ballAt(360, 800, UP), 4.8, brick, ROUTE);
      expect(ROUTE.bank, `bearing ${bearing}`).toBe(false);
      expect(ROUTE.reachable, `bearing ${bearing}`).toBe(true);
      const flown = flyTowards(ballAt(360, 800, UP), 4.8, x, y);
      expect(Math.abs(flown - ROUTE.path) / ROUTE.path, `bearing ${bearing}`).toBeLessThan(0.01);
    }

    // Dead behind, off every wall: a U-turn and more, because one way of turning does all the work.
    const radius = BALL_SPEED / 7;
    routeTo(ballAt(400, 480, 0), 7, brickAt(300, 480), ROUTE);
    expect(ROUTE.bank).toBe(false);
    expect(ROUTE.path).toBeCloseTo(radius * 1.5 * Math.PI + 100, 6);
    const flown = flyTowards(ballAt(400, 480, 0), 7, 300, 480);
    expect(Math.abs(flown - ROUTE.path) / ROUTE.path).toBeLessThan(0.01);
  });

  it('never claims a head-on route to a brick inside its turning circle', () => {
    // 250 px to the side at Guidance 1: the turning circle is 292 px wide, so lining up would need a loop.
    const brick = brickAt(610, 500);
    const ball = ballAt(360, 500, UP);
    expect(250).toBeLessThan((2 * BALL_SPEED) / WIDE);
    routeTo(ball, WIDE, brick, ROUTE);
    expect(ROUTE.bank || !ROUTE.reachable).toBe(true);
  });

  it('ranks a brick it has to loop around behind every brick it can line up on', () => {
    // Near the ceiling and heading down, with nothing to rebound off usefully.
    const loop = brickAt(460, 60);
    const linedUp = brickAt(360, 14 + BALL_RADIUS + 300);
    routeTo(ballAt(360, 100, UP + Math.PI), ANTI_STALL_TURN, loop, ROUTE);
    expect(ROUTE.reachable).toBe(false);
    const loopPath = ROUTE.path;
    routeTo(ballAt(360, 100, UP + Math.PI), ANTI_STALL_TURN, linedUp, ROUTE);
    expect(ROUTE.reachable).toBe(true);
    expect(ROUTE.path).toBeLessThan(loopPath);
  });

  it('measures a wall rebound as the path actually flown', () => {
    // Heading for the brick's mirror image; the wall turns the heading onto the brick itself.
    const cases: { ball: Ball; brick: Brick; wall: 'left' | 'right' | 'top' }[] = [
      // Lined up well before the wall.
      { ball: ballAt(600, 600, -Math.PI / 6), brick: brickAt(400, 300), wall: 'right' },
      { ball: ballAt(120, 600, (-Math.PI * 5) / 6), brick: brickAt(320, 300), wall: 'left' },
      // The wall arrives while the ball is still turning.
      { ball: ballAt(310, 873, UP), brick: brickAt(560, 640), wall: 'right' },
      { ball: ballAt(360, 300, UP), brick: brickAt(420, 360), wall: 'top' },
    ];
    for (const { ball, brick, wall } of cases) {
      routeTo(ball, WIDE, brick, ROUTE);
      expect(ROUTE.bank, wall).toBe(true);
      expect(ROUTE.reachable, wall).toBe(true);
      if (wall === 'top') expect(ROUTE.y).toBeLessThan(0);
      else expect(Math.sign(ROUTE.x - 360)).toBe(Math.sign(ROUTE.x - brick.x));
      expect(ROUTE.x === brick.x && ROUTE.y === brick.y, 'aims past the brick, not at it').toBe(false);
      const flown = flyRoute(ball, WIDE, ROUTE.x, ROUTE.y, brick);
      expect(Math.abs(flown - ROUTE.path) / ROUTE.path, `${wall} rebound`).toBeLessThan(0.02);
    }
  });

  it('charges a brick dead ahead no more than the straight distance', () => {
    // Rounding must not turn "no turn at all" into a full circle.
    const brick = brickAt(360, 200);
    routeTo(ballAt(360, 800, UP), 4.8, brick, ROUTE);
    expect(ROUTE.reachable).toBe(true);
    expect(ROUTE.bank).toBe(false);
    expect(ROUTE.path).toBeCloseTo(600, 6);
  });
});

describe('guidance: choosing a brick', () => {
  it('takes the brick it can reach soonest, not merely the nearest one', () => {
    // Heading straight up, one brick just behind and to the side, one further ahead.
    const ball = ballAt(360, 700, UP);
    const behind = brickAt(430, 760);
    const ahead = brickAt(360, 380);
    expect(pickTarget(ball, [behind, ahead], 4.8, ROUTE)).toBe(ahead);
    expect(ROUTE.bank).toBe(false);
    expect(ROUTE.reachable).toBe(true);
  });

  it('prefers the nearer of two bricks that are both straight ahead', () => {
    const near = brickAt(360, 400);
    expect(pickTarget(ballAt(360, 700, UP), [brickAt(360, 300), near], 4.8, ROUTE)).toBe(near);
  });

  it('rebounds off a wall when it cannot line up on the nearest brick', () => {
    const brick = brickAt(400, 300);
    const ball = ballAt(600, 600, -Math.PI / 6);
    expect(pickTarget(ball, [brick], WIDE, ROUTE)).toBe(brick);
    expect(ROUTE.bank).toBe(true);
    expect(ROUTE.x).toBeGreaterThan(ARENA_W);
  });

  it('never aims at a dead or a cloaked brick', () => {
    const dead = brickAt(360, 400);
    dead.dead = true;
    const cloaked = brickAt(360, 350);
    cloaked.cloaked = true;
    const live = brickAt(360, 300);
    expect(pickTarget(ballAt(360, 700, UP), [dead, cloaked, live], 4.8, ROUTE)).toBe(live);
    expect(pickTarget(ballAt(360, 700, UP), [dead, cloaked], 4.8, ROUTE)).toBeNull();
  });

  it('still finds the right brick when many nearer ones are all behind it', () => {
    const ball = ballAt(360, 700, UP);
    const behind = Array.from({ length: 12 }, (_, i) => brickAt(300 + i * 10, 740 + i));
    const ahead = brickAt(360, 380);
    expect(pickTarget(ball, [...behind, ahead], 4.8, ROUTE)).toBe(ahead);
  });
});

describe('guidance: when a ball turns', () => {
  const far = brickAt(360, 300);

  it('turns only while it has a charge to spend', () => {
    const armed = ballAt(300, 700, UP);
    armed.guided = 1;
    guide(armed, [far], 4.8, DT);
    expect(headingOf(armed)).toBeGreaterThan(UP);
    expect(headingOf(armed)).toBeLessThanOrEqual(UP + 4.8 * DT + 1e-12);

    const spent = ballAt(300, 700, UP);
    spent.guided = 0;
    guide(spent, [far], 4.8, DT);
    expect(headingOf(spent)).toBe(UP);
  });

  it('drifts towards a brick once it has touched none for a while, guidance or not', () => {
    for (const homing of [0, 4.8]) {
      const dry = ballAt(300, 700, UP);
      dry.guided = 0;
      dry.dryT = BALL_ANTI_STALL + 1;
      guide(dry, [far], homing, DT);
      expect(headingOf(dry), `homing ${homing}`).toBeGreaterThan(UP);
      expect(headingOf(dry), `homing ${homing}`).toBeLessThanOrEqual(UP + ANTI_STALL_TURN * DT + 1e-12);
    }
    const fresh = ballAt(300, 700, UP);
    fresh.guided = 0;
    guide(fresh, [far], 0, DT);
    expect(headingOf(fresh)).toBe(UP);
  });

  it('keeps its lock even when another brick becomes the nearer one', () => {
    const ball = ballAt(360, 700, UP);
    ball.guided = 1;
    guide(ball, [far], 7, DT);
    expect(ball.lock).toBe(far.id);

    const near = brickAt(330, 620);
    expect(pickTarget(ball, [far, near], 7, ROUTE)).toBe(near);
    guide(ball, [far, near], 7, DT);
    expect(ball.lock).toBe(far.id);
    // Dead ahead: the locked brick costs it no turning at all.
    expect(headingOf(ball)).toBe(UP);
  });

  it('takes a new brick once the one it locked on is gone or hidden', () => {
    const near = brickAt(330, 620);
    const dead = ballAt(360, 700, UP);
    dead.guided = 1;
    guide(dead, [far, near], 7, DT);
    far.dead = true;
    guide(dead, [far, near], 7, DT);
    expect(dead.lock).toBe(near.id);

    far.dead = false;
    far.cloaked = true;
    const hidden = ballAt(360, 700, UP);
    hidden.guided = 1;
    hidden.lock = far.id;
    guide(hidden, [far, near], 7, DT);
    expect(hidden.lock).toBe(near.id);
  });

  it('lets go when there is nothing left to aim at', () => {
    const ball = ballAt(360, 700, UP);
    ball.guided = 1;
    ball.lock = 4242;
    guide(ball, [], 4.8, DT);
    expect(ball.lock).toBe(0);
    expect(headingOf(ball)).toBe(UP);
  });
});

// ───────────────────────── in play ─────────────────────────

interface WorldOptions {
  level?: number;
  seed?: number;
  bot?: boolean;
  balls?: number;
}

function makeWorld(upgrades: Record<string, number>, options: WorldOptions = {}): World {
  const seed = options.seed ?? 1;
  const run = createRun('endless', seed);
  Object.assign(run.upgrades, upgrades);
  run.stats = { ...computeStats(run.upgrades, 0), ballCount: options.balls ?? 4 };
  const rng = new RNG(seed * 31 + (options.level ?? 1));
  return new World(run, buildLevel(options.level ?? 1, rng), rng.fork(), { bot: options.bot ?? true });
}

/** Steps the world until `predicate` holds or `seconds` of game time pass. */
function runUntil(world: World, predicate: () => boolean, seconds: number): void {
  for (let t = 0; !predicate() && t < seconds; t += DT) world.update(DT);
}

function startPlaying(world: World): void {
  runUntil(world, () => world.state === 'playing', 3);
  expect(world.state).toBe('playing');
}

/** Buff capsules never reach the paddle: nothing but guidance may bend the ball in these tests. */
function dropCapsules(world: World): void {
  for (const pickup of world.pickups) if (pickup.kind === 'buff') pickup.dead = true;
}

/** Parks every brick far above the arena, leaving an empty court. */
function clearCourt(world: World): void {
  for (const brick of world.bricks) {
    brick.baseY = -5000;
    brick.y = -5000;
  }
}

describe('guidance: in play', () => {
  it('steers only with both charges left and a turn rate to spend them on', () => {
    const ball = ballAt(360, 500, UP);
    ball.guided = 0;
    expect(isGuided(ball, WIDE)).toBe(false);
    ball.guided = 3;
    // Born holding a charge — but with no core or SEEKER capsule there is nothing to steer with.
    expect(isGuided(ball, 0)).toBe(false);
    expect(isGuided(ball, WIDE)).toBe(true);
  });

  it('spends one charge per brick contact and flies straight once they are gone', () => {
    const world = makeWorld({ homing: 3 }, { balls: 1 });
    startPlaying(world);
    const ball = world.balls[0]!;
    expect(ball.guided, 'loaded with 2 + level charges at launch').toBe(5);
    expect(ball.lock, 'has not picked a brick while docked').toBe(0);

    let hits = 0;
    world.events.on('hit', (event) => {
      if (event.source === 'ball') hits++;
    });
    runUntil(
      world,
      () => {
        dropCapsules(world);
        return hits > 0;
      },
      5,
    );
    expect(hits).toBeGreaterThan(0);
    expect(5 - ball.guided, 'every contact spends exactly one charge').toBe(hits);
    expect(ball.guided).toBeGreaterThan(0);

    runUntil(
      world,
      () => {
        dropCapsules(world);
        return ball.guided === 0;
      },
      20,
    );
    expect(hits, 'each charge bought exactly one contact').toBe(5);

    // With the charges gone it flies and bounces straight: no heading change until a rebound.
    let rebounds = 0;
    world.events.on('bounce', () => rebounds++);
    world.events.on('paddle', () => rebounds++);
    world.events.on('floorBounce', () => rebounds++);
    for (let i = 0; i < 30; i++) {
      const before = headingOf(ball);
      dropCapsules(world);
      rebounds = 0;
      world.update(DT);
      if (rebounds > 0) continue; // a rebound may bend the heading; steering may not
      expect(Math.abs(angleDelta(before, headingOf(ball))), `frame ${i}`).toBeLessThan(1e-9);
    }
  });

  it('reloads the guidance when the paddle returns the ball', () => {
    const world = makeWorld({ homing: 3 }, { balls: 1, bot: false });
    startPlaying(world);
    const ball = world.balls[0]!;
    ball.guided = 0;
    ball.lock = 4242;
    ball.x = world.paddle.x;
    ball.y = PADDLE_Y - 30;
    ball.vx = 0;
    ball.vy = ball.speed;
    world.paddleBounce(ball);
    expect(ball.guided, 'a full magazine of 2 + level').toBe(5);
    expect(ball.lock, 'picks a fresh brick for the new trip').toBe(0);
  });

  it('reloads the guidance when a lost ball relaunches from the paddle', () => {
    const world = makeWorld({ homing: 3 }, { balls: 1, bot: false });
    startPlaying(world);
    clearCourt(world);
    const ball = world.balls[0]!;
    ball.guided = 0;
    ball.x = ARENA_W - 60;
    ball.y = 500;
    ball.vx = 0;
    ball.vy = ball.speed;
    runUntil(world, () => !ball.alive, 5);
    expect(ball.alive).toBe(false);
    runUntil(world, () => ball.alive, 3);
    expect(ball.alive).toBe(true);
    expect(ball.guided).toBe(5);
  });

  it('arms every ball as it is born, twins from 「球体分裂」 included', () => {
    const world = makeWorld({ homing: 3 }, { balls: 1 });
    startPlaying(world);
    expect(world.activateBuff('split')).toBe(true);
    dropCapsules(world);
    world.update(DT);
    const twins = world.balls.filter((ball) => ball.clone);
    expect(twins).toHaveLength(2);
    expect(twins.every((ball) => ball.guided === 5 && ball.lock === 0)).toBe(true);
  });

  it('still drifts a spent ball towards a brick once it has been dry for a while', () => {
    // One brick far to the left; the ball is bouncing on the right with nothing to hit.
    const world = makeWorld({ homing: 3 }, { balls: 1, bot: false });
    startPlaying(world);
    const keep = world.bricks.reduce((a, b) => (a.x < b.x ? a : b));
    for (const brick of world.bricks) if (brick !== keep) brick.dead = true;
    keep.baseY = 150;
    keep.y = 150;
    const ball = world.balls[0]!;
    ball.guided = 0;
    ball.dryT = BALL_ANTI_STALL + 1;
    ball.x = 640;
    ball.y = 400;
    ball.vx = 0;
    ball.vy = -ball.speed;
    dropCapsules(world);
    world.update(DT);
    const heading = headingOf(ball);
    // The brick is off to the left, so "towards it" is a turn to the left.
    expect(heading, 'starts bending towards the brick').toBeLessThan(UP);
    expect(heading, 'at the drift rate, not the guidance rate').toBeGreaterThanOrEqual(
      UP - ANTI_STALL_TURN * DT - 1e-9,
    );
    runUntil(
      world,
      () => {
        dropCapsules(world);
        return keep.dead;
      },
      14,
    );
    expect(keep.dead, 'reaches the brick on its own').toBe(true);
  });

  it('turns only while armed, over whole levels, and hits the brick it locked on', () => {
    let trips = 0;
    let onTarget = 0;
    let turnsWhileArmed = 0;
    for (const level of [1, 2, 4]) {
      for (const seed of [1, 2, 3]) {
        const world = makeWorld({ homing: 3 }, { level, seed, balls: 1 });
        if (world.level.modifier?.id === 'gravity') continue;
        startPlaying(world);
        const ball = world.balls[0]!;

        let rebounds = 0;
        let paddleReturns = 0;
        world.events.on('bounce', () => rebounds++);
        world.events.on('floorBounce', () => rebounds++);
        world.events.on('paddle', () => {
          rebounds++;
          paddleReturns++;
        });
        // Written by the hit listener, which TypeScript cannot see from here.
        const landed: { brick: Brick | null } = { brick: null };
        world.events.on('hit', (event) => {
          if (event.source === 'ball' && !landed.brick) landed.brick = event.brick;
        });

        // One trip: from the paddle until the first brick it touches.
        let trip: { lock: number } | null = { lock: 0 };
        for (let t = 0; t < 40 && world.state === 'playing'; t += DT) {
          dropCapsules(world);
          const flying = ball.alive && !ball.docked;
          rebounds = 0;
          landed.brick = null;
          const returnsBefore = paddleReturns;
          const armed = flying && ball.guided > 0;
          const dry = ball.dryT;
          const before = flying ? headingOf(ball) : 0;
          world.update(DT);
          if (paddleReturns !== returnsBefore) trip = { lock: 0 };
          // A trip that ends in the floor is over; the relaunch starts a fresh one, uncounted.
          if (!ball.alive || ball.docked) {
            trip = null;
            continue;
          }
          if (trip && trip.lock === 0) trip.lock = ball.lock;
          const brickHit = landed.brick as Brick | null;
          if (brickHit) {
            if (trip) {
              trips++;
              if (trip.lock === brickHit.id) onTarget++;
            }
            trip = null;
          }
          if (flying && Math.abs(angleDelta(before, headingOf(ball))) > 1e-9 && rebounds === 0) {
            // The sim adds the frame to dryT before steering, so a frame that crosses the line counts.
            expect(armed || dry + DT > BALL_ANTI_STALL, 'steered with nothing to steer for').toBe(true);
            if (armed) turnsWhileArmed++;
          }
        }
      }
    }
    expect(turnsWhileArmed).toBeGreaterThan(0);
    expect(trips).toBeGreaterThan(20);
    expect(onTarget / trips).toBeGreaterThan(0.9);
  });
});

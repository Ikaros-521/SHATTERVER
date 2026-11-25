import { angleDelta, clamp } from '../core/math';
import { ARENA_H, ARENA_W, BALL_ANTI_STALL, PADDLE_H, WALL } from './config';
import { onBallHitBrick } from './combat';
import type { Ball, Brick } from './entities';
import type { World } from './world';

interface Sweep {
  /** Fraction of the segment at which contact happens. */
  t: number;
  nx: number;
  ny: number;
  /** The ball already overlaps the brick at the start of the segment. */
  inside: boolean;
}

const sweep: Sweep = { t: 0, nx: 0, ny: 0, inside: false };

/**
 * Sweeps a point segment against a brick inflated by the ball radius (its Minkowski sum).
 *
 * The slab test gives the exact contact fraction and the face normal, so a ball never tunnels
 * through a brick no matter how fast the build has made it.
 */
function sweepBrick(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  r: number,
  brick: Brick,
  out: Sweep,
): boolean {
  const hx = brick.w / 2 + r;
  const hy = brick.h / 2 + r;
  const sx = x0 - brick.x;
  const sy = y0 - brick.y;
  const dx = x1 - x0;
  const dy = y1 - y0;

  if (Math.abs(sx) <= hx && Math.abs(sy) <= hy) {
    // Overlapping at the start: push out along the axis of least penetration.
    const px = hx - Math.abs(sx);
    const py = hy - Math.abs(sy);
    out.inside = true;
    out.t = 0;
    if (px < py) {
      out.nx = sx < 0 ? -1 : 1;
      out.ny = 0;
    } else {
      out.nx = 0;
      out.ny = sy < 0 ? -1 : 1;
    }
    return true;
  }

  out.inside = false;
  let tmin = 0;
  let tmax = 1;
  let nx = 0;
  let ny = 0;

  if (Math.abs(dx) < 1e-9) {
    if (sx < -hx || sx > hx) return false;
  } else {
    let t1 = (-hx - sx) / dx;
    let t2 = (hx - sx) / dx;
    let n = -1;
    if (t1 > t2) {
      const swap = t1;
      t1 = t2;
      t2 = swap;
      n = 1;
    }
    if (t1 > tmin) {
      tmin = t1;
      nx = n;
      ny = 0;
    }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return false;
  }

  if (Math.abs(dy) < 1e-9) {
    if (sy < -hy || sy > hy) return false;
  } else {
    let t1 = (-hy - sy) / dy;
    let t2 = (hy - sy) / dy;
    let n = -1;
    if (t1 > t2) {
      const swap = t1;
      t1 = t2;
      t2 = swap;
      n = 1;
    }
    if (t1 > tmin) {
      tmin = t1;
      nx = 0;
      ny = n;
    }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return false;
  }

  if (nx === 0 && ny === 0) return false;
  out.t = tmin;
  out.nx = nx;
  out.ny = ny;
  return true;
}

/** Rotates the velocity direction toward a point by at most `maxTurn` radians. Speed is preserved. */
export function turnToward(ball: Ball, tx: number, ty: number, maxTurn: number): void {
  const current = Math.atan2(ball.vy, ball.vx);
  const wanted = Math.atan2(ty - ball.y, tx - ball.x);
  const angle = current + clamp(angleDelta(current, wanted), -maxTurn, maxTurn);
  ball.vx = Math.cos(angle) * ball.speed;
  ball.vy = Math.sin(angle) * ball.speed;
}

function renormalize(ball: Ball): void {
  const len = Math.hypot(ball.vx, ball.vy) || 1;
  ball.vx *= ball.speed / len;
  ball.vy *= ball.speed / len;
}

/** Keeps the ball from getting trapped in a near-horizontal or near-vertical loop. */
function enforceAngle(ball: Ball): void {
  const sp = ball.speed;
  if (Math.abs(ball.vy) < 0.2 * sp) {
    ball.vy = (ball.vy < 0 ? -1 : 1) * 0.2 * sp;
    renormalize(ball);
  }
  if (Math.abs(ball.vx) < 0.06 * sp) {
    ball.vx = (ball.vx < 0 ? -1 : 1) * 0.06 * sp;
    renormalize(ball);
  }
}

function collideWalls(world: World, ball: Ball): void {
  const left = WALL + ball.radius;
  const right = ARENA_W - WALL - ball.radius;
  if (ball.x <= left) {
    ball.x = left;
    if (ball.vx < 0) {
      ball.vx = -ball.vx;
      world.events.emit('bounce', { x: left - ball.radius, y: ball.y, nx: 1, ny: 0 });
      enforceAngle(ball);
    }
  } else if (ball.x >= right) {
    ball.x = right;
    if (ball.vx > 0) {
      ball.vx = -ball.vx;
      world.events.emit('bounce', { x: right + ball.radius, y: ball.y, nx: -1, ny: 0 });
      enforceAngle(ball);
    }
  }
  const top = WALL + ball.radius;
  if (ball.y <= top) {
    ball.y = top;
    if (ball.vy < 0) {
      ball.vy = -ball.vy;
      world.events.emit('bounce', { x: ball.x, y: top - ball.radius, nx: 0, ny: 1 });
      enforceAngle(ball);
    }
  }
}

function collidePaddle(world: World, ball: Ball): void {
  if (ball.vy <= 0) return;
  const paddle = world.paddle;
  const top = paddle.y - PADDLE_H / 2;
  if (
    ball.y + ball.radius >= top &&
    ball.y - ball.radius < paddle.y + PADDLE_H &&
    Math.abs(ball.x - paddle.x) <= paddle.halfW + ball.radius
  ) {
    world.paddleBounce(ball);
  }
}

function steer(ball: Ball, world: World, maxTurn: number): void {
  let target: Brick | null = null;
  let best = Infinity;
  for (const brick of world.bricks) {
    if (brick.dead || brick.cloaked) continue;
    const dx = brick.x - ball.x;
    const dy = brick.y - ball.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < best) {
      best = d2;
      target = brick;
    }
  }
  if (target) turnToward(ball, target.x, target.y, maxTurn);
}

/**
 * Advances one ball by `dt` with continuous collision detection.
 *
 * The move is split into sub-steps of a few pixels each; per sub-step the whole brick list is swept
 * and the earliest contact wins. A ball either bounces off that brick or (pierce) phases through it.
 */
export function stepBall(world: World, ball: Ball, dt: number): void {
  const stats = world.stats;
  if (stats.homing > 0) steer(ball, world, stats.homing * dt);
  // A ball that has found nothing to hit for a while drifts towards the nearest brick on its own.
  if (ball.dryT > BALL_ANTI_STALL && stats.homing <= 0) steer(ball, world, 1.6 * dt);
  if (world.level.modifier?.id === 'gravity') {
    ball.vy += 620 * dt;
    renormalize(ball);
  }
  if (stats.magnetRadius > 0 && ball.vy > 0) {
    const paddle = world.paddle;
    const dy = paddle.y - ball.y;
    if (dy > 0 && dy < stats.magnetRadius + 160 && Math.abs(paddle.x - ball.x) < stats.magnetRadius * 1.6) {
      turnToward(ball, paddle.x, paddle.y, (3 + stats.magnetRadius / 40) * dt);
    }
  }

  let remaining = dt;
  let hitNx = 0;
  let hitNy = 0;
  let hitInside = false;

  for (let guard = 0; guard < 16 && remaining > 1e-6; guard++) {
    const stepT = Math.min(remaining, Math.max(5, ball.radius * 0.7) / ball.speed);
    const x1 = ball.x + ball.vx * stepT;
    const y1 = ball.y + ball.vy * stepT;

    let target: Brick | null = null;
    let bestT = 1;
    for (const brick of world.bricks) {
      if (brick.dead) continue;
      const until = ball.ignore.get(brick.id);
      if (until !== undefined && until > world.time) continue;
      if (sweepBrick(ball.x, ball.y, x1, y1, ball.radius, brick, sweep) && sweep.t <= bestT) {
        bestT = sweep.t;
        target = brick;
        hitNx = sweep.nx;
        hitNy = sweep.ny;
        hitInside = sweep.inside;
      }
    }

    if (target) {
      const used = stepT * bestT;
      ball.x += ball.vx * used;
      ball.y += ball.vy * used;
      if (hitInside) {
        ball.x += hitNx * 0.6;
        ball.y += hitNy * 0.6;
      }
      const cx = ball.x - hitNx * ball.radius;
      const cy = ball.y - hitNy * ball.radius;
      const pierce = onBallHitBrick(world, ball, target, hitNx, hitNy, cx, cy);
      remaining -= Math.max(used, 1e-4);

      if (!pierce) {
        const into = ball.vx * hitNx + ball.vy * hitNy;
        if (into < 0) {
          ball.vx -= 2 * into * hitNx;
          ball.vy -= 2 * into * hitNy;
        }
        ball.x += hitNx * 0.05;
        ball.y += hitNy * 0.05;
        ball.squash = 1;
        world.events.emit('bounce', { x: cx, y: cy, nx: hitNx, ny: hitNy });
        enforceAngle(ball);
      }
      continue;
    }

    ball.x = x1;
    ball.y = y1;
    remaining -= stepT;

    collideWalls(world, ball);
    collidePaddle(world, ball);
    if (ball.y - ball.radius > ARENA_H) {
      world.loseBall(ball);
      return;
    }
  }
}

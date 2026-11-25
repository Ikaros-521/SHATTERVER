import { clamp } from '../core/math';
import { ARENA_W, PADDLE_BOUNCE_SPREAD, PADDLE_H, WALL } from './config';
import type { Ball, Bullet, Pickup } from './entities';
import type { World } from './world';

/** Where a descending ball will cross the paddle line, with wall bounces folded in. */
function landingOf(ball: Ball, world: World): { x: number; t: number } {
  const paddle = world.paddle;
  const t = (paddle.y - PADDLE_H / 2 - ball.radius - ball.y) / Math.max(1, ball.vy);
  const lo = WALL + ball.radius;
  const span = ARENA_W - WALL * 2 - ball.radius * 2;
  let pos = (ball.x - lo + ball.vx * t) % (span * 2);
  if (pos < 0) pos += span * 2;
  return { x: pos <= span ? lo + pos : lo + span * 2 - pos, t };
}

/**
 * Where along the paddle to catch so the return flight points at the most threatened brick.
 *
 * The paddle converts catch offset into return angle, so "aiming" means arriving early and
 * offset from the landing spot. The bot always goes for the brick closest to the danger line,
 * breaking ties by proximity to the landing spot.
 */
function aimOffset(world: World, landingX: number): number {
  let target: { x: number; y: number } | null = null;
  let best = -Infinity;
  for (const brick of world.bricks) {
    if (brick.dead) continue;
    const rank = brick.y - Math.abs(brick.x - landingX) * 0.05;
    if (rank > best) {
      best = rank;
      target = brick;
    }
  }
  if (!target) return 0;
  const angle = Math.atan2(target.x - landingX, world.paddle.y - target.y);
  return clamp(angle / PADDLE_BOUNCE_SPREAD, -0.92, 0.92);
}

/**
 * paddle x for the automated player. Used by the attract-mode demo behind the title screen
 * and by the headless balance simulations in `tests/`.
 *
 * Two jobs, one axis: catch the ball that arrives soonest (aimed), and block any bullet that
 * is about to reach the floor. When one position covers both it takes it; when two things
 * land at once on opposite sides it blocks the bullet, since a dropped ball costs only tempo.
 */
export function botTarget(world: World): number {
  const paddle = world.paddle;
  const minX = WALL + paddle.halfW;
  const maxX = ARENA_W - WALL - paddle.halfW;

  let ball: Ball | null = null;
  let ballT = Infinity;
  for (const candidate of world.balls) {
    if (!candidate.alive || candidate.docked || candidate.vy <= 0) continue;
    const t = (paddle.y - PADDLE_H / 2 - candidate.radius - candidate.y) / candidate.vy;
    if (t < ballT) {
      ballT = t;
      ball = candidate;
    }
  }

  let bullet: Bullet | null = null;
  let bulletT = Infinity;
  for (const candidate of world.bullets) {
    if (candidate.dead || candidate.vy <= 0) continue;
    const t = (paddle.y - candidate.y) / candidate.vy;
    if (t < bulletT) {
      bulletT = t;
      bullet = candidate;
    }
  }

  // A falling capsule is the one prize that can be missed, so the soonest one stands in for the
  // catch whenever it would arrive first. Barrages still outrank it: a buff is never worth a life.
  let capsule: Pickup | null = null;
  let capsuleT = Infinity;
  for (const candidate of world.pickups) {
    if (candidate.dead || candidate.kind !== 'buff' || candidate.vy <= 0) continue;
    const t = (paddle.y - 10 - candidate.y) / candidate.vy;
    if (t < capsuleT) {
      capsuleT = t;
      capsule = candidate;
    }
  }

  const capsuleFirst = capsule !== null && capsuleT <= ballT;
  const catchT = capsuleFirst ? capsuleT : ballT;
  const landing = !capsuleFirst && ball ? landingOf(ball, world).x : null;
  const blockX = bullet ? clamp(bullet.x + bullet.vx * bulletT, minX, maxX) : null;
  // A capsule only asks for the paddle to be under it; a ball is caught off-centre on purpose,
  // to aim its return.
  const catchX =
    capsuleFirst && capsule
      ? clamp(capsule.x, minX, maxX)
      : ball && landing !== null
        ? clamp(landing - aimOffset(world, landing) * paddle.halfW, minX, maxX)
        : null;
  const catchDue = capsuleFirst ? capsuleT < 1.4 : ball !== null && ballT < 1.4;
  const bulletDue = bullet !== null && bulletT < 1.6;
  // One paddle position can cover both when their landing spots are close enough to straddle.
  const coverBoth = catchX !== null && blockX !== null && Math.abs(catchX - blockX) <= paddle.halfW * 2 - 24;

  // Handle whatever reaches the paddle line first. The paddle closes ~95% of any gap in 0.1s,
  // so a bullet that lands clearly before the catch can be blocked and the catch still made.
  if (bulletDue && (!catchDue || bulletT < catchT - 0.15)) {
    return catchDue && coverBoth ? ((catchX as number) + (blockX as number)) / 2 : (blockX as number);
  }
  if (catchDue) {
    // Simultaneous and out of reach of each other: protect the life, sacrifice the catch.
    if (bulletDue && !coverBoth && Math.abs(bulletT - catchT) < 0.3) return blockX as number;
    return catchX as number;
  }
  if (bulletDue) return blockX as number;
  if (catchX !== null) return catchX;
  return ARENA_W / 2;
}

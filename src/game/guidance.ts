import { TAU, angleDelta, clamp } from '../core/math';
import { ARENA_W, BALL_ANTI_STALL, WALL } from './config';
import type { Ball, Brick } from './entities';

/**
 * Everything that bends a ball towards a brick on purpose: the Guidance core and the SEEKER capsule,
 * and the drift of a ball that has touched nothing for a while (anti-stall).
 *
 * Guidance works in charges. The paddle loads `guidedCharges` of them at each return, and a ball
 * spends one per aimed hit — one steered arc onto a locked brick, then straight flight and plain
 * bounces until the next charge or the next trip.
 *
 * A ball turns at a limited rate, so it can only line up on a brick that lies outside its turning
 * circle. Inside it the ball has to loop around first — which is what made guided balls swerve
 * across the field without end. So a ball locks onto the brick it can reach soonest (a rebound off a
 * wall counts as a way there), keeps that brick until it arrives, and only takes a new one when the
 * old one is gone or can no longer be lined up on.
 */

/** Turn rate (rad/s) of the anti-stall drift: a ball that has touched no brick for a while bends towards one. */
export const ANTI_STALL_TURN = 1.6;

/** How many bricks get a close look first when a ball picks a target: the ones nearest to it. */
const NEAREST = 6;

/** Rotates the velocity direction toward a point by at most `maxTurn` radians. Speed is preserved. */
export function turnToward(ball: Ball, tx: number, ty: number, maxTurn: number): void {
  const current = Math.atan2(ball.vy, ball.vx);
  const wanted = Math.atan2(ty - ball.y, tx - ball.x);
  const angle = current + clamp(angleDelta(current, wanted), -maxTurn, maxTurn);
  ball.vx = Math.cos(angle) * ball.speed;
  ball.vy = Math.sin(angle) * ball.speed;
}

/** Where a turn-then-straight path stops turning, and how far it turned by then. Filled by `turnThenStraight`. */
const TANGENT = { x: 0, y: 0, arc: 0 };

/**
 * Length of the path "turn at full rate towards the point until the heading lines up, then fly
 * straight", for a ball at (`x`, `y`) with its heading at `heading` radians.
 *
 * Infinity when the point lies inside the turning circle: the heading never lines up, and the ball
 * has to loop around before it can.
 */
function turnThenStraight(
  x: number,
  y: number,
  heading: number,
  speed: number,
  turn: number,
  tx: number,
  ty: number,
): number {
  const dx = tx - x;
  const dy = ty - y;
  const dist = Math.hypot(dx, dy);
  TANGENT.x = x;
  TANGENT.y = y;
  TANGENT.arc = 0;
  if (dist < 1e-6) return 0;

  const off = angleDelta(heading, Math.atan2(dy, dx));
  const radius = speed / turn;
  // The point seen from the centre of the turning circle, in a frame where the ball heads along +x
  // and turns towards +y: the centre then sits at (0, radius).
  const lx = dist * Math.cos(off);
  const ly = dist * Math.abs(Math.sin(off)) - radius;
  const toTarget = Math.hypot(lx, ly);
  if (toTarget < radius) return Infinity;

  // Both tangents from the point to the circle are this long, and both turn by the same angle to meet it.
  const straight = Math.sqrt(toTarget * toTarget - radius * radius);
  const beta = Math.atan2(straight, radius);
  const cb = Math.cos(beta);
  const sb = Math.sin(beta);
  const ux = lx / toTarget;
  const uy = ly / toTarget;

  // Two tangents run from the point to the circle. Only the one the ball reaches while turning
  // towards the point sends it on to the point; from the other it would head away.
  let best = Infinity;
  let nx = 0;
  let ny = 0;
  let arc = 0;
  for (let sign = -1; sign <= 1; sign += 2) {
    // Unit vector from the centre to where this tangent touches the circle.
    const px = ux * cb - uy * sb * sign;
    const py = ux * sb * sign + uy * cb;
    if (px * ly - py * lx <= 0) continue;
    const turned = Math.atan2(px, -py);
    // Dead ahead, rounding can leave the tangent a hair the wrong side of "no turn at all".
    const swept = turned >= -1e-9 ? Math.max(turned, 0) : turned + TAU;
    const path = radius * swept + straight;
    if (path < best) {
      best = path;
      nx = px;
      ny = py;
      arc = swept;
    }
  }
  if (best === Infinity) return Infinity;

  // Back to the world: `radius * nx` along the heading, `radius * (1 + ny)` towards the turning side.
  const hx = Math.cos(heading);
  const hy = Math.sin(heading);
  const side = off >= 0 ? 1 : -1;
  const along = radius * nx;
  const across = radius * (1 + ny);
  TANGENT.x = x + hx * along - hy * side * across;
  TANGENT.y = y + hy * along + hx * side * across;
  TANGENT.arc = arc;
  return best;
}

type Wall = 'left' | 'right' | 'top';

/**
 * Length of a route to the brick that rebounds off a wall: the ball heads for the brick's mirror
 * image behind that wall, so the rebound carries it on towards the brick itself.
 *
 * The wall can arrive before the heading has lined up with the image; the rest is then measured from
 * the rebound, where the ball is heading for the brick the mirrored way round.
 */
function rebound(ball: Ball, turn: number, brick: Brick, wall: Wall, ix: number, iy: number): number {
  const radius = ball.speed / turn;
  const heading = Math.atan2(ball.vy, ball.vx);
  const toImage = turnThenStraight(ball.x, ball.y, heading, ball.speed, turn, ix, iy);
  if (!Number.isFinite(toImage)) return Infinity;

  // The turning circle for a turn towards the image, and where on it the ball is.
  const side = angleDelta(heading, Math.atan2(iy - ball.y, ix - ball.x)) >= 0 ? 1 : -1;
  const cx = ball.x - Math.sin(heading) * radius * side;
  const cy = ball.y + Math.cos(heading) * radius * side;
  const start = Math.atan2(ball.y - cy, ball.x - cx);

  // Where the circle meets the wall, as directions from its centre.
  const edge = WALL + ball.radius;
  let first: number;
  let second: number;
  if (wall === 'top') {
    const sine = (edge - cy) / radius;
    if (Math.abs(sine) > 1) return toImage;
    first = Math.asin(sine);
    second = Math.PI - first;
  } else {
    const cosine = ((wall === 'left' ? edge : ARENA_W - edge) - cx) / radius;
    if (Math.abs(cosine) > 1) return toImage;
    first = Math.acos(cosine);
    second = -first;
  }
  // ...and the nearer of them, counted as an angle turned from where the ball is now.
  let impact = Infinity;
  for (let i = 0; i < 2; i++) {
    const arc = (((((i === 0 ? first : second) - start) * side) % TAU) + TAU) % TAU;
    if (arc > 1e-6 && arc < impact) impact = arc;
  }
  // Lined up first: the straight leg runs through the wall and on to the brick.
  if (impact >= TANGENT.arc) return toImage;

  const bearing = start + side * impact;
  const px = cx + radius * Math.cos(bearing);
  const py = cy + radius * Math.sin(bearing);
  const turned = heading + side * impact;
  const rest = turnThenStraight(
    px,
    py,
    wall === 'top' ? -turned : Math.PI - turned,
    ball.speed,
    turn,
    brick.x,
    brick.y,
  );
  return (
    radius * impact + (Number.isFinite(rest) ? rest : radius * TAU + Math.hypot(brick.x - px, brick.y - py))
  );
}

export interface Route {
  /** Where to head: the brick itself, or its mirror image behind the wall the route rebounds off. */
  x: number;
  y: number;
  /** How far the ball flies on this route. */
  path: number;
  /** False when the brick can only be reached by looping around first. Such a brick ranks behind every other. */
  reachable: boolean;
  /** The route rebounds off a wall. */
  bank: boolean;
}

const WALLS: readonly Wall[] = ['left', 'right', 'top'];

/**
 * The best way for this ball to reach `brick` from where it is now, written to `out`: head-on when
 * it can line up, otherwise off a wall.
 */
export function routeTo(ball: Ball, turn: number, brick: Brick, out: Route): void {
  const edge = WALL + ball.radius;
  const right = ARENA_W - edge;
  const heading = Math.atan2(ball.vy, ball.vx);
  const headOn = turnThenStraight(ball.x, ball.y, heading, ball.speed, turn, brick.x, brick.y);

  out.x = brick.x;
  out.y = brick.y;
  out.bank = false;
  out.reachable = Number.isFinite(headOn);
  // A loop around is worth no more than one full circle before the distance still to cover.
  out.path = out.reachable
    ? headOn
    : (ball.speed / turn) * TAU + Math.hypot(brick.x - ball.x, brick.y - ball.y);

  for (const wall of WALLS) {
    let ix = brick.x;
    let iy = brick.y;
    if (wall === 'top') {
      if (brick.y <= edge) continue;
      iy = 2 * edge - brick.y;
    } else if (wall === 'left') {
      if (brick.x <= edge) continue;
      ix = 2 * edge - brick.x;
    } else {
      if (brick.x >= right) continue;
      ix = 2 * right - brick.x;
    }
    const path = rebound(ball, turn, brick, wall, ix, iy);
    if (path < out.path) {
      out.path = path;
      out.x = ix;
      out.y = iy;
      out.reachable = true;
      out.bank = true;
    }
  }
}

const ROUTE: Route = { x: 0, y: 0, path: 0, reachable: false, bank: false };

/** The nearest bricks seen by the cheap pass in `pickTarget`, nearest first. */
const NEAR_D2 = new Float64Array(NEAREST);
const NEAR_BRICK: (Brick | null)[] = new Array<Brick | null>(NEAREST).fill(null);

/**
 * How isolated a brick is, 0 in a crowd to 1 all alone. An aimed hit on a lone brick strands the
 * ball at the edge of the field, so the picker charges lonely bricks a longer route rather than a
 * crowded one — steering stays inside the brick field, where the next bounce finds work.
 */
function isolationOf(brick: Brick, bricks: readonly Brick[]): number {
  let neighbours = 0;
  for (const other of bricks) {
    if (other === brick || other.dead || other.cloaked) continue;
    if ((other.x - brick.x) ** 2 + (other.y - brick.y) ** 2 <= ISOLATION_R2) {
      neighbours++;
      if (neighbours >= ISOLATION_CROWD) return 0;
    }
  }
  return 1 - neighbours / ISOLATION_CROWD;
}

/** Bricks within this distance of a candidate count as its crowd. */
const ISOLATION_R2 = 120 ** 2;
/** Neighbours at which a brick counts as fully crowded. */
const ISOLATION_CROWD = 5;
/** How much a wholly isolated brick's route is stretched, as a fraction. */
const ISOLATION_PENALTY = 0.6;

/**
 * The brick this ball should steer towards — the one it can reach soonest once lonely bricks are
 * charged for the detour — and the route there, written to `out`. Null when there is nothing to aim at.
 */
export function pickTarget(ball: Ball, bricks: readonly Brick[], turn: number, out: Route): Brick | null {
  // No route is shorter than the distance it covers, so the nearest bricks are weighed first: a good
  // early answer lets every brick farther away than it be skipped without a closer look.
  let count = 0;
  for (const brick of bricks) {
    if (brick.dead || brick.cloaked) continue;
    const d2 = (brick.x - ball.x) ** 2 + (brick.y - ball.y) ** 2;
    if (count === NEAREST && d2 >= NEAR_D2[NEAREST - 1]) continue;
    let i = Math.min(count, NEAREST - 1);
    for (; i > 0 && (NEAR_D2[i - 1] ?? 0) > d2; i--) {
      NEAR_D2[i] = NEAR_D2[i - 1] ?? 0;
      NEAR_BRICK[i] = NEAR_BRICK[i - 1] ?? null;
    }
    NEAR_D2[i] = d2;
    NEAR_BRICK[i] = brick;
    count = Math.min(count + 1, NEAREST);
  }

  let best = Infinity;
  let target: Brick | null = null;
  const consider = (brick: Brick): void => {
    routeTo(ball, turn, brick, out);
    const cost = out.path * (1 + ISOLATION_PENALTY * isolationOf(brick, bricks));
    if (cost < best) {
      best = cost;
      target = brick;
    }
  };
  for (let i = 0; i < count; i++) {
    const brick = NEAR_BRICK[i];
    // Already farther than the best route so far: it cannot beat it.
    if (brick && (NEAR_D2[i] ?? 0) < best * best) consider(brick);
  }
  for (const brick of bricks) {
    if (brick.dead || brick.cloaked) continue;
    if ((brick.x - ball.x) ** 2 + (brick.y - ball.y) ** 2 < best * best) consider(brick);
  }
  if (target) routeTo(ball, turn, target, out);
  return target;
}

/** The brick a ball is still steering towards, or null once it is gone, cloaked or was never locked. */
function lockOf(ball: Ball, bricks: readonly Brick[]): Brick | null {
  if (ball.lock === 0) return null;
  for (const brick of bricks) {
    if (brick.id === ball.lock) return brick.dead || brick.cloaked ? null : brick;
  }
  return null;
}

/** True while guidance steers `ball`: charges loaded, and a turn rate to spend them with. */
export function isGuided(ball: Ball, homing: number): boolean {
  return ball.guided > 0 && homing > 0;
}

/**
 * Steers `ball` for one frame, or leaves it alone when it has no reason to turn.
 *
 * With charges left the ball turns at the build's `homing` rate towards the brick it has locked
 * onto. Without them — charges spent, or no Guidance in the build — a ball that has touched no
 * brick for BALL_ANTI_STALL seconds drifts towards one at ANTI_STALL_TURN instead.
 */
export function guide(ball: Ball, bricks: readonly Brick[], homing: number, dt: number): void {
  const armed = isGuided(ball, homing);
  if (!armed && ball.dryT <= BALL_ANTI_STALL) return;
  const turn = armed ? homing : ANTI_STALL_TURN;

  const locked = lockOf(ball, bricks);
  if (locked) {
    routeTo(ball, turn, locked, ROUTE);
    if (ROUTE.reachable) {
      turnToward(ball, ROUTE.x, ROUTE.y, turn * dt);
      return;
    }
    // Flown past or knocked off course: the lock can no longer be lined up on, so a new one is taken.
  }
  const target = pickTarget(ball, bricks, turn, ROUTE);
  if (!target) {
    ball.lock = 0;
    return;
  }
  ball.lock = target.id;
  turnToward(ball, ROUTE.x, ROUTE.y, turn * dt);
}

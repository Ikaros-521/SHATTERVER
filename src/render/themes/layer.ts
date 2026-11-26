import { clamp, damp, lerp } from '../../core/math';
import { RNG, hashString } from '../../core/rng';
import { ARENA_W, PADDLE_H } from '../../game/config';
import type { Ball } from '../../game/entities';
import type { World } from '../../game/world';
import type { Pen } from '../batch';
import type { QualityLevel } from '../layout';
import { ParticleSystem, type Particle } from '../particles';
import { drawParticlePool } from '../scene';
import { AmbientField, type AmbientStage } from './ambient';
import { emitBurst } from './recipes';
import type { BallFrame, PaddleFrame, ThemeConfig, ThemeOverlay, ThemeSlots } from './types';
/**
 * The theme layer: the one place that knows a theme at run time.
 *
 * It is worn, part by part — whatever the save has equipped in each slot — and from then on it
 * only watches. Each frame the app hands it the world's presentation state (the paddle's place
 * and speed, the clock) and each contact the world announces; it answers with particles and
 * with what its painters draw. It writes nothing back: no position, velocity or rule of the
 * simulation is ever touched, and the collision boxes are drawn exactly where the simulation
 * keeps them.
 *
 * Its particles live in their own fixed pool, apart from the gameplay FX, so a theme can never
 * starve a brick shatter of sparks — nor flood the screen: every recipe is thinned as the pool
 * fills, and the counts step down with the quality.
 */

/** Particles a theme may have in flight at once, by quality step. */
export function themeParticleCapacity(quality: QualityLevel): number {
  return quality === 'low' ? 700 : quality === 'medium' ? 1500 : 2600;
}

/** A quality step's place in the specs' per-step counts. */
const stepOf = (quality: QualityLevel): 0 | 1 | 2 => (quality === 'low' ? 0 : quality === 'medium' ? 1 : 2);

/** Balls that leave a trail, at most: with a full swarm the first few carry the look. */
const MAX_TRAIL_BALLS = 8;
/** Theme effects for bounces allowed per frame: fifty balls rattling in a corner is one splash. */
const BOUNCE_BUDGET = 6;
/** World units the paddle travels between trail particles. */
const PADDLE_STRIDE = 46;
/** Below this the paddle counts as at rest and sheds nothing. */
const MOVE_THRESHOLD = 0.2;
/** Trail emission stops once the pool is this full; what is already flying finishes first. */
const POOL_LIMIT = 0.75;
/** How long a landing's "open" clock takes to settle, as the rate it eases back at. */
const HIT_EASE = 6.5;
/** The longest `sinceHit` reports, so it never grows without bound. */
const SINCE_HIT_CAP = 30;

/** The themes worn in each slot this frame. */
export type { ThemeSlots };

interface Trail {
  x: number;
  y: number;
  acc: number;
}

export class ThemeLayer implements ThemeOverlay {
  private pool: ParticleSystem;
  private quality: QualityLevel;
  /** The background's drifting layer, one field per spec of the worn background. */
  private fields: AmbientField[] = [];
  private fieldFor: string | null = null;
  private stage: AmbientStage | null = null;

  private time = 0;
  private hit = 0;
  private sinceHit = SINCE_HIT_CAP;
  private move = 0;
  /** -1..1: where the paddle sits across the arena, eased. The background's parallax input. */
  private parallax = 0;
  private paddleAcc = 0;
  private idleAcc = 0;
  private budget = BOUNCE_BUDGET;
  private readonly trails = new Map<number, Trail>();
  private readonly worn: ThemeSlots = { paddle: null, ball: null, bg: null };
  private offs: (() => void)[] = [];

  // Scratch, so drawing a frame allocates nothing.
  private readonly paddleFrame: PaddleFrame = {
    x: 0,
    y: 0,
    hw: 0,
    hh: 0,
    vx: 0,
    hit: 0,
    sinceHit: 0,
    move: 0,
    overdrive: false,
    time: 0,
  };
  private readonly ballFrame: BallFrame = { x: 0, y: 0, r: 0, rot: 0, alpha: 0, time: 0 };

  constructor(quality: QualityLevel) {
    this.quality = quality;
    this.pool = new ParticleSystem(themeParticleCapacity(quality));
  }

  /** The theme on the paddle, the ball and the background right now. */
  slots(): ThemeSlots {
    return this.worn;
  }

  /** True when any part is worn, i.e. the layer has anything to draw. */
  get active(): boolean {
    return this.worn.paddle !== null || this.worn.ball !== null || this.worn.bg !== null;
  }

  /** The background's parallax input for the frame: -1..1. */
  get drift(): number {
    return this.parallax;
  }

  /** The paddle's "open" clock: 1 the instant a ball lands, easing back to 0. What its painter animates by. */
  get openness(): number {
    return this.hit;
  }

  /** How many drifting fields the worn background runs. */
  get fieldCount(): number {
    return this.fields.length;
  }

  /** The particles in flight right now. For tests and the debug readout. */
  liveParticles(): readonly Particle[] {
    return this.pool.pool.filter((p) => p.alive);
  }

  /** The distinct kinds among them. For tests and the debug readout. */
  liveKinds(): number[] {
    return [...new Set(this.liveParticles().map((p) => p.kind))].sort();
  }

  /** How many theme particles are in flight. */
  get particles(): number {
    return this.pool.alive;
  }

  /** How many are adrift in the background's layer. */
  get ambientCount(): number {
    let count = 0;
    for (const field of this.fields) count += field.count;
    return count;
  }

  /** Dresses the layer. Cheap enough to call every frame; a changed background rebuilds its drifting layer. */
  wear(slots: ThemeSlots): void {
    this.worn.paddle = slots.paddle;
    this.worn.ball = slots.ball;
    const bg = slots.bg;
    this.worn.bg = bg;
    if (bg?.id === this.fieldFor) return;
    this.fieldFor = bg?.id ?? null;
    this.fields = [];
    if (!bg) return;
    const step = stepOf(this.quality);
    const rng = new RNG(hashString(bg.id));
    for (const spec of bg.effects.ambient) {
      const field = new AmbientField(spec, spec.count[2] ?? 0, rng.fork());
      field.setCount(spec.count[step] ?? 0);
      this.fields.push(field);
    }
    if (this.stage) for (const field of this.fields) field.resize(this.stage.width, this.stage.height);
  }

  /**
   * Follows a quality step. The pool is fixed at allocation, so a change swaps in a new one
   * (what is in flight is lost — a step happens when the device is struggling anyway).
   */
  setQuality(quality: QualityLevel): void {
    if (quality === this.quality) return;
    this.quality = quality;
    const capacity = themeParticleCapacity(quality);
    if (capacity !== this.pool.capacity) this.pool = new ParticleSystem(capacity);
    const step = stepOf(quality);
    for (const field of this.fields) field.setCount(field.spec.count[step] ?? 0);
  }

  /** Tells the layer where the window puts the world, for the frame about to be drawn. */
  begin(stage: AmbientStage): void {
    this.stage = stage;
    for (const field of this.fields) field.resize(stage.width, stage.height);
  }

  /** Starts watching a world's contacts. Returns what stops it. */
  attach(world: World): () => void {
    this.detach();
    this.offs = [
      world.events.on('paddle', ({ x }) => this.onPaddle(world, x)),
      world.events.on('bounce', ({ x, y, nx, ny }) => this.onBounce(x, y, nx, ny)),
    ];
    return () => this.detach();
  }

  detach(): void {
    for (const off of this.offs) off();
    this.offs = [];
  }

  /** Forgets everything in flight. Used when switching worlds. */
  clear(): void {
    this.pool.clear();
    this.trails.clear();
    this.hit = 0;
    this.sinceHit = SINCE_HIT_CAP;
    this.move = 0;
    this.paddleAcc = 0;
    this.idleAcc = 0;
  }

  /**
   * Advances the layer: its clock, its particles, the paddle's eased state and the trails both
   * leave behind. `dt` is the same slowed time the gameplay FX run on, so the theme follows the
   * world into slow motion exactly as they do.
   */
  update(dt: number, world: World | null): void {
    this.time += dt;
    this.budget = BOUNCE_BUDGET;
    this.hit = damp(this.hit, 0, HIT_EASE, dt);
    this.sinceHit = Math.min(this.sinceHit + dt, SINCE_HIT_CAP);
    this.pool.update(dt);
    for (const field of this.fields) field.update(dt, this.time);
    if (!world || dt <= 0) return;

    const paddle = world.paddle;
    this.move = damp(this.move, clamp(Math.abs(paddle.vx) / 1600, 0, 1), 9, dt);
    const half = ARENA_W / 2;
    this.parallax = damp(this.parallax, clamp((paddle.x - half) / half, -1, 1), 5, dt);

    const effects = this.worn.paddle?.effects;
    if (effects) {
      // Moving: the trailing end sheds. At rest: only what the theme says idles off it.
      this.paddleAcc += Math.abs(paddle.vx) * dt;
      if (this.move > MOVE_THRESHOLD && this.paddleAcc >= PADDLE_STRIDE) {
        this.paddleAcc = 0;
        const back = paddle.vx > 0 ? -1 : 1;
        emitBurst(
          this.pool,
          // Leaves most of the way, a firefly now and then.
          effects.paddleSpark && Math.random() < effects.paddleSpark.chance
            ? effects.paddleSpark.burst
            : effects.paddleTrail,
          paddle.x + back * paddle.halfW * 0.92,
          paddle.y - PADDLE_H / 2,
          back,
          -0.4,
          this.move,
        );
      }
      if (effects.paddleIdle) {
        this.idleAcc += dt;
        if (this.idleAcc >= effects.paddleIdle.every) {
          this.idleAcc = 0;
          const along = (Math.random() * 2 - 1) * paddle.halfW * 0.8;
          emitBurst(this.pool, effects.paddleIdle.burst, paddle.x + along, paddle.y - PADDLE_H / 2, 0, -1, 1);
        }
      }
    }

    if (this.worn.ball) this.updateTrails(world, this.worn.ball);
  }

  // ───────────────────────────── ThemeOverlay ─────────────────────────────

  under(pen: Pen): void {
    const stage = this.stage;
    if (!stage) return;
    for (const field of this.fields) field.draw(pen, stage, this.time);
    drawParticlePool(pen, this.pool.pool, this.time);
  }

  paddle(pen: Pen, world: World): void {
    const theme = this.worn.paddle;
    if (!theme) return;
    const p = world.paddle;
    const squash = p.squash;
    const f = this.paddleFrame;
    f.x = p.x;
    f.y = p.y;
    // The stock body's own extents, squash and all, so the themed body sits exactly on the box.
    f.hw = p.halfW * (1 + 0.1 * squash);
    f.hh = (PADDLE_H / 2) * (1 - 0.3 * squash);
    f.vx = p.vx;
    f.hit = this.hit;
    f.sinceHit = this.sinceHit;
    f.move = this.move;
    f.overdrive = world.odActive;
    f.time = this.time;
    theme.paddle.paint(pen, f, theme.colors);
  }

  ball(pen: Pen, ball: Ball): void {
    const theme = this.worn.ball;
    if (!theme) return;
    const f = this.ballFrame;
    f.x = ball.x;
    f.y = ball.y;
    f.r = ball.radius;
    f.rot = Math.atan2(ball.vy, ball.vx);
    f.alpha = 1;
    f.time = this.time;
    theme.ball.paint(pen, f, theme.colors);
  }

  // ───────────────────────────── watching the world ─────────────────────────────

  private onPaddle(world: World, x: number): void {
    this.hit = 1;
    this.sinceHit = 0;
    const effects = this.worn.paddle?.effects;
    if (!effects) return;
    // A landing on the paddle belongs to the paddle's theme: its fan opens, its leaves scatter.
    const y = world.paddle.y - PADDLE_H / 2;
    for (const burst of effects.paddleHit) emitBurst(this.pool, burst, x, y, 0, -1, this.thinning());
  }

  private onBounce(x: number, y: number, nx: number, ny: number): void {
    const effects = this.worn.ball?.effects;
    if (!effects || this.budget <= 0) return;
    this.budget--;
    for (const burst of effects.bounce) emitBurst(this.pool, burst, x, y, nx, ny, this.thinning());
  }

  /** How much of a recipe to throw: less as the pool fills. */
  private thinning(): number {
    return clamp(1.15 - this.pool.alive / this.pool.capacity, 0.15, 1);
  }

  private updateTrails(world: World, theme: ThemeConfig): void {
    const recipe = theme.effects.ballTrail;
    const crowded = this.pool.alive / this.pool.capacity > POOL_LIMIT;
    const trails = this.trails;
    let seen = 0;
    for (const ball of world.balls) {
      if (!ball.alive || ball.docked) continue;
      // Only an ordinary ball wears the theme; twins, ghosts and the rest keep their own look.
      if (ball.clone || ball.child || ball.ghost || ball.emp > 0) continue;
      if (++seen > MAX_TRAIL_BALLS) break;
      const trail = trails.get(ball.id);
      if (!trail) {
        trails.set(ball.id, { x: ball.x, y: ball.y, acc: 0 });
        continue;
      }
      trail.acc += Math.hypot(ball.x - trail.x, ball.y - trail.y);
      trail.x = ball.x;
      trail.y = ball.y;
      if (trail.acc < recipe.stride) continue;
      trail.acc = 0;
      if (!crowded) emitBurst(this.pool, recipe, ball.x, ball.y, -ball.vx, -ball.vy, this.thinning());
    }
    if (trails.size > seen) {
      for (const id of trails.keys()) {
        if (!world.balls.some((ball) => ball.id === id)) trails.delete(id);
      }
    }
  }
}

/** The share of real time the theme runs at, given the frame's time scale: the gameplay FX's own blend. */
export const themeDt = (dt: number, timeScale: number): number => dt * lerp(1, timeScale, 0.8);

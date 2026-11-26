import { smoothstep, TAU } from '../../core/math';
import { RNG } from '../../core/rng';
import type { Pen } from '../batch';
import { SHAPE_BUBBLE, SHAPE_FISH, SHAPE_LEAF, SHAPE_PETAL } from '../shaders/sprites';

import type { AmbientKind, AmbientSpec } from './types';

/**
 * The background's drifting layer: petals, bubbles, leaves, fireflies, dust, small fish.
 *
 * It lives in window space (CSS pixels), not the world's: it is scenery behind the field, so it
 * must not shake with the camera or scale with a zoom. Each frame every particle is projected
 * through the current view into world units, which is the only language the instance batches
 * speak.
 *
 * A field is a fixed set of slots in typed arrays, allocated once. Nothing is created or
 * destroyed while it runs: a particle that dies, or drifts out, is respawned in place.
 */

/** How a field sees the window this frame. */
export interface AmbientStage {
  /** Window size in CSS px. */
  width: number;
  height: number;
  /** CSS px per world unit. */
  scale: number;
  /** Where the world's origin sits in the window, in CSS px. */
  ox: number;
  oy: number;
  /** The arena's rect in CSS px. */
  ax: number;
  ay: number;
  aw: number;
  ah: number;
}

/** How far past the window's edge a particle may wander before it counts as gone. */
const MARGIN = 40;
/** Seconds a particle takes to fade in or out. */
const FADE = 0.6;

/**
 * How much of its light a point of the drifting layer keeps, 0..1. It mirrors the darker plate
 * the backdrop lays over the arena (see `shaders/background.ts`): anything that drifts across
 * the field is faded there, most of all over the bricks, so it can never compete with them.
 * The distance and the two weights are the shader's own, so a petal is dimmed exactly as much
 * as the scenery it drifts over.
 */
export function plateDim(stage: AmbientStage, x: number, y: number): number {
  const cx = stage.ax + stage.aw / 2;
  const cy = stage.ay + stage.ah / 2;
  // Signed distance to the arena's rounded box, padded by 6: negative inside.
  const qx = Math.abs(x - cx) - stage.aw / 2 - 6 + PLATE_RADIUS;
  const qy = Math.abs(y - cy) - stage.ah / 2 - 6 + PLATE_RADIUS;
  const sd = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - PLATE_RADIUS;
  const inside = 1 - smoothstep(-PLATE_FEATHER, PLATE_FEATHER, sd);
  if (inside <= 0) return 1;
  const overBricks = smoothstep(-0.2, 0.5, (cy - y) / (stage.ah / 2));
  return 1 - inside * (0.62 + 0.18 * overBricks);
}

/** The arena plate's corner radius and the width of its feather, in CSS px: the backdrop shader's. */
const PLATE_RADIUS = 22;
const PLATE_FEATHER = 18;

/** One kind of drifting thing, in numbers. */
export class AmbientField {
  readonly kind: AmbientKind;

  private readonly xs: Float32Array;
  private readonly ys: Float32Array;
  private readonly vx: Float32Array;
  private readonly vy: Float32Array;
  /** Seconds left, and the full span this particle was given. */
  private readonly life: Float32Array;
  private readonly span: Float32Array;
  private readonly size: Float32Array;
  private readonly rot: Float32Array;
  private readonly spin: Float32Array;
  /** Phase and rate of the sway each one makes about its course. */
  private readonly phase: Float32Array;
  private readonly rate: Float32Array;
  private readonly colors: Uint8Array;
  /** Fish only: which way it heads, -1 or 1. */
  private readonly headings: Int8Array;

  private active = 0;
  private width = 0;
  private height = 0;

  constructor(
    readonly spec: AmbientSpec,
    readonly capacity: number,
    private readonly rng: RNG,
  ) {
    this.kind = spec.kind;
    this.xs = new Float32Array(capacity);
    this.ys = new Float32Array(capacity);
    this.vx = new Float32Array(capacity);
    this.vy = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.span = new Float32Array(capacity);
    this.size = new Float32Array(capacity);
    this.rot = new Float32Array(capacity);
    this.spin = new Float32Array(capacity);
    this.phase = new Float32Array(capacity);
    this.rate = new Float32Array(capacity);
    this.colors = new Uint8Array(capacity);
    this.headings = new Int8Array(capacity);
  }

  /** How many are adrift right now. Never more than the capacity. */
  get count(): number {
    return this.active;
  }

  /**
   * How many should be adrift. Slots that come alive are placed at random across the window and
   * fade in; slots that retire are simply not drawn or moved any more.
   */
  setCount(count: number): void {
    const next = Math.max(0, Math.min(count, this.capacity));
    for (let i = this.active; i < next; i++) this.spawn(i, true);
    this.active = next;
  }

  /** Tells the field the window's size. The first call scatters the field across it. */
  resize(width: number, height: number): void {
    if (width <= 0 || height <= 0 || (width === this.width && height === this.height)) return;
    const first = this.width <= 0 || this.height <= 0;
    this.width = width;
    this.height = height;
    if (first) for (let i = 0; i < this.active; i++) this.spawn(i, true);
  }

  /** Starts every particle over somewhere across the window, as if it had always been there. */
  scatter(): void {
    for (let i = 0; i < this.active; i++) this.spawn(i, true);
  }

  update(dt: number, time: number): void {
    const sway = this.spec.sway;
    for (let i = 0; i < this.active; i++) {
      this.life[i] -= dt;
      // A sway is a sinusoidal detour about the straight course: its velocity is the cosine.
      const detour = Math.cos(time * this.rate[i] + this.phase[i]) * this.rate[i] * sway;
      this.xs[i] += (this.vx[i] + detour) * dt;
      this.ys[i] += this.vy[i] * dt;
      this.rot[i] += this.spin[i] * dt;
      const x = this.xs[i];
      const y = this.ys[i];
      if (
        this.life[i] <= 0 ||
        x < -MARGIN ||
        x > this.width + MARGIN ||
        y < -MARGIN ||
        y > this.height + MARGIN
      ) {
        this.spawn(i, false);
      }
    }
  }

  draw(pen: Pen, stage: AmbientStage, time: number): void {
    const inv = 1 / stage.scale;
    const colors = this.spec.colors;
    for (let i = 0; i < this.active; i++) {
      const x = this.xs[i];
      const y = this.ys[i];
      const dim = plateDim(stage, x, y);
      if (dim <= 0.01) continue;
      const life = this.life[i];
      const age = this.span[i] - life;
      // Fish enter from off screen, so they never pop; everything else fades at both ends.
      const fade = this.kind === 'fish' ? 1 : Math.min(1, age / FADE, life / FADE);
      const alpha = fade * dim;
      if (alpha <= 0.01) continue;
      const wx = (x - stage.ox) * inv;
      const wy = (y - stage.oy) * inv;
      const s = this.size[i] * inv;
      const color = colors[this.colors[i] ?? 0] ?? 0xffffff;
      const phase = this.phase[i];
      switch (this.kind) {
        case 'petal': {
          // Tumbling: the petal narrows as it turns edge-on.
          const flip = 0.35 + 0.65 * Math.abs(Math.cos(time * this.rate[i] * 3.2 + phase));
          pen.sprite(SHAPE_PETAL, wx, wy, s, s * 0.58 * flip, this.rot[i], color, 0.92 * alpha, {
            p0: 0.6,
            p1: 0.22,
          });
          break;
        }
        case 'leaf':
          pen.sprite(SHAPE_LEAF, wx, wy, s, s * 0.44, this.rot[i], color, 0.94 * alpha, { p0: 0.5, p1: 0.8 });
          break;
        case 'bubble':
          pen.sprite(SHAPE_BUBBLE, wx, wy, s, s, 0, color, 0.85 * alpha, { p0: 0.09, p1: 0.9 });
          break;
        case 'fish': {
          const heading = this.headings[i] || 1;
          pen.sprite(
            SHAPE_FISH,
            wx,
            wy,
            s,
            s * 0.5,
            Math.sin(time * 2 + phase) * 0.12 * heading,
            color,
            0.9 * alpha,
            {
              p2: time + phase,
              mirror: heading < 0,
              halo: 0.1,
            },
          );
          break;
        }
        case 'firefly': {
          const blink =
            0.25 + 0.75 * Math.pow(0.5 + 0.5 * Math.sin(time * this.rate[i] * 2.6 + phase * 3), 2);
          pen.haze(wx, wy, s, s, color, blink * alpha, 0.6);
          pen.haze(wx, wy, s * 3.2, s * 3.2, color, blink * alpha * 0.22, 0.2);
          break;
        }
        default:
          pen.haze(wx, wy, s, s, color, 0.7 * alpha, 0.5);
      }
    }
  }

  /**
   * Fills one slot with a new particle. `fresh` places it anywhere, as though it had been
   * adrift for a while already; otherwise it enters from the edge its kind comes from.
   */
  private spawn(i: number, fresh: boolean): void {
    const spec = this.spec;
    const rng = this.rng;
    const speed = rng.range(spec.drift[0], spec.drift[1]);
    const cross = rng.range(spec.wind[0], spec.wind[1]);
    this.size[i] = rng.range(spec.size[0], spec.size[1]);
    this.phase[i] = rng.range(0, TAU);
    this.rate[i] = rng.range(0.35, 0.9);
    this.colors[i] = rng.int(0, spec.colors.length - 1);
    this.spin[i] = rng.range(spec.spin[0], spec.spin[1]) * rng.sign();
    this.rot[i] = rng.range(0, TAU);
    this.vx[i] = cross;
    this.vy[i] = speed;
    switch (spec.kind) {
      case 'petal':
      case 'leaf':
      case 'mote':
        // Falling: in at the top, out at the bottom.
        this.xs[i] = rng.range(-MARGIN, this.width + MARGIN);
        this.ys[i] = fresh ? rng.range(-MARGIN, this.height + MARGIN) : -MARGIN * rng.range(0, 1);
        this.span[i] = (this.height + 2 * MARGIN) / Math.max(speed, 1);
        break;
      case 'bubble':
        this.vy[i] = -speed;
        this.xs[i] = rng.range(-MARGIN, this.width + MARGIN);
        this.ys[i] = fresh
          ? rng.range(-MARGIN, this.height + MARGIN)
          : this.height + MARGIN * rng.range(0, 1);
        this.span[i] = (this.height + 2 * MARGIN) / speed;
        break;
      case 'firefly':
        this.vy[i] = rng.range(-speed, speed) * 0.5;
        this.xs[i] = rng.range(0, this.width);
        this.ys[i] = rng.range(0, this.height);
        this.span[i] = rng.range(5, 11);
        break;
      case 'fish': {
        const heading = rng.sign();
        this.headings[i] = heading;
        this.vx[i] = heading * Math.abs(cross);
        this.vy[i] = rng.range(-speed, speed) * 0.4;
        this.xs[i] = fresh
          ? rng.range(-MARGIN, this.width + MARGIN)
          : heading > 0
            ? -MARGIN
            : this.width + MARGIN;
        this.ys[i] = rng.range(0, this.height);
        this.span[i] = (this.width + 2 * MARGIN) / Math.abs(cross);
        break;
      }
    }
    // A fresh particle is part-way through its life, so a field switches on without a wave of
    // simultaneous fades.
    this.life[i] = this.span[i] * (fresh ? rng.range(0.2, 1) : 1);
  }
}

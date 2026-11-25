import { ARENA_H, ARENA_W } from '../game/config';
import { clamp, lerp } from '../core/math';

/** Smooth 1D value noise in [-1, 1]: shake that feels hand-held rather than sinusoidal. */
function jitter(t: number, seed: number): number {
  const i = Math.floor(t);
  const f = t - i;
  const h = (n: number): number => {
    let x = (n * 374761393 + seed * 668265263) >>> 0;
    x = Math.imul(x ^ (x >>> 13), 1274126177) >>> 0;
    return ((x ^ (x >>> 16)) >>> 0) / 2147483648 - 1;
  };
  const a = h(i);
  const b = h(i + 1);
  const s = f * f * (3 - 2 * f);
  return lerp(a, b, s);
}

/** world → CSS pixel mapping for one frame. */
export interface View {
  /** CSS pixels per world unit. */
  scale: number;
  tx: number;
  ty: number;
}

export interface Viewport {
  /** Top-left of the arena in CSS px. */
  ax: number;
  ay: number;
  /** Arena size in CSS px. */
  aw: number;
  ah: number;
}

const SHAKE_RATE = 38;
const SHAKE_PX = 22;

/**
 * Game-feel camera: trauma-based shake, spring "punch" zoom, hit stop and slow motion.
 *
 * Nothing here knows about the game. The app asks for effects ("shake a little", "freeze for
 * 40ms") and the camera decides how they compose, decay and get out of each other's way.
 */
export class Camera {
  /** Multiplier to apply to the simulation this frame. 0 during hit stop, <1 during slow motion. */
  timeScale = 1;
  /** Shake amplitude multiplier from the accessibility settings. */
  shakeScale = 1;

  private trauma = 0;
  private zoom = 1;
  private zoomVelocity = 0;
  private hitStop = 0;
  private sinceStop = 10;
  private slowT = 0;
  private slowTotal = 1;
  private slowScale = 1;
  private elapsed = 0;
  private offsetX = 0;
  private offsetY = 0;

  /** Adds shake. Amounts add up and are squared, so many small hits stay subtle and one big hit lands. */
  shake(amount: number): void {
    this.trauma = clamp(this.trauma + amount, 0, 1);
  }

  /** Kicks the zoom in; a critically-damped spring brings it back. */
  punch(amount: number): void {
    this.zoom += amount;
  }

  /**
   * Freezes the simulation for `seconds`.
   *
   * Tiny stops are rate-limited: with fifty balls hitting constantly, per-hit stops would turn
   * into a stutter instead of impact. Big ones always go through.
   */
  stop(seconds: number): void {
    if (seconds <= 0.045 && this.sinceStop < 0.09) return;
    this.hitStop = Math.max(this.hitStop, seconds);
    this.sinceStop = 0;
  }

  /** Slows time to `scale` and eases back to normal over `seconds`. */
  slowmo(scale: number, seconds: number): void {
    this.slowScale = Math.min(this.slowScale, scale);
    this.slowT = Math.max(this.slowT, seconds);
    this.slowTotal = this.slowT;
  }

  /** Ends all slow motion immediately. */
  cutSlowmo(): void {
    this.slowT = 0;
    this.slowScale = 1;
  }

  reset(): void {
    this.trauma = 0;
    this.zoom = 1;
    this.zoomVelocity = 0;
    this.hitStop = 0;
    this.slowT = 0;
    this.slowScale = 1;
  }

  /** Advances the camera by real time and returns the simulation time scale. */
  update(dt: number): number {
    this.elapsed += dt;
    this.sinceStop += dt;

    if (this.hitStop > 0) {
      this.hitStop -= dt;
      this.timeScale = 0;
    } else if (this.slowT > 0) {
      this.slowT -= dt;
      const k = 1 - Math.max(0, this.slowT) / this.slowTotal;
      this.timeScale = lerp(this.slowScale, 1, k * k);
      if (this.slowT <= 0) this.slowScale = 1;
    } else {
      this.timeScale = 1;
    }

    this.trauma = Math.max(0, this.trauma - dt * 1.7);

    // Stiffness 170 / damping 14 gives one small overshoot: a "punch", not a wobble.
    this.zoomVelocity += ((1 - this.zoom) * 170 - this.zoomVelocity * 14) * dt;
    this.zoom += this.zoomVelocity * dt;

    const t = this.elapsed * SHAKE_RATE;
    const power = this.trauma * this.trauma * this.shakeScale;
    this.offsetX = jitter(t, 1) * SHAKE_PX * power;
    this.offsetY = jitter(t, 7) * SHAKE_PX * power;
    return this.timeScale;
  }

  /** Current world → CSS px transform for an arena of the given size. */
  view(port: Viewport): View {
    const scale = (port.aw / ARENA_W) * this.zoom;
    return {
      scale,
      tx: port.ax + port.aw / 2 - (ARENA_W / 2) * scale + this.offsetX,
      ty: port.ay + port.ah / 2 - (ARENA_H / 2) * scale + this.offsetY,
    };
  }
}

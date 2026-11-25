/**
 * Rolling window of frame durations: the evidence behind the quality governor and the
 * performance readout. A ring buffer, so feeding it every frame allocates nothing.
 */

/** A frame slower than this is visibly late: below about 36 frames per second. */
export const SLOW_MS = 28;

/** Frames longer than this are tab switches, resizes or similar one-offs, not sustained load. */
export const OUTLIER_MS = 250;

export class FrameTimes {
  private readonly ring: Float64Array;
  private next = 0;
  private filled = 0;

  constructor(capacity = 240) {
    this.ring = new Float64Array(Math.max(8, Math.floor(capacity)));
  }

  get count(): number {
    return this.filled;
  }

  /** Records one frame. Outliers are ignored rather than clamped: they would say nothing about load. */
  push(ms: number): void {
    if (!(ms > 0) || ms > OUTLIER_MS) return;
    this.ring[this.next] = ms;
    this.next = (this.next + 1) % this.ring.length;
    this.filled = Math.min(this.filled + 1, this.ring.length);
  }

  reset(): void {
    this.filled = 0;
    this.next = 0;
  }

  /** Frames per second across the window: the reciprocal of the mean frame time. 0 before any data. */
  get fps(): number {
    if (!this.filled) return 0;
    let sum = 0;
    for (let i = 0; i < this.filled; i++) sum += this.ring[i] ?? 0;
    return (1000 * this.filled) / sum;
  }

  /** Mean rate of the slowest five percent of frames: how bad the stutters get. */
  get lowFps(): number {
    const sorted = this.ring.slice(0, this.filled).sort();
    const tail = Math.max(1, Math.floor(sorted.length * 0.05));
    if (!sorted.length) return 0;
    let sum = 0;
    for (let i = sorted.length - tail; i < sorted.length; i++) sum += sorted[i] ?? 0;
    return (1000 * tail) / sum;
  }

  /** Share of the window's frames that were late (slower than `SLOW_MS`), 0..1. */
  get jank(): number {
    if (!this.filled) return 0;
    let late = 0;
    for (let i = 0; i < this.filled; i++) if ((this.ring[i] ?? 0) > SLOW_MS) late++;
    return late / this.filled;
  }
}

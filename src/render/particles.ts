import { clamp } from '../core/math';

export const PK_LIGHT = 0;
export const PK_SHARD = 1;
export const PK_RING = 2;
export const PK_STREAK = 3;

export interface Particle {
  alive: boolean;
  kind: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  /** Start and end size in world units. */
  size: number;
  sizeEnd: number;
  rot: number;
  rotV: number;
  /** Exponential velocity damping per second. */
  drag: number;
  grav: number;
  r: number;
  g: number;
  b: number;
  alpha: number;
  /** Brightness multiplier (HDR). */
  intensity: number;
}

export interface SpawnOptions {
  size: number;
  sizeEnd?: number;
  rot?: number;
  rotV?: number;
  drag?: number;
  grav?: number;
  alpha?: number;
  intensity?: number;
}

const makeParticle = (): Particle => ({
  alive: false,
  kind: 0,
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  life: 0,
  maxLife: 1,
  size: 1,
  sizeEnd: 1,
  rot: 0,
  rotV: 0,
  drag: 0,
  grav: 0,
  r: 1,
  g: 1,
  b: 1,
  alpha: 1,
  intensity: 1,
});

/**
 * Fixed-capacity particle pool.
 *
 * Objects are allocated once. Spawning walks a cursor round the pool and reuses the first dead
 * slot it meets, so when the pool is full the oldest particles are recycled first — the screen
 * stays just as full, and nothing ever allocates during play.
 */
export class ParticleSystem {
  readonly pool: Particle[];
  alive = 0;

  private cursor = 0;

  constructor(readonly capacity: number) {
    this.pool = Array.from({ length: capacity }, makeParticle);
  }

  spawn(
    kind: number,
    x: number,
    y: number,
    vx: number,
    vy: number,
    life: number,
    r: number,
    g: number,
    b: number,
    o: SpawnOptions,
  ): Particle | null {
    const pool = this.pool;
    // Probe a handful of slots from the cursor before giving up and overwriting whatever is next.
    let index = -1;
    for (let probe = 0; probe < 24; probe++) {
      const candidate = (this.cursor + probe) % pool.length;
      if (!pool[candidate]?.alive) {
        index = candidate;
        break;
      }
    }
    if (index < 0) index = this.cursor % pool.length;
    this.cursor = (index + 1) % pool.length;

    const p = pool[index];
    if (!p) return null;
    if (!p.alive) this.alive++;
    p.alive = true;
    p.kind = kind;
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.life = life;
    p.maxLife = life;
    p.size = o.size;
    p.sizeEnd = o.sizeEnd ?? o.size;
    p.rot = o.rot ?? 0;
    p.rotV = o.rotV ?? 0;
    p.drag = o.drag ?? 0;
    p.grav = o.grav ?? 0;
    p.r = r;
    p.g = g;
    p.b = b;
    p.alpha = o.alpha ?? 1;
    p.intensity = o.intensity ?? 1;
    return p;
  }

  update(dt: number): void {
    let alive = 0;
    for (const p of this.pool) {
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.alive = false;
        continue;
      }
      alive++;
      if (p.drag > 0) {
        const k = Math.exp(-p.drag * dt);
        p.vx *= k;
        p.vy *= k;
      }
      p.vy += p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.rotV * dt;
    }
    this.alive = alive;
  }

  /** 0..1 fraction of a particle's life that remains, clamped. */
  static t(p: Particle): number {
    return clamp(p.life / p.maxLife, 0, 1);
  }

  clear(): void {
    for (const p of this.pool) p.alive = false;
    this.alive = 0;
    this.cursor = 0;
  }
}

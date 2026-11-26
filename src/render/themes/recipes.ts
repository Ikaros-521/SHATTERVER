import { hexToRgb } from '../../core/math';
import { TAU } from '../../core/math';
import type { ParticleSystem, SpawnOptions } from '../particles';
import type { Burst } from './types';

const rand = (lo: number, hi: number): number => lo + Math.random() * (hi - lo);

/**
 * Throws one recipe at a point. `dx`/`dy` is the outward normal of whatever was hit: a ring
 * ignores it, a splash is thrown back along it. `scale` thins the recipe — the count shrinks,
 * and a single-particle recipe becomes that likely to fire at all.
 *
 * Returns how many of the burst are on screen now. A full pool never refuses a spawn — it recycles
 * its oldest particle — so a burst larger than the pool leaves exactly a pool's worth behind.
 */
export function emitBurst(
  pool: ParticleSystem,
  burst: Burst,
  x: number,
  y: number,
  dx: number,
  dy: number,
  scale = 1,
): number {
  const wanted = Math.max(0, burst.count) * Math.min(1, Math.max(0, scale));
  const count = wanted >= 1 ? Math.round(wanted) : Math.random() < wanted ? 1 : 0;
  if (count === 0) return 0;
  const [r, g, b] = hexToRgb(burst.color);
  const spread = burst.spread ?? Math.PI;
  const base = Math.atan2(dy, dx);
  const [x0, x1, y0, y1] = burst.offset ?? [0, 0, 0, 0];
  let spawned = 0;
  for (let i = 0; i < count; i++) {
    const angle = spread >= Math.PI ? rand(0, TAU) : base + rand(-spread, spread);
    const speed = rand(burst.speed[0], burst.speed[1]);
    const p = pool.spawn(
      burst.kind,
      x + rand(x0, x1),
      y + rand(y0, y1),
      Math.cos(angle) * speed,
      Math.sin(angle) * speed,
      rand(burst.life[0], burst.life[1]),
      r,
      g,
      b,
      {
        size: rand(burst.size[0], burst.size[1]),
        sizeEnd: burst.reach ?? burst.size[1],
        rot: burst.rotV ? rand(0, TAU) : 0,
        rotV: burst.rotV ? burst.rotV * (Math.random() < 0.5 ? -1 : 1) : 0,
        drag: burst.drag,
        grav: burst.grav,
        alpha: burst.alpha,
        intensity: burst.intensity,
      } satisfies SpawnOptions,
    );
    if (p) spawned++;
  }
  return Math.min(spawned, pool.capacity);
}

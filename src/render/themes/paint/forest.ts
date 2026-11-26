import { clamp, easeOutBack } from '../../../core/math';
import { SHAPE_BRANCH, SHAPE_CRYSTAL, SHAPE_LEAF } from '../../shaders/sprites';

import type { BallPainter, PaddlePainter } from '../types';
import { breathe, leanOf } from './common';

/** The bough's bark. The shape lights it from above and streaks it with grain. */
const WOOD = 0x9a7448;

/**
 * The leaves, one set per side: how far along the bough each sprouts (a share of its half
 * length), which side of it, and the angle it holds on the right (mirrored on the left).
 */
const LEAVES: readonly { along: number; up: boolean; angle: number }[] = [
  { along: 0.6, up: true, angle: -0.5 },
  { along: 0.76, up: false, angle: 0.55 },
  { along: 0.92, up: true, angle: -0.95 },
];

/**
 * 精灵树枝. The collision box is the bough itself: a rod that bows up at its ends and bends a
 * touch further into a swipe, with a life gem set in its middle. A landing scatters the leaves
 * (as particles, see the theme's effects); they grow back with a small overshoot.
 */
export const paintForestPaddle: PaddlePainter = (pen, f, c): void => {
  const rest = breathe(f.time, 1.6);
  const open = f.hit;
  const lean = leanOf(f.vx);
  const thick = f.hh * 1.3;

  pen.sprite(SHAPE_BRANCH, f.x, f.y, f.hw, thick, 0, f.overdrive ? 0xc8fbff : WOOD, 1, {
    p0: 0.86,
    p1: -0.24 - 0.03 * rest - 0.1 * lean * lean,
    p2: 1,
    flash: open * 0.6,
    halo: 0.22 + 0.6 * open,
    pad: 6,
  });

  const regrow = easeOutBack(clamp((f.sinceHit - 0.14) / 0.6, 0, 1), 1.6);
  if (regrow > 0.01) {
    for (const side of [-1, 1]) {
      for (let i = 0; i < LEAVES.length; i++) {
        const leaf = LEAVES[i]!;
        const flutter = Math.sin(f.time * 6 + i * 2.1 + (side > 0 ? 1.3 : 0)) * (0.06 + 0.16 * f.move);
        const reach = 15 * regrow;
        const bx = f.x + side * (f.hw * leaf.along + 3 * regrow);
        const by =
          f.y - thick * 0.26 * leaf.along * leaf.along + (leaf.up ? -1 : 1) * (thick * 0.7 + 4 * regrow);
        pen.sprite(
          SHAPE_LEAF,
          bx,
          by,
          reach,
          reach * 0.5,
          (side > 0 ? leaf.angle : Math.PI - leaf.angle) + flutter,
          i === 1 ? c.primary : c.secondary,
          0.95,
          { p0: 0.5, p1: 0.8, halo: 0.18 },
        );
      }
    }
  }

  // The life gem: light pooling out of it, more on a landing.
  pen.sprite(SHAPE_CRYSTAL, f.x, f.y, 9.5, 11.5, 0, c.secondary, 1, {
    p0: 4,
    p1: 1.1,
    p2: f.time * 1.1,
    flash: open * 0.5,
    halo: 0.9,
    pad: 8,
  });
  pen.light(f.x, f.y, 30 + 8 * open, 30 + 8 * open, c.primary, 0.35 + 0.2 * rest + 0.5 * open, 0.4);
  pen.light(f.x, f.y + f.hh + 5, f.hw * 1.2, 13, c.secondary, 0.34 + 0.4 * open, 0.3);
};

/**
 * 生命宝石. A green gem with energy swirling inside it (the shape's own flow), a fine halo
 * ring, and three motes of light circling it.
 */
export const paintForestBall: BallPainter = (pen, f, c): void => {
  const a = f.alpha;
  const spin = f.time * 1.2 + f.y * 0.003;
  pen.sprite(SHAPE_CRYSTAL, f.x, f.y, f.r, f.r * 1.26, 0, c.secondary, a, {
    p0: 4,
    p1: 1.25,
    p2: spin,
    halo: 0.55,
    pad: 6,
  });
  pen.ring(f.x, f.y, f.r * 1.66, 1 + 0.3 * Math.sin(f.time * 6), c.primary, 0.5 * a);
  for (let i = 0; i < 3; i++) {
    const t = -spin * 1.6 + (i * Math.PI * 2) / 3;
    const d = f.r * 1.66;
    pen.light(f.x + Math.cos(t) * d, f.y + Math.sin(t) * d, 3.2, 3.2, c.highlight, 0.75 * a, 0.75);
  }
};

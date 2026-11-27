import { SHAPE_ARC, SHAPE_CRYSTAL, SHAPE_CURL } from '../../shaders/sprites';

import type { BallPainter, PaddlePainter } from '../types';
import { breathe, leanOf } from './common';

/** Half-width of a crest's box; its hook's radius is a share of this (see `spCurl`). */
const CREST_WIDTH = 15;
const CREST_RADIUS = CREST_WIDTH * 0.82;

/**
 * 潮汐水流. The collision box is water gathered into a bar of light, a little see-through, as
 * water is. From just outside either tip a crest rises and hooks over, away from the paddle;
 * both grow and flare when a ball lands. The bubbles come from the theme's effects.
 */
export const paintOceanPaddle: PaddlePainter = (pen, f, c): void => {
  const rest = breathe(f.time, 1.8);
  const open = f.hit;
  const lean = leanOf(f.vx);

  pen.surface(f.x, f.y, f.hw, f.hh, f.overdrive ? 0xc8fbff : c.primary, {
    radius: f.hh,
    alpha: 0.8,
    flash: open * 0.5,
    halo: 0.45 + 0.25 * rest + 0.6 * open,
  });
  pen.light(f.x, f.y, f.hw * (0.62 + 0.05 * rest), f.hh * 0.95, c.highlight, 0.3 + 0.45 * open, 0.55);

  for (const side of [-1, 1]) {
    const reach = 24 + 4 * rest + 8 * open;
    // The column stands just inside the tip (the crest's own centre is a radius further out),
    // with its foot a little under the bar so the two join.
    const cx = f.x + side * (f.hw + CREST_RADIUS - 3 + 2 * open);
    const cy = f.y + 2 - reach;
    pen.sprite(SHAPE_CURL, cx, cy, CREST_WIDTH, reach, side * lean * 0.16, c.primary, 0.82, {
      p0: 6.5,
      p1: 1.18 * Math.PI + 0.2 * open,
      p2: 0.22,
      flash: open * 0.55,
      halo: 0.3,
      mirror: side < 0,
      pad: 8,
    });
  }

  pen.light(f.x, f.y + f.hh + 5, f.hw * 1.28, 14 + 3 * rest, c.primary, 0.4 + 0.5 * open, 0.3);
};

/**
 * 深海水晶. A blue crystal at the heart, with ripples of light turning inside a skin of water:
 * a rim, two arcs contra-rotating, and a specular highlight on the upper left.
 */
export const paintOceanBall: BallPainter = (pen, f, c): void => {
  const a = f.alpha;
  const spin = f.time * 0.9 + f.x * 0.004;
  pen.sprite(SHAPE_CRYSTAL, f.x, f.y, f.r * 1.02, f.r * 1.24, 0.18 * Math.sin(f.time * 0.7), c.secondary, a, {
    p0: 4,
    p1: 0.9,
    p2: spin,
    halo: 0.5,
    pad: 6,
  });
  pen.sprite(SHAPE_ARC, f.x, f.y, f.r * 1.62, f.r * 1.62, 0, c.highlight, 0.5 * a, {
    p0: 0.05,
    p1: spin * 1.4,
    p2: 2.4,
  });
  pen.sprite(SHAPE_ARC, f.x, f.y, f.r * 1.25, f.r * 1.25, 0, c.primary, 0.45 * a, {
    p0: 0.07,
    p1: -spin * 1.9,
    p2: 1.8,
  });
  pen.ring(f.x, f.y, f.r * 1.62, 1.1, c.highlight, 0.45 * a);
  pen.light(f.x - f.r * 0.66, f.y - f.r * 0.66, f.r * 0.3, f.r * 0.3, 0xffffff, 0.8 * a, 0.9);
};

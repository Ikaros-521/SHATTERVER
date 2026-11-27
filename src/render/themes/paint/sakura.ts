import { TAU } from '../../../core/math';
import { SHAPE_ARC, SHAPE_BLOSSOM, SHAPE_FAN, SHAPE_PETAL } from '../../shaders/sprites';

import type { BallPainter, PaddlePainter } from '../types';
import { breathe, leanOf } from './common';

/**
 * The membrane's colour: a deeper pink than the theme's lead colour. The surface shader pushes
 * a body's rim well past white, and the lead pink came out white with a pink halo; this one
 * keeps its colour through the bloom, so the fan reads as pink and only its edge as pale.
 */
const MEMBRANE = 0xff6fb5;

/**
 * 夜樱折扇. The collision box is the fan's membrane — a plane of pink light that breathes at
 * rest and flares when a ball lands — with the ribs spread from either end, a blossom at each
 * side of it, and a soft light underneath. A landing opens the ribs wide; they ease shut again.
 */
export const paintSakuraPaddle: PaddlePainter = (pen, f, c): void => {
  const rest = breathe(f.time, 2.2);
  const open = f.hit;
  const lean = leanOf(f.vx);

  pen.surface(f.x, f.y, f.hw, f.hh, f.overdrive ? 0xc8fbff : MEMBRANE, {
    radius: f.hh,
    flash: open * 0.55,
    halo: 0.34 + 0.2 * rest + 0.7 * open,
  });
  // The light gathered in the middle of the membrane.
  pen.light(f.x, f.y, f.hw * 0.9, f.hh * 0.5, c.highlight, 0.1 + 0.1 * rest + 0.4 * open, 0.75);

  const ribs = 6;
  for (const side of [-1, 1]) {
    const px = f.x + side * f.hw * 0.9;
    const py = f.y - f.hh * 0.4;
    const spread = 0.52 + 0.26 * open;
    const reach = 30 + 4 * rest + 7 * open;
    // Each fan leans out from its end, and a touch further into a swipe.
    const axis = side * (0.62 + 0.14 * lean);
    pen.sprite(SHAPE_FAN, px, py, reach, reach, axis, c.secondary, 0.5 + 0.4 * open, {
      p0: spread,
      p1: ribs,
      p2: 0.8 + 0.8 * open,
      flash: open * 0.4,
      halo: 0.22,
    });
    // A bead of light on the tip of every rib.
    for (let i = 0; i < ribs; i++) {
      const a = axis - spread + (i / (ribs - 1)) * spread * 2;
      pen.light(
        px + Math.sin(a) * reach * 0.97,
        py - Math.cos(a) * reach * 0.97,
        3.6,
        3.6,
        c.highlight,
        0.3 + 0.45 * open,
        0.75,
      );
    }
    // A blossom on each side of the membrane, opening a little further on a landing.
    pen.sprite(
      SHAPE_BLOSSOM,
      f.x + side * f.hw * 0.68,
      f.y,
      11,
      11,
      side * 0.4 + 0.2 * Math.sin(f.time * 1.1 + side),
      c.primary,
      1,
      {
        p0: 5,
        p1: 0.82 + 0.18 * open,
        flash: open * 0.5,
        halo: 0.35,
      },
    );
  }

  // The light underneath: a wide pink wash, a pale core.
  pen.light(f.x, f.y + f.hh + 5, f.hw * 1.28, 15 + 3 * rest, c.primary, 0.42 + 0.5 * open, 0.32);
  pen.light(f.x, f.y + f.hh + 2, f.hw * 0.7, 7, c.highlight, 0.2 + 0.3 * open, 0.5);
};

/**
 * 樱花核心. A pale halo ring that pulses, a ring of light turning slowly about the core, and
 * three petals orbiting it with their tips out. The stock glow layers then wear the theme's
 * colours on top, so the centre stays the brightest thing on the field.
 */
export const paintSakuraBall: BallPainter = (pen, f, c): void => {
  const pulse = 0.5 + 0.5 * Math.sin(f.time * 5.2 + f.x * 0.012);
  const a = f.alpha;
  pen.ring(f.x, f.y, f.r * (1.9 + 0.1 * pulse), 1.2 + 0.5 * pulse, c.primary, 0.55 * a);
  pen.sprite(SHAPE_ARC, f.x, f.y, f.r * 2.5, f.r * 2.5, 0, c.highlight, 0.55 * a, {
    p0: 0.045,
    p1: f.time * 1.3,
    p2: 2.1,
  });
  for (let i = 0; i < 3; i++) {
    const t = f.time * 1.7 + (i * TAU) / 3;
    const d = f.r * 1.55;
    pen.sprite(
      SHAPE_PETAL,
      f.x + Math.cos(t) * d,
      f.y + Math.sin(t) * d,
      f.r * 0.46,
      f.r * 0.28,
      t,
      i === 0 ? c.highlight : c.primary,
      0.9 * a,
      {
        p0: 0.6,
        p1: 0.25,
        halo: 0.3,
      },
    );
  }
};

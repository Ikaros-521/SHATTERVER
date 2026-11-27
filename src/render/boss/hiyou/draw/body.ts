import { DEG, TAU } from '../../../../core/math';
import type { PartLook } from '../../types';
import {
  css,
  fillPath,
  glow,
  keyedStroke,
  mirrored,
  mix,
  quadCurve,
  rgba,
  shade,
  strokePath,
  tapered,
  trace,
} from './brush';
import { INK } from './palette';

/**
 * 绯樱 below the chin, drawn with Canvas 2D in the figure units of `head.ts`: x to the right, y
 * down, the origin at the top of the breastbone. She hangs in the air, a bust that ends in a skirt
 * over a ring of light — what the arena has room for, and the parts the fight is made of: two
 * wings, a body, two arms, two pauldrons, a core behind its shield.
 *
 * Her proportions, in head heights (crown to chin, 119):
 *   the neck    a seventh of a head, the shoulder line just under it
 *   the torso   collar to waist nine tenths of a head; the waist is where she is narrowest
 *   the arms    upper arm half a head, forearm a little less, hanging a little way out from the body
 *   the wings   three blades' lengths past each shoulder
 *
 * What is paired is written for the right and mirrored by its path, never by the canvas: the light,
 * which comes from the upper left, then stays where it is on both sides.
 *
 * A part shows its state as it is drawn: a hit flashes white over the part and no further, damage
 * cracks its plates, and a part that is gone is not drawn. The cracks grow from a seed, so that
 * they do not crawl from frame to frame.
 */

type Side = 1 | -1;

const SIDES: readonly Side[] = [-1, 1];

/** The joint the head leans on: the top of the neck. */
export const NECK_JOINT = -112;

/** Where the core sits. */
const CORE_Y = -70;

/** The bounds of a shape, [left, top, right, bottom], written for the right of the figure. */
type Box = readonly [number, number, number, number];

/** Colours laid over something else, which need an opacity, or mixed in. */
const over = {
  shade: 0x8a6aa6,
  crack: 0x4a2c66,
  crackLight: 0xffe9fa,
  blade: 0xe4d5f0,
  energy: 0xff5fd8,
  energySoft: 0xffb4f6,
  well: 0x241636,
};

/** ───────────────────────────── the body ───────────────────────────── */

/** The under-suit the plates hang on: the whole of her from the collar to the hips. */
const SUIT =
  'M -16 -102 C -30 -99 -41 -92 -45 -80 C -48 -68 -43 -52 -37 -41 C -32 -31 -28 -23 -26 -15 ' +
  'C -25 -7 -28 3 -31 13 L 31 13 C 28 3 25 -7 26 -15 C 28 -23 32 -31 37 -41 C 43 -52 48 -68 45 -80 ' +
  'C 41 -92 30 -99 16 -102 Z';

/** The cuirass: pearl plate from the collar to under the bust, its foot cut in a little at the middle. */
const CUIRASS =
  'M -37 -93 C -19 -101 19 -101 37 -93 C 44 -82 44 -66 36 -54 C 26 -47 14 -44 0 -46 ' +
  'C -14 -44 -26 -47 -36 -54 C -44 -66 -44 -82 -37 -93 Z';

/** The belt: a band of steel where she is narrowest. */
const BELT = 'M -27 -23 C -12 -19 12 -19 27 -23 L 29 -13 C 12 -9 -12 -9 -29 -13 Z';

/** The dark underskirt that shows between the plates over it and below their hem. */
const UNDERSKIRT = 'M -27 -14 C -34 10 -44 36 -51 60 Q 0 72 51 60 C 44 36 34 10 27 -14 Z';

/** The plate over the middle of the skirt. */
const SKIRT_MIDDLE = 'M -14 -12 C -16 16 -15 44 -12 66 Q 0 71 12 66 C 15 44 16 16 14 -12 Q 0 -7 -14 -12 Z';

/** The two plates to the right of it, the inner then the outer; they lie under the one inside them. */
const SKIRT_OUTER = 'M 25 -7 C 36 13 49 36 57 58 Q 49 65 41 63 C 36 40 28 16 20 -2 Z';
const SKIRT_INNER = 'M 14 -11 C 24 12 33 38 40 64 Q 31 69 21 66 C 18 42 15 16 12 -10 Z';

/** The collar round the neck. */
const COLLAR =
  'M -21 -103 C -12 -95 12 -95 21 -103 C 24 -97 22 -90 15 -88 C 5 -84 -5 -84 -15 -88 C -22 -90 -24 -97 -21 -103 Z';

/** ───────────────────────────── a pauldron ───────────────────────────── */

/** The shell of the right pauldron: round at its outer end, drawn in towards the neck. */
const SHELL =
  'M 37 -97 C 43 -110 64 -117 80 -109 C 93 -103 100 -89 96 -75 C 92 -64 79 -62 67 -67 C 54 -72 41 -82 37 -97 Z';

/** The panel of steel let into its upper face. */
const PANEL = 'M 49 -102 C 59 -110 73 -112 84 -106 C 88 -103 90 -98 90 -93 C 78 -97 63 -99 49 -97 Z';

/** The fin that stands off it, up and out. */
const PAULDRON_FIN = 'M 75 -111 Q 87 -129 102 -135 Q 92 -122 85 -108 Z';

/** ───────────────────────────── an arm ───────────────────────────── */

/** The right upper arm: under-suit, from under the pauldron to the elbow. */
const UPPER_ARM = 'M 52 -86 C 50 -70 56 -50 62 -36 L 82 -40 C 80 -56 76 -72 74 -88 Z';

/** Two bands of silver round it. */
const BAND_HIGH = 'M 54 -58 C 61 -61 76 -62 81 -59 L 82 -52 C 76 -55 62 -54 56 -51 Z';
const BAND_LOW = 'M 58 -44 C 64 -46 77 -47 82 -45 L 83 -38 C 77 -40 65 -39 60 -37 Z';

/** The gauntlet: pearl plate from the elbow to the wrist, flared at the elbow. */
const GAUNTLET = 'M 57 -23 C 58 -8 64 4 69 16 L 87 16 C 85 4 84 -10 85 -23 C 77 -30 64 -30 57 -23 Z';

/** The cuff at the wrist, then the hand: a dark wrist and a mitten of pearl plate. */
const CUFF = 'M 67 14 C 74 17 82 17 88 14 L 89 24 C 82 27 73 27 68 24 Z';
const WRIST = 'M 68 24 L 89 24 L 88 31 L 69 31 Z';
const HAND = 'M 69 30 C 66 38 68 48 75 52 C 82 54 88 50 89 43 C 90 38 89 33 88 30 Z';

/** ───────────────────────────── a wing ───────────────────────────── */

/**
 * One blade of the right wing: where it grows from the spar, its angle in degrees (negative:
 * raised), its length and its half width. Uppermost first.
 */
const FEATHERS: readonly (readonly [number, number, number, number, number])[] = [
  [46, -95, -48, 118, 13],
  [64, -102, -36, 152, 16],
  [84, -109, -24, 180, 19],
  [100, -115, -13, 196, 21],
  [111, -117, -3, 200, 22],
  [118, -113, 7, 190, 21],
  [121, -106, 17, 174, 19.5],
  [121, -97, 27, 152, 17.5],
  [118, -88, 37, 126, 15],
];

/** Short blades lying over the roots of the long ones. */
const COVERTS: readonly (readonly [number, number, number, number, number])[] = [
  [38, -92, -34, 74, 12],
  [55, -100, -18, 88, 13.5],
  [74, -107, -2, 84, 13],
  [92, -112, 12, 76, 12],
];

/** The spar the blades grow from. */
const SPAR = 'M 24 -83 L 121 -114 L 126 -125 L 30 -95 Z';

/** The spar's joints: x, y, radius. */
const JOINTS: readonly (readonly [number, number, number])[] = [
  [27, -90, 7],
  [74, -104, 6],
  [123, -119, 8.5],
];

/** The marks of damage a state shows: 0, 0.45 or 1. */
function damageOf(look: PartLook): number {
  return look.state === 'intact' ? 0 : look.state === 'damaged_1' ? 0.45 : 1;
}

/** Fills a plate lit from the upper left: lighter along its upper left, its own colour in the middle, a shade deeper along its lower right. */
function plate(ctx: CanvasRenderingContext2D, d: string, colour: string, box: Box, side: Side = 1): void {
  const [x0, y0, x1, y1] = box;
  fillPath(
    ctx,
    d,
    shade(ctx, x0, y0, x1, y1, [
      [0, mix(colour, 0xffffff, 0.42)],
      [0.45, colour],
      [1, mix(colour, over.shade, 0.26)],
    ]),
    side,
  );
}

/** Clips to the outlines of a part, each one a closed shape written for the right of the figure. */
function clipTo(ctx: CanvasRenderingContext2D, outlines: readonly string[], side: Side): void {
  for (const d of outlines) trace(ctx, side < 0 ? mirrored(d) : d, d === outlines[0]);
  ctx.clip();
}

/** A small sure-footed generator: the same seed always gives the same run of numbers from 0 to 1. */
function seeded(seed: number): () => number {
  let state = (seed * 2654435761) >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** Cracks over a part, `count` of them, each a run of short turns from high on the part downwards. */
function cracks(ctx: CanvasRenderingContext2D, seed: number, count: number, box: Box, side: Side): void {
  const next = seeded(seed);
  const [x0, y0, x1, y1] = box;
  for (let i = 0; i < count; i++) {
    let x = x0 + next() * (x1 - x0);
    let y = y0 + next() * (y1 - y0) * 0.35;
    let turn = Math.PI * (0.3 + next() * 0.4);
    const points: [number, number, number][] = [[x, y, 1.5]];
    const steps = 4 + Math.floor(next() * 3);
    for (let k = 0; k < steps; k++) {
      turn += (next() - 0.5) * 1.6;
      x += Math.cos(turn) * (4 + next() * 7);
      y += Math.sin(turn) * (4 + next() * 7);
      points.push([x, y, 1.5 * (1 - (k + 1) / (steps + 1))]);
    }
    tapered(ctx, points, rgba(over.crack, 0.9), side);
    // The lit lip of the crack, on the side the light falls on.
    tapered(
      ctx,
      points.map(([px, py, w]): [number, number, number] => [px + side * 0.6, py + 0.7, w * 0.55]),
      rgba(over.crackLight, 0.45),
      side,
    );
  }
}

/** The white of a hit, over the whole of a part and no further. */
function flashOf(
  ctx: CanvasRenderingContext2D,
  look: PartLook,
  outlines: readonly string[],
  box: Box,
  side: Side,
): void {
  if (look.flash <= 0) return;
  const [x0, y0, x1, y1] = box;
  ctx.save();
  clipTo(ctx, outlines, side);
  ctx.fillStyle = rgba(0xffffff, Math.min(1, look.flash) * 0.85);
  ctx.fillRect(Math.min(side * x0, side * x1) - 2, y0 - 2, x1 - x0 + 4, y1 - y0 + 4);
  ctx.restore();
}

/** A seam of light: a soft wash under a bright line. */
function seam(
  ctx: CanvasRenderingContext2D,
  points: readonly (readonly [number, number, number])[],
  side: Side,
): void {
  keyedStroke(
    ctx,
    points,
    [
      [0, 0.2],
      [0.5, 3.6],
      [1, 0.2],
    ],
    rgba(over.energy, 0.3),
    side,
  );
  keyedStroke(
    ctx,
    points,
    [
      [0, 0.15],
      [0.5, 1.2],
      [1, 0.15],
    ],
    rgba(over.energySoft, 0.95),
    side,
  );
}

/** A ring of steel with a pin of light in it: a joint. */
function joint(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  side: Side,
  flash: number,
): void {
  ctx.fillStyle = glow(ctx, side * x, y, rgba(over.energy, 0.4), radius * 0.8, radius * 2.6);
  ctx.fillRect(side * x - radius * 3, y - radius * 3, radius * 6, radius * 6);
  ctx.beginPath();
  ctx.arc(side * x, y, radius, 0, TAU);
  ctx.fillStyle = shade(ctx, side * x - radius, y - radius, side * x + radius, y + radius, [
    [0, '#f2f3f9'],
    [0.5, INK.silver],
    [1, INK.silverShade],
  ]);
  ctx.fill();
  ctx.lineWidth = 0.9;
  ctx.strokeStyle = INK.silverDeep;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(side * x, y, radius * 0.42, 0, TAU);
  ctx.fillStyle = flash > 0 ? mix(INK.energy, 0xffffff, flash) : INK.energy;
  ctx.fill();
}

/** A stone: a round gem lit from the upper left, with a glint on it. */
function stone(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, side: Side): void {
  ctx.fillStyle = glow(ctx, side * x, y, rgba(over.energy, 0.5), radius * 0.6, radius * 2.8);
  ctx.fillRect(side * x - radius * 3, y - radius * 3, radius * 6, radius * 6);
  ctx.beginPath();
  ctx.arc(side * x, y, radius, 0, TAU);
  ctx.fillStyle = shade(ctx, side * x - radius, y - radius, side * x + radius, y + radius, [
    [0, '#ffffff'],
    [0.4, INK.energySoft],
    [1, INK.energy],
  ]);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(side * x - radius * 0.32, y - radius * 0.36, radius * 0.24, 0, TAU);
  ctx.fillStyle = rgba(0xffffff, 0.9);
  ctx.fill();
}

/**
 * The body: the under-suit, the cuirass with the collar, the belt and the skirt. The joints the
 * arms hang on belong to it, so that they are still there when an arm is gone.
 */
export function drawTorso(ctx: CanvasRenderingContext2D, look: PartLook): void {
  if (look.state === 'destroyed') return;
  ctx.save();
  ctx.translate(look.dx, look.dy);

  fillPath(
    ctx,
    SUIT,
    shade(ctx, -45, -102, 45, 13, [
      [0, mix(INK.suit, 0xffffff, 0.22)],
      [0.5, INK.suit],
      [1, INK.suitDeep],
    ]),
  );
  strokePath(ctx, SUIT, 1.2, INK.suitDeep);

  // The skirt, from the dark under it outwards: the outer plates, then the inner, then the middle.
  fillPath(
    ctx,
    UNDERSKIRT,
    shade(ctx, -50, -14, 50, 70, [
      [0, INK.suit],
      [1, INK.suitDeep],
    ]),
  );
  strokePath(ctx, UNDERSKIRT, 1.1, INK.suitDeep);
  for (const side of SIDES) {
    plate(ctx, SKIRT_OUTER, INK.pearl, [20, -7, 58, 64], side);
    strokePath(ctx, SKIRT_OUTER, 1.15, INK.pearlDeep, side);
    seam(ctx, quadCurve(25, -3, 36, 22, 45, 60, 10), side);
  }
  for (const side of SIDES) {
    plate(ctx, SKIRT_INNER, INK.pearl, [12, -11, 41, 67], side);
    strokePath(ctx, SKIRT_INNER, 1.15, INK.pearlDeep, side);
    seam(ctx, quadCurve(15, -6, 21, 24, 25, 62, 10), side);
  }
  plate(ctx, SKIRT_MIDDLE, INK.pearl, [-15, -12, 15, 69]);
  strokePath(ctx, SKIRT_MIDDLE, 1.2, INK.pearlDeep);

  // The belt, and the stone on it.
  plate(ctx, BELT, INK.steel, [-29, -23, 29, -9]);
  strokePath(ctx, BELT, 1.1, INK.silverDeep);
  seam(ctx, quadCurve(-24, -16, 0, -12.5, 24, -16, 10), 1);
  stone(ctx, 0, -16, 3.6, 1);

  // The cuirass, and the collar over its top.
  plate(ctx, CUIRASS, INK.pearl, [-44, -101, 44, -44]);
  ctx.save();
  trace(ctx, CUIRASS);
  ctx.clip();
  // The shadow the collar throws, and the bust's own shading on the side away from the light.
  ctx.fillStyle = shade(ctx, 0, -101, 0, -80, [
    [0, rgba(over.shade, 0.4)],
    [1, rgba(over.shade, 0)],
  ]);
  ctx.fillRect(-46, -102, 92, 24);
  ctx.fillStyle = shade(ctx, 14, 0, 44, 0, [
    [0, rgba(over.shade, 0)],
    [1, rgba(over.shade, 0.3)],
  ]);
  ctx.fillRect(0, -102, 46, 60);
  ctx.restore();
  strokePath(ctx, CUIRASS, 1.25, INK.pearlDeep);
  // The seams of light along the foot of the cuirass.
  seam(ctx, quadCurve(-33, -55, -16, -45.5, 0, -46, 8), 1);
  seam(ctx, quadCurve(0, -46, 16, -45.5, 33, -55, 8), 1);

  plate(ctx, COLLAR, INK.silver, [-24, -103, 24, -84]);
  strokePath(ctx, COLLAR, 1.05, INK.silverDeep);

  // The socket the core sits in.
  ctx.beginPath();
  ctx.arc(0, CORE_Y, 14.5, 0, TAU);
  ctx.fillStyle = INK.silver;
  ctx.fill();
  ctx.lineWidth = 1.1;
  ctx.strokeStyle = INK.silverDeep;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, CORE_Y, 11.8, 0, TAU);
  ctx.fillStyle = css(over.well);
  ctx.fill();

  // The shoulder joints.
  for (const side of SIDES) joint(ctx, 50, -84, 9.5, side, look.flash);

  // The hover ring under the hem.
  ctx.fillStyle = glow(ctx, 0, 96, rgba(over.energy, 0.4), 30, 62);
  ctx.fillRect(-64, 70, 128, 52);
  for (const [width, alpha] of [
    [6, 0.2],
    [2.4, 0.85],
  ] as const) {
    ctx.beginPath();
    ctx.ellipse(0, 96, 48, 9.5, 0, 0, TAU);
    ctx.lineWidth = width;
    ctx.strokeStyle = rgba(over.energy, alpha);
    ctx.stroke();
  }

  const plates: readonly string[] = [CUIRASS, SKIRT_MIDDLE, SKIRT_INNER, SKIRT_OUTER, BELT, COLLAR];
  if (damageOf(look) > 0) {
    const count = look.state === 'damaged_2' ? 7 : 3;
    ctx.save();
    clipTo(ctx, plates, 1);
    cracks(ctx, 20, count, [-50, -100, 50, 66], 1);
    ctx.restore();
  }
  flashOf(ctx, look, [SUIT, ...plates], [-51, -103, 51, 71], 1);
  ctx.restore();
}

/** A pauldron: the shell over a shoulder, its lip, the panel let into it, a slit of light and a stone. */
export function drawPauldron(ctx: CanvasRenderingContext2D, side: Side, look: PartLook, time: number): void {
  if (look.state === 'destroyed') return;
  // The pauldrons float: they drift a little out of step with her, and with each other.
  const drift = Math.sin(time * 1.3 + (side > 0 ? 1.7 : 0)) * 1.6;
  ctx.save();
  ctx.translate(side * look.dx, look.dy + drift);

  fillPath(ctx, PAULDRON_FIN, mix(over.blade, 0xffffff, 0.2), side);
  strokePath(ctx, PAULDRON_FIN, 0.9, INK.silverDeep, side);
  // The lip, a step below the shell in silver. The shell overlaps it, so only its lower edge shows.
  ctx.save();
  ctx.translate(side * 1, 3.6);
  fillPath(ctx, SHELL, INK.silverShade, side);
  strokePath(ctx, SHELL, 1, INK.silverDeep, side);
  ctx.restore();

  plate(ctx, SHELL, INK.pearl, [36, -117, 100, -62], side);
  ctx.save();
  clipTo(ctx, [SHELL], side);
  // The vent at the neck end: three slits.
  for (let i = 0; i < 3; i++) {
    tapered(
      ctx,
      [
        [42 + i * 5.6, -101 + i * 1.4, 0.3],
        [43.4 + i * 5.6, -95 + i * 1.4, 1.6],
        [44.6 + i * 5.6, -88 + i * 1.4, 0.3],
      ],
      rgba(0x5a5478, 0.75),
      side,
    );
  }
  ctx.restore();
  strokePath(ctx, SHELL, 1.25, INK.pearlDeep, side);

  plate(ctx, PANEL, INK.steel, [48, -112, 91, -93], side);
  strokePath(ctx, PANEL, 0.9, INK.silverDeep, side);
  // The slit of light across the shell, and a stone at the middle of it.
  seam(ctx, quadCurve(47, -80, 70, -88, 92, -78, 10), side);
  stone(ctx, 70, -86.5, 4, side);

  const marks: readonly string[] = [SHELL, PANEL, PAULDRON_FIN];
  if (damageOf(look) > 0) {
    ctx.save();
    clipTo(ctx, marks, side);
    cracks(ctx, side < 0 ? 3 : 4, look.state === 'damaged_2' ? 5 : 2, [37, -117, 100, -62], side);
    ctx.restore();
  }
  flashOf(ctx, look, marks, [36, -136, 103, -61], side);
  ctx.restore();
}

/** An arm: the upper arm in under-suit, the elbow, the gauntlet and the hand. */
export function drawArm(ctx: CanvasRenderingContext2D, side: Side, look: PartLook, time: number): void {
  if (look.state === 'destroyed') return;
  // The arms hang a little away from the body and sway with her breathing.
  const sway = Math.sin(time * 1.4 + (side > 0 ? 0 : 0.9)) * 1.2;
  ctx.save();
  ctx.translate(side * (look.dx + sway), look.dy);

  fillPath(
    ctx,
    UPPER_ARM,
    shade(ctx, side * 52, -88, side * 82, -36, [
      [0, mix(INK.suit, 0xffffff, 0.22)],
      [0.5, INK.suit],
      [1, INK.suitDeep],
    ]),
    side,
  );
  strokePath(ctx, UPPER_ARM, 1.1, INK.suitDeep, side);
  for (const band of [BAND_HIGH, BAND_LOW]) {
    fillPath(ctx, band, INK.silver, side);
    strokePath(ctx, band, 0.8, INK.silverDeep, side);
  }
  joint(ctx, 72, -31, 8, side, look.flash);

  plate(ctx, GAUNTLET, INK.pearl, [57, -32, 90, 20], side);
  ctx.save();
  clipTo(ctx, [GAUNTLET], side);
  ctx.fillStyle = shade(ctx, side * 72, 0, side * 90, 0, [
    [0, rgba(over.shade, 0)],
    [1, rgba(over.shade, 0.3)],
  ]);
  ctx.fillRect(-92, -34, 184, 56);
  ctx.restore();
  strokePath(ctx, GAUNTLET, 1.2, INK.pearlDeep, side);
  // The elbow's pin, over the top of the gauntlet.
  for (const [radius, colour] of [
    [3.5, INK.silver],
    [2.1, INK.energy],
  ] as const) {
    ctx.beginPath();
    ctx.arc(side * 72, -32, radius, 0, TAU);
    ctx.fillStyle = colour;
    ctx.fill();
  }
  seam(ctx, quadCurve(62, -16, 66, -2, 71, 11, 8), side);

  fillPath(ctx, WRIST, INK.suit, side);
  plate(ctx, CUFF, INK.silver, [64, 16, 92, 31], side);
  strokePath(ctx, CUFF, 0.9, INK.silverDeep, side);
  plate(ctx, HAND, INK.pearl, [64, 31, 92, 57], side);
  strokePath(ctx, HAND, 1.1, INK.pearlDeep, side);
  // The knuckles: two short lines.
  for (let i = 0; i < 2; i++) {
    keyedStroke(
      ctx,
      quadCurve(76 + i * 5.6, 36, 77.4 + i * 5.6, 40, 77 + i * 5.6, 44, 5),
      [
        [0, 0.2],
        [0.5, 0.8],
        [1, 0.2],
      ],
      rgba(over.shade, 0.7),
      side,
    );
  }

  const marks: readonly string[] = [UPPER_ARM, GAUNTLET, HAND, CUFF];
  if (damageOf(look) > 0) {
    ctx.save();
    clipTo(ctx, marks, side);
    cracks(ctx, side < 0 ? 7 : 8, look.state === 'damaged_2' ? 5 : 2, [50, -88, 92, 57], side);
    ctx.restore();
  }
  flashOf(ctx, look, marks, [50, -88, 92, 57], side);
  ctx.restore();
}

/** One blade of a wing: a leaf that starts at the spar, is widest a third of the way out, and ends in a point that glows. */
function blade(
  ctx: CanvasRenderingContext2D,
  side: Side,
  rootX: number,
  rootY: number,
  angle: number,
  reach: number,
  width: number,
  colour: string | number,
): void {
  const base = typeof colour === 'number' ? css(colour) : colour;
  const f = (n: number): string => String(Math.round(n * 100) / 100);
  const tipX = rootX + Math.cos(angle) * reach;
  const tipY = rootY + Math.sin(angle) * reach;
  // The leaf's two sides: from the root out to the tip, each bowing to its own side of the line.
  const bulgeX = rootX + (tipX - rootX) * 0.36;
  const bulgeY = rootY + (tipY - rootY) * 0.36;
  // Across the blade, at right angles to the way it points.
  const alongX = -Math.sin(angle);
  const alongY = Math.cos(angle);
  const d =
    `M ${f(rootX)} ${f(rootY)} Q ${f(bulgeX + alongX * width)} ${f(bulgeY + alongY * width)} ${f(tipX)} ${f(tipY)} ` +
    `Q ${f(bulgeX - alongX * width)} ${f(bulgeY - alongY * width)} ${f(rootX)} ${f(rootY)} Z`;
  fillPath(
    ctx,
    d,
    shade(ctx, side * rootX, rootY, side * tipX, tipY, [
      [0, mix(base, over.shade, 0.3)],
      [0.6, base],
      [1, mix(base, 0xffffff, 0.5)],
    ]),
    side,
  );
  strokePath(ctx, d, 0.9, INK.silverDeep, side);
  // The rib, and the light at the point.
  keyedStroke(
    ctx,
    quadCurve(rootX, rootY, bulgeX, bulgeY, tipX, tipY, 10),
    [
      [0, 0.8],
      [1, 0.25],
    ],
    rgba(over.shade, 0.45),
    side,
  );
  ctx.fillStyle = glow(ctx, side * tipX, tipY, rgba(over.energy, 0.55), 2, 12);
  ctx.fillRect(side * tipX - 13, tipY - 13, 26, 26);
}

/** A wing: the blades from a spar, shortest — the lowest — first, so each above lies over the root of the last. */
export function drawWing(ctx: CanvasRenderingContext2D, side: Side, look: PartLook, time: number): void {
  if (look.state === 'destroyed') return;
  ctx.save();
  ctx.translate(side * look.dx, look.dy);

  // They breathe: the lower ones travel further than the upper. A damaged wing has lost blades from
  // its lower edge.
  for (let i = FEATHERS.length - 1; i >= 0; i--) {
    const [rootX, rootY, degrees, length, width] = FEATHERS[i]!;
    const lost =
      look.state === 'damaged_2' && i >= FEATHERS.length - 2
        ? 0.42
        : look.state === 'damaged_1' && i === FEATHERS.length - 1
          ? 0.6
          : 1;
    const angle = (degrees + Math.sin(time * 1.7 + i * 0.55) * (0.6 + i * 0.22)) * DEG;
    blade(ctx, side, rootX, rootY, angle, length * lost, width, i % 2 === 0 ? INK.pearl : over.blade);
  }

  // The spar, then the short blades over the roots of the long ones.
  fillPath(
    ctx,
    SPAR,
    shade(ctx, side * 24, -95, side * 126, -114, [
      [0, INK.silver],
      [1, INK.steel],
    ]),
    side,
  );
  strokePath(ctx, SPAR, 1, INK.silverDeep, side);
  for (const [rootX, rootY, degrees, length, width] of COVERTS) {
    blade(ctx, side, rootX, rootY, degrees * DEG, length, width, mix(INK.pearl, INK.energySoft, 0.25));
  }
  for (const [x, y, radius] of JOINTS) joint(ctx, x, y, radius, side, look.flash);

  if (damageOf(look) > 0) {
    ctx.save();
    clipTo(ctx, [SPAR], side);
    cracks(ctx, side < 0 ? 5 : 6, look.state === 'damaged_2' ? 3 : 1, [24, -125, 126, -83], side);
    ctx.restore();
  }
  flashOf(ctx, look, [SPAR], [23, -126, 127, -82], side);
  ctx.restore();
}

/** The core in its socket, turning, with two arcs of light going round it; and the shield over it. */
export function drawCore(
  ctx: CanvasRenderingContext2D,
  core: PartLook,
  shield: PartLook,
  time: number,
): void {
  if (core.state !== 'destroyed') {
    const beat = 0.5 + 0.5 * Math.sin(time * 4.2);
    ctx.save();
    ctx.translate(core.dx, CORE_Y + core.dy);
    ctx.fillStyle = glow(ctx, 0, 0, rgba(over.energy, 0.26 + 0.08 * beat), 14, 46);
    ctx.fillRect(-48, -48, 96, 96);
    // The stone: six faces, every other point drawn in a little.
    ctx.beginPath();
    for (let i = 0; i < 12; i++) {
      const angle = (i * Math.PI) / 6 + time * 0.3;
      const radius = i % 2 === 0 ? 10.5 : 8.6;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = glow(ctx, -2, -3, mix(INK.core, 0xffffff, 0.3 + 0.4 * core.flash), 2.5, 13);
    ctx.fill();
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = INK.energy;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-2.6, -3.4, 2.4, 0, TAU);
    ctx.fillStyle = rgba(0xffffff, 0.85 + 0.1 * beat);
    ctx.fill();
    // Two arcs of light that orbit it.
    for (const [turn, sweep, alpha] of [
      [time * 1.7, 1.8, 0.9],
      [time * 1.7 + Math.PI, -1.1, 0.7],
    ] as const) {
      ctx.beginPath();
      ctx.arc(0, 0, 15.5, turn, turn + sweep, sweep < 0);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = rgba(over.energy, alpha);
      ctx.stroke();
    }
    ctx.restore();
  }
  if (shield.state === 'destroyed') return;

  // The shield: a bubble of light over the socket. Its rim is bright, and there is a highlight
  // where the light catches it on the upper left.
  ctx.save();
  ctx.translate(shield.dx, CORE_Y + shield.dy);
  const shimmer = Math.sin(time * 2.6) * 0.04;
  ctx.beginPath();
  ctx.arc(0, 0, 30, 0, TAU);
  ctx.fillStyle = shade(ctx, -30, -30, 30, 30, [
    [0, rgba(0xffe6ff, 0.3 + shimmer + shield.flash * 0.3)],
    [0.6, rgba(0xd98cff, 0.1 + shimmer)],
    [1, rgba(0xd98cff, 0.2 + shimmer)],
  ]);
  ctx.fill();
  // The lattice across it: three chords.
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = rgba(0xffffff, 0.16);
  for (const [x0, y0, x1, y1] of [
    [-28, 0, 28, 0],
    [-14, -24, 14, 24],
    [14, -24, -14, 24],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(0, 0, 30, 0, TAU);
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = rgba(over.energySoft, 0.6 + shield.flash * 0.3);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 27.5, Math.PI * 1.12, Math.PI * 1.52);
  ctx.lineWidth = 2.6;
  ctx.lineCap = 'round';
  ctx.strokeStyle = rgba(0xffffff, 0.6);
  ctx.stroke();
  ctx.restore();
}

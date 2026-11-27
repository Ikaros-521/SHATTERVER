import { TAU } from '../../../../core/math';
import type { FaceId } from '../../types';
import {
  bothHalves,
  chained,
  cubicPoints,
  fillPath,
  glow,
  joined,
  keyedStroke,
  mirrored,
  quadCurve,
  quadStroke,
  rgba,
  shade,
  shadeY,
  strokePath,
  tapered,
  trace,
} from './brush';
import { INK } from './palette';

/**
 * 绯樱's head, drawn with Canvas 2D in figure units: x to the right, y down, the origin at the top
 * of the breastbone. The crown is at -236 and the chin at -117, and everything on it is placed by
 * proportions measured off drawn anime faces, in widths of the face itself (W, the face across the
 * eyes):
 *
 *   the eyes   0.6 W below the crown, their middles 0.26 W out from the middle of the face, so
 *              that 0.24 W — a touch under one eye's width — lies between their inner corners;
 *              each opening 0.28 W wide and 0.22 W tall. As wide apart as the reference (0.41 W)
 *              she looked strange: her pupils too far apart.
 *   the iris   a tall oval, 0.17 W wide, set towards the inner corner: as tall as the eye is open
 *   the nose   a third of the way from the eyes to the chin; the mouth a little over half way
 *   the chin   small: the jaw is full to the level of the nose, then drawn in to a rounded point
 *   the hair   a dome 0.1 W above the crown; the fringe cut into two great pointed locks a side
 *
 * Shapes written for the right of the head are mirrored for the left. What must not mirror — the
 * light, which comes from the upper left — is chosen separately for each side.
 */

type Side = 1 | -1;

const SIDES: readonly Side[] = [-1, 1];

/** Where the eyes sit: the middle of each opening, and how far it is from the middle of the face. */
const EYE_Y = -165.5;
const EYE_X = 21.2;

/** The same, as the tests read them. */
export const EYE_AT: readonly [number, number] = [EYE_X, EYE_Y];

/** The lower lid, about which the upper lid closes. */
const LOW = 8.5;

/** The outline of the head, from the crown down one side and back up the other. */
export const FACE = bothHalves(
  'M 0 -236 C 26 -236 40 -218 40.3 -184 C 40.4 -177 40.3 -171 40.3 -166 ' +
    'C 40.4 -145 31 -131 17.7 -124.5 C 13 -123.5 5 -117 0 -117',
);

/** The cheek and jaw: the stretch of the contour that carries a line. */
const JAW = 'M 40.3 -169 C 40.4 -145 31 -131 17.7 -124.5 C 13 -123.5 5 -117 0 -117';

/** The neck, from under the jaw down to the collar. */
const NECK = 'M -14.5 -128 L -15.5 -97 L 15.5 -97 L 14.5 -128 Z';

/** The shadow the jaw throws on the neck. */
const NECK_SHADOW = 'M -15.5 -128 L 15.5 -128 L 15.5 -105 Q 0 -99.5 -15.5 -105 Z';

/** The upper lid of the open right eye, about the eye's middle: in from its inner corner, up to its peak. */
const LID_IN: readonly number[] = [-11.5, 1.2, -9.9, -4.2, -6.2, -8.6, -0.6, -8.6];

/** …and down from the peak to its outer corner. */
const LID_OUT: readonly number[] = [-0.6, -8.6, 4.6, -8.6, 9.6, -5.6, 11.5, -0.8];

/** The lower lid, the other way round: from the outer corner round the foot of the eye to the inner. */
const LID_LOW_OUT: readonly number[] = [11.5, -0.8, 11, 4.4, 6.4, 8.5, 0, 8.5];
const LID_LOW_IN: readonly number[] = [0, 8.5, -6.4, 8.5, -11, 5.4, -11.5, 1.2];

/** How thick the lash is along the lid, from the inner corner (0) to the outer (1). */
const LASH_WIDTH: readonly (readonly [number, number])[] = [
  [0, 0.3],
  [0.2, 0.8],
  [0.45, 1.5],
  [0.65, 2.3],
  [0.8, 3.1],
  [1, 4.2],
];

/** The line of the lower lid: the outer four fifths of the eye's foot. */
const LOWER = joined(
  cubicPoints(11.5, -0.8, 11, 4.4, 6.4, 8.5, 0, 8.5, 9),
  cubicPoints(0, 8.5, -6.4, 8.5, -11, 5.4, -11.5, 1.2, 8),
);

/**
 * The hem of the right half of the fringe, from the fold outside the outer lock in to the middle,
 * in three stretches. The edges bow: each lock is full on its outer side and cut in on its inner,
 * so that its point is sharp and its flank round. The dome above is joined onto the first of them.
 */
const HEM: readonly (readonly [number, number, number, number, number, number, number, number])[] = [
  [39.5, -196, 37.8, -188.4, 33.6, -183.2, 27.5, -182],
  [27.5, -182, 23.6, -187.4, 16.8, -199, 11, -208.6],
  [11, -208.6, 8.8, -201, 6, -190.6, 0.6, -182.4],
];

/** The fringe: a dome over the skull, cut at its hem into pointed locks. */
const FRINGE = bothHalves(
  'M 0 -239.5 C 17 -239.5 33 -230 39.5 -213 C 41.6 -207.5 41.6 -201 39.5 -196 ' + hem(),
);

/** The hem as it is run on from the dome. */
function hem(): string {
  const path = chained(HEM);
  return path.slice(path.indexOf('C'));
}

/** The centre lock's right edge, carried on up its flank to where the locks part below the crown. */
const CENTRE_LOCK = joined(
  cubicPoints(5.2, -221, 7.4, -216.4, 9.4, -212.4, 11, -208.6, 8),
  cubicPoints(...HEM[2]!, 12),
);

/** The outer lock's outer edge, carried on up the side of the dome in the same way. */
const OUTER_LOCK = joined(
  cubicPoints(34, -224, 36.6, -217.4, 39, -205.4, 39.5, -196, 8),
  cubicPoints(...HEM[0]!, 8),
);

/** The lock that falls in front of the right ear and shoulder, over the cheek and the armour. */
const SIDE_LOCK =
  'M 22 -236 C 40 -230 52 -214 52.4 -192 C 52.6 -176 49 -152 46.6 -130 C 44.6 -108 46.8 -86 51 -64 ' +
  'C 53 -52 51.4 -38 45.6 -26 C 44.6 -38 43.4 -52 42.4 -68 C 41.2 -92 41.4 -114 41.6 -134 ' +
  'C 41.9 -156 41.4 -178 40.8 -196 C 40.2 -212 32 -228 22 -236 Z';

/** All the hair behind the head and the body: far wider than the skull, its edges rising and falling as the locks turn over, and ending in points at the small of the back. */
const BACK_HAIR =
  'M 0 -236 C 31 -236 50 -220 53.5 -197 C 56.5 -178 52.5 -160 54 -142 C 55.5 -124 61 -108 60 -88 ' +
  'C 59 -68 53 -54 54 -34 C 55 -16 61 -4 58 12 Q 56 22 51 30 Q 48 39 45 22 Q 41 37 37 46 ' +
  'Q 32.5 37 27 27 Q 22 41 16 53 Q 8 43 0 31 Q -8 43 -16 53 Q -22 41 -27 27 Q -32.5 37 -37 46 ' +
  'Q -41 37 -45 22 Q -48 39 -51 30 Q -56 22 -58 12 C -61 -4 -55 -16 -54 -34 C -53 -54 -59 -68 -60 -88 ' +
  'C -61 -108 -55.5 -124 -54 -142 C -52.5 -160 -56.5 -178 -53.5 -197 C -50 -220 -31 -236 0 -236 Z';

/** The sheen on the crown: groups of short zigzags, where each starts. */
const SHEEN: readonly (readonly [number, number])[] = [
  [-33.5, -210.6],
  [-28.2, -213],
  [-15.5, -215.6],
  [-10.2, -215.4],
  [4.9, -215.5],
  [10.2, -215.2],
  [22.9, -213.6],
  [28.2, -211.2],
];

/** The fin that stands off the right ear unit, up and out. */
const FIN = 'M 52.2 -164 Q 58.2 -168 65 -173.6 Q 57.8 -172.6 52.6 -167.8 Z';

/** The stone of the coronet, set over the part. */
const CORONET = 'M 0 -225.4 L 3.4 -221.4 L 0 -217.4 L -3.4 -221.4 Z';

/** Colours laid over something else, which need an opacity. */
const over = {
  skinShade: 0xf0bbaa,
  skinDeep: 0xe5a898,
  nose: 0xd99a8e,
  blush: 0xff8fa6,
  lidShadow: 0x2c1145,
  lowerLid: 0x7a4258,
  hairShadow: 0xd96fa5,
  hairDeep: 0xab4a80,
  hairLit: 0xffe1ee,
  hairLine: 0x9c4176,
  energy: 0xff5fd8,
  irisLight: 0xffdcf9,
};

/** How one eye is drawn, by face. */
interface EyeLook {
  /** How far open the eye is; under 0.12 it is shut. */
  open: number;
  /** The eye's turn in radians: negative lifts its outer corner. */
  tilt: number;
  /** How hard the foot of the iris burns; above 1 it is meant to glow. */
  burn: number;
  /** The iris's size beside the eye's. */
  iris: number;
  size: number;
  /** Shut: which way the lash bows. Positive, down: squeezed. */
  bow: number;
}

const EYES: Record<FaceId, EyeLook> = {
  idle: { open: 1, tilt: -0.04, burn: 0.5, iris: 1, size: 1, bow: 0 },
  smug: { open: 0.4, tilt: -0.2, burn: 0.45, iris: 1, size: 1, bow: 0 },
  surprised: { open: 1.16, tilt: -0.02, burn: 0.3, iris: 0.84, size: 1.04, bow: 0 },
  angry: { open: 0.5, tilt: -0.3, burn: 0.8, iris: 1, size: 1, bow: 0 },
  hurt: { open: 0, tilt: -0.06, burn: 0.4, iris: 1, size: 1, bow: 1 },
  awakened: { open: 0.9, tilt: -0.24, burn: 1.7, iris: 1, size: 1.03, bow: 0 },
  defeated: { open: 0, tilt: 0.04, burn: 0, iris: 1, size: 1, bow: -0.8 },
};

/** A brow of the right eye: where its curve starts, the point it bends round, and where it ends. */
interface Brow {
  from: readonly [number, number];
  by: readonly [number, number];
  to: readonly [number, number];
}

const BROWS: Record<FaceId, Brow> = {
  idle: { from: [5.2, -185], by: [12.8, -188.4], to: [20.4, -186.8] },
  smug: { from: [5.2, -188.2], by: [12.8, -190.8], to: [20.4, -189.6] },
  surprised: { from: [5.2, -189.2], by: [12.8, -193.2], to: [20.4, -190.8] },
  angry: { from: [3.2, -182.2], by: [10.8, -184.6], to: [20.4, -190] },
  hurt: { from: [3.4, -188.2], by: [10.8, -186.8], to: [19.8, -184] },
  awakened: { from: [3.2, -181.4], by: [10.8, -185.2], to: [20.4, -191] },
  defeated: { from: [3.4, -186.6], by: [10.8, -185.4], to: [19.8, -185.2] },
};

/** The brow that disagrees on a lopsided face: the left one. */
const LEFT_BROWS: Partial<Record<FaceId, Brow>> = {
  smug: { from: [5.2, -183.2], by: [12.8, -184.8], to: [20.4, -185] },
};

/** A width read from keyframes of [how far along, width], straight between them. */
function along(keys: readonly (readonly [number, number])[], t: number): number {
  for (let i = 1; i < keys.length; i++) {
    const [t1, w1] = keys[i]!;
    if (t <= t1) {
      const [t0, w0] = keys[i - 1]!;
      return t1 > t0 ? w0 + ((w1 - w0) * (t - t0)) / (t1 - t0) : w1;
    }
  }
  return keys[keys.length - 1]![1];
}

/** A point of the lid's line, with the line's way there and its normal, away from the eye. */
interface LidPoint {
  x: number;
  y: number;
  tx: number;
  ty: number;
  nx: number;
  ny: number;
  /** How far along the line it is, 0 at the inner corner. */
  t: number;
}

/** The lid's cubic with the lid brought down towards the lower lid, as the eye closes. */
function lidCubic(c: readonly number[], open: number): number[] {
  return c.map((value, i) => (i % 2 === 1 ? LOW + (value - LOW) * open : value));
}

/**
 * The outline of the right eye's opening, about the eye's middle: the lid's two stretches, then the
 * lower lid's two, back to the inner corner. `open` is how far open the eye is.
 */
export function eyeOpening(open: number): string {
  return chained([lidCubic(LID_IN, open), lidCubic(LID_OUT, open), LID_LOW_OUT, LID_LOW_IN], true);
}

/** The line of the upper lid, sample by sample, its length run out from the inner corner. */
function lidLine(open: number): LidPoint[] {
  const a = lidCubic(LID_IN, open);
  const b = lidCubic(LID_OUT, open);
  const raw: [number, number][] = [
    ...cubicPoints(a[0]!, a[1]!, a[2]!, a[3]!, a[4]!, a[5]!, a[6]!, a[7]!, 19).map(
      ([x, y]): [number, number] => [x, y],
    ),
    ...cubicPoints(b[0]!, b[1]!, b[2]!, b[3]!, b[4]!, b[5]!, b[6]!, b[7]!, 19)
      .slice(1)
      .map(([x, y]): [number, number] => [x, y]),
  ];
  const run: number[] = [0];
  for (let i = 1; i < raw.length; i++) {
    run.push(run[i - 1]! + Math.hypot(raw[i]![0] - raw[i - 1]![0], raw[i]![1] - raw[i - 1]![1]));
  }
  const total = run[run.length - 1]!;
  return raw.map(([x, y], i) => {
    const before = raw[Math.max(0, i - 1)]!;
    const after = raw[Math.min(raw.length - 1, i + 1)]!;
    const tx = after[0] - before[0];
    const ty = after[1] - before[1];
    const len = Math.hypot(tx, ty) || 1;
    return { x, y, tx: tx / len, ty: ty / len, nx: ty / len, ny: -tx / len, t: run[i]! / total };
  });
}

/** The point of a line a given way along it. */
function part(line: readonly LidPoint[], t: number): LidPoint {
  const at = Math.min(line.length - 2, Math.max(0, Math.floor(t * (line.length - 1))));
  const a = line[at]!;
  const b = line[at + 1]!;
  const k = Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t || 1)));
  const mix = (p: number, q: number): number => p + (q - p) * k;
  return {
    x: mix(a.x, b.x),
    y: mix(a.y, b.y),
    tx: mix(a.tx, b.tx),
    ty: mix(a.ty, b.ty),
    nx: mix(a.nx, b.nx),
    ny: mix(a.ny, b.ny),
    t,
  };
}

/** An egg on end, its foot drawn in a little: the shape of an iris. */
function egg(x: number, y: number, rx: number, ry: number): string {
  const f = (n: number): string => String(Math.round(n * 100) / 100);
  return (
    `M ${f(x)} ${f(y - ry)} C ${f(x + 0.74 * rx)} ${f(y - ry)} ${f(x + rx)} ${f(y - 0.6 * ry)} ${f(x + rx)} ${f(y - 0.16 * ry)} ` +
    `C ${f(x + rx)} ${f(y + 0.34 * ry)} ${f(x + 0.9 * rx)} ${f(y + ry)} ${f(x)} ${f(y + ry)} ` +
    `C ${f(x - 0.9 * rx)} ${f(y + ry)} ${f(x - rx)} ${f(y + 0.34 * ry)} ${f(x - rx)} ${f(y - 0.16 * ry)} ` +
    `C ${f(x - rx)} ${f(y - 0.6 * ry)} ${f(x - 0.74 * rx)} ${f(y - ry)} ${f(x)} ${f(y - ry)} Z`
  );
}

/**
 * The lash: the band over the lid, fine at the inner corner and a broad block at the outer one,
 * and off that corner a wing that turns up to a point. It is the lid's own line carried out past
 * the eye.
 */
function lashBand(ctx: CanvasRenderingContext2D, lid: readonly LidPoint[]): void {
  const top = lid.map((p) => {
    const w = along(LASH_WIDTH, p.t);
    return [p.x + p.nx * w, p.y + p.ny * w] as const;
  });
  const end = lid[lid.length - 1]!;
  ctx.beginPath();
  ctx.moveTo(top[0]![0], top[0]![1]);
  for (const [x, y] of top.slice(1)) ctx.lineTo(x, y);
  // The wing: off the top of the block, its upper edge bowing up on its way out to the point, and
  // its under edge sagging a little on its way back to the corner. It keeps its shape, turning with
  // the corner, as the lid comes down.
  const turn = Math.atan2(end.ty, end.tx) - Math.atan2(LID_TURN_Y, LID_TURN_X);
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  const wing = (x: number, y: number): readonly [number, number] => [
    end.x + x * cos - y * sin,
    end.y + x * sin + y * cos,
  ];
  const [px, py] = wing(6, -6.2);
  const [bx, by] = wing(2.2, -5.6);
  const [ax, ay] = wing(3.4, 1.3);
  ctx.quadraticCurveTo(bx, by, px, py);
  ctx.quadraticCurveTo(ax, ay, end.x, end.y);
  for (let i = lid.length - 2; i >= 0; i--) ctx.lineTo(lid[i]!.x, lid[i]!.y);
  ctx.closePath();
  ctx.fillStyle = INK.lash;
  ctx.fill();
}

/** The way the lid runs into its outer corner when the eye is wide open. */
const LID_TURN_X = 0.37;
const LID_TURN_Y = 0.93;

/** A lash standing off the top of the band, leaning out towards the corner. */
function lashSpike(
  ctx: CanvasRenderingContext2D,
  lid: readonly LidPoint[],
  t: number,
  lean: number,
  length: number,
  base: number,
): void {
  const p = part(lid, t);
  const sx = p.x + p.nx * along(LASH_WIDTH, t) * 0.5;
  const sy = p.y + p.ny * along(LASH_WIDTH, t) * 0.5;
  const dx = p.nx * Math.cos(lean) + p.tx * Math.sin(lean);
  const dy = p.ny * Math.cos(lean) + p.ty * Math.sin(lean);
  keyedStroke(
    ctx,
    quadCurve(
      sx,
      sy,
      sx + dx * length * 0.5 + p.tx * 0.9,
      sy + dy * length * 0.5 + p.ty * 0.9,
      sx + dx * length,
      sy + dy * length,
      9,
    ),
    [
      [0, base],
      [0.45, base * 0.6],
      [1, 0.12],
    ],
    INK.lash,
  );
}

/** The line of the lower lid, along the foot of the eye and a little over it: it stays put while the lid comes down. */
function lowerLid(ctx: CanvasRenderingContext2D): void {
  tapered(
    ctx,
    LOWER.map(([x, y, t]) => [
      x,
      y - 0.1,
      along(
        [
          [0, 0.45],
          [0.3, 0.9],
          [0.7, 0.95],
          [0.9, 0.55],
          [1, 0.05],
        ] as const,
        t,
      ),
    ]),
    rgba(0x3a1c42, 0.8),
  );
  // The fold of the lid itself, a fine line above the first one near the outer corner.
  keyedStroke(
    ctx,
    quadCurve(11.2, 0.9, 9.8, 3.4, 7.2, 5.8, 7),
    [
      [0, 0.15],
      [0.5, 0.6],
      [1, 0.1],
    ],
    rgba(over.lowerLid, 0.7),
  );
}

function drawEye(ctx: CanvasRenderingContext2D, eye: EyeLook, side: Side): void {
  ctx.save();
  ctx.translate(side * EYE_X, EYE_Y);
  ctx.scale(side, 1);
  ctx.rotate(eye.tilt);
  ctx.scale(eye.size, eye.size);

  if (eye.open < 0.12) {
    // Shut: the lash alone, bowed the way the face feels, with its wing and one lash off it.
    keyedStroke(
      ctx,
      quadCurve(-11.5, -1.6, 0, eye.bow * 8.6, 11.5, -1.2, 14),
      [
        [0, 0.4],
        [0.45, 3],
        [1, 2.4],
      ],
      INK.lash,
    );
    keyedStroke(
      ctx,
      quadCurve(10.6, -2.2, 12.4, -1.8, 14.6, -4.4, 7),
      [
        [0, 2.2],
        [0.5, 1.5],
        [1, 0.1],
      ],
      INK.lash,
    );
    keyedStroke(
      ctx,
      quadCurve(6.4, -1 - eye.bow * 2.4, 6.6, -4.6, 7.4, -7.2, 7),
      [
        [0, 1.5],
        [1, 0.1],
      ],
      INK.lash,
    );
    ctx.restore();
    return;
  }

  const lid = lidLine(eye.open);
  const opening = eyeOpening(eye.open);

  // The white.
  trace(ctx, opening);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  ctx.save();
  trace(ctx, opening);
  ctx.clip();

  // The iris: taller than the eye is open — the lid takes its top, the lower lid its foot — and
  // set towards the inner corner, so that most of the white shows on the outer side.
  const iris = eye.iris;
  const ix = -2.2;
  const iy = 0.9;
  const rx = 6.9 * iris;
  const ry = 9.1 * iris;
  const shape = egg(ix, iy, rx, ry);
  trace(ctx, shape);
  ctx.fillStyle = shadeY(ctx, iy - ry, iy + ry, [
    [0, INK.irisTop],
    [0.5, INK.irisMid],
    [1, INK.irisLow],
  ]);
  ctx.fill();
  // The light it catches at its foot, then its rim.
  ctx.fillStyle = glow(ctx, ix, iy + 6.2 * iris, rgba(over.irisLight, 0.5 + 0.3 * eye.burn), 1.6, 7.8 * iris);
  ctx.fillRect(-12, -10, 24, 20);
  strokePath(ctx, shape, 0.85, INK.irisRim);
  // The pupil: tall, its top lost under the lash.
  ctx.beginPath();
  ctx.ellipse(ix, -2.4, 3.5 * iris, 7 * iris, 0, 0, TAU);
  ctx.fillStyle = INK.pupil;
  ctx.fill();
  // The lid's shadow, on iris and white alike.
  for (const [off, w, alpha] of [
    [0.7, 2.6, 0.2],
    [2, 2.6, 0.09],
  ] as const) {
    tapered(
      ctx,
      lid.map((p) => [p.x, p.y + off, w] as const),
      rgba(over.lidShadow, alpha),
    );
  }
  // A crescent of light round the foot of the iris, just inside its rim: what makes it glassy.
  tapered(
    ctx,
    Array.from({ length: 11 }, (_, i) => {
      const angle = ((36 + (i * 108) / 10) * Math.PI) / 180;
      return [
        ix + Math.cos(angle) * rx * 0.82,
        iy + Math.sin(angle) * ry * 0.82,
        0.2 + 1.5 * Math.sin((i / 10) * Math.PI),
      ] as const;
    }),
    rgba(over.irisLight, 0.6),
  );
  // Catchlights: one large high on the lit side of the eye, overlapping the pupil's edge; one
  // small low on the other. The lit side is the left of each eye in the world, which inside the
  // mirror of the left eye is its right.
  ctx.beginPath();
  ctx.ellipse(ix - side * 3.1, -4.3, 2.95 * iris, 3.1 * iris, 0, 0, TAU);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(ix + side * 3.3, 3.5, 1.5 * iris, 0, TAU);
  ctx.fillStyle = rgba(0xffffff, 0.95);
  ctx.fill();
  ctx.restore();

  lowerLid(ctx);
  lashBand(ctx, lid);
  lashSpike(ctx, lid, 0.6, 0.2, 5.4, 1.8);
  lashSpike(ctx, lid, 0.77, 0.72, 5, 1.9);
  ctx.restore();
}

function drawMouth(ctx: CanvasRenderingContext2D, face: FaceId): void {
  const line = (x0: number, y0: number, cx: number, cy: number, x1: number, y1: number): void => {
    keyedStroke(
      ctx,
      quadCurve(x0, y0, cx, cy, x1, y1, 8),
      [
        [0, 0.5],
        [0.5, 1.3],
        [1, 0.5],
      ],
      INK.mouth,
    );
  };
  /** An open mouth, `wide` across, its upper lip at `lip` and its foot at `low`. */
  const open = (wide: number, lip: number, low: number): void => {
    // Its upper lip barely curves; its foot rounds out through control points set wide of the middle.
    const side = wide * 0.9;
    const shape = `M ${-wide} ${lip} Q 0 ${lip + 2} ${wide} ${lip} Q ${side} ${low - 1.6} 0 ${low} Q ${-side} ${low - 1.6} ${-wide} ${lip} Z`;
    trace(ctx, shape);
    ctx.fillStyle = INK.mouthIn;
    ctx.fill();
    // The line of the teeth along the top, and the tip of the tongue below it, both kept inside.
    ctx.save();
    trace(ctx, shape);
    ctx.clip();
    keyedStroke(
      ctx,
      quadCurve(-wide * 0.62, lip + 1.3, 0, lip + 2.6, wide * 0.62, lip + 1.3, 8),
      [
        [0, 0.3],
        [0.5, 1.5],
        [1, 0.3],
      ],
      INK.tooth,
    );
    ctx.beginPath();
    ctx.ellipse(0, low - 1.6, wide * 0.4, 1.5, 0, 0, TAU);
    ctx.fillStyle = INK.tongue;
    ctx.fill();
    ctx.restore();
  };
  switch (face) {
    case 'angry':
      open(5.8, -139.4, -132.4);
      return;
    case 'awakened':
      // Laughing.
      open(6.4, -139, -131.8);
      return;
    case 'smug':
      // A smirk, lifted at its right corner.
      line(-5.2, -136.4, 1.4, -133.6, 6.8, -137.6);
      return;
    case 'surprised':
      ctx.beginPath();
      ctx.ellipse(0, -134.6, 2.4, 3.2, 0, 0, TAU);
      ctx.fillStyle = INK.mouthIn;
      ctx.fill();
      return;
    case 'hurt':
      // Gritted: pressed flat.
      tapered(
        ctx,
        [
          [-5, -136.4, 0.9],
          [0, -135.4, 2.3],
          [5, -136.4, 0.9],
        ],
        INK.mouth,
      );
      return;
    case 'defeated':
      // Turned down at its corners.
      line(-5.2, -134.2, 0, -137.8, 5.2, -134.2);
      return;
    default:
      // A small smile, with the light on the lip below it.
      line(-7.6, -137.4, 0, -134.4, 7.6, -137.4);
      ctx.beginPath();
      ctx.ellipse(0.4, -133.4, 2.6, 0.85, 0, 0, TAU);
      ctx.fillStyle = rgba(0xffb9c4, 0.75);
      ctx.fill();
  }
}

/** The hair behind everything: a mass that falls to the small of her back and ends in points. */
export function drawBackHair(ctx: CanvasRenderingContext2D): void {
  // The head is 8 taller than the mass was first drawn for: the whole of it rides up to match.
  ctx.save();
  ctx.translate(0, -8);
  fillPath(
    ctx,
    BACK_HAIR,
    shadeY(ctx, -236, 53, [
      [0, INK.hair],
      [0.42, INK.hair],
      [0.64, INK.hairShadow],
      [0.88, INK.hairDeep],
    ]),
  );
  ctx.save();
  trace(ctx, BACK_HAIR);
  ctx.clip();
  // The head and the shoulders keep the light off the middle of it.
  ctx.fillStyle = glow(ctx, 0, -112, rgba(over.hairDeep, 0.55), 64, 128);
  ctx.fillRect(-70, -240, 140, 300);
  // The top is lit, most on the side the light comes from.
  for (const side of SIDES) {
    ctx.fillStyle = glow(ctx, side * 46, -206, rgba(over.hairLit, side < 0 ? 0.5 : 0.28), 10, 30);
    ctx.fillRect(-80, -240, 160, 80);
  }
  // The locks it falls in, parted along curved lines that follow its rise and fall. The side of a
  // lock away from the light — to the right of its line, whichever side of the head it is on — lies
  // in shadow, the side towards it is lit.
  const parts: readonly (readonly [number, number, number, number, number, number])[] = [
    [51, -198, 57, -112, 50, -14],
    [42, -152, 49, -80, 37, 40],
  ];
  for (const side of SIDES) {
    for (const [x0, y0, cx, cy, x1, y1] of parts) {
      quadStroke(
        ctx,
        x0 + side * 3.2,
        y0,
        cx + side * 3.2,
        cy,
        x1 + side * 3,
        y1,
        6,
        0.5,
        rgba(over.hairShadow, 0.5),
        side,
        14,
      );
      quadStroke(
        ctx,
        x0 - side * 3,
        y0 + 4,
        cx - side * 3,
        cy,
        x1 - side * 2.6,
        y1 - 8,
        0.4,
        2.6,
        rgba(over.hairLit, 0.4),
        side,
        14,
      );
      keyedStroke(
        ctx,
        quadCurve(x0, y0, cx, cy, x1, y1, 14),
        [
          [0, 0.3],
          [0.5, 1.5],
          [1, 0.3],
        ],
        rgba(over.hairLine, 0.6),
        side,
      );
    }
  }
  // The points at the foot catch the light.
  ctx.fillStyle = shadeY(ctx, 0, 52, [
    [0, rgba(over.hairLit, 0)],
    [1, rgba(over.hairLit, 0.3)],
  ]);
  ctx.fillRect(-70, 0, 140, 54);
  // The outer edge on the side away from the light falls back into shade; on the side towards it,
  // it catches a little light. Both give the mass its roundness.
  ctx.fillStyle = shade(ctx, 46, 0, 60, 0, [
    [0, rgba(over.hairShadow, 0)],
    [1, rgba(over.hairShadow, 0.55)],
  ]);
  ctx.fillRect(46, -240, 16, 300);
  ctx.fillStyle = shade(ctx, -60, 0, -46, 0, [
    [0, rgba(over.hairLit, 0.3)],
    [1, rgba(over.hairLit, 0)],
  ]);
  ctx.fillRect(-60, -240, 14, 300);
  ctx.restore();
  strokePath(ctx, BACK_HAIR, 1.25, INK.hairLine);
  ctx.restore();
}

/** The blush: a soft flush with three strokes of red drawn across it, as a comic draws one. */
function drawBlush(ctx: CanvasRenderingContext2D, side: Side): void {
  ctx.save();
  ctx.translate(side * 21, -149.5);
  ctx.scale(1, 0.5);
  ctx.fillStyle = glow(ctx, 0, 0, rgba(0xff9db2, 0.34), 6, 13.5);
  ctx.fillRect(-14, -14, 28, 28);
  ctx.restore();
  // The strokes rise the same way on both cheeks.
  for (let i = 0; i < 3; i++) {
    const x = side * 21 - 5.6 + i * 2.8;
    tapered(
      ctx,
      [
        [x, -146.2, 0.15],
        [x + 1.6, -148.3, 0.75],
        [x + 3.2, -150.4, 0.15],
      ],
      rgba(over.blush, 0.8),
    );
  }
}

/** The face with its eyes, nose and mouth, and the brows above them. */
export function drawFace(ctx: CanvasRenderingContext2D, face: FaceId): void {
  fillPath(ctx, NECK, INK.skin);
  fillPath(ctx, NECK_SHADOW, rgba(over.skinDeep, 0.7));

  fillPath(ctx, FACE, INK.skin);
  ctx.save();
  trace(ctx, FACE);
  ctx.clip();
  // The cheek away from the light, no more than a breath of it.
  ctx.fillStyle = shade(ctx, 28, 0, 41, 0, [
    [0, rgba(over.skinDeep, 0)],
    [1, rgba(over.skinDeep, 0.3)],
  ]);
  ctx.fillRect(28, -237, 14, 122);
  for (const side of SIDES) drawBlush(ctx, side);
  ctx.restore();

  // The fringe's shadow on the forehead: the fringe itself, a little lower, held inside the face.
  ctx.save();
  trace(ctx, FACE);
  ctx.clip();
  ctx.translate(0.4, 3.2);
  fillPath(ctx, FRINGE, rgba(over.skinShade, 0.6));
  ctx.restore();

  for (const side of SIDES) strokePath(ctx, JAW, 1.1, INK.skinLine, side);

  // The nose: a small oval, drawn only in line.
  ctx.beginPath();
  ctx.ellipse(0.2, -150.4, 0.95, 1.9, 0, 0, TAU);
  ctx.lineWidth = 0.62;
  ctx.strokeStyle = rgba(over.nose, 0.9);
  ctx.stroke();

  const eye = EYES[face];
  for (const side of SIDES) drawEye(ctx, eye, side);

  // The brows: thick at their inner end, drawn out to a point.
  const brow = BROWS[face];
  for (const side of SIDES) {
    const one = (side < 0 ? LEFT_BROWS[face] : undefined) ?? brow;
    keyedStroke(
      ctx,
      quadCurve(one.from[0], one.from[1], one.by[0], one.by[1], one.to[0], one.to[1], 8),
      [
        [0, 2.2],
        [0.45, 2.3],
        [1, 0.5],
      ],
      INK.brow,
      side,
    );
  }

  drawMouth(ctx, face);
}

/** The fringe: the dome over the forehead and the pointed locks that make its hem. */
export function drawBangs(ctx: CanvasRenderingContext2D): void {
  fillPath(
    ctx,
    FRINGE,
    shade(ctx, -40, 0, 44, 0, [
      [0, INK.hairLit],
      [0.3, INK.hair],
      [0.78, INK.hair],
      [1, INK.hairShadow],
    ]),
  );
  ctx.save();
  trace(ctx, FRINGE);
  ctx.clip();
  // Where each lock lies over the one outside it, it throws a shadow to the right of its edge —
  // whichever side of the head it is on, the light being on the left — and its edge is lined.
  // Past the fold the line runs on up the flank of the lock, thinning as it goes.
  for (const side of SIDES) {
    tapered(
      ctx,
      CENTRE_LOCK.slice(5).map(([x, y], i): [number, number, number] => [
        x + side * 1.5,
        y + 1.2,
        3.2 * (1 - i / 14) + 0.4,
      ]),
      rgba(over.hairShadow, 0.55),
      side,
    );
    keyedStroke(
      ctx,
      CENTRE_LOCK,
      [
        [0, 0.15],
        [0.36, 0.9],
        [1, 1.05],
      ],
      INK.hairLine,
      side,
    );
    tapered(
      ctx,
      CENTRE_LOCK.slice(0, 9).map(([x, y]): [number, number, number] => [x - 0.9, y, 0.8]),
      rgba(over.hairLit, 0.55),
      side,
    );
    tapered(
      ctx,
      OUTER_LOCK.slice(4).map(([x, y], i): [number, number, number] => [
        x + side * 1.4,
        y + 1,
        3 * (1 - i / 11) + 0.3,
      ]),
      rgba(over.hairShadow, 0.55),
      side,
    );
    keyedStroke(
      ctx,
      OUTER_LOCK,
      [
        [0, 0.15],
        [0.45, 0.8],
        [1, 1.05],
      ],
      INK.hairLine,
      side,
    );
    // The hem, where it lies over the forehead, is a shade deeper than the dome above it.
    ctx.fillStyle = shadeY(ctx, -196, -180, [
      [0, rgba(over.hairShadow, 0)],
      [1, rgba(over.hairShadow, 0.22)],
    ]);
    ctx.fillRect(0, -200, 44, 22);
  }
  // The sheen: short zigzags in groups along the crown.
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = 1.7;
  ctx.strokeStyle = rgba(over.hairLit, 0.62);
  for (const [x, y] of SHEEN) {
    // Each stroke climbs in two leaps of different heights, as a glint on hair is drawn.
    ctx.beginPath();
    ctx.moveTo(x, y + 1.7);
    ctx.lineTo(x + 1.5, y - 2.5);
    ctx.lineTo(x + 2.7, y + 1.3);
    ctx.lineTo(x + 4.1, y - 2);
    ctx.lineTo(x + 5.2, y + 1.7);
    ctx.stroke();
  }
  ctx.restore();
  strokePath(ctx, FRINGE, 1.15, INK.hairLine);
}

/** The locks that fall in front of the shoulders, over the armour. */
export function drawSideLocks(ctx: CanvasRenderingContext2D): void {
  for (const side of SIDES) {
    // The lock's shadow on what is behind it: down and to the right, on either side of the head.
    ctx.save();
    ctx.translate(2.2, 3.4);
    fillPath(ctx, SIDE_LOCK, rgba(over.hairDeep, 0.45), side);
    ctx.restore();
    // The edge away from the light is the one further out on the right, further in on the left.
    fillPath(
      ctx,
      SIDE_LOCK,
      shade(ctx, side * 38, 0, side * 54, 0, [
        [0, INK.hair],
        [0.5, INK.hair],
        [1, INK.hairShadow],
      ]),
      side,
    );
    ctx.save();
    trace(ctx, side < 0 ? mirrored(SIDE_LOCK) : SIDE_LOCK);
    ctx.clip();
    // The tip catches the light, and a line runs down the fold of the lock.
    ctx.fillStyle = shadeY(ctx, -80, -24, [
      [0, rgba(over.hairLit, 0)],
      [1, rgba(over.hairLit, 0.4)],
    ]);
    ctx.fillRect(side > 0 ? 36 : -58, -90, 22, 70);
    keyedStroke(
      ctx,
      quadCurve(46.6, -186, 45.4, -130, 46.4, -70, 14),
      [
        [0, 0.2],
        [0.5, 1.1],
        [1, 0.3],
      ],
      rgba(over.hairLine, 0.5),
      side,
    );
    ctx.restore();
    strokePath(ctx, SIDE_LOCK, 1.2, INK.hairLine, side);
  }
}

/** What she wears on her head: an ear unit over each ear, a coronet, and the halo. */
export function drawHeadgear(ctx: CanvasRenderingContext2D): void {
  for (const side of SIDES) {
    // A fin standing off the unit, then the unit itself: a disc of silver lit from the upper left,
    // with a light at its centre that spills out past it.
    const x = side * 48.2;
    fillPath(ctx, FIN, INK.silver, side);
    strokePath(ctx, FIN, 0.9, INK.silverDeep, side);
    ctx.fillStyle = glow(ctx, x, -155.5, rgba(over.energy, 0.45), 4.5, 16);
    ctx.fillRect(x - 16, -171.5, 32, 32);
    ctx.beginPath();
    ctx.arc(x, -155.5, 8.6, 0, TAU);
    ctx.fillStyle = shade(ctx, x - 6.6, -162, x + 6.6, -149, [
      [0, '#eceef6'],
      [0.55, INK.silver],
      [1, INK.silverShade],
    ]);
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = INK.silverDeep;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, -155.5, 4.2, 0, TAU);
    ctx.fillStyle = shade(ctx, x - 3, -158.4, x + 3, -152.6, [
      [0, '#ffffff'],
      [0.4, INK.energySoft],
      [1, INK.energy],
    ]);
    ctx.fill();
  }

  // The coronet: a stone set over the part.
  ctx.fillStyle = glow(ctx, 0, -221.4, rgba(over.energy, 0.5), 3, 12);
  ctx.fillRect(-12, -233, 24, 24);
  fillPath(
    ctx,
    CORONET,
    shade(ctx, -3, -225, 3, -217, [
      [0, '#ffffff'],
      [0.35, INK.energySoft],
      [1, INK.core],
    ]),
  );
  strokePath(ctx, CORONET, 0.7, rgba(0xffffff, 0.8));

  // The halo: a ring of light, drawn as a halo is, in strokes that widen as they fade.
  for (const [width, alpha] of [
    [9, 0.1],
    [5, 0.22],
    [2.2, 0.95],
  ] as const) {
    ctx.beginPath();
    ctx.ellipse(0, -253, 31, 6.8, 0, 0, TAU);
    ctx.lineWidth = width;
    ctx.strokeStyle = rgba(over.energy, alpha);
    ctx.stroke();
  }
  fillPath(ctx, 'M 0 -257.4 L 2.4 -253.6 L 0 -249.8 L -2.4 -253.6 Z', '#ffd0f4');
}

/** Everything in front of the body: the face with its brows, the fringe over them, the locks and the headgear. */
export function drawHead(ctx: CanvasRenderingContext2D, face: FaceId): void {
  drawFace(ctx, face);
  drawBangs(ctx);
  drawSideLocks(ctx);
  drawHeadgear(ctx);
}

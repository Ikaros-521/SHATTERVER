import { TAU } from '../../../../core/math';
import type { FaceId } from '../../types';
import {
  cubicPoints,
  fillPath,
  glow,
  joined,
  keyedStroke,
  mirrored,
  quadCurve,
  quadPoints,
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
 * of the breastbone. The crown is at -224 and the chin at about -119, so the head stands about 105
 * tall, and everything on it is placed by the proportions of an anime face read against that:
 *
 *   the eyes   a little over half way down the head, on the line round a skull drawn as a circle;
 *              one eye's width apart, each about a fifth of the head's height wide
 *   the nose   about a third of the way from the eyes to the chin
 *   the mouth  about half way from the eyes to the chin
 *   the chin   small and round, the cheeks full: the lower face is short
 *   the hair   far wider than the skull, falling in pointed locks from the crown
 *
 * Shapes written for the right of the head are mirrored for the left. What must not mirror — the
 * light, which comes from the upper left — is chosen separately for each side.
 */

type Side = 1 | -1;

const SIDES: readonly Side[] = [-1, 1];

/** Where the eyes sit. */
const EYE_Y = -167.5;
/** How far each eye's centre is from the middle of the face. */
const EYE_X = 21.6;

/** The head: round on top, full through the cheeks, drawn in to a small round chin. */
const SKULL =
  'M 0 -226 C 23 -226 40 -209 40.3 -184 C 40.5 -170 39.6 -158 34.5 -143.5 C 29.5 -130.5 19 -121.6 8 -119.6 ' +
  'C 3 -118.8 -3 -118.8 -8 -119.6 C -19 -121.6 -29.5 -130.5 -34.5 -143.5 C -39.6 -158 -40.5 -170 -40.3 -184 ' +
  'C -40 -209 -23 -226 0 -226 Z';

/** The right cheek and jaw: the stretch of the contour that carries a line. */
const JAW = 'M 40.3 -184 C 40.5 -170 39.6 -158 34.5 -143.5 C 29.5 -130.5 19 -121.6 8 -119.6';

/** The chin, closing the contour between the two jaws. */
const CHIN = 'M 8 -119.6 C 3 -118.8 -3 -118.8 -8 -119.6';

/** The neck, from under the jaw down to the collar. */
const NECK = 'M -14 -130 C -7 -121 7 -121 14 -130 L 14.5 -100 L -14.5 -100 Z';

/** The shadow the jaw throws on the neck. */
const NECK_SHADOW = 'M -14 -130 C -7 -120 7 -120 14 -130 L 14.5 -112 C 7 -107 -7 -107 -14.5 -112 Z';

/**
 * The right eye wide open, about its own centre: an almond with a rounded upper lid, its outer
 * corner a little higher than its inner one.
 */
const EYE =
  'M -11 2.5 C -9.5 -4 -5 -10 1.5 -10 C 7 -10 10.5 -6 11 -1.5 C 10 5.5 6 9.2 0 9.3 C -6 9.2 -10 6 -11 2.5 Z';

/** Its upper lid, in two stretches that meet at its peak. */
const LID = joined(
  cubicPoints(-11, 2.5, -9.5, -4, -5, -10, 1.5, -10, 9),
  cubicPoints(1.5, -10, 7, -10, 10.5, -6, 11, -1.5, 8),
);

/** The lash: the lid's line carried on past the outer corner, where it turns up into a point. */
const LASH = joined(LID, cubicPoints(11, -1.5, 12.8, -2.4, 14.6, -4.2, 16.2, -6.8, 7));

/** The line of its lower lid, just outside the white: from the foot of the eye to its outer corner. */
const LOWER_LID = quadCurve(0.4, 10.6, 8.4, 7.4, 11.4, 0.6, 8);

/** The fold above the lid. */
const CREASE = quadCurve(-5.5, -13.2, 1.5, -16.6, 9, -11.8, 8);

/**
 * The cap of the fringe: hair over the forehead, round on top, cut off across the brows so that
 * they show. The locks that fall over it are what make its hem.
 */
const CAP =
  'M -40.5 -172 C -43.5 -190 -39 -211 -27 -222 C -15 -232.5 15 -232.5 27 -222 C 39 -211 43.5 -190 40.5 -172 ' +
  'Q 0 -205 -40.5 -172 Z';

/** The part of the cap's outline that carries a line: up one side, over the crown, down the other. */
const CAP_TOP =
  'M -40.5 -172 C -43.5 -190 -39 -211 -27 -222 C -15 -232.5 15 -232.5 27 -222 C 39 -211 43.5 -190 40.5 -172';

/**
 * The locks of the right half of the fringe, outermost first so each one inside it lies over it.
 * They start at the crown and end where their points fall: where each ends, how far it bows
 * outwards on its way, and how wide it is where it starts.
 */
const LOCKS: readonly (readonly [number, number, number, number])[] = [
  [39.5, -166, 3.5, 7],
  [31, -175, 3, 8.5],
  [22, -180, 2, 9.5],
  [13, -180, 1, 10],
  [4.5, -182, 0.2, 10],
];

/** The band of sheen across the crown: its lower edge cut into teeth, its upper edge soft. */
const RING =
  'M -31 -214 Q 0 -223 31 -214 L 26 -205.5 L 21 -210 L 16 -204 L 11 -209 L 6 -203 L 1.5 -207.8 ' +
  'L -1.5 -207.8 L -6 -203 L -11 -209 L -16 -204 L -21 -210 L -26 -205.5 Z';

/** The lock that falls in front of the right shoulder. */
const SIDE_LOCK =
  'M 34 -206 C 45 -198 50.6 -180 49.6 -160 C 48.8 -140 45 -124 42.6 -110 C 40.6 -88 45 -62 47.6 -40 ' +
  'C 48.6 -30 46.6 -19 42.4 -11 C 41.6 -22 40 -36 39 -52 C 37.4 -78 37.8 -98 38.8 -116 ' +
  'C 39.8 -136 38.2 -150 36.6 -166 C 35.6 -180 35.4 -194 34 -206 Z';

/** All the hair behind the head and the body: far wider than the skull, its edges rising and falling as the locks turn over, and ending in points at the small of the back. */
const BACK_HAIR =
  'M 0 -236 C 31 -236 50 -220 53.5 -197 C 56.5 -178 52.5 -160 54 -142 C 55.5 -124 61 -108 60 -88 ' +
  'C 59 -68 53 -54 54 -34 C 55 -16 61 -4 58 12 Q 56 22 51 30 Q 48 39 45 22 Q 41 37 37 46 ' +
  'Q 32.5 37 27 27 Q 22 41 16 53 Q 8 43 0 31 Q -8 43 -16 53 Q -22 41 -27 27 Q -32.5 37 -37 46 ' +
  'Q -41 37 -45 22 Q -48 39 -51 30 Q -56 22 -58 12 C -61 -4 -55 -16 -54 -34 C -53 -54 -59 -68 -60 -88 ' +
  'C -61 -108 -55.5 -124 -54 -142 C -52.5 -160 -56.5 -178 -53.5 -197 C -50 -220 -31 -236 0 -236 Z';

/** The fin that stands off the right ear unit, up and out. */
const FIN = 'M 44.6 -166.5 Q 50.6 -170.5 57.4 -176 Q 50.2 -175 45 -170.2 Z';

/** The stone of the coronet, set over the part. */
const CORONET = 'M 0 -212.4 L 3.7 -208 L 0 -203.6 L -3.7 -208 Z';

/** Colours laid over something else, which need an opacity. */
const over = {
  skinShade: 0xe9b3a3,
  skinDeep: 0xe5a898,
  nose: 0xdfa394,
  lowerLid: 0x9a5f6a,
  crease: 0xb97972,
  lidShadow: 0xb4a3d4,
  hairShadow: 0xd96fa5,
  hairDeep: 0xab4a80,
  hairLit: 0xffd0e4,
  hairLine: 0x9c4176,
  energy: 0xff5fd8,
};

/** How one eye is drawn, by face. */
interface EyeLook {
  /** How far open the eye is; under 0.12 it is shut. */
  open: number;
  /** The almond's turn in radians: negative lifts its outer corner. */
  tilt: number;
  /** How hard the foot of the iris burns; above 1 it is meant to glow. */
  burn: number;
  /** The iris's size beside the eye's. */
  iris: number;
  size: number;
  /** Shut: which way the lash bows. Negative, down. */
  bow: number;
}

const EYES: Record<FaceId, EyeLook> = {
  idle: { open: 1, tilt: -0.05, burn: 0.5, iris: 1, size: 1, bow: 0 },
  smug: { open: 0.5, tilt: -0.2, burn: 0.45, iris: 1, size: 1, bow: 0 },
  surprised: { open: 1.1, tilt: -0.03, burn: 0.3, iris: 0.84, size: 1.05, bow: 0 },
  angry: { open: 0.58, tilt: -0.3, burn: 0.8, iris: 1, size: 1, bow: 0 },
  hurt: { open: 0, tilt: -0.06, burn: 0.4, iris: 1, size: 1, bow: -1 },
  awakened: { open: 0.95, tilt: -0.26, burn: 1.6, iris: 1, size: 1.04, bow: 0 },
  defeated: { open: 0, tilt: 0.04, burn: 0, iris: 1, size: 1, bow: -0.5 },
};

/** A brow of the right eye: where its curve starts, the point it bends round, and where it ends. */
interface Brow {
  from: readonly [number, number];
  by: readonly [number, number];
  to: readonly [number, number];
}

const BROWS: Record<FaceId, Brow> = {
  idle: { from: [12.2, -182.4], by: [22, -187], to: [31.2, -182.8] },
  smug: { from: [12.2, -185], by: [22, -189.6], to: [31.2, -185.6] },
  surprised: { from: [12.2, -187.2], by: [22, -192], to: [31.2, -188.2] },
  angry: { from: [11.6, -176], by: [20.5, -180.6], to: [31.6, -186.4] },
  hurt: { from: [11.6, -183.6], by: [20.5, -181.8], to: [31.6, -177.4] },
  awakened: { from: [11.6, -177.4], by: [20.5, -182.4], to: [31.6, -188.6] },
  defeated: { from: [11.6, -182.6], by: [20.5, -180.2], to: [31.6, -176] },
};

/** The brow that disagrees on a lopsided face: the left one. */
const LEFT_BROWS: Partial<Record<FaceId, Brow>> = {
  smug: { from: [12.2, -179.4], by: [22, -182], to: [31.2, -179] },
};

/**
 * One lock of the fringe: a stroke that starts wide at the crown, bows outwards and ends in a
 * point. Its centre line, with the lock's width at each point of it.
 */
function lockLine(lock: readonly [number, number, number, number]): [number, number, number][] {
  const [tx, ty, bow, root] = lock;
  const sx = tx * 0.06;
  const sy = -222 + Math.abs(tx) * 0.12;
  const cx = sx + (tx - sx) * 0.45 + bow;
  const cy = (sy + ty) / 2 - 3;
  return quadPoints(sx, sy, cx, cy, tx, ty, 14).map(([x, y], i) => [x, y, root + ((0.4 - root) * i) / 13]);
}

function drawEye(ctx: CanvasRenderingContext2D, eye: EyeLook, side: Side): void {
  // The fold above the lid stays put while the lid itself comes down and the almond turns about its
  // lower lid.
  keyedStroke(
    ctx,
    CREASE,
    [
      [0, 0.2],
      [0.5, 0.95],
      [1, 0.2],
    ],
    rgba(over.crease, 0.75),
    side,
  );

  ctx.save();
  ctx.translate(EYE_X, EYE_Y);
  ctx.rotate(eye.tilt);
  ctx.scale(eye.size, eye.size);
  if (eye.open < 0.12) {
    // Shut: the lash alone, bowed the way the face feels.
    keyedStroke(
      ctx,
      quadCurve(-11, 2, 0, 1 - 9 * eye.bow, 11, -1.6, 10),
      [
        [0, 0.6],
        [0.45, 3.1],
        [1, 1.3],
      ],
      INK.lash,
    );
    ctx.restore();
    return;
  }
  ctx.translate(0, 9.3);
  ctx.scale(1, eye.open);
  ctx.translate(0, -9.3);

  // The white, in the shadow of the lid at the top of it.
  trace(ctx, EYE);
  ctx.fillStyle = shadeY(ctx, -10, 2, [
    [0, '#e4dcf2'],
    [1, '#ffffff'],
  ]);
  ctx.fill();

  ctx.save();
  trace(ctx, EYE);
  ctx.clip();

  // The iris, taller than the eye is open: the lid takes its top, the lower lid its foot. It sits a
  // touch towards the inner corner, so more of the white shows on the outer side than the inner.
  const rx = 8.7 * eye.iris;
  const ry = 10.3 * eye.iris;
  const ix = -0.8;
  ctx.beginPath();
  ctx.ellipse(ix, 0.3, rx, ry, 0, 0, TAU);
  ctx.fillStyle = shadeY(ctx, -10, 10.6, [
    [0, INK.irisTop],
    [0.45, INK.irisMid],
    [1, INK.irisLow],
  ]);
  ctx.fill();
  // The light it catches at its foot, and the shadow the lid throws on its crown.
  ctx.fillStyle = glow(ctx, ix, 7.6, rgba(0xffd6f6, 0.5 + 0.3 * eye.burn), 2.5, 8.6 * eye.iris);
  ctx.fillRect(-11, -2, 22, 15);
  ctx.fillStyle = shadeY(ctx, -10, 1, [
    [0, rgba(0x2c1145, 0.5)],
    [1, rgba(0x2c1145, 0)],
  ]);
  ctx.fillRect(-11, -11, 22, 13);
  // A rim, and the pupil.
  ctx.beginPath();
  ctx.ellipse(ix, 0.3, rx, ry, 0, 0, TAU);
  ctx.lineWidth = 1.1;
  ctx.strokeStyle = INK.irisRim;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(ix, -0.6, 3.1 * eye.iris, 4.8 * eye.iris, 0, 0, TAU);
  ctx.fillStyle = INK.pupil;
  ctx.fill();
  // A crescent of light round the foot of the iris, just inside its rim: what makes it glassy.
  tapered(
    ctx,
    Array.from({ length: 9 }, (_, i) => {
      const angle = (40 + (i * 100) / 8) * (Math.PI / 180);
      return [
        ix + Math.cos(angle) * rx * 0.84,
        0.3 + Math.sin(angle) * ry * 0.84,
        0.2 + 1.8 * Math.sin((i / 8) * Math.PI),
      ];
    }),
    rgba(0xffe6fa, 0.6),
  );

  // The lid's shadow: a soft band just inside the upper lid.
  keyedStroke(
    ctx,
    LID,
    [
      [0, 0.4],
      [0.45, 5],
      [1, 2],
    ],
    rgba(over.lidShadow, 0.45),
  );
  ctx.restore();

  // Catchlights: one large high on the lit side of the eye, one small low on the other. The lit
  // side is the left of each eye in the world, which inside the mirror of the left eye is its right.
  ctx.beginPath();
  ctx.ellipse(ix - side * 2.6, -4.4, 3.5 * eye.iris, 3.9 * eye.iris, 0, 0, TAU);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(ix + side * 4.8, 4.4, 1.5 * eye.iris, 0, TAU);
  ctx.fillStyle = rgba(0xffffff, 0.92);
  ctx.fill();

  // The lower lid, a fine line that keeps its distance from the white.
  keyedStroke(
    ctx,
    LOWER_LID,
    [
      [0, 0.2],
      [0.6, 0.9],
      [1, 0.5],
    ],
    rgba(over.lowerLid, 0.8),
  );

  // The lash: fine at the inner corner, thickest over the peak of the lid, and drawn out past the
  // outer corner into a point that turns up. Two lashes stand off it near the outer corner.
  keyedStroke(
    ctx,
    LASH,
    [
      [0, 0.7],
      [0.13, 2.8],
      [0.33, 3.5],
      [0.56, 2.8],
      [0.66, 2.3],
      [1, 0.3],
    ],
    INK.lash,
  );
  for (const [x0, y0, cx, cy, x1, y1, w] of [
    [7.4, -9.2, 8.6, -11, 9.6, -13.4, 1.3],
    [3.6, -9.9, 4.4, -11.4, 5.2, -13.6, 1.1],
  ] as const) {
    keyedStroke(
      ctx,
      quadCurve(x0, y0, cx, cy, x1, y1, 5),
      [
        [0, w],
        [1, 0.15],
      ],
      INK.lash,
    );
  }
  ctx.restore();
}

function drawMouth(ctx: CanvasRenderingContext2D, face: FaceId): void {
  const line = (x0: number, y0: number, cx: number, cy: number, x1: number, y1: number): void => {
    keyedStroke(
      ctx,
      quadCurve(x0, y0, cx, cy, x1, y1, 8),
      [
        [0, 0.5],
        [0.5, 1.4],
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
      open(5.6, -144.6, -138.6);
      return;
    case 'awakened':
      // Laughing.
      open(6, -144.4, -137.6);
      return;
    case 'smug':
      // A smirk, lifted at its right corner.
      line(-3.6, -143.2, 1.4, -140.4, 5.6, -144.2);
      return;
    case 'surprised':
      ctx.beginPath();
      ctx.ellipse(0, -141.8, 2.6, 3.4, 0, 0, TAU);
      ctx.fillStyle = INK.mouthIn;
      ctx.fill();
      return;
    case 'hurt':
      // Gritted: pressed flat.
      tapered(
        ctx,
        [
          [-5, -142.4, 0.9],
          [0, -141.4, 2.3],
          [5, -142.4, 0.9],
        ],
        INK.mouth,
      );
      return;
    case 'defeated':
      // Turned down at its corners.
      line(-4.4, -141.6, 0, -145.2, 4.4, -141.6);
      return;
    default:
      // A small smile, with the light on the lip below it.
      line(-4.8, -143.8, 0, -140.6, 4.8, -143.8);
      ctx.beginPath();
      ctx.ellipse(0.4, -139.8, 2.3, 0.8, 0, 0, TAU);
      ctx.fillStyle = rgba(0xffb9c4, 0.75);
      ctx.fill();
  }
}

/** The hair behind everything: a mass that falls to the small of her back and ends in points. */
export function drawBackHair(ctx: CanvasRenderingContext2D): void {
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
}

/** The face with its eyes, nose and mouth, and the brows above them. */
function drawFace(ctx: CanvasRenderingContext2D, face: FaceId): void {
  fillPath(ctx, NECK, INK.skin);
  ctx.save();
  trace(ctx, NECK);
  ctx.clip();
  fillPath(ctx, NECK_SHADOW, rgba(over.skinDeep, 0.85));
  ctx.restore();

  fillPath(ctx, SKULL, INK.skin);
  ctx.save();
  trace(ctx, SKULL);
  ctx.clip();
  // The cheek away from the light, no more than a breath of it.
  ctx.fillStyle = shade(ctx, 28, 0, 41, 0, [
    [0, rgba(over.skinDeep, 0)],
    [1, rgba(over.skinDeep, 0.3)],
  ]);
  ctx.fillRect(28, -227, 14, 112);
  // The blush.
  for (const side of SIDES) {
    ctx.save();
    ctx.translate(side * 25.5, -151);
    ctx.scale(1, 0.42);
    ctx.fillStyle = glow(ctx, 0, 0, rgba(0xff9db2, 0.32), 6, 13);
    ctx.fillRect(-13, -13, 26, 26);
    ctx.restore();
  }
  // The fringe's shadow on the forehead: the fringe itself, a little lower, held inside the face.
  ctx.translate(0, 3.4);
  fillPath(ctx, CAP, rgba(over.skinShade, 0.75));
  for (const side of SIDES) {
    for (const lock of LOCKS) tapered(ctx, lockLine(lock), rgba(over.skinShade, 0.75), side);
  }
  ctx.restore();

  for (const side of SIDES) {
    strokePath(ctx, JAW, 1.1, INK.skinLine, side);
  }
  strokePath(ctx, CHIN, 1.1, INK.skinLine);

  // The nose: a short stroke.
  tapered(
    ctx,
    [
      [2.2, -156, 0.5],
      [3.6, -152.8, 1.25],
      [1.8, -150.2, 0.7],
    ],
    rgba(over.nose, 0.85),
  );

  const eye = EYES[face];
  for (const side of SIDES) {
    ctx.save();
    if (side < 0) ctx.scale(-1, 1);
    drawEye(ctx, eye, side);
    ctx.restore();
  }

  // The brows: thick at their inner end, drawn out to a point.
  const brow = BROWS[face];
  for (const side of SIDES) {
    const one = (side < 0 ? LEFT_BROWS[face] : undefined) ?? brow;
    keyedStroke(
      ctx,
      quadCurve(one.from[0], one.from[1], one.by[0], one.by[1], one.to[0], one.to[1], 8),
      [
        [0, 2.3],
        [0.5, 2.0],
        [1, 0.8],
      ],
      INK.brow,
      side,
    );
  }

  drawMouth(ctx, face);
}

/** The fringe: the cap over the forehead, and the locks that fall from the crown over it. */
function drawBangs(ctx: CanvasRenderingContext2D): void {
  fillPath(ctx, CAP, INK.hair);
  ctx.save();
  trace(ctx, CAP);
  ctx.clip();
  // Lit from the upper left: brighter on that side, a shade deeper on the other.
  ctx.fillStyle = shade(ctx, -40, 0, 44, 0, [
    [0, rgba(over.hairLit, 0.3)],
    [0.5, rgba(over.hairLit, 0)],
    [1, rgba(over.hairDeep, 0.26)],
  ]);
  ctx.fillRect(-46, -236, 92, 84);
  ctx.restore();
  strokePath(ctx, CAP_TOP, 1.25, INK.hairLine);

  // The locks, outermost first so each one inside lies over the one before it. Each is in shadow
  // down the edge away from the light and lit down the other; only the lit edge has a line, since
  // that is the edge that shows against the lock it lies over. Both begin a little way down the
  // lock: where the locks leave the crown they are one mass, and lines there would gather into a star.
  for (const side of SIDES) {
    for (const lock of LOCKS) {
      const line = lockLine(lock);
      const last = line.length - 1;
      // The lock's shadow on the one under it, down and to the right of it: only down its upper
      // stretch, so that it stays on the fringe and never falls across the forehead.
      tapered(
        ctx,
        line.slice(0, 10).map(([x, y, w]) => [x + side * 2.2, y + 2.8, w * 0.9]),
        rgba(over.hairShadow, 0.45),
        side,
      );
      tapered(ctx, line, INK.hair, side);
      tapered(
        ctx,
        line.slice(5).map(([x, y, w], i) => {
          const t = i / (last - 5);
          return [x + side * w * 0.5, y, w * 0.5 * (1 - t) + 0.2 * t];
        }),
        rgba(over.hairShadow, 0.85),
        side,
      );
      tapered(
        ctx,
        line.slice(7).map(([x, y, w], i) => {
          const t = i / (last - 7);
          return [x - side * w * 0.42, y, 1.2 * (1 - t) + 0.2 * t];
        }),
        INK.hairLine,
        side,
      );
    }
  }

  // The sheen across the crown lies over the cap and the locks alike.
  ctx.save();
  trace(ctx, CAP);
  ctx.clip();
  trace(ctx, RING);
  ctx.fillStyle = shadeY(ctx, -220, -203, [
    [0, rgba(over.hairLit, 0.2)],
    [1, rgba(over.hairLit, 0.95)],
  ]);
  ctx.fill();
  ctx.restore();

  // A few strands come loose at the crown.
  for (const side of SIDES)
    quadStroke(ctx, 20, -224, 30, -233, 38, -231, 0.2, 1.1, rgba(over.hairLine, 0.7), side, 6);
}

/** The locks that fall in front of the shoulders, over the armour. */
function drawSideLocks(ctx: CanvasRenderingContext2D): void {
  for (const side of SIDES) {
    // The lock's shadow on the hair behind it: down and to the right, on either side of the head.
    ctx.save();
    ctx.translate(2.2, 3.4);
    fillPath(ctx, SIDE_LOCK, rgba(over.hairDeep, 0.5), side);
    ctx.restore();
    // The edge away from the light is the one further out on the right, further in on the left.
    fillPath(
      ctx,
      SIDE_LOCK,
      shade(ctx, side * 33, 0, side * 51, 0, [
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
    ctx.fillStyle = shadeY(ctx, -70, -11, [
      [0, rgba(over.hairLit, 0)],
      [1, rgba(over.hairLit, 0.45)],
    ]);
    ctx.fillRect(30, -80, 22, 72);
    keyedStroke(
      ctx,
      quadCurve(39.8, -176, 42.2, -120, 41.6, -60, 12),
      [
        [0, 0.3],
        [0.5, 1.3],
        [1, 0.3],
      ],
      rgba(over.hairLine, 0.45),
      side,
    );
    ctx.restore();
    strokePath(ctx, SIDE_LOCK, 1.2, INK.hairLine, side);
  }
}

/** What she wears on her head: an ear unit over each ear, a coronet, and the halo. */
function drawHeadgear(ctx: CanvasRenderingContext2D): void {
  for (const side of SIDES) {
    // A fin standing off the unit, then the unit itself: a disc of silver lit from the upper left,
    // with a light at its centre that spills out past it.
    const x = side * 40.2;
    fillPath(ctx, FIN, INK.silver, side);
    strokePath(ctx, FIN, 0.9, INK.silverDeep, side);
    ctx.fillStyle = glow(ctx, x, -158, rgba(over.energy, 0.45), 4.5, 16);
    ctx.fillRect(x - 16, -174, 32, 32);
    ctx.beginPath();
    ctx.arc(x, -158, 9.2, 0, TAU);
    ctx.fillStyle = shade(ctx, x - 7, -165, x + 7, -151, [
      [0, '#eceef6'],
      [0.55, INK.silver],
      [1, INK.silverShade],
    ]);
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = INK.silverDeep;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, -158, 4.5, 0, TAU);
    ctx.fillStyle = shade(ctx, x - 3, -161, x + 3, -155, [
      [0, '#ffffff'],
      [0.4, INK.energySoft],
      [1, INK.energy],
    ]);
    ctx.fill();
  }

  // The coronet: a stone set in the fringe over the part.
  ctx.fillStyle = glow(ctx, 0, -208, rgba(over.energy, 0.5), 3, 12);
  ctx.fillRect(-12, -220, 24, 24);
  fillPath(
    ctx,
    CORONET,
    shade(ctx, -3, -212, 3, -204, [
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
    ctx.ellipse(0, -243, 30, 6.6, 0, 0, TAU);
    ctx.lineWidth = width;
    ctx.strokeStyle = rgba(over.energy, alpha);
    ctx.stroke();
  }
  fillPath(ctx, 'M 0 -247.4 L 2.4 -243.6 L 0 -239.8 L -2.4 -243.6 Z', '#ffd0f4');
}

/** Everything in front of the body: the face with its brows, the fringe over them, the locks and the headgear. */
export function drawHead(ctx: CanvasRenderingContext2D, face: FaceId): void {
  drawFace(ctx, face);
  drawBangs(ctx);
  drawSideLocks(ctx);
  drawHeadgear(ctx);
}

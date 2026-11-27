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
  quadStroke,
  rgba,
  shade,
  shadeY,
  stretch,
  strokePath,
  tapered,
  trace,
} from './brush';
import { INK } from './palette';

/**
 * 绯樱's head, drawn with Canvas 2D in figure units: x to the right, y down, the origin at the top
 * of the breastbone. The crown is at -224 and the chin at -116, so the head stands 108 tall, and
 * everything on it is placed by the standard proportions of an anime face read against that:
 *
 *   the eyes   a little over half way down the head, one eye's width apart, each about a fifth of
 *              the head's height wide
 *   the nose   half way from the eyes to the chin
 *   the mouth  half way from the nose to the chin
 *   the face   three quarters of the head's height wide at the cheeks
 *
 * Shapes written for the right of the head are mirrored for the left. What must not mirror — the
 * light, which comes from the upper left — is chosen separately for each side.
 */

type Side = 1 | -1;

const SIDES: readonly Side[] = [-1, 1];

/** The head: round on top, drawn in along the cheeks to a small chin. */
const SKULL =
  'M 0 -226 C 23 -226 40 -209 40.5 -185 C 40.8 -171 39 -158 33 -146 C 27 -134.5 16 -123.5 6 -118.4 C 2 -116.6 -2 -116.6 -6 -118.4 C -16 -123.5 -27 -134.5 -33 -146 C -39 -158 -40.8 -171 -40.5 -185 C -40 -209 -23 -226 0 -226 Z';

/** The right cheek and jaw: the stretch of the contour that carries a line. */
const JAW = 'M 40.5 -185 C 40.8 -171 39 -158 33 -146 C 27 -134.5 16 -123.5 6 -118.4';

/** The neck, from under the jaw down to the collar. */
const NECK = 'M -15 -128 C -8 -119 8 -119 15 -128 L 15 -100 L -15 -100 Z';

/** The shadow the jaw throws on the neck. */
const NECK_SHADOW = 'M -15 -128 C -8 -118 8 -118 15 -128 L 15 -110 C 7 -105 -7 -105 -15 -110 Z';

/** The right eye wide open: an almond with a high upper lid, its inner corner the lower. */
const EYE =
  'M 10.6 -159.4 C 13 -169.6 18.5 -173.8 23.5 -173.6 C 28.5 -173.4 32.4 -168 33 -162.2 C 30.5 -155.6 15 -154.2 10.6 -159.4 Z';

/** The upper lid of that eye, in two stretches that meet at its peak. */
const LID = joined(
  cubicPoints(10.6, -159.4, 13, -169.6, 18.5, -173.8, 23.5, -173.6, 9),
  cubicPoints(23.5, -173.6, 28.5, -173.4, 32.4, -168, 33, -162.2, 8),
);

/** Its lower lid, from the inner corner round to the outer one. */
const LOWER_LID = cubicPoints(10.6, -159.4, 15, -154.2, 30.5, -155.6, 33, -162.2, 12);

/**
 * The fringe in one piece: a mass round the top of the head whose hem parts into locks. Each lock
 * is a lobe between two valleys, one edge of it swelling and the other drawn in, which is what
 * makes it read as a lock rather than as a tooth. It is parted in the middle.
 */
const BANGS =
  'M -40.5 -170 C -43 -188 -39 -210 -27 -221 C -15 -231.5 15 -231.5 27 -221 C 39 -210 43 -188 40.5 -170 ' +
  'Q 41.5 -166 40 -162 Q 39.2 -171 35.6 -177.2 Q 32.6 -174.6 28.4 -173.4 Q 23.6 -172.2 20.2 -181.4 ' +
  'Q 15.6 -179 11.2 -176.6 Q 5.8 -175 1.6 -185 Q 0 -188 -1.6 -185 ' +
  'Q -5.8 -175 -11.2 -176.6 Q -15.6 -179 -20.2 -181.4 Q -23.6 -172.2 -28.4 -173.4 Q -32.6 -174.6 -35.6 -177.2 ' +
  'Q -39.2 -171 -40.5 -170 Z';

/**
 * A lock laid over the fringe: it starts at the part, sweeps across the forehead and ends in a
 * point above the outer corner of the eye. Two of these give the fringe its layering. Its inner
 * edge is the part itself, which is why it has no line of its own.
 */
const SWEEP =
  'M 0 -225 C 14 -226 27 -214 32.5 -197 C 35.5 -188.5 35 -180 31.5 -174.5 ' +
  'C 28.5 -180.5 24.5 -185.5 19.5 -188.5 C 12 -192.5 4 -193.5 0 -192 Z';

/** The outline of that lock: over the crown, round its bend, down to its point. */
const SWEEP_EDGE = joined(
  cubicPoints(0, -225, 14, -226, 27, -214, 32.5, -197, 10),
  cubicPoints(32.5, -197, 35.5, -188.5, 35, -180, 31.5, -174.5, 8),
);

/** Its lower edge, from the point back to the part: the edge that carries its shadow. */
const SWEEP_SHADOW = joined(
  cubicPoints(31.5, -174.5, 28.5, -180.5, 24.5, -185.5, 19.5, -188.5, 7),
  cubicPoints(19.5, -188.5, 12, -192.5, 4, -193.5, 0, -192, 7),
);

type Edge = readonly [number, number, number, number, number, number];

/** The edges of the right half of the fringe, each a quadratic curve. */
const EDGE = {
  /** From the part down to the point of the lock beside it. */
  part: [1.6, -185, 5.8, -175, 11.2, -176.6],
  /** From the valley right of that lock, down to its point. */
  innerRight: [20.2, -181.4, 15.6, -179, 11.2, -176.6],
  /** From that valley down to the point of the next lock out. */
  midLeft: [20.2, -181.4, 23.6, -172.2, 28.4, -173.4],
  /** From the valley right of that lock, down to its point. */
  midRight: [35.6, -177.2, 32.6, -174.6, 28.4, -173.4],
  /** From that valley down to the point of the lock at the temple. */
  outerLeft: [35.6, -177.2, 39.2, -171, 40, -162],
  /** From the side of the head down to that point. */
  outerRight: [40.5, -170, 41.5, -166, 40, -162],
} as const;

/** The band of sheen across the crown: its lower edge cut into teeth, its upper edge soft. */
const RING =
  'M -31 -213 Q 0 -222 31 -213 L 26 -204.5 L 21 -209 L 16 -203 L 11 -208 L 6 -202 L 1.5 -206.8 ' +
  'L -1.5 -206.8 L -6 -202 L -11 -208 L -16 -203 L -21 -209 L -26 -204.5 Z';

/** The lock that falls in front of the right shoulder. */
const SIDE_LOCK =
  'M 34 -206 C 44 -198 49.6 -180 48.8 -160 C 48.2 -141 44 -125 41.8 -110 C 39.8 -88 44 -62 46.6 -40 ' +
  'C 47.6 -30 45.6 -19 41.4 -11 C 40.6 -22 39 -36 38 -52 C 36.4 -78 36.8 -98 37.8 -116 ' +
  'C 38.8 -136 37.2 -150 35.6 -166 C 34.6 -180 34.4 -194 34 -206 Z';

/** All the hair behind the head and the body, ending in points along the small of the back. */
const BACK_HAIR =
  'M 0 -234 C 29 -234 47 -218 50.5 -194 C 54 -170 55 -144 60 -116 C 64 -90 63 -56 59 -24 C 56.5 -4 54 14 50 30 ' +
  'Q 47.5 39 44 22 Q 40.5 37 37 46 Q 32.5 37 27 27 Q 22 41 16 53 Q 8 43 0 31 Q -8 43 -16 53 Q -22 41 -27 27 ' +
  'Q -32.5 37 -37 46 Q -40.5 37 -44 22 Q -47.5 39 -50 30 C -54 14 -56.5 -4 -59 -24 C -63 -56 -64 -90 -60 -116 ' +
  'C -55 -144 -54 -170 -50.5 -194 C -47 -218 -29 -234 0 -234 Z';

/** The fin that stands off the right ear unit, up and out. */
const FIN = 'M 44 -162.5 Q 50 -166.5 56.8 -172 Q 49.6 -171 44.4 -166.2 Z';

/** The stone of the coronet. */
const CORONET = 'M 0 -211.4 L 3.7 -207 L 0 -202.6 L -3.7 -207 Z';

/** Colours laid over something else, which need an opacity. */
const over = {
  skinShade: 0xe9b3a3,
  skinDeep: 0xe5a898,
  nose: 0xdfa394,
  lowerLid: 0x8f5f6c,
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
  idle: { open: 1, tilt: -0.06, burn: 0.5, iris: 1, size: 1, bow: 0 },
  smug: { open: 0.5, tilt: -0.24, burn: 0.45, iris: 1, size: 1, bow: 0 },
  surprised: { open: 1.1, tilt: -0.03, burn: 0.3, iris: 0.84, size: 1.05, bow: 0 },
  angry: { open: 0.6, tilt: -0.3, burn: 0.8, iris: 1, size: 1, bow: 0 },
  hurt: { open: 0, tilt: -0.06, burn: 0.4, iris: 1, size: 1, bow: -1 },
  awakened: { open: 0.95, tilt: -0.28, burn: 1.6, iris: 1, size: 1.04, bow: 0 },
  defeated: { open: 0, tilt: 0.04, burn: 0, iris: 1, size: 1, bow: -0.5 },
};

/** A brow of the right eye: where its curve starts, the point it bends round, and where it ends. */
interface Brow {
  from: readonly [number, number];
  by: readonly [number, number];
  to: readonly [number, number];
}

const BROWS: Record<FaceId, Brow> = {
  idle: { from: [11.4, -178.6], by: [22, -184], to: [33.6, -179.8] },
  smug: { from: [11.4, -181.6], by: [22, -186.6], to: [33.6, -182.4] },
  surprised: { from: [11.4, -184], by: [22, -189.6], to: [33.6, -185] },
  angry: { from: [10.8, -171.6], by: [20, -176.6], to: [33.6, -183.2] },
  hurt: { from: [10.8, -180.2], by: [20, -178.2], to: [33.6, -173.8] },
  awakened: { from: [10.8, -173.4], by: [20, -178.6], to: [33.6, -185.6] },
  defeated: { from: [10.8, -179], by: [20, -176.4], to: [33.6, -172.2] },
};

/** The brow that disagrees on a lopsided face: the left one. */
const LEFT_BROWS: Partial<Record<FaceId, Brow>> = {
  smug: { from: [11.4, -175.6], by: [22, -178.6], to: [33.6, -175.2] },
};

/** A stroke along one of the fringe's edges: its wide end at the valley, nothing at the point. */
function edgeStroke(
  ctx: CanvasRenderingContext2D,
  edge: Edge,
  wide: number,
  style: string,
  side: Side,
): void {
  quadStroke(ctx, edge[0], edge[1], edge[2], edge[3], edge[4], edge[5], wide, 0.25, style, side, 12);
}

function drawEye(ctx: CanvasRenderingContext2D, eye: EyeLook, side: Side): void {
  // The crease of the lid stays put while the lid itself comes down and the almond turns about
  // the line of its lower lid.
  keyedStroke(
    ctx,
    quadCurve(14.2, -170.6, 22, -176.4, 30.2, -171.4, 8),
    [
      [0, 0.25],
      [0.5, 1.05],
      [1, 0.25],
    ],
    rgba(over.crease, 0.8),
    side,
  );

  ctx.save();
  ctx.translate(21.8, -155.5);
  ctx.rotate(eye.tilt);
  ctx.scale(eye.size, eye.size);
  if (eye.open < 0.12) {
    // Shut: the lash alone, bowed the way the face feels.
    keyedStroke(
      ctx,
      quadCurve(10.6, -160.2, 21.8, -162 - 9 * eye.bow, 33, -161.4, 10),
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
  ctx.scale(1, eye.open);
  ctx.translate(-21.8, 155.5);

  // The white, in the shadow of the lid at the top of it.
  trace(ctx, EYE);
  ctx.fillStyle = shadeY(ctx, -173.8, -158, [
    [0, '#d9d0ee'],
    [1, '#ffffff'],
  ]);
  ctx.fill();

  ctx.save();
  trace(ctx, EYE);
  ctx.clip();

  // The iris: deep at the top, lit at the foot, where its light spills into the white below it.
  ctx.beginPath();
  ctx.ellipse(21.9, -161.2, 8.3 * eye.iris, 10.8 * eye.iris, 0, 0, TAU);
  ctx.fillStyle = shadeY(ctx, -172.4, -150, [
    [0, INK.irisTop],
    [0.5, INK.irisMid],
    [1, INK.irisLow],
  ]);
  ctx.fill();
  ctx.fillStyle = glow(ctx, 21.9, -153.6, rgba(0xffd6f6, 0.5 + 0.3 * eye.burn), 3, 9 * eye.iris);
  ctx.fillRect(9, -164, 26, 15);
  ctx.beginPath();
  ctx.ellipse(21.9, -161.2, 8.3 * eye.iris, 10.8 * eye.iris, 0, 0, TAU);
  ctx.lineWidth = 1;
  ctx.strokeStyle = INK.irisRim;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(21.9, -161.8, 2.9 * eye.iris, 5.8 * eye.iris, 0, 0, TAU);
  ctx.fillStyle = INK.pupil;
  ctx.fill();

  // The lid's shadow: a soft band just inside the upper lid.
  keyedStroke(
    ctx,
    LID,
    [
      [0, 0.5],
      [0.45, 6],
      [1, 2.5],
    ],
    rgba(over.lidShadow, 0.5),
  );
  ctx.restore();

  // Catchlights, the large one high on the lit side of the eye and the small one low on the other.
  ctx.beginPath();
  ctx.arc(21.9 - side * 3.5, -165.6, 3.5 * eye.iris, 0, TAU);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(21.9 + side * 3.3, -157.4, 1.6 * eye.iris, 0, TAU);
  ctx.fillStyle = rgba(0xffffff, 0.92);
  ctx.fill();

  // The lower lid: a fine line along the outer stretch of it.
  keyedStroke(
    ctx,
    stretch(LOWER_LID, 0.4, 1),
    [
      [0, 0.15],
      [0.6, 0.85],
      [1, 0.7],
    ],
    rgba(over.lowerLid, 0.8),
  );

  // The lash: fine at the inner corner, thickest over the peak of the lid, with a flick past the
  // outer corner.
  keyedStroke(
    ctx,
    LID,
    [
      [0, 0.7],
      [0.18, 2.6],
      [0.45, 3.7],
      [0.8, 3],
      [1, 2.3],
    ],
    INK.lash,
  );
  keyedStroke(
    ctx,
    quadCurve(33, -162.2, 34.8, -165.4, 36.8, -167.6, 5),
    [
      [0, 2.4],
      [1, 0.3],
    ],
    INK.lash,
  );
  ctx.restore();
}

function drawMouth(ctx: CanvasRenderingContext2D, face: FaceId): void {
  const line = (x0: number, y0: number, cx: number, cy: number, x1: number, y1: number): void => {
    keyedStroke(
      ctx,
      quadCurve(x0, y0, cx, cy, x1, y1, 8),
      [
        [0, 0.6],
        [0.5, 1.5],
        [1, 0.6],
      ],
      INK.mouth,
    );
  };
  /** An open mouth, `wide` across, its upper lip at `lip` and its foot at `low`. */
  const open = (wide: number, lip: number, low: number): void => {
    const top = -wide * 0.72;
    const shape = `M ${-wide} ${lip} Q 0 ${lip + 2} ${wide} ${lip} Q ${top} ${low - 2.4} 0 ${low} Q ${-top} ${low - 2.4} ${-wide} ${lip} Z`;
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
      open(6, -131.4, -123.6);
      return;
    case 'awakened':
      // Laughing.
      open(6.5, -131.2, -122.6);
      return;
    case 'smug':
      // A smirk, lifted at its right corner.
      line(-3.6, -129.4, 1.4, -126.6, 5.6, -130.4);
      return;
    case 'surprised':
      ctx.beginPath();
      ctx.ellipse(0, -128.6, 2.6, 3.4, 0, 0, TAU);
      ctx.fillStyle = INK.mouthIn;
      ctx.fill();
      return;
    case 'hurt':
      // Gritted: pressed flat.
      tapered(
        ctx,
        [
          [-5, -128.9, 0.9],
          [0, -127.9, 2.3],
          [5, -128.9, 0.9],
        ],
        INK.mouth,
      );
      return;
    case 'defeated':
      // Turned down at its corners.
      line(-4.4, -127.4, 0, -131, 4.4, -127.4);
      return;
    default:
      // A small smile, with the light on the lip below it.
      line(-4.6, -130, 0, -126.6, 4.6, -130);
      ctx.beginPath();
      ctx.ellipse(0.4, -125.2, 2.2, 0.8, 0, 0, TAU);
      ctx.fillStyle = rgba(0xffb9c4, 0.75);
      ctx.fill();
  }
}

/** The hair behind everything: a mass that falls to the small of her back and ends in points. */
export function drawBackHair(ctx: CanvasRenderingContext2D): void {
  fillPath(
    ctx,
    BACK_HAIR,
    shadeY(ctx, -234, 53, [
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
  ctx.fillStyle = glow(ctx, 0, -112, rgba(over.hairDeep, 0.55), 62, 125);
  ctx.fillRect(-70, -240, 140, 300);
  // The top is lit, most on the side the light comes from.
  for (const side of SIDES) {
    ctx.fillStyle = glow(ctx, side * 44, -204, rgba(over.hairLit, side < 0 ? 0.5 : 0.28), 10, 30);
    ctx.fillRect(-80, -240, 160, 80);
  }
  // The locks it falls in, parted along curved lines. The side of a lock away from the light —
  // to the right of its line, whichever side of the head it is on — lies in shadow, the side
  // towards it is lit.
  const parts: readonly (readonly [number, number, number, number, number, number])[] = [
    [50, -196, 60, -112, 53, -14],
    [42, -150, 50, -80, 38, 40],
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
  ctx.restore();
  strokePath(ctx, BACK_HAIR, 1.25, INK.hairLine);
}

/** The face with its eyes, nose and mouth. */
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
    ctx.translate(side * 26, -145);
    ctx.scale(1, 0.42);
    ctx.fillStyle = glow(ctx, 0, 0, rgba(0xff9db2, 0.32), 6, 13);
    ctx.fillRect(-13, -13, 26, 26);
    ctx.restore();
  }
  // The fringe's shadow on the forehead: the fringe itself, a little lower, held inside the face.
  ctx.translate(0, 3.4);
  fillPath(ctx, BANGS, rgba(over.skinShade, 0.75));
  ctx.restore();

  for (const side of SIDES) strokePath(ctx, JAW, 1.1, INK.skinLine, side);

  // The nose: a short stroke.
  tapered(
    ctx,
    [
      [2.2, -146, 0.5],
      [3.3, -142.6, 1.25],
      [1.7, -139.8, 0.7],
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

  drawMouth(ctx, face);
}

/** The brows: thick at their inner end, drawn out to a point. */
function drawBrows(ctx: CanvasRenderingContext2D, face: FaceId): void {
  const brow = BROWS[face];
  for (const side of SIDES) {
    const one = (side < 0 ? LEFT_BROWS[face] : undefined) ?? brow;
    keyedStroke(
      ctx,
      quadCurve(one.from[0], one.from[1], one.by[0], one.by[1], one.to[0], one.to[1], 8),
      [
        [0, 2.4],
        [0.5, 2.1],
        [1, 0.9],
      ],
      INK.brow,
      side,
    );
  }
}

/** The fringe, over the forehead. */
function drawBangs(ctx: CanvasRenderingContext2D): void {
  fillPath(ctx, BANGS, INK.hair);
  ctx.save();
  trace(ctx, BANGS);
  ctx.clip();
  // Lit from the upper left: brighter on that side, a shade deeper on the other.
  ctx.fillStyle = shade(ctx, -40, 0, 44, 0, [
    [0, rgba(over.hairLit, 0.3)],
    [0.5, rgba(over.hairLit, 0)],
    [1, rgba(over.hairDeep, 0.26)],
  ]);
  ctx.fillRect(-46, -236, 92, 84);
  // Each lock has the edge away from the light in shadow — a soft wash, then a hard band over it
  // — and the edge towards it lit. Left of the part the edges are mirrored, so there they swap.
  const shadowed: readonly Edge[] = [EDGE.innerRight, EDGE.midRight, EDGE.outerRight];
  const lit: readonly Edge[] = [EDGE.part, EDGE.midLeft, EDGE.outerLeft];
  for (const side of SIDES) {
    const inShadow = side > 0 ? shadowed : lit;
    const inLight = side > 0 ? lit : shadowed;
    for (const edge of inShadow) {
      edgeStroke(ctx, edge, 7, rgba(over.hairShadow, 0.32), side);
      edgeStroke(ctx, edge, 3.4, rgba(over.hairShadow, 0.9), side);
    }
    for (const edge of inLight) edgeStroke(ctx, edge, 1.4, rgba(over.hairLit, 0.6), side);
  }
  ctx.restore();

  // Two locks laid over the fringe, each from the part to a temple. Each throws its shadow on the
  // fringe under it — down and to the right, on either side of the part, which is what makes the
  // part read — and is in shadow along its own lower edge. Only its outer edge gets a line.
  for (const side of SIDES) {
    ctx.save();
    trace(ctx, BANGS);
    ctx.clip();
    ctx.translate(side * 1.8, 3.4);
    fillPath(ctx, SWEEP, rgba(over.hairShadow, 0.6), side);
    ctx.restore();
    fillPath(
      ctx,
      SWEEP,
      shadeY(ctx, -225, -174, [
        [0, '#fcc3dd'],
        [1, INK.hair],
      ]),
      side,
    );
    ctx.save();
    trace(ctx, side < 0 ? mirrored(SWEEP) : SWEEP);
    ctx.clip();
    keyedStroke(
      ctx,
      SWEEP_SHADOW,
      [
        [0, 3],
        [1, 1.6],
      ],
      rgba(over.hairShadow, 0.85),
      side,
    );
    ctx.restore();
    keyedStroke(
      ctx,
      SWEEP_EDGE,
      [
        [0, 0.2],
        [0.3, 1.2],
        [1, 0.5],
      ],
      INK.hairLine,
      side,
    );
  }

  // The sheen across the crown lies over the fringe and the locks alike.
  for (const shape of [BANGS, SWEEP, mirrored(SWEEP)]) {
    ctx.save();
    trace(ctx, shape);
    ctx.clip();
    trace(ctx, RING);
    ctx.fillStyle = shadeY(ctx, -219, -202, [
      [0, rgba(over.hairLit, 0.2)],
      [1, rgba(over.hairLit, 0.95)],
    ]);
    ctx.fill();
    ctx.restore();
  }

  strokePath(ctx, BANGS, 1.25, INK.hairLine);
  // A few strands come loose at the crown.
  for (const side of SIDES)
    quadStroke(ctx, 20, -222, 30, -231, 38, -229, 0.2, 1.1, rgba(over.hairLine, 0.7), side, 6);
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
      shade(ctx, side * 33, 0, side * 50, 0, [
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
      quadCurve(39.4, -176, 41.6, -120, 41, -60, 12),
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
    const x = side * 39.6;
    fillPath(ctx, FIN, INK.silver, side);
    strokePath(ctx, FIN, 0.9, INK.silverDeep, side);
    ctx.fillStyle = glow(ctx, x, -154, rgba(over.energy, 0.45), 4.5, 16);
    ctx.fillRect(x - 16, -170, 32, 32);
    ctx.beginPath();
    ctx.arc(x, -154, 9.2, 0, TAU);
    ctx.fillStyle = shade(ctx, x - 7, -161, x + 7, -147, [
      [0, '#eceef6'],
      [0.55, INK.silver],
      [1, INK.silverShade],
    ]);
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = INK.silverDeep;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, -154, 4.5, 0, TAU);
    ctx.fillStyle = shade(ctx, x - 3, -157, x + 3, -151, [
      [0, '#ffffff'],
      [0.4, INK.energySoft],
      [1, INK.energy],
    ]);
    ctx.fill();
  }

  // The coronet: a stone set in the fringe over the part.
  ctx.fillStyle = glow(ctx, 0, -207, rgba(over.energy, 0.5), 3, 12);
  ctx.fillRect(-12, -219, 24, 24);
  fillPath(
    ctx,
    CORONET,
    shade(ctx, -3, -211, 3, -203, [
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
    ctx.ellipse(0, -241, 30, 6.6, 0, 0, TAU);
    ctx.lineWidth = width;
    ctx.strokeStyle = rgba(over.energy, alpha);
    ctx.stroke();
  }
  fillPath(ctx, 'M 0 -245.4 L 2.4 -241.6 L 0 -237.8 L -2.4 -241.6 Z', '#ffd0f4');
}

/** Everything in front of the body: the face, the fringe over it, the brows over that (the way
 * animation draws them, so the fringe cannot hide the expression), the locks and the headgear. */
export function drawHead(ctx: CanvasRenderingContext2D, face: FaceId): void {
  drawFace(ctx, face);
  drawBangs(ctx);
  drawBrows(ctx, face);
  drawSideLocks(ctx);
  drawHeadgear(ctx);
}

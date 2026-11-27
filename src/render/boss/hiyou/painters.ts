import type { BossOptions, Pen } from '../../batch';
import { DEG } from '../../../core/math';
import {
  PART_ARC,
  PART_BLOB,
  PART_EYE,
  PART_FACE,
  PART_FEATHER,
  PART_FRINGE,
  PART_GEM,
  PART_LINE,
  PART_PLATE,
  PART_STRAND,
} from '../../shaders/boss';
import type { BossFrame, FaceId, PartLook } from '../types';
import { Brush } from './brush';
import { HIYOU } from './palette';

/**
 * The painters of 樱之誓约·绯樱: one function per part, each drawing its own layer of the figure
 * from the shapes in `shaders/boss`.
 *
 * They work in figure units (see `Brush`): x to the right, y down, the origin at the top of the
 * breastbone. The head is about 85 units tall and the whole figure stands about 300 from the
 * crown to the hem. Everything paired is written once, for the right, and placed for the left
 * with `side`: a plate only has its place and its turn mirrored (its light stays where it was),
 * while a shape with a handed look — a swept lock, a brow — takes the sign of its sweep from
 * `side` too. A shape whose shading would come out back to front that way (a lock turned on its
 * side, a brow) takes the mirror flag as well, which turns its shading with it.
 */

/** The right of the figure is 1 and the left is -1. */
type Side = 1 | -1;

const SIDES: readonly Side[] = [-1, 1];

/** Ink lines, in world units. She stands near 1:1 on a desktop, so these are close to pixels there. */
const LINE = 2;
const FINE = 1.2;
/** The line round a thin lock laid over hair: fine enough that it reads as a strand, not a sticker. */
const WISP = 0.9;
/** The lash's base width: the shader draws the upper lash about three times thicker than this. */
const LASH = 1.2;
/** The joint the head turns on: the top of the neck. */
const NECK_Y = -112;
/** Where the core sits. */
const CORE_Y = -60;

/**
 * The seed each part's cracks grow from. No two parts share one, or they would crack alike.
 * (The body's is high because its skirt gores take the three after it.)
 */
const SEED = {
  Head: 1,
  Body: 20,
  LeftShoulder: 3,
  RightShoulder: 4,
  LeftWing: 5,
  RightWing: 6,
  LeftArm: 7,
  RightArm: 8,
  CoreShield: 9,
  Core: 10,
} as const;

/** 0, 0.45 or 1: how much of a part's cracks show. */
function damageOf(look: PartLook): number {
  return look.state === 'intact' ? 0 : look.state === 'damaged_1' ? 0.45 : 1;
}

/** The options every plate of a part carries — its damage, its hit flash, its ink line and its seed — with the caller's on top. */
function style(look: PartLook, seed: number, o: BossOptions = {}, outline = LINE): BossOptions {
  return { p2: damageOf(look), flash: look.flash, outline, seed, ...o };
}

// ───────────────────────────── wings ─────────────────────────────

/**
 * One blade of the right wing, in figure units: where it grows from the spar, its angle in degrees
 * (negative: raised), its length and its half width. Uppermost first.
 */
const FEATHERS: readonly (readonly [number, number, number, number, number])[] = [
  [50, -97, -40, 116, 9.5],
  [72, -105, -27, 150, 11.5],
  [93, -112, -15, 182, 13.5],
  [111, -117, -4, 194, 14.5],
  [119, -111, 8, 186, 14],
  [121, -100, 20, 166, 13],
  [119, -89, 32, 140, 11],
  [115, -79, 44, 110, 9],
];

/** Short blades lying over the roots of the long ones. */
const COVERTS: readonly (readonly [number, number, number, number, number])[] = [
  [42, -95, -30, 66, 8.5],
  [60, -103, -12, 76, 9],
  [79, -110, 6, 72, 8],
];

/** The spar's joints: x, y, radius. */
const JOINTS: readonly (readonly [number, number, number])[] = [
  [24, -88, 7],
  [72, -105, 6],
  [119, -119, 8.5],
];

function paintWing(b: Brush, side: Side, look: PartLook, time: number): void {
  if (look.state === 'destroyed') return;
  b.pose(0, 0, 0, look.dx, look.dy);
  const seed = side < 0 ? SEED.LeftWing : SEED.RightWing;

  // The long blades, the lowest first, so each one above it lies over its root. They breathe: the
  // lower ones travel further than the upper. A damaged wing has lost blades from its lower edge.
  for (let i = FEATHERS.length - 1; i >= 0; i--) {
    const [rx, ry, degrees, length, width] = FEATHERS[i]!;
    const lost =
      look.state === 'damaged_2' && i >= FEATHERS.length - 2
        ? 0.42
        : look.state === 'damaged_1' && i === FEATHERS.length - 1
          ? 0.6
          : 1;
    const angle = (degrees + Math.sin(time * 1.7 + i * 0.55) * (0.6 + i * 0.22)) * DEG;
    const reach = length * lost;
    const tx = rx + Math.cos(angle) * reach;
    const ty = ry + Math.sin(angle) * reach;
    b.part(
      PART_FEATHER,
      side * (rx + (tx - rx) / 2),
      ry + (ty - ry) / 2,
      reach / 2,
      width,
      side * angle,
      i % 2 === 0 ? HIYOU.pearl : HIYOU.blade,
      1,
      {
        p0: 0.9,
        p1: 0.7,
        p2: 0.55 + 0.25 * Math.sin(time * 2.1 + i * 1.3),
        flash: look.flash,
        outline: FINE,
      },
    );
    if (lost === 1) b.light(side * tx, ty, 9, 9, HIYOU.energy, 0.3 + 0.12 * Math.sin(time * 2.1 + i), 0.4);
  }

  // The spar the blades grow from.
  b.part(
    PART_PLATE,
    side * 49,
    -97,
    29,
    5.5,
    -side * 0.345,
    HIYOU.steel,
    1,
    style(look, seed, { p0: 1, p1: 0.5 }, FINE),
  );
  b.part(
    PART_PLATE,
    side * 96,
    -112,
    26,
    4.5,
    -side * 0.303,
    HIYOU.steel,
    1,
    style(look, seed + 1, { p0: 1, p1: 0.5 }, FINE),
  );

  for (const [rx, ry, degrees, length, width] of COVERTS) {
    const angle = degrees * DEG;
    b.part(
      PART_FEATHER,
      side * (rx + (Math.cos(angle) * length) / 2),
      ry + (Math.sin(angle) * length) / 2,
      length / 2,
      width,
      side * angle,
      HIYOU.pearl,
      1,
      { p0: 0.95, p1: 0.5, p2: 0.3, flash: look.flash, outline: FINE },
    );
  }

  // The joints on top, each with a pin of light.
  for (const [jx, jy, radius] of JOINTS) {
    b.part(
      PART_PLATE,
      side * jx,
      jy,
      radius,
      radius,
      0,
      HIYOU.silver,
      1,
      style(look, seed, { p0: 1, p1: 1 }, FINE),
    );
    b.light(side * jx, jy, radius * 2.4, radius * 2.4, HIYOU.energy, 0.45, 0.6);
    b.part(PART_PLATE, side * jx, jy, radius * 0.42, radius * 0.42, 0, HIYOU.energy, 1, {
      p0: 1,
      flash: look.flash,
    });
  }
}

// ───────────────────────────── hair behind ─────────────────────────────

function paintHairBack(b: Brush, look: PartLook, tilt: number): void {
  if (look.state === 'destroyed') return;
  b.pose(tilt, 0, NECK_Y, look.dx, look.dy);
  const lock = (p1: number): BossOptions => ({ p1, flash: look.flash, outline: LINE });

  // The mass of it, a long oval that falls to the shoulder blades, then locks hanging from behind
  // it — the outer pair first — and the crown on top of all of it.
  b.part(PART_PLATE, 0, -146, 68, 76, 0, HIYOU.hair, 1, style(look, SEED.Head, { p0: 1, p1: 0.3 }));
  for (const side of SIDES) {
    b.part(PART_STRAND, side * 60, -56, 18, 84, side * 0.18, HIYOU.hair, 1, { ...lock(0.7), p0: side * 0.5 });
    b.part(PART_STRAND, side * 38, -44, 26, 96, side * 0.04, HIYOU.hair, 1, {
      ...lock(0.82),
      p0: side * 0.45,
    });
  }
  b.part(PART_STRAND, 0, -40, 40, 100, 0, HIYOU.hair, 1, lock(0.9));
  b.part(PART_PLATE, 0, -182, 50, 42, 0, HIYOU.hair, 1, style(look, SEED.Head, { p0: 1, p1: 0.3 }));
}

// ───────────────────────────── body ─────────────────────────────

function paintBody(b: Brush, look: PartLook, time: number): void {
  if (look.state === 'destroyed') return;
  b.pose(0, 0, 0, look.dx, look.dy);
  const flash = look.flash;
  const seed = SEED.Body;

  // The neck, and the under-suit the plates hang on.
  b.part(PART_PLATE, 0, -114, 7.5, 10, 0, HIYOU.skin, 1, { p0: 1, flash, outline: FINE });
  b.part(PART_PLATE, 0, -60, 42, 46, 0, HIYOU.suit, 1, style(look, seed, { p0: 0.6 }));

  // Chest and ribs: pearl plate, each with its bevel.
  b.part(PART_PLATE, 0, -88, 45, 19, 0, HIYOU.pearl, 1, style(look, seed, { p0: 0.5, p1: 1 }));
  b.part(PART_PLATE, 0, -50, 38, 16, 0, HIYOU.pearl, 1, style(look, seed + 1, { p0: 0.5, p1: 1 }));

  // The collar: a ring at the neck, and a wing of silver over each collarbone.
  b.part(PART_PLATE, 0, -107, 16, 5, 0, HIYOU.silver, 1, style(look, seed, { p0: 1, p1: 0.8 }, FINE));
  for (const side of SIDES)
    b.part(
      PART_PLATE,
      side * 28,
      -103,
      15,
      6,
      -side * 0.55,
      HIYOU.silver,
      1,
      style(look, seed, { p0: 0.8, p1: 0.9 }, FINE),
    );

  // Seams of light where the plates meet.
  b.beam(-36, -100, -21, -46, 1.4, HIYOU.energy, 0.75, 0.8);
  b.beam(36, -100, 21, -46, 1.4, HIYOU.energy, 0.75, 0.8);

  // The socket the core sits in: a silver rim round a dark well.
  b.part(PART_PLATE, 0, CORE_Y, 24, 24, 0, HIYOU.silver, 1, style(look, seed, { p0: 1, p1: 1 }, FINE));
  b.part(PART_PLATE, 0, CORE_Y, 20, 20, 0, HIYOU.socket, 1, { p0: 1, flash });

  // The waist: a band of steel with a seam of light. Then the hip plates.
  b.part(PART_PLATE, 0, -24, 26, 9, 0, HIYOU.steel, 1, style(look, seed, { p0: 1, p1: 0.7 }, FINE));
  b.beam(-19, -24, 19, -24, 1.3, HIYOU.energy, 0.85, 0.8);
  for (const side of SIDES)
    b.part(
      PART_PLATE,
      side * 40,
      -3,
      15,
      18,
      -side * 0.3,
      HIYOU.pearl,
      1,
      style(look, seed, { p0: 0.55, p1: 1 }),
    );
  b.part(PART_GEM, 0, -7, 4.5, 4.5, 0, HIYOU.trim, 1, { p0: 6, p1: 0.6, p2: time * 0.5, flash, outline: 0 });

  // The skirt: a dark underskirt that shows below the hem, then three gores of pearl plate, each
  // drawn to a point and splayed so the dark shows between them.
  b.part(PART_BLOB, 0, 34, 37, 26, 0, HIYOU.suit, 1, { flash, outline: FINE });
  const gore = { p1: 0.6, p2: damageOf(look), flash, outline: LINE };
  for (const side of SIDES)
    b.part(PART_STRAND, side * 30, 16, 19.5, 29, side * 0.22, HIYOU.pearl, 1, {
      ...gore,
      p0: side * 0.05,
      seed: seed + (side < 0 ? 2 : 3),
    });
  b.part(PART_STRAND, 0, 18, 23.5, 32, 0, HIYOU.pearl, 1, { ...gore, p0: 0, seed: seed + 4 });

  // The hover base: a ring of light under the hem, and the wash of what holds her up.
  b.light(0, 62, 28, 20, 0xd9a6ff, 0.3, 0.3);
  b.part(PART_ARC, 0, 74, 44, 9, 0, HIYOU.energy, 0.75, { p0: 0.09, p1: time * 1.3, p2: 1.4 });
  b.part(PART_ARC, 0, 74, 44, 9, 0, HIYOU.energy, 0.75, { p0: 0.09, p1: time * 1.3 + Math.PI, p2: 1.4 });
  b.light(0, 72, 42, 9, HIYOU.energy, 0.34, 0.35);
}

// ───────────────────────────── arms ─────────────────────────────

function paintArm(b: Brush, side: Side, look: PartLook, time: number): void {
  if (look.state === 'destroyed') return;
  // The arms hang a little away from the body and sway with her breathing.
  const sway = Math.sin(time * 1.4 + (side > 0 ? 0 : 0.9)) * 0.018;
  b.pose(0, 85, -70, look.dx, look.dy);
  const seed = side < 0 ? SEED.LeftArm : SEED.RightArm;
  const upper = side * (1.362 + sway * 0.4);
  const turn = side * (1.234 + sway);

  // The joint under the pauldron; the upper arm of under-suit, banded with silver twice.
  b.part(
    PART_PLATE,
    side * 84,
    -71,
    11.5,
    11.5,
    0,
    HIYOU.steel,
    1,
    style(look, seed, { p0: 1, p1: 0.7 }, FINE),
  );
  b.part(
    PART_PLATE,
    side * 90.5,
    -42,
    34,
    9.5,
    upper,
    HIYOU.suit,
    1,
    style(look, seed, { p0: 1, p1: 0 }, FINE),
  );
  b.part(
    PART_PLATE,
    side * 92,
    -37,
    10.5,
    3.4,
    upper,
    HIYOU.silver,
    1,
    style(look, seed, { p0: 1, p1: 0.9 }, FINE),
  );
  b.part(
    PART_PLATE,
    side * 95,
    -18,
    10.5,
    3.4,
    upper,
    HIYOU.silver,
    1,
    style(look, seed, { p0: 1, p1: 0.9 }, FINE),
  );

  // The elbow, with its pin of light.
  b.part(
    PART_PLATE,
    side * 97,
    -13,
    8.5,
    8.5,
    0,
    HIYOU.steel,
    1,
    style(look, seed, { p0: 1, p1: 0.7 }, FINE),
  );
  b.part(PART_PLATE, side * 97, -13, 3.2, 3.2, 0, HIYOU.energy, 1, { p0: 1, flash: look.flash });

  // The gauntlet in three steps down the forearm: a shell of pearl plate with a stripe of trim, a
  // cuff of silver at the wrist, then a mitten of pearl plate on a dark wrist.
  b.part(
    PART_PLATE,
    side * 104.3,
    7.8,
    27,
    12,
    turn,
    HIYOU.pearl,
    1,
    style(look, seed + 1, { p0: 0.9, p1: 1 }),
  );
  b.part(PART_LINE, side * 104.3, 7.8, 16, 1.1, turn, HIYOU.trim, 0.95, { p1: 1, flash: look.flash, pad: 1 });
  b.part(
    PART_PLATE,
    side * 116.8,
    43.6,
    12,
    9.5,
    turn,
    HIYOU.silver,
    1,
    style(look, seed + 2, { p0: 0.9, p1: 0.9 }, FINE),
  );
  b.part(
    PART_PLATE,
    side * 123.4,
    62.5,
    8.5,
    11,
    turn,
    HIYOU.suit,
    1,
    style(look, seed, { p0: 1, p1: 0.2 }, FINE),
  );
  b.part(
    PART_PLATE,
    side * 124.2,
    64.5,
    6.2,
    7.5,
    turn,
    HIYOU.pearl,
    1,
    style(look, seed, { p0: 1, p1: 0.9 }, 0),
  );
}

// ───────────────────────────── shoulders ─────────────────────────────

function paintShoulder(b: Brush, side: Side, look: PartLook, time: number): void {
  if (look.state === 'destroyed') return;
  // The pauldrons float: they drift a little out of step with her, and with each other.
  const drift = Math.sin(time * 1.3 + (side > 0 ? 1.7 : 0)) * 1.6;
  b.pose(0, 0, 0, look.dx, look.dy + drift);
  const seed = side < 0 ? SEED.LeftShoulder : SEED.RightShoulder;
  const x = side * 92;
  const y = -91;
  // The shell's long axis: its round end out, its point in towards the neck. And its tilt.
  const along = side * (Math.PI / 2 + 0.18);
  const tilt = side * 0.18;
  const shell = { p0: 0, p1: 1, p2: damageOf(look), flash: look.flash, seed, mirror: side < 0 };

  // A fin behind, pointing up and out.
  const fin = -52 * DEG;
  b.part(
    PART_FEATHER,
    x + side * (30 + (Math.cos(fin) * 46) / 2),
    y - 10 + (Math.sin(fin) * 46) / 2,
    23,
    6.5,
    side * fin,
    HIYOU.blade,
    1,
    { p0: 0.9, p1: 0.5, p2: 0.5, flash: look.flash, outline: FINE },
  );

  // The lip of the shell, a step below it in silver. It goes down first, so the shell overlaps it
  // and only its lower edge shows.
  b.part(PART_STRAND, x, y + 7, 25, 46, along, HIYOU.silver, 1, { ...shell, outline: FINE });

  // The pauldron itself: a shell of pearl plate — round at its outer end, drawn in towards the
  // neck, where the collar hides its point — with a flat panel of steel let into its upper face
  // and a vent of three fins at the neck end.
  b.part(PART_STRAND, x, y, 27, 46, along, HIYOU.pearl, 1, { ...shell, outline: LINE });
  b.part(
    PART_PLATE,
    x - side * 3,
    y - 11,
    26,
    8.5,
    tilt,
    HIYOU.steel,
    1,
    style(look, seed, { p0: 0.45, p1: 0.9 }, FINE),
  );
  for (let i = 0; i < 3; i++)
    b.part(
      PART_PLATE,
      x - side * (30 + i * 6),
      y - 4 + i * 1.2,
      2.2,
      10,
      tilt,
      HIYOU.steel,
      1,
      style(look, seed, { p0: 0.8, p1: 0.4 }, 0),
    );

  // The slit of light across it, and a stone at its heart.
  b.beam(x - side * 4, y + 8, x + side * 30, y + 14, 1.8, HIYOU.energy, 0.9, 0.8);
  b.part(PART_GEM, x + side * 12, y + 3, 5, 5, 0, HIYOU.trim, 1, {
    p0: 6,
    p1: 0.6,
    p2: time * 0.4,
    flash: look.flash,
    outline: 0,
  });
}

// ───────────────────────────── head ─────────────────────────────

/** How far the eyes are open, how the almond is tilted (the right eye's turn; negative lifts its outer corner), how hard the iris burns, and their size. */
interface Eye {
  open: number;
  tilt: number;
  burn: number;
  size: number;
}

const EYES: Record<FaceId, Eye> = {
  idle: { open: 1, tilt: -0.1, burn: 0.55, size: 1 },
  smug: { open: 0.62, tilt: -0.2, burn: 0.5, size: 1 },
  surprised: { open: 1, tilt: -0.03, burn: 0.3, size: 1.1 },
  angry: { open: 0.66, tilt: -0.24, burn: 0.85, size: 1 },
  hurt: { open: 0.28, tilt: 0.12, burn: 0.4, size: 0.95 },
  awakened: { open: 0.96, tilt: -0.26, burn: 1.7, size: 1.06 },
  defeated: { open: 0.04, tilt: 0.14, burn: 0, size: 1 },
};

/** A brow of the right eye in figure units: its height, its turn (negative: the outer end lifted), its thickness and half length. */
interface Brow {
  y: number;
  turn: number;
  thick: number;
  wide: number;
}

const BROWS: Record<FaceId, Brow> = {
  idle: { y: -170, turn: -0.17, thick: 1.9, wide: 8.5 },
  smug: { y: -175.5, turn: -0.12, thick: 1.9, wide: 8.5 },
  surprised: { y: -178, turn: -0.05, thick: 1.7, wide: 8 },
  angry: { y: -168.5, turn: -0.49, thick: 2.3, wide: 9.5 },
  hurt: { y: -171.5, turn: 0.4, thick: 2.1, wide: 9 },
  awakened: { y: -172, turn: -0.52, thick: 2.4, wide: 9.5 },
  defeated: { y: -168.5, turn: 0.44, thick: 2, wide: 8.5 },
};

/** The brow that disagrees on a lopsided face: the left one, by face. */
const LEFT_BROWS: Partial<Record<FaceId, Brow>> = {
  smug: { y: -168.5, turn: 0.1, thick: 1.9, wide: 8.5 },
};

/** How far the head leans, in radians: positive droops towards the right shoulder. */
function headTilt(face: FaceId, time: number): number {
  switch (face) {
    case 'defeated':
      return 0.17;
    case 'hurt':
      return -0.07;
    case 'awakened':
      return -0.09;
    case 'smug':
      return 0.08;
    case 'angry':
      return -0.04;
    default:
      return Math.sin(time * 0.9) * 0.025;
  }
}

function paintMouth(b: Brush, face: FaceId, flash: number): void {
  const line = (x: number, y: number, hw: number, turn: number, color: number = HIYOU.mouth): void => {
    b.part(PART_LINE, x, y, hw, 0.9, turn, color, 1, { p1: 1, flash, pad: 1 });
  };
  switch (face) {
    case 'angry':
    case 'awakened':
      // Open: shouting, or laughing.
      b.part(PART_BLOB, 0, -130, face === 'angry' ? 6 : 6.5, face === 'angry' ? 4 : 3, 0, HIYOU.mouth, 1, {
        flash,
        outline: FINE,
      });
      line(0, face === 'angry' ? -132.7 : -131.9, 4.6, 0, 0xffffff);
      return;
    case 'smug':
      // A smirk: the right corner lifted.
      line(2, -132, 5, -0.24);
      return;
    case 'surprised':
      b.part(PART_BLOB, 0, -130, 3.2, 3.9, 0, HIYOU.mouth, 1, { flash, outline: FINE });
      return;
    case 'hurt':
      // Gritted: a flat line, pressed hard.
      b.part(PART_LINE, 0, -131.4, 5.5, 1.7, 0, HIYOU.mouth, 1, { p1: 1, flash, pad: 1 });
      return;
    case 'defeated':
      // Turned down at the corners.
      line(-2.4, -131.2, 2.4, -0.26);
      line(2.4, -131.2, 2.4, 0.26);
      return;
    default:
      // A small smile: turned up at the corners.
      line(-2.2, -131.8, 2.5, 0.26);
      line(2.6, -131.9, 2.5, -0.28);
  }
}

function paintHead(b: Brush, look: PartLook, face: FaceId, time: number): void {
  if (look.state === 'destroyed') return;
  b.pose(headTilt(face, time), 0, NECK_Y, look.dx, look.dy);
  const flash = look.flash;

  // The face, and the blush on its cheeks.
  b.part(PART_FACE, 0, -157, 35, 41, 0, HIYOU.skin, 1, { p0: 0.54, p1: 0.9, flash, outline: LINE });
  for (const side of SIDES) b.part(PART_BLOB, side * 23, -140, 9, 4.4, 0, HIYOU.blush, 0.4, { p0: 0.75 });

  // Eyes: taller than wide, an almond even wide open. A tilt lifts the outer corner of each one,
  // so the right eye's turn is the left's mirrored.
  const eye = EYES[face];
  for (const side of SIDES) {
    b.part(PART_EYE, side * 15, -152, 10.5 * eye.size, 12.5 * eye.size, 0, HIYOU.iris, 1, {
      p0: eye.open,
      p1: side * eye.tilt,
      p2: eye.burn,
      flash,
      outline: LASH,
    });
  }
  if (eye.burn > 1) for (const side of SIDES) b.light(side * 15, -151, 22, 14, HIYOU.iris, 0.4, 0.5);

  // The nose is a dot; the mouth is the face's.
  b.part(PART_LINE, 2.5, -141, 1.4, 0.7, 0.5, 0xe9ac9c, 0.85, { p1: 1, pad: 1 });
  paintMouth(b, face, flash);

  // The fringe: a solid cap of hair that covers the forehead to just above the brows, its hem cut
  // into shallow points, and five locks laid over it — the outer ones first, so the middle lies
  // over them. Where the locks part, the hair behind shows: skin never does. Then the sheen.
  b.part(PART_FRINGE, 0, -192, 45, 28, 0, HIYOU.hair, 1, { p0: 5, p1: 0.3, p2: 0.6, flash, outline: LINE });
  const locks: readonly (readonly [number, number, number, number, number])[] = [
    // centre x, centre y, half width, half length, sweep of the tip
    [27, -188, 9.5, 24, 0.5],
    [13.5, -190, 10, 25, 0.22],
  ];
  for (const [x, y, hw, hh, sweep] of locks) {
    for (const side of SIDES) {
      b.part(PART_STRAND, side * x, y, hw, hh, side * (0.05 + sweep * 0.1), HIYOU.hair, 1, {
        p0: side * sweep,
        p1: 0.25,
        flash,
        outline: WISP,
      });
    }
  }
  b.part(PART_STRAND, 0, -190, 10, 26, 0, HIYOU.hair, 1, { p0: 0, p1: 0.25, flash, outline: WISP });
  b.part(PART_BLOB, -8, -209, 26, 5, -0.22, HIYOU.hairLight, 0.55, { p0: 0.65, flash });

  // Brows, over the hair: drawn the way animation draws them, so the fringe cannot hide the
  // expression. The right one's outer end is the thin end; the left is its mirror.
  const brow = BROWS[face];
  for (const side of SIDES) {
    const one = (side < 0 ? LEFT_BROWS[face] : undefined) ?? brow;
    b.part(PART_LINE, side * 15.5, one.y, one.wide, one.thick, side * one.turn, HIYOU.brow, 1, {
      p0: 0.45,
      p1: 1,
      flash,
      mirror: side < 0,
      pad: 1,
    });
  }

  // Two longer locks swept over the fringe from either temple, and the locks that fall in front
  // of the shoulders, over the pauldrons: they start inside the crown, bow out over the ear units
  // and hang straight from there.
  b.part(PART_STRAND, -33, -180, 8, 26, -0.16, HIYOU.hair, 1, { p0: -0.3, p1: 0.3, flash, outline: WISP });
  b.part(PART_STRAND, 35, -182, 7, 21, 0.22, HIYOU.hair, 1, { p0: 0.35, p1: 0.3, flash, outline: WISP });
  for (const side of SIDES) {
    b.part(PART_STRAND, side * 38, -105, 13, 95, side * 0.01, HIYOU.hair, 1, {
      p0: side * 0.85,
      p1: 0.35,
      flash,
      outline: LINE,
    });
    b.part(PART_STRAND, side * 50, -80, 5.5, 66, side * 0.05, HIYOU.hair, 1, {
      p0: side * 0.7,
      p1: 0.4,
      flash,
      outline: WISP,
    });
  }

  // A coronet: a stone set in the fringe, on two silver prongs. Then stones above the left temple.
  for (const side of SIDES)
    b.part(PART_LINE, side * 10, -204.5, 8.6, 0.9, side * 0.66, HIYOU.silver, 1, { p1: 1, flash, pad: 1 });
  b.part(PART_GEM, 0, -210, 4.4, 4.4, Math.PI / 4, HIYOU.core, 1, {
    p0: 4,
    p1: 0.8,
    p2: time,
    flash,
    outline: 0,
  });
  b.light(0, -210, 12, 12, HIYOU.energy, 0.4, 0.6);
  b.part(PART_GEM, -30, -199, 5.5, 5.5, 0.3, HIYOU.trim, 1, {
    p0: 5,
    p1: 0.7,
    p2: time * 0.4,
    flash,
    outline: 0,
  });
  b.part(PART_GEM, -36.5, -192.5, 3.4, 3.4, -0.2, HIYOU.core, 1, {
    p0: 5,
    p1: 0.5,
    p2: time * 0.4,
    flash,
    outline: 0,
  });
  b.light(-31, -197, 14, 14, HIYOU.trim, 0.4, 0.5);

  // The ear units, worn over the hair like headphones, each with a light at its centre and a
  // silver fin standing off it, up and out.
  for (const side of SIDES) {
    b.part(PART_STRAND, side * 51, -163, 5, 10, Math.PI + side * 1.02, HIYOU.silver, 1, {
      p0: 0,
      p1: 0.3,
      flash,
      outline: FINE,
    });
    b.part(PART_PLATE, side * 38.5, -155, 10, 10, 0, HIYOU.silver, 1, { p0: 1, p1: 1, flash, outline: FINE });
    b.part(PART_PLATE, side * 39, -155, 4.6, 4.6, 0, HIYOU.energy, 1, { p0: 1, flash });
    b.light(side * 39, -155, 13, 13, HIYOU.energy, 0.45 + 0.15 * Math.sin(time * 3 + side), 0.6);
  }

  // The halo: a ring of light that hangs above her.
  b.part(PART_ARC, 0, -238, 31, 7.5, 0, HIYOU.energy, 0.95, { p0: 0.07, p1: 0.04, p2: Math.PI - 0.08 });
  b.part(PART_ARC, 0, -238, 31, 7.5, 0, HIYOU.energy, 0.7, {
    p0: 0.07,
    p1: Math.PI + 0.04,
    p2: Math.PI - 0.08,
  });
  b.light(0, -238, 40, 12, HIYOU.energy, 0.3, 0.3);
  b.part(PART_GEM, 0, -245.5, 3.6, 3.6, 0, HIYOU.core, 1, { p0: 4, p1: 0.9, p2: time, flash, outline: 0 });
}

// ───────────────────────────── core & shield ─────────────────────────────

function paintCore(b: Brush, core: PartLook, shield: PartLook, time: number): void {
  if (core.state !== 'destroyed') {
    const beat = 0.5 + 0.5 * Math.sin(time * 4.2);
    b.pose(0, 0, CORE_Y, core.dx, core.dy);
    // The stone, and the light it throws.
    b.light(0, CORE_Y, 48, 48, HIYOU.energy, 0.26 + 0.08 * beat, 0.35);
    b.part(PART_GEM, 0, CORE_Y, 15, 15, time * 0.25, HIYOU.core, 1, {
      p0: 6,
      p1: 0.7 + 0.3 * beat,
      p2: time * 0.8,
      flash: core.flash,
      outline: 1.4,
    });
    b.light(0, CORE_Y, 17, 17, 0xffe0ff, 0.7 + 0.2 * beat, 0.9);
    // Two arcs of light that orbit it.
    b.part(PART_ARC, 0, CORE_Y, 24, 24, 0, HIYOU.energy, 0.9, { p0: 0.05, p1: time * 1.7, p2: 1.8 });
    b.part(PART_ARC, 0, CORE_Y, 24, 24, 0, HIYOU.energy, 0.7, {
      p0: 0.05,
      p1: time * 1.7 + Math.PI,
      p2: -1.1,
    });
  }
  if (shield.state === 'destroyed') return;

  // The shield: a bubble of light over the socket. Its rim is bright, and there is a highlight
  // where the light catches it on the upper left.
  b.pose(0, 0, CORE_Y, shield.dx, shield.dy);
  const flash = shield.flash;
  b.part(PART_BLOB, 0, CORE_Y, 40, 40, 0, 0xd98cff, 0.13 + 0.04 * Math.sin(time * 2.6) + flash * 0.3, {
    p0: 0.3,
    p1: 0.3,
  });
  // The lattice across it: three chords.
  b.beam(-37, CORE_Y, 37, CORE_Y, 0.8, 0xffffff, 0.1, 0);
  b.beam(-18.5, CORE_Y - 32, 18.5, CORE_Y + 32, 0.8, 0xffffff, 0.1, 0);
  b.beam(18.5, CORE_Y - 32, -18.5, CORE_Y + 32, 0.8, 0xffffff, 0.1, 0);
  b.part(PART_ARC, 0, CORE_Y, 41, 41, 0, 0xffb4f6, 0.55 + flash * 0.3, { p0: 0.05, p1: 0, p2: 0 });
  b.part(PART_ARC, 0, CORE_Y, 41, 41, 0, 0xffffff, 0.55, { p0: 0.055, p1: 3.6, p2: 1.2 });
}

// ───────────────────────────── the figure ─────────────────────────────

/** Figure units to world units. One place to change how big she stands in the arena. */
const SCALE = 0.92;

/** The one brush every figure is drawn with. */
const BRUSH = new Brush();

/** Draws 樱之誓约·绯樱 for one frame: back to front, each part where its look says. */
export function paintHiyou(pen: Pen, frame: BossFrame): void {
  const { look, time, face } = frame;
  // She hangs in the air: the whole figure drifts up and down a little.
  const b = BRUSH;
  b.place(pen, frame.x, frame.y + Math.sin(time * 1.1) * 3, SCALE);
  const tilt = headTilt(face, time);

  paintWing(b, -1, look.LeftWing, time);
  paintWing(b, 1, look.RightWing, time);
  paintHairBack(b, look.Head, tilt);
  paintBody(b, look.Body, time);
  paintArm(b, -1, look.LeftArm, time);
  paintArm(b, 1, look.RightArm, time);
  paintShoulder(b, -1, look.LeftShoulder, time);
  paintShoulder(b, 1, look.RightShoulder, time);
  paintHead(b, look.Head, face, time);
  paintCore(b, look.Core, look.CoreShield, time);
  b.pose();
}

import { DEG } from '../../../../core/math';
import type { BossFrame, FaceId, PartLook, PartState } from '../../types';
import {
  ARM_BOX,
  CORE_ARC_BOX,
  CORE_GEM_BOX,
  CORE_LIGHT,
  CORE_Y,
  FEATHERS,
  HOVER_BOX,
  NECK_JOINT,
  PAULDRON_BOX,
  SHIELD_BOX,
  SPAR_BOX,
  TORSO_BOX,
  bladeBox,
  paintArm,
  paintBlade,
  paintCoreArc,
  paintCoreGem,
  paintHover,
  paintPauldron,
  paintShield,
  paintTorso,
  paintWingSpar,
  tornBladeBox,
  type Box,
} from './body';
import { drawBackHair, drawBangs, drawFace, drawHeadgear, drawSideLocks } from './head';

/**
 * 绯樱 as pieces: the parts of the drawing that each move as one — a blade, a pauldron, a face —
 * and where each goes on a given frame.
 *
 * A piece is drawn once, at rest, in a frame of its own (see `body.ts` and `head.ts`), and has
 * bounds in that frame. Which piece shows is a matter of state: a pauldron cracked twice is another
 * piece from one that is whole, a blade torn off another from one that is whole, and every face is
 * its own piece. So there is nothing to redraw when she is hurt or changes expression: only which
 * pieces are placed, and where.
 *
 * `placeHiyou` is the whole of her motion, and it is pure: it looks at the frame and says where
 * every piece goes, back to front. Drawing her straight onto a canvas and handing the same list to
 * a renderer that has the pieces baked into pictures give the same figure.
 */

/** One piece as it can be drawn or baked: its bounds in its own frame, and how it is painted there. */
export interface Piece {
  box: Box;
  /** Draws it in its own frame, with what its part's look shows: its damage, and the white of a hit. */
  paint: (ctx: CanvasRenderingContext2D, look: PartLook) => void;
}

/** A part at rest with nothing showing on it. */
export const AT_REST: PartLook = { state: 'intact', flash: 0, dx: 0, dy: 0 };

/** The states a part can be drawn in. One that is destroyed is not drawn. */
const DRAWN: readonly PartState[] = ['intact', 'damaged_1', 'damaged_2'];

const FACES: readonly FaceId[] = ['idle', 'smug', 'surprised', 'angry', 'hurt', 'awakened', 'defeated'];

/** The right and the left, with the letter that tells their pieces apart. */
const SIDES: readonly (readonly [number, string])[] = [
  [-1, 'L'],
  [1, 'R'],
];

/** The same bounds written for the other side of the figure. */
const flip = ([x0, y0, x1, y1]: Box): Box => [-x1, y0, -x0, y1];

/** The bounds of the hair behind her, in the figure's frame. */
const BACK_HAIR_BOX: Box = [-63, -246, 63, 48];
/** Of her face with its neck. The fringe hides all above the folds between its locks, so that is not baked. */
const FACE_BOX: Box = [-43, -215, 43, -96];
/** Of everything worn in front of the face: the fringe, the locks before her shoulders, the headgear with its halo. */
const HAIR_FRONT_BOX: Box = [-68, -268, 68, -20];

/** How many blades a wing loses at the worst: two, from its lower edge. */
export const TORN_COUNT = 2;

/** The first of the blades that can be torn off; the rest never are. */
const TORN_FROM = FEATHERS.length - TORN_COUNT;

/** Every piece she is made of, by key. Built once. */
export const PIECES: ReadonlyMap<string, Piece> = buildPieces();

function buildPieces(): ReadonlyMap<string, Piece> {
  const table = new Map<string, Piece>();
  const add = (key: string, box: Box, paint: Piece['paint']): void => {
    table.set(key, { box, paint });
  };
  add('backHair', BACK_HAIR_BOX, (ctx) => drawBackHair(ctx));
  add('hover', HOVER_BOX, (ctx) => paintHover(ctx));
  for (const state of DRAWN) {
    const at: PartLook = { ...AT_REST, state };
    add(`torso.${state}`, TORSO_BOX, (ctx, look) => paintTorso(ctx, { ...at, flash: look.flash }));
    for (const [side, tag] of SIDES) {
      add(`arm.${tag}.${state}`, side > 0 ? ARM_BOX : flip(ARM_BOX), (ctx, look) =>
        paintArm(ctx, side as 1 | -1, { ...at, flash: look.flash }),
      );
      add(`pauldron.${tag}.${state}`, side > 0 ? PAULDRON_BOX : flip(PAULDRON_BOX), (ctx, look) =>
        paintPauldron(ctx, side as 1 | -1, { ...at, flash: look.flash }),
      );
      add(`spar.${tag}.${state}`, side > 0 ? SPAR_BOX : flip(SPAR_BOX), (ctx, look) =>
        paintWingSpar(ctx, side as 1 | -1, { ...at, flash: look.flash }),
      );
    }
  }
  FEATHERS.forEach((_, index) => {
    add(`blade.${index}`, bladeBox(index), (ctx) => paintBlade(ctx, index));
    // Only the lowest blades are ever torn off (see `placeHiyou`): only they are baked torn.
    if (index >= FEATHERS.length - TORN_COUNT) {
      add(`blade.${index}~`, tornBladeBox(index), (ctx) => paintBlade(ctx, index, true));
    }
  });
  for (const face of FACES) add(`face.${face}`, FACE_BOX, (ctx) => drawFace(ctx, face));
  add('hairFront', HAIR_FRONT_BOX, (ctx) => {
    drawBangs(ctx);
    drawSideLocks(ctx);
    drawHeadgear(ctx);
  });
  add('shield', SHIELD_BOX, (ctx, look) => paintShield(ctx, look));
  add('coreGem', CORE_GEM_BOX, (ctx) => paintCoreGem(ctx));
  add('coreArc0', CORE_ARC_BOX, (ctx) => paintCoreArc(ctx, 0));
  add('coreArc1', CORE_ARC_BOX, (ctx) => paintCoreArc(ctx, 1));
  return table;
}

/** Every piece's key, in the order they are baked. */
export const PIECE_KEYS: readonly string[] = [...PIECES.keys()];

/** One piece placed for a frame: where its own frame's origin goes, in figure units, and how it is turned. */
export interface Placed {
  key: string;
  x: number;
  y: number;
  /** Radians. */
  rot: number;
  /** The piece is flipped left to right in its own frame before it is turned. */
  mirror: boolean;
  alpha: number;
  /** The look of the part it belongs to. */
  look: PartLook;
}

/** How far the head leans, in radians: positive droops towards her right shoulder. */
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

/**
 * Where every piece goes this frame, back to front, about the top of her breastbone. The list is
 * reused from call to call: read it before placing again.
 */
export function placeHiyou(frame: BossFrame, out: Placed[] = []): Placed[] {
  const { look, time, face } = frame;
  out.length = 0;
  const put = (
    key: string,
    x: number,
    y: number,
    part: PartLook,
    rot = 0,
    mirror = false,
    alpha = 1,
  ): void => {
    out.push({ key, x, y, rot, mirror, alpha, look: part });
  };

  // The wings. Their blades breathe — the lower ones travel further than the upper — and a damaged
  // wing has lost blades from its lower edge.
  for (const [side, tag] of SIDES) {
    const wing = side < 0 ? look.LeftWing : look.RightWing;
    if (wing.state === 'destroyed') continue;
    for (let i = FEATHERS.length - 1; i >= 0; i--) {
      const [rootX, rootY, degrees] = FEATHERS[i]!;
      const torn =
        wing.state === 'damaged_2' ? i >= TORN_FROM : wing.state === 'damaged_1' && i === FEATHERS.length - 1;
      const angle = (degrees + Math.sin(time * 1.7 + i * 0.55) * (0.6 + i * 0.22)) * DEG;
      // A blade is baked for the right wing; the left is the same piece turned over.
      put(
        `blade.${i}${torn ? '~' : ''}`,
        side * (rootX + wing.dx),
        rootY + wing.dy,
        wing,
        side * angle,
        side < 0,
      );
    }
    put(`spar.${tag}.${wing.state}`, side * wing.dx, wing.dy, wing);
  }

  // The hair behind her goes where her head goes.
  if (look.Head.state !== 'destroyed') put('backHair', look.Head.dx, look.Head.dy, look.Head);

  put('hover', 0, 0, AT_REST);

  if (look.Body.state !== 'destroyed') put(`torso.${look.Body.state}`, look.Body.dx, look.Body.dy, look.Body);

  // The arms hang a little away from the body and sway with her breathing; the pauldrons float,
  // drifting a little out of step with her and with each other.
  for (const [side, tag] of SIDES) {
    const arm = side < 0 ? look.LeftArm : look.RightArm;
    if (arm.state !== 'destroyed') {
      const sway = Math.sin(time * 1.4 + (side > 0 ? 0 : 0.9)) * 1.2;
      put(`arm.${tag}.${arm.state}`, side * (arm.dx + sway), arm.dy, arm);
    }
    const pauldron = side < 0 ? look.LeftShoulder : look.RightShoulder;
    if (pauldron.state !== 'destroyed') {
      const drift = Math.sin(time * 1.3 + (side > 0 ? 1.7 : 0)) * 1.6;
      put(`pauldron.${tag}.${pauldron.state}`, side * pauldron.dx, pauldron.dy + drift, pauldron);
    }
  }

  // Her face and what she wears over it lean on the joint at the top of her neck. The pieces are
  // drawn about the breastbone, so turning them about the joint carries their origin along too.
  if (look.Head.state !== 'destroyed') {
    const tilt = headTilt(face, time);
    const ox = look.Head.dx - NECK_JOINT * Math.sin(tilt);
    const oy = look.Head.dy + NECK_JOINT * (1 - Math.cos(tilt));
    put(`face.${face}`, ox, oy, look.Head, tilt);
    put('hairFront', ox, oy, look.Head, tilt);
  }

  // The core turns in its socket, with two arcs of light going round it; the shield shimmers.
  const core = look.Core;
  if (core.state !== 'destroyed') {
    put('coreGem', core.dx, CORE_Y + core.dy, core, time * 0.3);
    put('coreArc0', core.dx, CORE_Y + core.dy, core, time * 1.7);
    put('coreArc1', core.dx, CORE_Y + core.dy, core, time * 1.7 + Math.PI);
  }
  const shield = look.CoreShield;
  if (shield.state !== 'destroyed') {
    put(
      'shield',
      shield.dx,
      CORE_Y + shield.dy,
      shield,
      0,
      false,
      0.86 + 0.14 * (0.5 + 0.5 * Math.sin(time * 2.6)),
    );
  }
  return out;
}

/** The light the core throws on what is around it this frame, in figure units; none without a core. */
export function coreLight(frame: BossFrame): { x: number; y: number; alpha: number } | null {
  const core = frame.look.Core;
  if (core.state === 'destroyed') return null;
  return {
    x: core.dx,
    y: CORE_Y + core.dy,
    alpha:
      (0.26 + 0.08 * (0.5 + 0.5 * Math.sin(frame.time * 4.2))) * (1 - core.flash * 0.5) + core.flash * 0.3,
  };
}

/** How far the core's light reaches, in figure units. */
export const CORE_REACH = CORE_LIGHT.reach;

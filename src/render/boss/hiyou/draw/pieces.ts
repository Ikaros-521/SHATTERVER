import { DEG } from '../../../../core/math';
import {
  DRAWN,
  about,
  byFace,
  byState,
  imageSlots,
  place,
  sheetFromImages,
  type Box,
  type Layer,
  type Placed,
  type Pose,
  type Sheet,
  type SheetLight,
  type Shot,
} from '../../sheet';
import type { BossFrame, BossPartId, FaceId, PartLook } from '../../types';
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
} from './body';
import { drawBackHair, drawBangs, drawFace, drawHeadgear, drawSideLocks } from './head';

/**
 * 绯樱 as a sheet: the parts of the drawing that each move as one — a blade, a pauldron, a face —
 * as layers (`../sheet.ts`), drawn with Canvas 2D in the figure units of `head.ts`.
 *
 * Each picture is drawn once, at rest, in a frame of its own (see `body.ts` and `head.ts`), with
 * bounds in that frame. Which picture shows is a matter of state: a pauldron cracked twice is another
 * picture from one that is whole, a blade torn off another from one that is whole, and every face is
 * its own picture. So there is nothing to redraw when she is hurt or changes expression: only which
 * pictures are placed, and where.
 *
 * The layers are cut as finely as the drawing goes — each blade its own layer, so that each can
 * breathe — and tagged with the group an image made for her comes by (`wing.L`, `face`, …): a
 * coarser cut, a whole wing to a picture, which `hiyouFromImages` builds a sheet from. The parts,
 * and so the fight, are the same in both, and so is how she moves where the cut makes no difference.
 */

/** A part at rest, with nothing showing on it: how every picture is drawn. */
const AT_REST: PartLook = { state: 'intact', flash: 0, dx: 0, dy: 0 };

const FACES: readonly FaceId[] = ['idle', 'smug', 'surprised', 'angry', 'hurt', 'awakened', 'defeated'];

/** The same bounds written for the other side of the figure. */
const flip = ([x0, y0, x1, y1]: Box): Box => [-x1, y0, -x0, y1];

/** The bounds of the hair behind her, in the figure's frame. */
const BACK_HAIR_BOX: Box = [-63, -246, 63, 48];
/** Of her face with its neck. The fringe hides all above the folds between its locks, so that is not baked. */
const FACE_BOX: Box = [-43, -215, 43, -96];
/** Of everything worn in front of the face: the fringe, the locks before her shoulders, the headgear with its halo. */
const HAIR_FRONT_BOX: Box = [-68, -268, 68, -20];

/**
 * How much higher her body rides on her neck than it was first drawn, in figure units. Drawn to
 * the collar, her neck was long. Everything below her head is placed this much higher; her face,
 * her hair and what she wears on her head are not.
 */
export const BODY_Y = -6;

/** How many blades a wing loses at the worst: two, from its lower edge. */
export const TORN_COUNT = 2;

/** The first of the blades that can be torn off; the rest never are. */
const TORN_FROM = FEATHERS.length - TORN_COUNT;

const shot = (id: string, variant: string, box: Box, paint: Shot['paint']): Shot => ({
  id,
  variant,
  box,
  paint,
});

/** A layer. `move` is what it does on top of being anchored at `home`. */
const layer = (
  id: string,
  part: BossPartId | null,
  group: string,
  variants: Layer['variants'],
  shots: readonly Shot[],
  show: Layer['show'],
  move?: Layer['move'],
  home?: Partial<Pose>,
): Layer => ({ id, part, group, variants, shots, show, move, home });

// ───────────────────────────── the pictures ─────────────────────────────

const backHair = shot('backHair', 'whole', BACK_HAIR_BOX, (ctx) => drawBackHair(ctx));
const hover = shot('hover', 'whole', HOVER_BOX, (ctx) => paintHover(ctx));

const torso = DRAWN.map((state) =>
  shot(`torso.${state}`, state, TORSO_BOX, (ctx) => paintTorso(ctx, { ...AT_REST, state })),
);

/** One kind of piece of armour, whole and cracked, for each side: written for the right, mirrored for the left. */
function sided(
  name: 'arm' | 'pauldron' | 'spar',
  box: Box,
  paint: (ctx: CanvasRenderingContext2D, side: 1 | -1, look: PartLook) => void,
): readonly [readonly Shot[], readonly Shot[]] {
  const made = (side: 1 | -1, tag: 'R' | 'L') =>
    DRAWN.map((state) =>
      shot(`${name}.${tag}.${state}`, state, side > 0 ? box : flip(box), (ctx) =>
        paint(ctx, side, { ...AT_REST, state }),
      ),
    );
  return [made(-1, 'L'), made(1, 'R')];
}

const [armL, armR] = sided('arm', ARM_BOX, paintArm);
const [pauldronL, pauldronR] = sided('pauldron', PAULDRON_BOX, paintPauldron);
const [sparL, sparR] = sided('spar', SPAR_BOX, paintWingSpar);

/** The blades, whole; and torn, for those that can be. Both wings share them: the left is the right turned over. */
const blade = FEATHERS.map((_, index) =>
  shot(`blade.${index}`, 'whole', bladeBox(index), (ctx) => paintBlade(ctx, index)),
);
const bladeTorn = new Map<number, Shot>();
FEATHERS.forEach((_, index) => {
  if (index >= TORN_FROM) {
    bladeTorn.set(
      index,
      shot(`blade.${index}~`, 'torn', tornBladeBox(index), (ctx) => paintBlade(ctx, index, true)),
    );
  }
});

const face = FACES.map((each) => shot(`face.${each}`, each, FACE_BOX, (ctx) => drawFace(ctx, each)));
const hairFront = shot('hairFront', 'whole', HAIR_FRONT_BOX, (ctx) => {
  drawBangs(ctx);
  drawSideLocks(ctx);
  drawHeadgear(ctx);
});
const shield = shot('shield', 'whole', SHIELD_BOX, (ctx) => paintShield(ctx));
const coreGem = shot('coreGem', 'whole', CORE_GEM_BOX, (ctx) => paintCoreGem(ctx));
const coreArc = ([0, 1] as const).map((which) =>
  shot(`coreArc${which}`, 'whole', CORE_ARC_BOX, (ctx) => paintCoreArc(ctx, which)),
);

// ───────────────────────────── how she stands and moves ─────────────────────────────
// Every layer says where it is anchored (`home`: its bind pose, which a picture made for it is
// drawn to) and how it moves on top of that; being knocked with its part, which `place` does for
// all of them, is neither. The same serves the sheet made of images, group for group.

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

/** Her face and what she wears over it lean on the joint at the top of her neck. */
const headMove: Layer['move'] = (frame) => about(0, NECK_JOINT, headTilt(frame.face, frame.time));

/** Her body rides higher on her neck than it was drawn. */
const bodyHome: Partial<Pose> = { y: BODY_Y };

/** An arm hangs a little away from the body, and sways with her breathing. */
const armHome: Partial<Pose> = { y: BODY_Y };
const armMove =
  (side: -1 | 1): Layer['move'] =>
  (frame) => ({ x: side * Math.sin(frame.time * 1.4 + (side > 0 ? 0 : 0.9)) * 1.2 });

/**
 * A pauldron floats: it drifts a little out of step with her and with the other, and sits a little
 * lower than the rest of her body rides — at its full height they came up to her chin.
 */
const pauldronHome: Partial<Pose> = { y: BODY_Y + 3 };
const pauldronMove =
  (side: -1 | 1): Layer['move'] =>
  (frame) => ({ y: Math.sin(frame.time * 1.3 + (side > 0 ? 1.7 : 0)) * 1.6 });

/** Where the core sits, body and all; and the shield over it. */
const coreAt = CORE_Y + BODY_Y;
const coreHome: Partial<Pose> = { y: coreAt };

/** The shield shimmers. */
const shieldMove: Layer['move'] = (frame) => ({
  alpha: 0.86 + 0.14 * (0.5 + 0.5 * Math.sin(frame.time * 2.6)),
});

/**
 * A blade's breathing. At rest — and at time 0 — every blade lies at the angle it was drawn at, so
 * that a whole wing drawn as one picture matches the blades: the lower ones travel further than the
 * upper.
 */
const breath = (index: number, time: number): number =>
  (Math.sin(time * 1.7 + index * 0.55) - Math.sin(index * 0.55)) * (0.6 + index * 0.22);

/** One blade of a wing: it grows from its root on the spar, lies at the angle it was drawn at, and is turned over for the left wing. */
const bladeLayer = (index: number, side: -1 | 1, tag: 'L' | 'R'): Layer => {
  const [rootX, rootY, degrees] = FEATHERS[index]!;
  const whole = blade[index]!;
  const torn = bladeTorn.get(index);
  return layer(
    `blade.${index}.${tag}`,
    side < 0 ? 'LeftWing' : 'RightWing',
    `wing.${tag}`,
    'state',
    torn ? [whole, torn] : [whole],
    (_frame, look) =>
      torn && (look.state === 'damaged_2' || (look.state === 'damaged_1' && index === FEATHERS.length - 1))
        ? torn
        : whole,
    (frame) => ({ rot: side * breath(index, frame.time) * DEG }),
    { x: side * rootX, y: rootY + BODY_Y, rot: side * degrees * DEG, mirror: side < 0 },
  );
};

/** A wing's spar with all that hangs on it. */
const sparLayer = (side: -1 | 1, tag: 'L' | 'R', shots: readonly Shot[]): Layer =>
  layer(
    `spar.${tag}`,
    side < 0 ? 'LeftWing' : 'RightWing',
    `wing.${tag}`,
    'state',
    shots,
    byState(shots),
    undefined,
    bodyHome,
  );

/** One wing: its blades, the lowest first so each above lies over the root of the last, then its spar. */
const wing = (side: -1 | 1, tag: 'L' | 'R', spar: readonly Shot[]): Layer[] => [
  ...FEATHERS.map((_, index) => index)
    .reverse()
    .map((index) => bladeLayer(index, side, tag)),
  sparLayer(side, tag, spar),
];

/** The light the core throws, in the figure's frame; none without a core. */
const coreLights = (frame: BossFrame): readonly SheetLight[] => {
  const core = frame.look.Core;
  if (core.state === 'destroyed') return [];
  return [
    {
      x: core.dx,
      y: coreAt + core.dy,
      reach: CORE_LIGHT.reach,
      color: 0xff5fd8,
      alpha:
        (0.26 + 0.08 * (0.5 + 0.5 * Math.sin(frame.time * 4.2))) * (1 - core.flash * 0.5) + core.flash * 0.3,
      sharp: 0.35,
    },
  ];
};

/** She hangs in the air: the whole of her drifts up and down a little. */
const bob: Sheet['bob'] = (time) => Math.sin(time * 1.1) * 3;

/** Her, drawn with Canvas 2D: the finest cut there is of her, and what every image made for her is cut to. */
export const HIYOU_SHEET: Sheet = {
  id: 'hiyou',
  faces: FACES,
  layers: [
    ...wing(-1, 'L', sparL),
    ...wing(1, 'R', sparR),
    layer('backHair', 'Head', 'hairBack', 'whole', [backHair], () => backHair),
    layer('hover', null, 'hover', 'whole', [hover], () => hover),
    layer('torso', 'Body', 'torso', 'state', torso, byState(torso), undefined, bodyHome),
    layer('arm.L', 'LeftArm', 'arm.L', 'state', armL, byState(armL), armMove(-1), armHome),
    layer(
      'pauldron.L',
      'LeftShoulder',
      'pauldron.L',
      'state',
      pauldronL,
      byState(pauldronL),
      pauldronMove(-1),
      pauldronHome,
    ),
    layer('arm.R', 'RightArm', 'arm.R', 'state', armR, byState(armR), armMove(1), armHome),
    layer(
      'pauldron.R',
      'RightShoulder',
      'pauldron.R',
      'state',
      pauldronR,
      byState(pauldronR),
      pauldronMove(1),
      pauldronHome,
    ),
    layer('face', 'Head', 'face', 'face', face, byFace(face), headMove),
    layer('hairFront', 'Head', 'hairFront', 'whole', [hairFront], () => hairFront, headMove),
    layer(
      'coreGem',
      'Core',
      'core',
      'whole',
      [coreGem],
      () => coreGem,
      (frame) => ({ rot: frame.time * 0.3 }),
      coreHome,
    ),
    layer(
      'coreArc0',
      'Core',
      'core',
      'whole',
      [coreArc[0]!],
      () => coreArc[0]!,
      (frame) => ({ rot: frame.time * 1.7 }),
      coreHome,
    ),
    layer(
      'coreArc1',
      'Core',
      'core',
      'whole',
      [coreArc[1]!],
      () => coreArc[1]!,
      (frame) => ({ rot: frame.time * 1.7 + Math.PI }),
      coreHome,
    ),
    layer('shield', 'CoreShield', 'shield', 'whole', [shield], () => shield, shieldMove, coreHome),
  ],
  bob,
  lights: coreLights,
};

/** Every picture of her, by id. */
export const PIECES: ReadonlyMap<string, Shot> = new Map(
  HIYOU_SHEET.layers.flatMap((each) => each.shots.map((eachShot) => [eachShot.id, eachShot] as const)),
);

/** Where every picture goes this frame, back to front. The list is reused from call to call. */
export function placeHiyou(frame: BossFrame, out: Placed[] = []): Placed[] {
  return place(HIYOU_SHEET, frame, out);
}

// ───────────────────────────── her, made of images ─────────────────────────────

/** Figure units to world units: one place to change how big she stands in the arena. */
export const HIYOU_SCALE = 0.92;

/** The joint a whole wing swings on: the root of its spar. */
const WING_ROOT = [30, -96 + BODY_Y] as const;

/**
 * A whole wing, one picture, swings about its root. The blades of a wing drawn with Canvas 2D each
 * breathe on their own, which one picture cannot; so the wings are the one group that moves another
 * way cut coarse from cut fine. They swing in time with the blades' breathing, and a touch out of
 * step with each other.
 */
const wingMove =
  (side: -1 | 1): Layer['move'] =>
  (frame) =>
    about(
      side * WING_ROOT[0],
      WING_ROOT[1],
      side * Math.sin(frame.time * 1.7 + (side > 0 ? 0 : 0.6)) * 1.4 * DEG,
    );

/** How they move. Left out: they are only knocked with their part. */
const imageMove = (group: string): Layer['move'] | undefined => {
  switch (group) {
    case 'wing.L':
      return wingMove(-1);
    case 'wing.R':
      return wingMove(1);
    case 'arm.L':
      return armMove(-1);
    case 'arm.R':
      return armMove(1);
    case 'pauldron.L':
      return pauldronMove(-1);
    case 'pauldron.R':
      return pauldronMove(1);
    case 'face':
    case 'hairFront':
      return headMove;
    case 'shield':
      return shieldMove;
    // The core is one picture there: its stone and its arcs turn together.
    case 'core':
      return (frame) => ({ rot: frame.time * 0.8 });
    default:
      return undefined;
  }
};

/**
 * Her from a set of images made for her: one for every slot `imageSlots(HIYOU_SHEET)` names, and no
 * group half supplied — a group with an image missing is left out altogether. An image is stretched
 * over its slot, so it should be drawn to the slot's shape.
 */
export function hiyouFromImages(image: (name: string) => CanvasImageSource | undefined): Sheet {
  return sheetFromImages('hiyou-images', imageSlots(HIYOU_SHEET), image, {
    move: imageMove,
    bob,
    lights: coreLights,
  });
}

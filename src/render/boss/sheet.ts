import { type BossFrame, type BossPartId, type FaceId, type PartLook, type PartState } from './types';

/**
 * A character boss as layers: the one shape the simulation, the drawing and the atlas all agree on.
 *
 * A boss is made of parts (`BossPartId`) — the simulation owns them, and a part is in one of a few
 * states. How she looks is a sheet: an ordered list of layers, each belonging to a part and holding
 * one picture per state the part can show (and, for a face, one per expression). A frame is placed
 * by asking every layer which of its pictures shows and where it goes; the atlas is made by drawing
 * every picture of every layer once.
 *
 * Nothing here knows what she looks like. A sheet may be drawn with Canvas 2D (`hiyou/draw/pieces.ts`)
 * or made of images — a set generated for her, one file a picture (`sheetFromImages`) — and the
 * simulation, the atlas, the shader and the renderer cannot tell the two apart. That is the point:
 * the art can be replaced without touching anything above it, and a boss with more states is a
 * sheet with more pictures to a layer.
 *
 * A layer is the smallest thing that moves as one. A sheet drawn with Canvas 2D may be cut as fine
 * as it likes — a blade a layer, so that each can breathe; a sheet of images is cut as coarsely as
 * its pictures are — a whole wing a layer, which swings as one. The parts, and so the fight, are the
 * same either way.
 */

/** Bounds in figure units, [left, top, right, bottom]. */
export type Box = readonly [number, number, number, number];

/** One picture as it goes into the atlas: where it lies in its layer's frame, and how it is drawn there. */
export interface Shot {
  /** Unique in its sheet. */
  id: string;
  /**
   * What it is a picture of: the state of its part (`intact`, `damaged_1`, `damaged_2`), the
   * expression, or `whole` where a layer has but one picture. It is the second half of the name of
   * an image made for it (see `imageSlots`).
   */
  variant: string;
  /** Where it lies in its layer's frame, in figure units. Nothing may be drawn outside it. */
  box: Box;
  /**
   * Draws it into the atlas. The context is already in the layer's frame, scaled, with the box's
   * top left corner at the corner of the picture's place in the atlas.
   */
  paint: (ctx: CanvasRenderingContext2D) => void;
}

/** Where a layer's frame is put for a frame: its origin in figure units, its turn, and whether it is flipped first. */
export interface Pose {
  x: number;
  y: number;
  /** Radians, about the origin of the layer's frame. */
  rot: number;
  /** The layer is flipped left to right in its own frame before it is turned. */
  mirror: boolean;
  alpha: number;
}

/** What a layer's pictures vary with. */
export type Variants = 'state' | 'face' | 'whole';

export interface Layer {
  /** Unique in its sheet. */
  id: string;
  /**
   * The part it belongs to: it is not placed while the part is destroyed, the white of a hit on the
   * part washes it, and it goes where the part is knocked. Null for what belongs to no part.
   */
  part: BossPartId | null;
  /**
   * The pictures an image made for her comes as: layers of one group are covered by one image a
   * variant (`imageSlots`). A sheet drawn with Canvas 2D may spread many layers over one group.
   */
  group: string;
  variants: Variants;
  shots: readonly Shot[];
  /**
   * Another group whose images serve this one too: the two are the same thing the other way about
   * (a wing and its twin), so one picture is made for both. They must agree on their variants, and
   * this group lies in its box as the other's does in its own.
   */
  shares?: string;
  /** Which of its pictures shows this frame. Null: none. Not asked while the part is destroyed. */
  show: (frame: BossFrame, look: PartLook) => Shot | null;
  /**
   * Where it goes this frame, beside being knocked with its part, which every layer is. Left out:
   * it stays where it was drawn.
   */
  move?: (frame: BossFrame, look: PartLook) => Partial<Pose>;
  /**
   * Where it is anchored when nothing moves: its bind pose. A picture made for it is drawn to this,
   * and `imageSlots` measures it here. What its motion adds on top — a turn about a pivot carries
   * the layer's origin along — is no part of it.
   */
  home?: Partial<Pose>;
}

/** A light thrown under the field, in figure units. */
export interface SheetLight {
  x: number;
  y: number;
  reach: number;
  /** 0xRRGGBB. */
  color: number;
  alpha: number;
  sharp: number;
}

export interface Sheet {
  id: string;
  /** Back to front. */
  layers: readonly Layer[];
  /** Her expressions, as the layers' `face` pictures are named. */
  faces: readonly FaceId[];
  /** How far the whole of her has drifted from where she stands at a moment: she hangs in the air. */
  bob: (time: number) => number;
  lights: (frame: BossFrame) => readonly SheetLight[];
}

/** One picture placed for a frame. The list it is in is reused from frame to frame. */
export interface Placed {
  shot: Shot;
  /** The group of layers its layer belongs to: which of her it is a piece of, for pictures made for her. */
  group: string;
  /** The origin of its layer's frame, in figure units: where it was drawn, its own motion, and its part's knock. */
  x: number;
  y: number;
  rot: number;
  mirror: boolean;
  alpha: number;
  /** The look of the part it belongs to. */
  look: PartLook;
}

/** How a layer with no part is looked at: whole, and never knocked. */
export const NO_PART: PartLook = { state: 'intact', flash: 0, dx: 0, dy: 0 };

/** The states a part is drawn in. One that is destroyed is not drawn. */
export const DRAWN: readonly PartState[] = ['intact', 'damaged_1', 'damaged_2'];

/**
 * Where every picture goes this frame, back to front. Pure: the same frame gives the same list.
 * `out` is cleared and filled, and returned. `still` places her as she stands in a picture made
 * for her: anchored, and not moving.
 */
export function place(sheet: Sheet, frame: BossFrame, out: Placed[] = [], still = false): Placed[] {
  out.length = 0;
  for (const layer of sheet.layers) {
    const look = layer.part ? frame.look[layer.part] : NO_PART;
    if (look.state === 'destroyed') continue;
    const shot = layer.show(frame, look);
    if (!shot) continue;
    const pose = still ? undefined : layer.move ? layer.move(frame, look) : undefined;
    const home = layer.home;
    out.push({
      shot,
      group: layer.group,
      // The knock is in figure units, the same way about on both sides of her.
      x: (home?.x ?? 0) + (pose?.x ?? 0) + look.dx,
      y: (home?.y ?? 0) + (pose?.y ?? 0) + look.dy,
      rot: (home?.rot ?? 0) + (pose?.rot ?? 0),
      mirror: (home?.mirror ?? false) || (pose?.mirror ?? false),
      alpha: pose?.alpha ?? 1,
      look,
    });
  }
  return out;
}

/** Every picture of a sheet once, in the order of its layers. Throws if two share an id. */
export function allShots(sheet: Sheet): Shot[] {
  // A picture may lie in more layers than one — the blades serve both of her wings — and is baked once.
  const shots = new Map<string, Shot>();
  for (const layer of sheet.layers) {
    for (const shot of layer.shots) {
      const known = shots.get(shot.id);
      if (known && known !== shot) throw new Error(`Two pictures of ${sheet.id} are named "${shot.id}".`);
      shots.set(shot.id, shot);
    }
  }
  return [...shots.values()];
}

// ───────────────────────────── ways of choosing a picture ─────────────────────────────

const byVariant =
  (shots: readonly Shot[]): Layer['show'] =>
  (_frame, look) =>
    shots.find((shot) => shot.variant === look.state) ?? null;

/** The picture of the part's state. */
export const byState = (shots: readonly Shot[]): Layer['show'] => byVariant(shots);

/** The picture of her expression. */
export const byFace =
  (shots: readonly Shot[]): Layer['show'] =>
  (frame) =>
    shots.find((shot) => shot.variant === frame.face) ?? null;

/** The one picture there is. */
export const whole =
  (shots: readonly Shot[]): Layer['show'] =>
  () =>
    shots[0] ?? null;

/** Turning about a point other than the origin of a layer's frame: where that puts the origin. */
export function about(px: number, py: number, theta: number): Partial<Pose> {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return { x: px * (1 - c) + py * s, y: py * (1 - c) - px * s, rot: theta };
}

// ───────────────────────────── sheets made of images ─────────────────────────────

/** One image a sheet of images is made from. */
export interface ImageSlot {
  /** `${group}.${variant}`: the image's name. */
  name: string;
  group: string;
  variant: string;
  by: Variants;
  part: BossPartId | null;
  /**
   * Where the image lies when she is at rest, in figure units: every picture of the group, at every
   * variant, drawn where its layer puts it and not turned. One box for the whole group, so that no
   * variant of it is drawn to another scale than the rest.
   */
  box: Box;
  /**
   * The group whose image serves this one: then this group has no image of its own. The image of
   * the other lies over this box the other way about — stretched over it with its left and right
   * exchanged — and so the two boxes must be each other's reflection.
   */
  shared?: string | null;
}

/** The width and height of a box. */
export const sizeOf = ([x0, y0, x1, y1]: Box): readonly [number, number] => [x1 - x0, y1 - y0];

/**
 * What a set of images made for her has to hold: one image for every group of layers and every
 * variant the group comes in. This is the brief handed to whoever — or whatever — draws her.
 */
export function imageSlots(sheet: Sheet): ImageSlot[] {
  // The groups in the order their lowest layer is drawn.
  const groups = new Map<
    string,
    { part: BossPartId | null; by: Variants; layers: Layer[]; shares: string | undefined }
  >();
  for (const layer of sheet.layers) {
    let entry = groups.get(layer.group);
    if (!entry) {
      entry = { part: layer.part, by: layer.variants, layers: [], shares: layer.shares };
      groups.set(layer.group, entry);
    } else if (entry.part !== layer.part || entry.by !== layer.variants || entry.shares !== layer.shares) {
      throw new Error(
        `The layers of ${layer.group} disagree about their part, their variants or what they share.`,
      );
    }
    entry.layers.push(layer);
  }
  const slots: ImageSlot[] = [];
  for (const [group, { part, by, layers }] of groups) {
    let box: Box | null = null;
    for (const layer of layers) {
      const home = layer.home;
      const c = Math.cos(home?.rot ?? 0);
      const s = Math.sin(home?.rot ?? 0);
      for (const shot of layer.shots) {
        // Where the picture's corners lie where it is anchored, turned as it is anchored: an image
        // is drawn to that, and only her motion turns it further.
        const [x0, y0, x1, y1] = shot.box;
        const corners = [x0, x1].flatMap((x) => [y0, y1].map((y) => [x, y] as const));
        const turned = (x: number): number => (home?.mirror ? -x : x);
        const wx = corners.map(([x, y]) => c * turned(x) - s * y + (home?.x ?? 0));
        const wy = corners.map(([x, y]) => s * turned(x) + c * y + (home?.y ?? 0));
        const at: Box = [Math.min(...wx), Math.min(...wy), Math.max(...wx), Math.max(...wy)];
        box = box
          ? [
              Math.min(box[0], at[0]),
              Math.min(box[1], at[1]),
              Math.max(box[2], at[2]),
              Math.max(box[3], at[3]),
            ]
          : at;
      }
    }
    const variants =
      by === 'state' ? DRAWN : by === 'face' ? sheet.faces : [layers[0]!.shots[0]?.variant ?? 'whole'];
    for (const variant of variants) {
      if (box) slots.push({ name: `${group}.${variant}`, group, variant, by, part, box, shared: null });
    }
  }
  // A group that shares has no image of its own: the other's lies over its box the other way about.
  // The one asked for the picture first: not itself sharing one, or sharing with a group that is.
  const pictureOf = (group: string, seen: readonly string[] = []): string => {
    if (seen.includes(group))
      throw new Error(`The groups ${[...seen, group].join(' and ')} share each other's images.`);
    const shares = groups.get(group)!.shares;
    return shares ? pictureOf(shares, [...seen, group]) : group;
  };
  for (const slot of slots) {
    const with_ = groups.get(slot.group)!.shares;
    if (!with_) continue;
    const other = slots.find((each) => each.group === pictureOf(slot.group) && each.variant === slot.variant);
    if (!other)
      throw new Error(`The group ${slot.group} shares with ${with_}, which has no image "${slot.variant}".`);
    // The picture lies over this box with its left and right exchanged: so the two boxes must be
    // each other's reflection, or it would be drawn to another shape than it was made for.
    const mirrored: Box = [-other.box[2], other.box[1], -other.box[0], other.box[3]];
    if (mirrored.some((value, at) => Math.abs(value - slot.box[at]!) > 0.01)) {
      throw new Error(
        `The image of ${other.group} cannot lie over ${slot.group} the other way about: their boxes are not each other's reflection (${other.group} ${mirrored.join(', ')}; ${slot.group} ${slot.box.join(', ')}).`,
      );
    }
    slot.shared = pictureOf(slot.group);
  }
  return slots;
}

/** What a sheet of images needs to know that its images cannot say. */
export interface ImageSheetMotion {
  /** How a group moves, if it does. Left out: it is only knocked with its part. */
  move?: (group: string, slot: ImageSlot) => Layer['move'] | undefined;
  /** Where a group is anchored. Left out: where it was drawn. */
  home?: (group: string, slot: ImageSlot) => Partial<Pose> | undefined;
  bob: Sheet['bob'];
  lights: Sheet['lights'];
}

/**
 * The sheet a set of images makes: a layer for every group, a picture for every image. `image` hands
 * over the image of a name, or nothing — and a group with an image missing is left out of the sheet
 * altogether rather than drawn half there. An image is stretched over its slot's box.
 */
export function sheetFromImages(
  id: string,
  slots: readonly ImageSlot[],
  image: (name: string) => CanvasImageSource | undefined,
  motion: ImageSheetMotion,
): Sheet {
  const byGroup = new Map<string, ImageSlot[]>();
  for (const slot of slots) byGroup.set(slot.group, [...(byGroup.get(slot.group) ?? []), slot]);
  const layers: Layer[] = [];
  for (const [group, own] of byGroup) {
    // The picture of a group that shares is the other's, flipped.
    const images = own.map((slot) => ({
      slot,
      image: image(slot.shared ? `${slot.shared}.${slot.variant}` : slot.name),
    }));
    if (images.some((each) => !each.image)) continue;
    const first = own[0]!;
    const shots: Shot[] = images.map(({ slot, image: source }) => {
      const [x0, y0, x1] = slot.box;
      const [w, h] = sizeOf(slot.box);
      return {
        id: slot.name,
        variant: slot.variant,
        box: slot.box,
        paint: (ctx) => {
          if (!slot.shared) {
            ctx.drawImage(source!, x0, y0, w, h);
            return;
          }
          // The other way about: drawn from 0 to its width, flipped, it lies from this point back
          // towards the left — so its left edge is put along this box's right edge, and it covers
          // the box exactly.
          ctx.save();
          ctx.translate(x1, 0);
          ctx.scale(-1, 1);
          ctx.drawImage(source!, 0, y0, w, h);
          ctx.restore();
        },
      };
    });
    layers.push({
      id: group,
      part: first.part,
      group,
      variants: first.by,
      shots,
      show: first.by === 'state' ? byState(shots) : first.by === 'face' ? byFace(shots) : whole(shots),
      move: motion.move?.(group, first),
    });
  }
  // Her expressions are whatever the face group's images are named for.
  const faces = slots.filter((slot) => slot.by === 'face').map((slot) => slot.variant as FaceId);
  return { id, layers, faces, bob: motion.bob, lights: motion.lights };
}

// ───────────────────────────── drawn straight onto a canvas ─────────────────────────────

const rgba = (hex: number, alpha: number): string =>
  `rgba(${(hex >> 16) & 255},${(hex >> 8) & 255},${hex & 255},${alpha})`;

const buffer: Placed[] = [];

/**
 * One picture placed, drawn where it was placed with whatever its `paint` does — the other way a
 * sheet reaches a screen, for looking at her while she is drawn. `turned` false draws it upright
 * where it is placed, flipped if it is flipped: what an image made for her is a picture of.
 */
export function drawPlaced(ctx: CanvasRenderingContext2D, placed: Placed, turned = true): void {
  ctx.save();
  ctx.translate(placed.x, placed.y);
  if (turned && placed.rot !== 0) ctx.rotate(placed.rot);
  if (placed.mirror) ctx.scale(-1, 1);
  ctx.globalAlpha = placed.alpha;
  placed.shot.paint(ctx);
  ctx.restore();
}

/** A sheet for one frame, straight onto a canvas. `frame.x` and `frame.y` are where the origin of the figure goes. */
export function drawSheet(ctx: CanvasRenderingContext2D, sheet: Sheet, frame: BossFrame): void {
  ctx.save();
  ctx.translate(frame.x, frame.y + sheet.bob(frame.time));
  for (const light of sheet.lights(frame)) {
    const reach = light.reach + 2;
    const lit = rgba(light.color, light.alpha);
    const wash = ctx.createRadialGradient(light.x, light.y, 0, light.x, light.y, light.reach);
    wash.addColorStop(0, lit);
    wash.addColorStop(Math.min(1, light.sharp), lit);
    wash.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = wash;
    ctx.fillRect(light.x - reach, light.y - reach, reach * 2, reach * 2);
  }
  for (const placed of place(sheet, frame, buffer)) drawPlaced(ctx, placed);
  ctx.restore();
}

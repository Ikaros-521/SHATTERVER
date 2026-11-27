import type { Pen, PictureRect } from '../batch';
import type { GL } from '../gl';
import { allShots, place, type Placed, type Sheet, type Shot } from './sheet';
import { makeBakingCanvas } from '../textAtlas';
import type { BossFrame } from './types';

/**
 * A sheet baked into one atlas, and drawn from it.
 *
 * Every picture of the sheet (`sheet.ts`) is drawn once into a square canvas and uploaded as one
 * texture — the way the damage numbers are (see `textAtlas.ts`). From then on a frame costs no
 * drawing at all: every picture she is showing is one quad that samples its rectangle of the atlas,
 * turned and put where `place` says. Which is the whole of her motion, her damage and her
 * expressions: a cracked pauldron, a torn blade and a laughing face are each another rectangle of the
 * same texture.
 *
 * It is the same for a sheet drawn with Canvas 2D and a sheet made of images: by the time a picture
 * reaches here it is a `paint` and a box.
 *
 * Nothing is baked twice. The atlas is made when a boss first comes on screen and thrown away when
 * she is gone for good; a fight that never reaches her never pays for it.
 */

/** Pixels to a figure unit in the atlas. A figure unit is about a world unit, which is a CSS pixel and a bit; this leaves her crisp at three times the density. */
export const ATLAS_SCALE = 2.4;

/** The atlas is a square of this many pixels. Every GPU made in the last decade takes one. */
export const ATLAS_SIZE = 2048;

/** Transparent pixels kept between pictures, so that none bleeds into its neighbour when filtered. */
export const GUTTER = 2;

/** One picture in the atlas: the rectangle of it the quad samples, and the quad's middle and half extents in its layer's frame. */
export interface Picture extends PictureRect {
  /** Half extents, in figure units. */
  hw: number;
  hh: number;
  /** The middle, in figure units: a layer's frame need not be the middle of what it draws. */
  cx: number;
  cy: number;
}

/** Everything about a sheet that the renderer needs beyond its layers. */
export interface PictureAtlas {
  texture: WebGLTexture;
  pictures: ReadonlyMap<string, Picture>;
  /** Pixels to a figure unit the pictures were baked at. */
  scale: number;
}

/**
 * Packs rectangles into rows, the tallest first so that the rows are level: where each one goes,
 * in pixels from the atlas's corner, clear of the gutter. Null if they do not all fit.
 */
export function packRows(
  sizes: readonly (readonly [string, number, number])[],
  size: number,
  gutter = GUTTER,
): Map<string, [number, number]> | null {
  const slots = new Map<string, [number, number]>();
  // The sort is stable, so pictures of a height keep the order they were given in.
  const order = [...sizes].sort((a, b) => b[2] - a[2]);
  let x = 0;
  let y = 0;
  let row = 0;
  for (const [key, width, height] of order) {
    const w = width + gutter * 2;
    const h = height + gutter * 2;
    if (w > size || h > size) return null;
    if (x + w > size) {
      x = 0;
      y += row;
      row = 0;
    }
    if (y + h > size) return null;
    slots.set(key, [x + gutter, y + gutter]);
    x += w;
    row = Math.max(row, h);
  }
  return slots;
}

/** The density a picture is baked at: the atlas's, less whatever the picture gives up. */
export const shotScale = (shot: Shot, scale: number): number => scale * (shot.density ?? 1);

/** The size each picture of a sheet takes in the atlas, in pixels: [id, width, height]. */
export function shotSizes(sheet: Sheet, scale: number): [string, number, number][] {
  return allShots(sheet).map((shot) => {
    const [x0, y0, x1, y1] = shot.box;
    const at = shotScale(shot, scale);
    return [shot.id, Math.ceil((x1 - x0) * at), Math.ceil((y1 - y0) * at)];
  });
}

/** The least density a sheet is baked at rather than refused. */
const LEAST_SCALE = 0.25;

/**
 * The most pixels to a figure unit at which every picture of a sheet fits an atlas of `size`, never
 * more than `most`. A sheet of images is coarser than one drawn with Canvas 2D — a whole wing to a
 * picture, not a blade — and so takes more of the atlas to the picture: it is baked a little less
 * dense rather than not baked at all. 0 if it fits at no density worth having.
 */
export function fitScale(sheet: Sheet, size = ATLAS_SIZE, most = ATLAS_SCALE): number {
  if (packRows(shotSizes(sheet, most), size)) return most;
  let low = LEAST_SCALE / 2;
  let high = most;
  if (!packRows(shotSizes(sheet, low), size)) return 0;
  for (let i = 0; i < 10; i++) {
    const mid = (low + high) / 2;
    if (packRows(shotSizes(sheet, mid), size)) low = mid;
    else high = mid;
  }
  // A density is only kept if it fits beyond doubt: rounded down, and a hundredth under.
  return Math.max(LEAST_SCALE, Math.floor(low * 100) / 100 - 0.01);
}

/**
 * Draws every picture of a sheet into a fresh atlas and uploads it, at `scale` pixels to a figure
 * unit — the densest that fits (see `fitScale`) unless one is given. Throws if the one given does
 * not fit, or if the sheet fits at no density worth having.
 */
export function bakeSheet(
  gl: GL,
  sheet: Sheet,
  size = ATLAS_SIZE,
  scale = fitScale(sheet, size),
): PictureAtlas {
  const shots = allShots(sheet);
  if (scale < LEAST_SCALE) {
    throw new Error(`The pictures of ${sheet.id} fit an atlas of ${size} at no density above ${scale}.`);
  }
  const slots = packRows(shotSizes(sheet, scale), size);
  if (!slots) throw new Error(`The pictures of ${sheet.id} do not fit an atlas of ${size} at ${scale}.`);
  const canvas = makeBakingCanvas();
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas is not available.');
  const pictures = new Map<string, Picture>();
  for (const shot of shots) {
    const [sx, sy] = slots.get(shot.id)!;
    const [x0, y0, x1, y1] = shot.box;
    const w = x1 - x0;
    const h = y1 - y0;
    // A picture may be baked coarser than its neighbours (see `Shot.density`).
    const at = shotScale(shot, scale);
    // The layer's frame, scaled, with the box's corner at the slot's corner; and nothing drawn
    // outside the box, which would run into the gutter and the next picture.
    ctx.setTransform(at, 0, 0, at, sx - x0 * at, sy - y0 * at);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0, w, h);
    ctx.clip();
    shot.paint(ctx);
    ctx.restore();
    // A picture samples its slot from half a pixel in: the quad's edge then shows the first texel whole, not half of it and half of the gutter.
    pictures.set(shot.id, {
      u0: (sx + 0.5) / size,
      v0: (sy + 0.5) / size,
      u1: (sx + w * at - 0.5) / size,
      v1: (sy + h * at - 0.5) / size,
      hw: w / 2,
      hh: h / 2,
      cx: (x0 + x1) / 2,
      cy: (y0 + y1) / 2,
    });
  }

  const g = gl.gl;
  const texture = g.createTexture();
  if (!texture) throw new Error('Could not allocate the boss atlas.');
  g.bindTexture(g.TEXTURE_2D, texture);
  g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL, false);
  // Premultiplied: the frame is blended that way, and so a filtered edge does not drag the colour of transparent pixels in.
  g.pixelStorei(g.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  try {
    g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, g.RGBA, g.UNSIGNED_BYTE, canvas);
  } finally {
    g.pixelStorei(g.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  }
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR);
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
  return { texture, pictures, scale };
}

/** The placement of one frame, kept from the last: placing is an action performed many times a second. */
const placed: Placed[] = [];

/**
 * Draws a sheet for one frame from its atlas: every picture `place` puts down, as a quad sampling
 * its rectangle of the atlas, back to front. `frame.x` and `frame.y` are where the origin of the
 * figure stands, in world units; `scale` is world units to figure units.
 */
export function paintSheet(
  pen: Pen,
  frame: BossFrame,
  sheet: Sheet,
  atlas: PictureAtlas,
  scale: number,
): void {
  const k = scale;
  const ox = frame.x;
  const oy = frame.y + sheet.bob(frame.time) * k;
  for (const piece of place(sheet, frame, placed)) {
    const picture = atlas.pictures.get(piece.shot.id);
    if (!picture) continue;
    // The quad's middle in the picture's frame; a picture flipped left to right has it the other way about.
    const cx = piece.mirror ? -picture.cx : picture.cx;
    const cy = picture.cy;
    const c = Math.cos(piece.rot);
    const s = Math.sin(piece.rot);
    pen.bossPicture(
      ox + (piece.x + c * cx - s * cy) * k,
      oy + (piece.y + s * cx + c * cy) * k,
      picture.hw * k,
      picture.hh * k,
      piece.rot,
      picture,
      piece.alpha,
      piece.flash,
      piece.mirror,
      piece.ghost,
    );
  }
  // What she throws on the field around her goes down beneath it, where it belongs.
  for (const light of sheet.lights(frame)) {
    pen.haze(
      ox + light.x * k,
      oy + light.y * k,
      light.reach * k,
      light.reach * k,
      light.color,
      light.alpha,
      light.sharp,
    );
  }
}

import type { Pen, PictureRect } from '../batch';
import type { GL } from '../gl';
import {
  AT_REST,
  CORE_REACH,
  PIECES,
  PIECE_KEYS,
  coreLight,
  placeHiyou,
  type Placed,
} from './hiyou/draw/pieces';
import { makeBakingCanvas } from '../textAtlas';
import type { BossFrame } from './types';

/**
 * 绯樱 baked into one atlas, and drawn from it.
 *
 * Her pieces (`hiyou/draw/pieces.ts`) are drawn once, at rest, into a square canvas with Canvas 2D
 * and uploaded as one texture — the way the damage numbers are (see `textAtlas.ts`). From then on a
 * frame costs no drawing at all: every piece she is showing is one quad that samples its rectangle
 * of the atlas, turned and put where `placeHiyou` says. Which is the whole of her motion, her damage
 * and her expressions: a cracked pauldron, a torn blade and a laughing face are each another
 * rectangle of the same texture.
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

/** One piece in the atlas: the rectangle of it the quad samples, and the quad's middle and half extents in the piece's own frame. */
export interface Picture extends PictureRect {
  /** Half extents, in figure units. */
  hw: number;
  hh: number;
  /** The middle, in figure units: a piece's frame need not be the middle of what it draws. */
  cx: number;
  cy: number;
}

/** Everything about her that the renderer needs beyond the pieces' painters. */
export interface PictureAtlas {
  texture: WebGLTexture;
  pictures: ReadonlyMap<string, Picture>;
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
  // The sort is stable, so pieces of a height keep the order they were given in.
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

/** The size each piece takes in the atlas, in pixels: [key, width, height]. */
export function pieceSizes(scale: number): [string, number, number][] {
  return PIECE_KEYS.map((key) => {
    const [x0, y0, x1, y1] = PIECES.get(key)!.box;
    return [key, Math.ceil((x1 - x0) * scale), Math.ceil((y1 - y0) * scale)];
  });
}

/** Draws every piece into a fresh atlas and uploads it. Throws if the pieces do not fit. */
export function bakeHiyou(gl: GL, scale = ATLAS_SCALE, size = ATLAS_SIZE): PictureAtlas {
  const slots = packRows(pieceSizes(scale), size);
  if (!slots) throw new Error('Her pieces do not fit in the atlas.');
  const canvas = makeBakingCanvas();
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas is not available.');
  const pictures = new Map<string, Picture>();
  for (const key of PIECE_KEYS) {
    const piece = PIECES.get(key)!;
    const [sx, sy] = slots.get(key)!;
    const [x0, y0, x1, y1] = piece.box;
    const w = x1 - x0;
    const h = y1 - y0;
    // The piece's frame, scaled, with its bounds' corner at the slot's corner; and nothing of it
    // outside its bounds, which would run into the gutter and the next piece.
    ctx.setTransform(scale, 0, 0, scale, sx - x0 * scale, sy - y0 * scale);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0, w, h);
    ctx.clip();
    piece.paint(ctx, AT_REST);
    ctx.restore();
    // A picture samples its slot from half a pixel in: the quad's edge then shows the first texel whole, not half of it and half of the gutter.
    pictures.set(key, {
      u0: (sx + 0.5) / size,
      v0: (sy + 0.5) / size,
      u1: (sx + w * scale - 0.5) / size,
      v1: (sy + h * scale - 0.5) / size,
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
  return { texture, pictures };
}

/** Figure units to world units: one place to change how big she stands in the arena. */
export const HIYOU_SCALE = 0.92;

/** The placement of one frame, kept from the last: placing is an action performed many times a second. */
const placed: Placed[] = [];

/**
 * Draws her for one frame from her atlas: every piece `placeHiyou` puts down, as a quad sampling
 * its rectangle of the atlas, back to front. `frame.x` and `frame.y` are where the top of her
 * breastbone stands, in world units.
 */
export function paintHiyou(pen: Pen, frame: BossFrame, atlas: PictureAtlas, scale = HIYOU_SCALE): void {
  const k = scale;
  const ox = frame.x;
  // She hangs in the air: the whole of her drifts up and down a little.
  const oy = frame.y + Math.sin(frame.time * 1.1) * 3 * k;
  for (const piece of placeHiyou(frame, placed)) {
    const picture = atlas.pictures.get(piece.key);
    if (!picture) continue;
    // The quad's middle in the piece's frame; a piece flipped left to right has it the other way about.
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
      piece.look.flash,
      piece.mirror,
    );
  }
  // The light the core throws goes down beneath the field, where it belongs.
  const light = coreLight(frame);
  if (light) {
    pen.haze(ox + light.x * k, oy + light.y * k, CORE_REACH * k, CORE_REACH * k, 0xff5fd8, light.alpha, 0.35);
  }
}

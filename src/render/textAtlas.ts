import type { GL } from './gl';

/**
 * Glyph atlas for in-world numbers ("1.2K", "999!").
 *
 * All other text in the game is DOM. Only damage numbers need to live inside the world —
 * hundreds per frame, moving and scaling — and uploading a texture per number would be ruinous,
 * so the twenty-five glyphs are baked once into a single strip and drawn as tinted quads.
 *
 * The strip covers exactly what `formatNumber` (core/math) and the crit suffix can emit:
 * digits, the unit letters K M B T Q S a i x p, the decimal point, the sign characters
 * "+"/"-", the crit mark "!", and "∞" for non-finite values.
 */

export const CHARS = '0123456789KMBTQSapix.-+∞!';
const FONT_SIZE = 96;
const PAD = 16;

export interface GlyphAtlas {
  texture: WebGLTexture;
  index: Record<string, number>;
  /** Advance to the next glyph, in multiples of the glyph size. */
  advance: Float32Array;
  /** Quad width of each glyph cell, in multiples of the glyph size. */
  width: Float32Array;
  u0: Float32Array;
  u1: Float32Array;
  /** Quad height, in multiples of the glyph size. */
  heightRatio: number;
}

export function createGlyphAtlas(gl: GL): GlyphAtlas {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas is not available');

  // Bahnschrift ships with Windows 10/11 and has the condensed, technical look the HUD wants.
  // Everything after it is a fallback for other platforms, in decreasing order of preference.
  const font = `"Bahnschrift", "DIN Alternate", "Roboto Condensed", "Arial Narrow", "Segoe UI", "Helvetica Neue", Arial, sans-serif`;
  ctx.font = `700 ${FONT_SIZE}px ${font}`;

  const metrics = [...CHARS].map((ch) => ctx.measureText(ch));
  const ascent = Math.max(...metrics.map((m) => m.actualBoundingBoxAscent || FONT_SIZE * 0.72));
  const descent = Math.max(...metrics.map((m) => m.actualBoundingBoxDescent || FONT_SIZE * 0.05));
  const cellWidths = metrics.map((m) => Math.ceil(m.width) + PAD * 2);
  const totalWidth = cellWidths.reduce((sum, w) => sum + w, 0) + 4;
  const height = Math.ceil(ascent + descent + PAD * 2);
  canvas.width = totalWidth;
  canvas.height = height;

  // Resizing the canvas resets its context, so font and fill styles are set again here.
  ctx.font = `700 ${FONT_SIZE}px ${font}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';

  const count = CHARS.length;
  const atlas: GlyphAtlas = {
    texture: null as unknown as WebGLTexture,
    index: {},
    advance: new Float32Array(count),
    width: new Float32Array(count),
    u0: new Float32Array(count),
    u1: new Float32Array(count),
    heightRatio: height / FONT_SIZE,
  };

  let x = 2;
  for (let i = 0; i < count; i++) {
    const cell = cellWidths[i] as number;
    const baseline = PAD + ascent;
    const gx = x + PAD;
    // A dark outline keeps numbers legible on top of bloom and debris.
    ctx.strokeStyle = 'rgba(4, 6, 16, 0.92)';
    ctx.lineWidth = 14;
    ctx.strokeText(CHARS[i] as string, gx, baseline);
    ctx.lineWidth = 22;
    ctx.globalAlpha = 0.35;
    ctx.strokeText(CHARS[i] as string, gx, baseline);
    ctx.globalAlpha = 1;
    // White body; instances supply the colour.
    const grad = ctx.createLinearGradient(0, baseline - ascent, 0, baseline + descent);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(1, '#dfe9ff');
    ctx.fillStyle = grad;
    ctx.fillText(CHARS[i] as string, gx, baseline);

    atlas.index[CHARS[i] as string] = i;
    atlas.advance[i] = (metrics[i]?.width ?? FONT_SIZE * 0.6) / FONT_SIZE + 0.04;
    atlas.width[i] = cell / FONT_SIZE;
    atlas.u0[i] = x / totalWidth;
    atlas.u1[i] = (x + cell) / totalWidth;
    x += cell;
  }

  const g = gl.gl;
  const texture = g.createTexture();
  if (!texture) throw new Error('Could not allocate the glyph atlas');
  g.bindTexture(g.TEXTURE_2D, texture);
  g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL, false);
  g.pixelStorei(g.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, g.RGBA, g.UNSIGNED_BYTE, canvas);
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR);
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
  atlas.texture = texture;
  return atlas;
}

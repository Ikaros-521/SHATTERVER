import { THEME_FACTS, type ThemeId } from '../render/themes/catalog';
import type { ThemeColors, ThemePartKind } from '../render/themes/types';

/**
 * Procedural thumbnails for the theme shelf.
 *
 * The shop is DOM, so a theme's preview cannot be the WebGL scene itself. These small canvas
 * drawings stand in for it: a set's three parts on one strip, and a tile per part. They only
 * have to say what a theme looks like — its colours, its shapes — and the real thing plays
 * behind the shop the moment it is equipped.
 *
 * They carry no text, so there is nothing here for the platform's review to read (AGENTS.md §3),
 * and they are drawn from the theme's data alone: the painters and shaders are never imported.
 */

type Ctx = CanvasRenderingContext2D;
type ScenePainter = (ctx: Ctx, w: number, h: number, c: ThemeColors) => void;
type PartPainter = (ctx: Ctx, x: number, y: number, size: number, c: ThemeColors) => void;

/** The set's preview strip, and each part's tile, in device pixels (shown at about half). */
const STRIP_W = 300;
const STRIP_H = 140;
const TILE = 96;

const TAU = Math.PI * 2;
const cache = new Map<string, string>();

const css = (hex: number): string => `#${hex.toString(16).padStart(6, '0')}`;
const rgba = (hex: number, alpha: number): string =>
  `rgba(${(hex >> 16) & 255},${(hex >> 8) & 255},${hex & 255},${alpha})`;

function make(width: number, height: number, paint: (ctx: Ctx) => void): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  paint(ctx);
  return canvas.toDataURL();
}

function polygon(ctx: Ctx, points: readonly (readonly [number, number])[]): void {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
}

function disc(ctx: Ctx, x: number, y: number, r: number, fill: string | CanvasGradient): void {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

/** A rod with round ends, lying along x. */
function capsule(ctx: Ctx, x: number, y: number, len: number, thick: number): void {
  const r = thick / 2;
  ctx.beginPath();
  ctx.moveTo(x - len + r, y - r);
  ctx.lineTo(x + len - r, y - r);
  ctx.arc(x + len - r, y, r, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(x - len + r, y + r);
  ctx.arc(x - len + r, y, r, Math.PI / 2, Math.PI * 1.5);
  ctx.closePath();
}

/** The sky and ground of every thumbnail: the theme's depths, with its colour glowing above. */
function base(ctx: Ctx, w: number, h: number, c: ThemeColors): void {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, css(c.depths[0]));
  g.addColorStop(1, css(c.depths[2]));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const glow = ctx.createRadialGradient(w * 0.5, 0, 0, w * 0.5, 0, w * 0.7);
  glow.addColorStop(0, rgba(c.primary, 0.2));
  glow.addColorStop(1, rgba(c.primary, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
}

// ───────────────────────────── scenes ─────────────────────────────

function sakuraScene(ctx: Ctx, w: number, h: number, c: ThemeColors): void {
  base(ctx, w, h, c);
  const m = Math.min(w, h);
  // The moon, in its halo.
  const mx = w * 0.76;
  const my = h * 0.28;
  disc(ctx, mx, my, m * 0.3, rgba(c.secondary, 0.2));
  disc(ctx, mx, my, m * 0.25, rgba(c.secondary, 0.16));
  disc(ctx, mx, my, m * 0.14, '#fff3e4');
  // Hills, then the nearer ridge, then the pond.
  ctx.fillStyle = '#2b1d58';
  polygon(ctx, [
    [0, h * 0.72],
    [w * 0.18, h * 0.5],
    [w * 0.36, h * 0.66],
    [w * 0.56, h * 0.46],
    [w * 0.78, h * 0.68],
    [w, h * 0.54],
    [w, h],
    [0, h],
  ]);
  ctx.fill();
  ctx.fillStyle = '#170f3c';
  polygon(ctx, [
    [0, h * 0.86],
    [w * 0.26, h * 0.68],
    [w * 0.5, h * 0.84],
    [w * 0.74, h * 0.66],
    [w, h * 0.8],
    [w, h],
    [0, h],
  ]);
  ctx.fill();
  ctx.fillStyle = '#120c30';
  ctx.fillRect(0, h * 0.87, w, h * 0.13);
  ctx.fillStyle = rgba(c.highlight, 0.3);
  ctx.fillRect(w * 0.745, h * 0.87, w * 0.03, h * 0.12);
  // Blossom in the upper corners.
  const bloom: readonly (readonly [number, number])[] = [
    [0.04, 0.12],
    [0.2, 0.04],
    [0.11, 0.32],
    [0.44, 0.05],
    [0.96, 0.07],
    [0.9, 0.3],
  ];
  bloom.forEach(([x, y], i) =>
    disc(
      ctx,
      w * x,
      h * y,
      m * (0.1 + (i % 3) * 0.03),
      i % 2 ? 'rgba(244,160,200,0.55)' : 'rgba(214,140,220,0.5)',
    ),
  );
  // A torii at the left.
  const tx = w * 0.16;
  const ty = h * 0.84;
  const s = m * 0.26;
  ctx.fillStyle = '#6b1626';
  ctx.fillRect(tx - s * 0.3, ty - s, s * 0.07, s);
  ctx.fillRect(tx + s * 0.23, ty - s, s * 0.07, s);
  ctx.fillRect(tx - s * 0.42, ty - s * 0.78, s * 0.84, s * 0.06);
  ctx.fillRect(tx - s * 0.36, ty - s, s * 0.72, s * 0.07);
}

function oceanScene(ctx: Ctx, w: number, h: number, c: ThemeColors): void {
  base(ctx, w, h, c);
  const m = Math.min(w, h);
  // Shafts of daylight, slanting down.
  ctx.globalAlpha = 0.14;
  ctx.fillStyle = css(c.highlight);
  for (let i = 0; i < 4; i++) {
    const x = w * (0.22 + i * 0.2);
    polygon(ctx, [
      [x, 0],
      [x + w * 0.05, 0],
      [x - w * 0.07, h],
      [x - w * 0.12, h],
    ]);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // The temple.
  const cx = w * 0.5;
  const ground = h * 0.78;
  const s = m * 0.5;
  ctx.fillStyle = '#0b3a6a';
  ctx.fillRect(cx - s * 0.52, ground - s * 0.05, s * 1.04, s * 0.05);
  for (let i = 0; i < 5; i++) {
    const x = cx + (i - 2) * s * 0.2;
    const tall = i === 2 ? 0.45 : i === 1 || i === 3 ? 0.8 : 1;
    ctx.fillRect(x - s * 0.03, ground - s * 0.05 - s * 0.42 * tall, s * 0.06, s * 0.42 * tall);
  }
  ctx.fillRect(cx - s * 0.46, ground - s * 0.52, s * 0.92, s * 0.05);
  polygon(ctx, [
    [cx - s * 0.5, ground - s * 0.52],
    [cx + s * 0.5, ground - s * 0.52],
    [cx, ground - s * 0.7],
  ]);
  ctx.fill();
  // Its one light.
  const g = ctx.createRadialGradient(cx, ground - s * 0.14, 0, cx, ground - s * 0.14, s * 0.22);
  g.addColorStop(0, rgba(c.highlight, 0.9));
  g.addColorStop(0.3, rgba(c.primary, 0.5));
  g.addColorStop(1, rgba(c.primary, 0));
  ctx.fillStyle = g;
  ctx.fillRect(cx - s * 0.3, ground - s * 0.4, s * 0.6, s * 0.4);
  ctx.fillStyle = css(c.highlight);
  ctx.fillRect(cx - s * 0.035, ground - s * 0.2, s * 0.07, s * 0.15);
  // Weed and coral, thick at the sides.
  ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const x = w * 0.5 + side * w * (0.36 + i * 0.05);
      ctx.strokeStyle = i === 0 ? '#d9717a' : '#2fb9a8';
      ctx.lineWidth = m * 0.03;
      ctx.beginPath();
      ctx.moveTo(x, h);
      ctx.bezierCurveTo(
        x - m * 0.06,
        h * 0.8,
        x + m * 0.06,
        h * 0.7,
        x + (i - 1) * m * 0.05,
        h * (0.46 + i * 0.08),
      );
      ctx.stroke();
    }
  }
  ctx.strokeStyle = rgba(c.highlight, 0.6);
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.arc(w * (0.14 + i * 0.19), h * (0.2 + ((i * 7) % 5) * 0.13), 2 + (i % 3) * 1.5, 0, TAU);
    ctx.stroke();
  }
}

function forestScene(ctx: Ctx, w: number, h: number, c: ThemeColors): void {
  base(ctx, w, h, c);
  const m = Math.min(w, h);
  // Daylight coming down, in shafts.
  const sun = ctx.createRadialGradient(w * 0.55, 0, 0, w * 0.55, 0, w * 0.6);
  sun.addColorStop(0, 'rgba(255,244,190,0.5)');
  sun.addColorStop(1, 'rgba(255,244,190,0)');
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 0.13;
  ctx.fillStyle = '#f4ffcf';
  for (let i = 0; i < 4; i++) {
    const x = w * (0.3 + i * 0.13);
    polygon(ctx, [
      [x, 0],
      [x + w * 0.035, 0],
      [x - w * 0.07, h],
      [x - w * 0.1, h],
    ]);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // The far wood, and the floor.
  ctx.fillStyle = '#14402a';
  for (let i = 0; i < 9; i++) ctx.fillRect(w * (0.06 + i * 0.11), h * 0.2, w * 0.016, h * 0.6);
  ctx.fillStyle = '#0d2e1a';
  ctx.fillRect(0, h * 0.78, w, h * 0.22);
  // A fall on the right.
  ctx.fillStyle = 'rgba(205,245,250,0.85)';
  ctx.fillRect(w * 0.84, h * 0.16, w * 0.05, h * 0.62);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillRect(w * 0.855, h * 0.16, w * 0.012, h * 0.62);
  // A hut with one lit window.
  const hx = w * 0.66;
  const hy = h * 0.78;
  const s = m * 0.2;
  ctx.fillStyle = '#3a3022';
  ctx.fillRect(hx - s * 0.5, hy - s * 0.6, s, s * 0.6);
  ctx.fillStyle = '#1d4a2c';
  polygon(ctx, [
    [hx - s * 0.62, hy - s * 0.6],
    [hx + s * 0.62, hy - s * 0.6],
    [hx, hy - s * 1.1],
  ]);
  ctx.fill();
  ctx.fillStyle = '#ffd27a';
  ctx.fillRect(hx - s * 0.12, hy - s * 0.42, s * 0.24, s * 0.22);
  // Two ancients flanking it all.
  ctx.fillStyle = '#2a2014';
  for (const side of [-1, 1]) {
    const x = w * 0.5 + side * w * 0.44;
    polygon(ctx, [
      [x - w * 0.035, 0],
      [x + w * 0.035, 0],
      [x + w * 0.06, h],
      [x - w * 0.06, h],
    ]);
    ctx.fill();
  }
  // Fireflies.
  for (let i = 0; i < 7; i++) {
    disc(ctx, w * (0.12 + i * 0.12), h * (0.3 + ((i * 5) % 7) * 0.08), m * 0.012, 'rgba(226,255,180,0.95)');
  }
}

const SCENES: Record<ThemeId, ScenePainter> = { sakura: sakuraScene, ocean: oceanScene, forest: forestScene };

// ───────────────────────────── paddles ─────────────────────────────
// Each is drawn about (x, y): `len` is its half length, `thick` its thickness.
type ThumbPaddle = (ctx: Ctx, x: number, y: number, len: number, thick: number, c: ThemeColors) => void;

/** The collision box as a bar of light in the theme's colours. */
function bar(ctx: Ctx, x: number, y: number, len: number, thick: number, c: ThemeColors, alpha = 1): void {
  const g = ctx.createLinearGradient(x - len, 0, x + len, 0);
  g.addColorStop(0, css(c.secondary));
  g.addColorStop(0.5, css(c.primary));
  g.addColorStop(1, css(c.secondary));
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.shadowColor = css(c.primary);
  ctx.shadowBlur = thick * 1.6;
  ctx.fillStyle = g;
  capsule(ctx, x, y, len, thick);
  ctx.fill();
  ctx.restore();
}

function blossom(ctx: Ctx, x: number, y: number, r: number, c: ThemeColors): void {
  for (let i = 0; i < 5; i++) {
    const a = (i * TAU) / 5 - Math.PI / 2;
    disc(ctx, x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6, r * 0.5, css(c.primary));
  }
  disc(ctx, x, y, r * 0.32, '#fff0c8');
}

function sakuraPaddle(ctx: Ctx, x: number, y: number, len: number, thick: number, c: ThemeColors): void {
  for (const side of [-1, 1]) {
    // A fan opened upwards from either end, leaning out.
    const px = x + side * len * 0.9;
    const reach = thick * 3.4;
    const from = -Math.PI / 2 + (side > 0 ? -0.9 : -0.4);
    const to = -Math.PI / 2 + (side > 0 ? 0.4 : 0.9);
    ctx.beginPath();
    ctx.moveTo(px, y);
    ctx.arc(px, y, reach, from, to);
    ctx.closePath();
    ctx.fillStyle = rgba(c.secondary, 0.4);
    ctx.fill();
    ctx.strokeStyle = rgba(c.highlight, 0.9);
    ctx.lineWidth = 1.2;
    for (let i = 0; i <= 4; i++) {
      const a = from + ((to - from) * i) / 4;
      ctx.beginPath();
      ctx.moveTo(px, y);
      ctx.lineTo(px + Math.cos(a) * reach, y + Math.sin(a) * reach);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(px, y, reach, from, to);
    ctx.stroke();
    blossom(ctx, x + side * len * 0.66, y, thick * 0.95, c);
  }
  bar(ctx, x, y, len, thick, c);
}

function oceanPaddle(ctx: Ctx, x: number, y: number, len: number, thick: number, c: ThemeColors): void {
  bar(ctx, x, y, len, thick, c, 0.85);
  for (const side of [-1, 1]) {
    // A crest rising from the tip and hooking over, away from the paddle.
    const bx = x + side * len;
    const rise = thick * 3.2;
    const out = thick * 1.9;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.shadowColor = css(c.primary);
    ctx.shadowBlur = thick;
    for (const [width, stroke] of [
      [thick * 0.7, css(c.primary)],
      [thick * 0.22, css(c.highlight)],
    ] as const) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(bx - side * thick * 0.4, y + thick * 0.4);
      ctx.bezierCurveTo(
        bx,
        y - rise * 0.4,
        bx + side * out * 0.2,
        y - rise,
        bx + side * out,
        y - rise * 0.92,
      );
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.strokeStyle = rgba(c.highlight, 0.8);
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(x + (i - 1) * len * 0.5, y - thick * (1.6 + i * 0.5), thick * 0.22 + i, 0, TAU);
    ctx.stroke();
  }
}

function forestPaddle(ctx: Ctx, x: number, y: number, len: number, thick: number, c: ThemeColors): void {
  // The bough: bowed up at its ends, a lighter ridge along its top.
  const bow = thick * 0.9;
  ctx.save();
  ctx.lineCap = 'round';
  for (const [width, stroke, lift, blur] of [
    [thick, '#8a6440', 0, thick],
    [thick * 0.3, '#b98d5c', thick * 0.18, 0],
  ] as const) {
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = blur;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x - len, y - bow - lift);
    ctx.quadraticCurveTo(x, y + bow * 0.5 - lift, x + len, y - bow - lift);
    ctx.stroke();
  }
  ctx.restore();
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const lx = x + side * len * (0.58 + i * 0.18);
      const ly = y - bow * 0.5 + (i === 1 ? thick * 1.2 : -thick * 1.2);
      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(side * (i === 1 ? 0.6 : -0.6));
      ctx.fillStyle = css(i === 1 ? c.primary : c.secondary);
      ctx.beginPath();
      ctx.ellipse(0, 0, thick * 1.1, thick * 0.45, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }
  // The life gem.
  const g = ctx.createLinearGradient(x, y - thick * 1.3, x, y + thick * 1.3);
  g.addColorStop(0, css(c.highlight));
  g.addColorStop(1, css(c.secondary));
  ctx.save();
  ctx.shadowColor = css(c.primary);
  ctx.shadowBlur = thick * 2;
  ctx.fillStyle = g;
  polygon(ctx, [
    [x, y - thick * 1.3],
    [x + thick * 0.85, y],
    [x, y + thick * 1.3],
    [x - thick * 0.85, y],
  ]);
  ctx.fill();
  ctx.restore();
}

const PADDLES: Record<ThemeId, ThumbPaddle> = {
  sakura: sakuraPaddle,
  ocean: oceanPaddle,
  forest: forestPaddle,
};

// ───────────────────────────── balls ─────────────────────────────
// Each is drawn about (x, y); `size` is its radius.

function halo(ctx: Ctx, x: number, y: number, r: number, c: ThemeColors): void {
  const g = ctx.createRadialGradient(x, y, r * 0.4, x, y, r * 2.8);
  g.addColorStop(0, rgba(c.primary, 0.55));
  g.addColorStop(1, rgba(c.primary, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r * 2.8, 0, TAU);
  ctx.fill();
}

/** A cut stone pointing up, in a diagonal light. */
function gem(ctx: Ctx, x: number, y: number, r: number, c: ThemeColors, tall = 1.2): void {
  const g = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
  g.addColorStop(0, css(c.highlight));
  g.addColorStop(0.45, css(c.primary));
  g.addColorStop(1, css(c.secondary));
  ctx.fillStyle = g;
  polygon(ctx, [
    [x, y - r * tall],
    [x + r, y],
    [x, y + r * tall],
    [x - r, y],
  ]);
  ctx.fill();
  ctx.fillStyle = rgba(c.highlight, 0.55);
  polygon(ctx, [
    [x, y - r * tall * 0.5],
    [x + r * 0.5, y],
    [x, y + r * tall * 0.5],
    [x - r * 0.5, y],
  ]);
  ctx.fill();
}

function sakuraBall(ctx: Ctx, x: number, y: number, r: number, c: ThemeColors): void {
  halo(ctx, x, y, r, c);
  ctx.strokeStyle = rgba(c.primary, 0.8);
  ctx.lineWidth = r * 0.12;
  ctx.beginPath();
  ctx.arc(x, y, r * 1.85, 0, TAU);
  ctx.stroke();
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(1, css(c.primary));
  disc(ctx, x, y, r, g);
  for (let i = 0; i < 3; i++) {
    const a = (i * TAU) / 3 - 0.4;
    ctx.save();
    ctx.translate(x + Math.cos(a) * r * 1.55, y + Math.sin(a) * r * 1.55);
    ctx.rotate(a);
    ctx.fillStyle = css(c.highlight);
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.42, r * 0.24, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

function oceanBall(ctx: Ctx, x: number, y: number, r: number, c: ThemeColors): void {
  halo(ctx, x, y, r * 0.9, c);
  // The skin of water.
  ctx.strokeStyle = rgba(c.highlight, 0.75);
  ctx.lineWidth = r * 0.1;
  ctx.beginPath();
  ctx.arc(x, y, r * 1.6, 0, TAU);
  ctx.stroke();
  gem(ctx, x, y, r, c);
  disc(ctx, x - r * 0.62, y - r * 0.62, r * 0.22, 'rgba(255,255,255,0.95)');
}

function forestBall(ctx: Ctx, x: number, y: number, r: number, c: ThemeColors): void {
  halo(ctx, x, y, r * 0.9, c);
  ctx.strokeStyle = rgba(c.primary, 0.75);
  ctx.lineWidth = r * 0.09;
  ctx.beginPath();
  ctx.arc(x, y, r * 1.6, 0, TAU);
  ctx.stroke();
  gem(ctx, x, y, r, c);
  for (let i = 0; i < 3; i++) {
    const a = (i * TAU) / 3 + 0.5;
    disc(ctx, x + Math.cos(a) * r * 1.6, y + Math.sin(a) * r * 1.6, r * 0.14, css(c.highlight));
  }
}

const BALLS: Record<ThemeId, PartPainter> = { sakura: sakuraBall, ocean: oceanBall, forest: forestBall };

// ───────────────────────────── entry ─────────────────────────────

/** The art id of a theme's preview strip: `theme:<id>`. */
export const themeArtId = (theme: ThemeId): string => `theme:${theme}`;

/** The art id of one part's tile: `theme:<id>:<paddle|ball|bg>`. */
export const themePartArtId = (theme: ThemeId, kind: ThemePartKind): string => `theme:${theme}:${kind}`;

/**
 * The thumbnail for a theme art id as a data URL, or null when the id is not one. Results are
 * cached: a thumbnail is drawn once and shown as many times as the shop re-renders.
 */
export function themeArt(id: string): string | null {
  const cached = cache.get(id);
  if (cached !== undefined) return cached || null;
  const [kind, themeId, part] = id.split(':');
  const theme = kind === 'theme' ? THEME_FACTS.find((entry) => entry.id === themeId) : undefined;
  if (!theme) return null;
  const c = theme.colors;
  const scene = SCENES[theme.id];
  const paddle = PADDLES[theme.id];
  const ball = BALLS[theme.id];
  const url =
    part === undefined
      ? // The set: its scene, its ball above its paddle.
        make(STRIP_W, STRIP_H, (ctx) => {
          scene(ctx, STRIP_W, STRIP_H, c);
          ball(ctx, STRIP_W / 2, STRIP_H * 0.4, 13, c);
          paddle(ctx, STRIP_W / 2, STRIP_H * 0.85, 86, 11, c);
        })
      : part === 'bg'
        ? make(TILE, TILE, (ctx) => scene(ctx, TILE, TILE, c))
        : part === 'paddle' || part === 'ball'
          ? // A part on its own, over a dimmed scene so it is what the eye lands on.
            make(TILE, TILE, (ctx) => {
              scene(ctx, TILE, TILE, c);
              ctx.fillStyle = 'rgba(5,6,15,0.5)';
              ctx.fillRect(0, 0, TILE, TILE);
              if (part === 'paddle') paddle(ctx, TILE / 2, 54, 31, 9, c);
              else ball(ctx, TILE / 2, TILE / 2, 13, c);
            })
          : null;
  if (!url) return null;
  cache.set(id, url);
  return url;
}

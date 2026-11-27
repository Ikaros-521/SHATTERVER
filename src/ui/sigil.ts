import { cssHex, TAU } from '../core/math';
import { hashString, RNG } from '../core/rng';

/**
 * Procedural upgrade icons.
 *
 * Rather than forty hand-drawn glyphs (or emojis), each upgrade gets a "sigil": a radially
 * symmetric geometric mark generated from a hash of its id. They are all built from the same
 * vocabulary — rings, ticks, star polygons, dots — so the set looks like one system while every
 * upgrade is individually recognisable.
 *
 * `drawSigil` is the platform-neutral core (a plain 2D context, no DOM); the DOM build wraps it
 * in a data URL for `<img>`, and the WeChat shell calls it directly on an offscreen canvas for
 * `drawImage` onto the HUD.
 */

const SIZE = 128;

/** A 2D context whose canvas this function fully owns (no clearing needed — drawn once). */
export function drawSigil(ctx: CanvasRenderingContext2D, id: string, color: number): void {
  const rng = new RNG(hashString(id));
  const pick = <T>(items: readonly T[]): T => rng.pick(items);
  const css = cssHex(color);
  const center = SIZE / 2;
  ctx.translate(center, center);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const symmetry = pick([3, 4, 5, 6, 8]);
  const spin = rng.range(0, TAU);

  /** Strokes the current path twice: a wide coloured halo, then a crisp light core. */
  const ink = (width: number, core = 'rgba(255,255,255,0.95)'): void => {
    ctx.strokeStyle = css;
    ctx.lineWidth = width * 2.6;
    ctx.globalAlpha = 0.2;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.shadowColor = css;
    ctx.shadowBlur = 14;
    ctx.strokeStyle = core;
    ctx.lineWidth = width;
    ctx.stroke();
    ctx.shadowBlur = 0;
  };

  // Outer ring, broken into dashes.
  ctx.save();
  ctx.rotate(spin);
  ctx.beginPath();
  ctx.arc(0, 0, rng.range(50, 55), 0, TAU);
  ctx.setLineDash([rng.range(10, 34), rng.range(5, 16)]);
  ink(2, css);
  ctx.setLineDash([]);
  ctx.restore();

  // Ticks between the ring and the motif.
  const ticks = symmetry * 2;
  ctx.save();
  ctx.rotate(spin / 2);
  for (let i = 0; i < ticks; i++) {
    if (rng.chance(0.3)) continue;
    ctx.rotate(TAU / ticks);
    ctx.beginPath();
    ctx.moveTo(42, 0);
    ctx.lineTo(47, 0);
    ink(2.5, css);
  }
  ctx.restore();

  // Main motif: a star or a plain polygon, possibly with an inner echo.
  const star = rng.chance(0.6);
  const points = star ? symmetry * 2 : symmetry;
  const outer = rng.range(30, 39);
  const inner = outer * rng.range(0.42, 0.66);
  const polygon = (radiusA: number, radiusB: number, scale = 1): void => {
    ctx.beginPath();
    for (let i = 0; i < points; i++) {
      const angle = (i / points) * TAU;
      const radius = (i % 2 === 0 || !star ? radiusA : radiusB) * scale;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  };
  ctx.save();
  ctx.rotate(spin);
  polygon(outer, inner);
  ink(3.5);
  if (rng.chance(0.5)) {
    polygon(outer, inner, 0.62);
    ink(2, css);
  }
  ctx.restore();

  // Radial spokes from the motif out to the ticks, with a dot at the tip.
  if (rng.chance(0.55)) {
    const tip = Math.max(outer + 7, 39);
    ctx.save();
    ctx.rotate(spin + TAU / (symmetry * 2));
    for (let i = 0; i < symmetry; i++) {
      ctx.rotate(TAU / symmetry);
      ctx.beginPath();
      ctx.moveTo(outer + 2, 0);
      ctx.lineTo(tip, 0);
      ink(2.5, css);
      ctx.beginPath();
      ctx.arc(tip + 2.5, 0, 3.2, 0, TAU);
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = css;
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  // Core: a ring with a bright centre, or a small rotated square.
  if (rng.chance(0.5)) {
    ctx.beginPath();
    ctx.arc(0, 0, rng.range(13, 18), 0, TAU);
    ink(2.5, css);
  } else {
    const half = rng.range(9, 13);
    ctx.beginPath();
    ctx.moveTo(-half, -half);
    ctx.lineTo(half, -half);
    ctx.lineTo(half, half);
    ctx.lineTo(-half, half);
    ctx.closePath();
    ink(2.5, css);
  }
  ctx.beginPath();
  ctx.arc(0, 0, rng.range(5, 8), 0, TAU);
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = css;
  ctx.shadowBlur = 16;
  ctx.fill();
}

const cache = new Map<string, string>();

/** DOM build: the sigil baked into a data URL for an `<img>` element. */
export function sigil(id: string, color: number): string {
  const key = `${id}:${color}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  drawSigil(ctx, id, color);

  const url = canvas.toDataURL();
  cache.set(key, url);
  return url;
}

// ─── WeChat build: offscreen canvases drawn straight onto the HUD ───

interface SigilCanvas {
  canvas: HTMLCanvasElement;
  size: number;
}
const canvasCache = new Map<string, SigilCanvas>();

/** An offscreen canvas works on the browser (`document`) and the minigame runtime (`wx`). */
function makeBakingCanvas(): HTMLCanvasElement {
  if (typeof document !== 'undefined') return document.createElement('canvas');
  const api = (globalThis as { wx?: { createCanvas(): HTMLCanvasElement } }).wx;
  return api!.createCanvas();
}

/** WeChat build: the sigil rendered onto a cached offscreen canvas, for HUD `drawImage`. */
export function sigilCanvas(id: string, color: number): SigilCanvas {
  const key = `${id}:${color}`;
  const cached = canvasCache.get(key);
  if (cached) return cached;

  const canvas = makeBakingCanvas();
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas is not available');
  drawSigil(ctx, id, color);

  const made: SigilCanvas = { canvas, size: SIZE };
  canvasCache.set(key, made);
  return made;
}

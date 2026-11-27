/**
 * Path and stroke helpers for drawing a character with Canvas 2D.
 *
 * Everything here works in figure units and leaves line width to the caller: the same drawing is
 * rasterised at whatever scale a device needs. No `Path2D` (the WeChat runtime has none): paths
 * are SVG-style strings, traced command by command.
 */

/** Colours, as CSS strings. */
export const css = (hex: number): string => `#${hex.toString(16).padStart(6, '0')}`;

/** A colour at an opacity. */
export function rgba(hex: number, alpha: number): string {
  const r = (hex >> 16) & 255;
  const g = (hex >> 8) & 255;
  const b = hex & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Traces an SVG-style path: absolute M, L, Q, C and Z, numbers separated by spaces or commas.
 * A command holds until the next letter, as in SVG ("M 0 -10 L 4 -2 L -4 -2 Z").
 */
export function trace(ctx: CanvasRenderingContext2D, d: string): void {
  const tokens = d.trim().split(/[\s,]+/);
  ctx.beginPath();
  for (let i = 0; i < tokens.length;) {
    const op = tokens[i++];
    const n = (k: number): number => Number(tokens[i + k]);
    if (op === 'M' || op === 'L') {
      if (op === 'M') ctx.moveTo(n(0), n(1));
      else ctx.lineTo(n(0), n(1));
      i += 2;
    } else if (op === 'Q') {
      ctx.quadraticCurveTo(n(0), n(1), n(2), n(3));
      i += 4;
    } else if (op === 'C') {
      ctx.bezierCurveTo(n(0), n(1), n(2), n(3), n(4), n(5));
      i += 6;
    } else if (op === 'Z') {
      ctx.closePath();
    } else {
      // Not a command: the path is malformed. Leave it rather than draw a wrong line.
      return;
    }
  }
}

/** The same path with every x negated: a shape written for the right of a figure, turned into its left. */
export function mirrored(d: string): string {
  const tokens = d.trim().split(/[\s,]+/);
  const out: string[] = [];
  const flip = (index: number): void => {
    out.push(String(-Number(tokens[index])));
  };
  const keep = (index: number): void => {
    out.push(tokens[index]!);
  };
  for (let i = 0; i < tokens.length;) {
    const op = tokens[i++]!;
    out.push(op);
    const pairs = op === 'Q' ? [0, 2] : op === 'C' ? [0, 2, 4] : op === 'M' || op === 'L' ? [0] : [];
    const count = op === 'C' ? 6 : op === 'Q' ? 4 : pairs.length > 0 ? 2 : 0;
    for (let k = 0; k < count; k += 2) {
      if (pairs.includes(k)) flip(i + k);
      else keep(i + k);
      keep(i + k + 1);
    }
    i += count;
  }
  return out.join(' ');
}

/**
 * A shape written from the middle of a figure, round one side of it and back to the middle, made
 * into the closed outline of both sides: the path runs on as its own reflection in x = 0,
 * backwards. `d` holds M and C only, and its last point must be on the middle.
 */
export function bothHalves(d: string): string {
  const tokens = d.trim().split(/[\s,]+/);
  const segments: number[][] = [];
  const points: [number, number][] = [];
  let at = 0;
  while (at < tokens.length) {
    const op = tokens[at++];
    if (op === 'M') {
      points.push([Number(tokens[at]), Number(tokens[at + 1])]);
      at += 2;
    } else if (op === 'C') {
      const values = tokens.slice(at, at + 6).map(Number);
      segments.push(values);
      points.push([values[4]!, values[5]!]);
      at += 6;
    } else if (op !== 'Z') {
      throw new Error(`bothHalves cannot read "${op}".`);
    }
  }
  const out = [d];
  for (let i = segments.length - 1; i >= 0; i--) {
    const [c1x, c1y, c2x, c2y] = segments[i]!;
    const [px, py] = points[i]!;
    out.push(`C ${-c2x} ${c2y} ${-c1x} ${c1y} ${-px} ${py}`);
  }
  out.push('Z');
  return out.join(' ');
}

/**
 * A path through cubics given in full — start, two control points, end, eight numbers each — every
 * one running on from the last. It throws on a cubic that is not eight numbers: `trace` leaves out
 * what it cannot read, and a path that quietly stops halfway draws a shape that is wrong in a way
 * hard to see.
 */
export function chained(cubics: readonly (readonly number[])[], close = false): string {
  const [first, ...rest] = cubics;
  if (!first || cubics.some((c) => c.length !== 8)) {
    throw new Error('chained wants every cubic as eight numbers.');
  }
  const out = [`M ${first[0]} ${first[1]}`, `C ${first.slice(2).join(' ')}`];
  for (const c of rest) out.push(`C ${c.slice(2).join(' ')}`);
  if (close) out.push('Z');
  return out.join(' ');
}

/** Fills a path, mirrored first when `side` is the left. */
export function fillPath(
  ctx: CanvasRenderingContext2D,
  d: string,
  style: string | CanvasGradient,
  side: 1 | -1 = 1,
): void {
  trace(ctx, side < 0 ? mirrored(d) : d);
  ctx.fillStyle = style;
  ctx.fill();
}

/** Outlines a path with a round-joined line, mirrored first when `side` is the left. */
export function strokePath(
  ctx: CanvasRenderingContext2D,
  d: string,
  width: number,
  style: string,
  side: 1 | -1 = 1,
): void {
  trace(ctx, side < 0 ? mirrored(d) : d);
  ctx.lineWidth = width;
  ctx.strokeStyle = style;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
}

/** Samples a quadratic curve into `count` points, its end included. */
export function quadPoints(
  x0: number,
  y0: number,
  cx: number,
  cy: number,
  x1: number,
  y1: number,
  count: number,
): [number, number][] {
  const points: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const u = 1 - t;
    points.push([u * u * x0 + 2 * u * t * cx + t * t * x1, u * u * y0 + 2 * u * t * cy + t * t * y1]);
  }
  return points;
}

/** A stroke along a quadratic curve, its width easing from one end to the other. */
export function quadStroke(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  cx: number,
  cy: number,
  x1: number,
  y1: number,
  w0: number,
  w1: number,
  style: string | CanvasGradient,
  side: 1 | -1 = 1,
  count = 10,
): void {
  const points = quadPoints(x0, y0, cx, cy, x1, y1, count);
  tapered(
    ctx,
    points.map(([x, y], i) => [x, y, w0 + ((w1 - w0) * i) / (count - 1)]),
    style,
    side,
  );
}

/**
 * A cubic curve sampled into `count` points, its end included: [x, y, how far along, 0 to 1].
 * The third number is what a stroke's width is read against.
 */
export function cubicPoints(
  x0: number,
  y0: number,
  c1x: number,
  c1y: number,
  c2x: number,
  c2y: number,
  x1: number,
  y1: number,
  count: number,
): [number, number, number][] {
  const points: [number, number, number][] = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const u = 1 - t;
    points.push([
      u * u * u * x0 + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * x1,
      u * u * u * y0 + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * y1,
      t,
    ]);
  }
  return points;
}

/** A quadratic curve sampled into `count` points, its end included: [x, y, how far along, 0 to 1]. */
export function quadCurve(
  x0: number,
  y0: number,
  cx: number,
  cy: number,
  x1: number,
  y1: number,
  count: number,
): [number, number, number][] {
  return quadPoints(x0, y0, cx, cy, x1, y1, count).map(([x, y], i) => [x, y, i / (count - 1)]);
}

/** A width read from keyframes of [how far along, width], straight between them. */
function keyed(keys: readonly (readonly [number, number])[], t: number): number {
  for (let i = 1; i < keys.length; i++) {
    const [t1, w1] = keys[i]!;
    if (t <= t1) {
      const [t0, w0] = keys[i - 1]!;
      return t1 > t0 ? w0 + ((w1 - w0) * (t - t0)) / (t1 - t0) : w1;
    }
  }
  return keys[keys.length - 1]![1];
}

/**
 * A stroke along a sampled curve whose width is read from keyframes of [how far along, width] —
 * thick in the middle of a lash, thin at the point of a brow. `side` mirrors it.
 */
export function keyedStroke(
  ctx: CanvasRenderingContext2D,
  curve: readonly (readonly [number, number, number])[],
  keys: readonly (readonly [number, number])[],
  style: string | CanvasGradient,
  side: 1 | -1 = 1,
): void {
  tapered(
    ctx,
    curve.map(([x, y, t]) => [x, y, keyed(keys, t)]),
    style,
    side,
  );
}

/** The part of a sampled curve between two points along it, re-read from 0 to 1. */
export function stretch(
  curve: readonly (readonly [number, number, number])[],
  from: number,
  to: number,
): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (const [x, y, t] of curve) {
    if (t < from || t > to) continue;
    out.push([x, y, (t - from) / (to - from)]);
  }
  return out;
}

/** Two sampled curves joined end to end — the second one's first point dropped — re-read from 0 to 1. */
export function joined(
  first: readonly (readonly [number, number, number])[],
  second: readonly (readonly [number, number, number])[],
): [number, number, number][] {
  const points: [number, number][] = [
    ...first.map(([x, y]): [number, number] => [x, y]),
    ...second.slice(1).map(([x, y]): [number, number] => [x, y]),
  ];
  return points.map(([x, y], i) => [x, y, i / (points.length - 1)]);
}

/**
 * A stroke whose width varies along its way — the shape of a lash, a brow, a lock of hair — which
 * a line of constant width never is. Each point is x, y and the stroke's full width there; the
 * polygon round the centre line is filled. `side` mirrors it.
 */
export function tapered(
  ctx: CanvasRenderingContext2D,
  points: readonly (readonly [number, number, number])[],
  style: string | CanvasGradient,
  side: 1 | -1 = 1,
): void {
  const k = side;
  const count = points.length;
  if (count < 2) return;
  const left: [number, number][] = [];
  const right: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    const [x, y, w] = points[i]!;
    const before = points[Math.max(0, i - 1)]!;
    const after = points[Math.min(count - 1, i + 1)]!;
    let nx = -(after[1] - before[1]);
    let ny = after[0] - before[0];
    const len = Math.hypot(nx, ny) || 1;
    nx /= len;
    ny /= len;
    left.push([k * (x + (nx * w) / 2), y + (ny * w) / 2]);
    right.push([k * (x - (nx * w) / 2), y - (ny * w) / 2]);
  }
  const mid = (a: readonly [number, number], b: readonly [number, number]): [number, number] => [
    (a[0] + b[0]) / 2,
    (a[1] + b[1]) / 2,
  ];
  ctx.beginPath();
  ctx.moveTo(left[0]![0], left[0]![1]);
  for (let i = 1; i < count - 1; i++) {
    const m = mid(left[i]!, left[i + 1]!);
    ctx.quadraticCurveTo(left[i]![0], left[i]![1], m[0], m[1]);
  }
  const tail = points[count - 1]!;
  ctx.lineTo(k * tail[0], tail[1]);
  for (let i = count - 2; i > 0; i--) {
    const m = mid(right[i]!, right[i - 1]!);
    ctx.quadraticCurveTo(right[i]![0], right[i]![1], m[0], m[1]);
  }
  ctx.closePath();
  ctx.fillStyle = style;
  ctx.fill();
}

/** A vertical linear gradient from `y0` to `y1` through colour stops of [offset, colour]. */
export function shadeY(
  ctx: CanvasRenderingContext2D,
  y0: number,
  y1: number,
  stops: readonly (readonly [number, string])[],
): CanvasGradient {
  const gradient = ctx.createLinearGradient(0, y0, 0, y1);
  for (const [at, colour] of stops) gradient.addColorStop(at, colour);
  return gradient;
}

/** A linear gradient between two points through colour stops of [offset, colour]. */
export function shade(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  stops: readonly (readonly [number, string])[],
): CanvasGradient {
  const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [at, colour] of stops) gradient.addColorStop(at, colour);
  return gradient;
}

/** A radial gradient: a hard core of `inner` out to `radius`, then fading to nothing at `outer`. */
export function glow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  inner: string,
  radius: number,
  outer: number,
): CanvasGradient {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, outer);
  gradient.addColorStop(0, inner);
  gradient.addColorStop(Math.min(1, radius / outer), inner);
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  return gradient;
}

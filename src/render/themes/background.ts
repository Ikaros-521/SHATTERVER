import type { ThemeScene } from './types';

/**
 * Assembles a theme background's fragment shader.
 *
 * A scene is drawn in one full-screen pass, back to front, into `col`. It is given the arena's
 * frame and three sampling coordinates — `far`, `mid`, `near` — that already carry each layer's
 * share of the parallax, so a scene only has to decide which layer a thing belongs to. Everything
 * is procedural: no images to load, nothing for a review to OCR, and the same scene at any
 * resolution.
 *
 * The pass does not darken the arena: the backdrop composite does that for any background (see
 * `shaders/background.ts`), so a scene may paint right across the play field.
 */

const PREAMBLE = `#version 300 es
precision highp float;

in vec2 vUv;

// Window size in CSS px.
uniform vec2 uCss;
// Arena rect in CSS px: centre x, centre y (y down), half width, half height.
uniform vec4 uArena;
// Seconds.
uniform float uTime;
// 0..1, combo and overdrive: the scene brightens with the action.
uniform float uEnergy;
// -1..1, where the paddle sits across the arena: the parallax input.
uniform float uPar;
// 0 on the low step, 1 above it: a scene loops over fewer strands, fish and blossoms at 0. The
// step already draws it at a third of the resolution every other frame; this is what is left.
uniform float uDetail;

out vec4 outColor;

const float TAU = 6.2831853;
const float HALF_TAU = 3.14159265;

float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.54;
  for (int i = 0; i < 4; i++) {
    sum += amp * vnoise(p);
    p = mat2(0.8, 0.6, -0.6, 0.8) * p * 2.07 + 11.7;
    amp *= 0.5;
  }
  return sum;
}

/** A wavy line: the height at x of something like a ridge or a floor. */
float wobble(vec2 s, float base, float amp, float freq) {
  return base + amp * (vnoise(vec2(s.x * freq, 3.7)) * 0.65 + vnoise(vec2(s.x * freq * 2.9, 8.1)) * 0.35);
}

float sdBox(vec2 p, vec2 b) {
  vec2 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
}

float sdRoundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

float sdCircle(vec2 p, float r) {
  return length(p) - r;
}

float sdSegment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * h);
}

/** A rod from a to b whose radius runs from ra at a to rb at b (a trunk, a root). */
float sdTapered(vec2 p, vec2 a, vec2 b, float ra, float rb) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * h) - mix(ra, rb, h);
}

float sdEllipse(vec2 p, vec2 r) {
  float k0 = length(p / r);
  float k1 = length(p / (r * r));
  return k0 * (k0 - 1.0) / max(k1, 1e-5);
}

float sdTriangle(vec2 p, vec2 p0, vec2 p1, vec2 p2) {
  vec2 e0 = p1 - p0;
  vec2 e1 = p2 - p1;
  vec2 e2 = p0 - p2;
  vec2 v0 = p - p0;
  vec2 v1 = p - p1;
  vec2 v2 = p - p2;
  vec2 pq0 = v0 - e0 * clamp(dot(v0, e0) / dot(e0, e0), 0.0, 1.0);
  vec2 pq1 = v1 - e1 * clamp(dot(v1, e1) / dot(e1, e1), 0.0, 1.0);
  vec2 pq2 = v2 - e2 * clamp(dot(v2, e2) / dot(e2, e2), 0.0, 1.0);
  float s = sign(e0.x * e2.y - e0.y * e2.x);
  vec2 d = min(
    min(vec2(dot(pq0, pq0), s * (v0.x * e0.y - v0.y * e0.x)), vec2(dot(pq1, pq1), s * (v1.x * e1.y - v1.y * e1.x))),
    vec2(dot(pq2, pq2), s * (v2.x * e2.y - v2.y * e2.x))
  );
  return -sqrt(d.x) * sign(d.y);
}

/** q as it is, unless it is dead centre: atan(0, 0) is undefined, and one undefined pixel spreads. */
vec2 offCentre(vec2 q) {
  return dot(q, q) > 1e-8 ? q : vec2(1e-4, 0.0);
}

/** Antialiased coverage of a shape: 1 inside, 0 outside. */
float fill(float d) {
  return 1.0 - smoothstep(0.0, max(fwidth(d), 1e-5), d);
}

/** Coverage that feathers over ±w instead of an edge. */
float soft(float d, float w) {
  return 1.0 - smoothstep(-w, w, d);
}

/** Light falling off from a point over roughly radius units. */
float glow(float d, float radius) {
  return exp(-max(d, 0.0) / radius);
}
`;

const MAIN = `
void main() {
  vec2 px = vec2(vUv.x, 1.0 - vUv.y) * uCss;

  // The scene is composed in the arena's frame: the origin is the arena's centre, one unit is
  // half its height, and y is up. The arena spans x ±0.75 and y ±1. Bricks fill its upper half
  // (y 0.2..0.87), the danger line sits at y -0.58 and the paddle travels along y -0.85, so the
  // middle of the field is best left to air and water: the scenery belongs at its edges.
  vec2 a = vec2(px.x - uArena.x, uArena.y - px.y) / uArena.w;
  // Half extents of the window in the same units: wide on a desktop, tall on a phone.
  vec2 ext = uCss / (2.0 * uArena.w);

  // How much window stands beside the arena: 0 when it only just fits, 1 on a desktop display,
  // where the HUD keeps two panels at the top of the side columns and nothing below them. A
  // landmark belongs under those panels: at a.y below 0.76 on the left, 0.54 on the right.
  float wide = smoothstep(0.95, 1.6, ext.x);

  // Each layer samples the scene shifted by its own share of the parallax.
  vec2 far = a;
  far.x -= uPar * 0.010;
  vec2 mid = a;
  mid.x -= uPar * 0.026;
  vec2 near = a;
  near.x -= uPar * 0.050;

  // The scene brightens with the action.
  float lift = 1.0 + 0.45 * uEnergy;

  vec3 col = vec3(0.0);

__BODY__

  outColor = vec4(max(col, vec3(0.0)), 1.0);
}
`;

/** True for as long as the placeholder has not been replaced: a scene with no body would not compile. */
const BODY_TOKEN = '__BODY__';

/** The complete fragment source of a scene: the shared preamble, the scene's helpers, then its body inside `main`. */
export function themeFragment(scene: ThemeScene): string {
  const body = scene.body
    .split('\n')
    .map((line) => (line.trim() === '' ? '' : `  ${line}`))
    .join('\n');
  return `${PREAMBLE}\n${scene.helpers.trim()}\n${MAIN.replace(BODY_TOKEN, body)}`;
}

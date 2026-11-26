/**
 * Theme sprites: the cosmetic themes' own instanced shapes, in a program of their own.
 *
 * Petals, blossoms, bubbles, leaves, crests of water, fans, boughs, gems, arcs of light and
 * little fish. They share the instance shader's vertex layout — a theme sprite is one instance,
 * written through `Pen.sprite` into the sprite batches — but nothing else: the game's own shapes
 * (bricks, the paddle, glows, rings, strokes) never run this code, and this code never runs for
 * a player who wears no theme. The renderer compiles the program the first time a frame has a
 * sprite to draw, and keeps a failure here to the sprites (see `renderer.ts`): a theme may lose
 * its looks on some GPU, the game never loses its frame.
 *
 * Instance layout: the same 20 floats as `shaders/instances`. Each shape reads its own subset:
 *   aPos      x, y, quad half-width, quad half-height
 *   aRotColor rotation, r, g, b
 *   aShape    alpha, shape, shape half-width, shape half-height
 *   aParm     p0, p1, FLAG_MIRROR, flash
 *   aExtra    halo, p2, -, -
 */

export const SHAPE_PETAL = 0;
export const SHAPE_BLOSSOM = 1;
export const SHAPE_BUBBLE = 2;
export const SHAPE_LEAF = 3;
export const SHAPE_CURL = 4;
export const SHAPE_FAN = 5;
export const SHAPE_BRANCH = 6;
export const SHAPE_CRYSTAL = 7;
export const SHAPE_ARC = 8;
export const SHAPE_FISH = 9;

/** Sprite flag: the shape is mirrored across its own vertical axis. */
export const FLAG_MIRROR = 1;

/** How many shapes the program knows: anything at or past this draws nothing. */
export const SPRITE_SHAPES = 10;

/** The instance shader's vertex stage, plus the third shape parameter it never needed. */
export const SPRITE_VERT = `#version 300 es
precision highp float;

layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec4 aPos;
layout(location = 2) in vec4 aRotColor;
layout(location = 3) in vec4 aShape;
layout(location = 4) in vec4 aParm;
layout(location = 5) in vec4 aExtra;

// world → device pixel: scale, then translate (device px, y down)
uniform vec4 uView;
uniform vec2 uResolution;

out vec2 vLocal;
out vec2 vCenter;
flat out vec2 vQuad;
flat out vec4 vColor;
flat out vec4 vParm;
flat out vec4 vParm2;
flat out float vHalo;

void main() {
  vec2 local = aCorner * aPos.zw;
  float c = cos(aRotColor.x);
  float s = sin(aRotColor.x);
  vec2 world = aPos.xy + vec2(c * local.x - s * local.y, s * local.x + c * local.y);
  vec2 px = world * uView.x + uView.yz;
  gl_Position = vec4(px.x / uResolution.x * 2.0 - 1.0, 1.0 - px.y / uResolution.y * 2.0, 0.0, 1.0);
  vLocal = local;
  vCenter = aPos.xy;
  vQuad = aPos.zw;
  vColor = vec4(aRotColor.yzw, aShape.x);
  vParm = vec4(aShape.y, aShape.zw, aParm.x);
  vParm2 = vec4(aParm.y, aParm.z, aParm.w, aExtra.y);
  vHalo = aExtra.x;
}
`;

export const SPRITE_FRAG = `#version 300 es
precision highp float;

in vec2 vLocal;
in vec2 vCenter;
flat in vec2 vQuad;
flat in vec4 vColor;
flat in vec4 vParm;
flat in vec4 vParm2;
flat in float vHalo;

uniform float uTime;
// World units per device pixel: keeps edges antialiased at any window size.
uniform float uPixel;

out vec4 outColor;

const float TAU = 6.2831853;
const float HALF_TAU = 3.14159265;

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
// ── theme sprites ──────────────────────────────────────────────────────────────────
// Shapes for the cosmetic themes. All return (premultiplied colour, coverage): a body carries
// its coverage in alpha and is alpha blended; a light returns 0 there and simply adds, beneath
// whatever the alpha-blended batch draws after it. Distances are in world units.

/** 0..1 coverage of a signed distance, antialiased across about one device pixel. */
float cover(float d, float px) {
  float aa = max(fwidth(d), px);
  return 1.0 - smoothstep(-aa, aa, d);
}

/**
 * The soft additive falloff just outside a shape. It is gone by 2.5 world units out, which the
 * default padded quad always holds: a halo that reached the quad's edge would show that edge.
 */
float bleed(float d, float reach) {
  float r = min(reach, 2.5);
  return exp(-max(d, 0.0) * 0.12) * (1.0 - smoothstep(0.0, r, d));
}

/** q, unless it is the exact centre: atan(0, 0) is undefined, and one undefined pixel spreads. */
vec2 offCentre(vec2 q) {
  return dot(q, q) > 1e-8 ? q : vec2(1e-4, 0.0);
}

// A sakura petal lying along x: narrow at its base (-1), round and notched at the tip (+1).
// p0 notch depth, p1 edge softness.
vec4 spPetal(vec2 p, vec2 h, vec3 rgb, float alpha, float p0, float p1, float flash, float halo) {
  vec2 q = p / h;
  float w = 0.30 + 0.70 * smoothstep(-1.0, 0.6, q.x);
  vec2 e = vec2(q.x, q.y / max(w, 0.04));
  float d = (length(e) - 1.0) * w * h.y;
  float cut = length((q - vec2(1.0 + 0.5 * p0, 0.0)) * h) - 0.55 * p0 * h.y;
  d = max(d, -cut);
  float aa = max(fwidth(d), uPixel) + p1 * min(h.x, h.y) * 0.6;
  float m = 1.0 - smoothstep(-aa, aa, d);
  // Lit from the tip: the outer half carries the pale colour, a crease runs down the middle.
  float tip = smoothstep(-0.9, 1.0, q.x);
  vec3 col = mix(rgb * 0.72, mix(rgb, vec3(1.0), 0.55), tip);
  col *= 1.0 - 0.16 * exp(-abs(q.y) * 9.0) * tip;
  col += rgb * flash * 0.6;
  return vec4((col * m + mix(rgb, vec3(1.0), 0.4) * bleed(d, min(h.x, h.y) * 0.9) * halo) * alpha, m * alpha);
}

// A flower seen from above: p0 petals at bloom p1 (0 closed, 1 open), around a pale heart.
vec4 spBlossom(vec2 p, vec2 h, vec3 rgb, float alpha, float p0, float p1, float flash, float halo) {
  vec2 q = offCentre(p / h);
  float r = length(q);
  float ang = atan(q.y, q.x);
  float n = max(p0, 3.0);
  float wave = 0.5 + 0.5 * cos(ang * n);
  float edge = (0.5 + 0.5 * pow(wave, 0.7)) * p1 + 0.35 * (1.0 - p1);
  float d = (r - edge) * h.y;
  float m = cover(d, uPixel);
  // Petal creases: radial lines in the valleys between petals.
  float crease = pow(1.0 - wave, 6.0) * smoothstep(0.25, 0.9, r);
  vec3 col = mix(mix(rgb, vec3(1.0), 0.62), rgb * 0.80, smoothstep(0.85, 0.15, r));
  col *= 1.0 - 0.22 * crease;
  float heart = 1.0 - smoothstep(0.13, 0.19, r);
  col = mix(col, mix(vec3(1.0, 0.93, 0.6), rgb, 0.25), heart);
  col += rgb * flash * 0.5;
  return vec4((col * m + rgb * bleed(d, min(h.x, h.y) * 0.8) * halo) * alpha, m * alpha);
}

// A soap-thin bubble: p0 rim thickness (of the radius), p1 strength of the two specular highlights.
vec4 spBubble(vec2 p, vec2 h, vec3 rgb, float alpha, float p0, float p1, float flash, float halo) {
  vec2 q = offCentre(p / h);
  float r = length(q);
  float ang = atan(q.y, q.x);
  float aa = max(fwidth(r), uPixel / h.y);
  float band = 1.0 - smoothstep(p0 * 0.4, p0 * 1.6, abs(r - 0.90));
  float line = band * (0.55 + 0.45 * cos(ang - 2.5));
  float body = (1.0 - smoothstep(0.0, 0.9, r)) * 0.14;
  float s1 = 1.0 - smoothstep(0.0, 0.30 + aa, length(q - vec2(-0.42, -0.46)));
  float s2 = 1.0 - smoothstep(0.0, 0.14 + aa, length(q - vec2(0.40, 0.52)));
  float s = (s1 + s2 * 0.6) * p1;
  vec3 col = mix(rgb, vec3(1.0), 0.6) * line * 1.4 + rgb * body + vec3(1.0) * s;
  col += rgb * flash;
  float a = clamp(line + body * 0.6 + s, 0.0, 1.0);
  return vec4((col + rgb * halo * band * 0.5) * alpha, a * alpha);
}

// A leaf lying along x. p0 pointiness of the two tips, p1 strength of the veins.
vec4 spLeaf(vec2 p, vec2 h, vec3 rgb, float alpha, float p0, float p1, float flash, float halo) {
  vec2 q = p / h;
  float ex = 2.4 + 2.4 * clamp(p0, 0.0, 1.0);
  float ax = max(abs(q.x), 1e-4);
  float f = pow(ax, ex) + pow(abs(q.y) / 0.58, 2.0) - 1.0;
  vec2 g = vec2(ex * pow(ax, ex - 1.0), 2.0 * q.y / (0.58 * 0.58));
  float d = f / max(length(g), 1e-4) * h.y;
  float m = cover(d, uPixel);
  // Folded along the midrib: the lower half catches more light.
  float fold = smoothstep(-0.25, 0.25, q.y);
  vec3 col = mix(rgb * 0.72, rgb * 1.22 + vec3(0.03), fold);
  float mid = 1.0 - smoothstep(0.0, 0.035 + uPixel / h.y, abs(q.y));
  float ribs = 1.0 - smoothstep(0.0, 0.05, abs(fract(q.x * 2.6 - abs(q.y) * 1.3) - 0.5));
  ribs *= step(0.06, abs(q.y)) * (1.0 - step(0.5, abs(q.y)));
  col = mix(col, mix(rgb, vec3(1.0), 0.55), clamp(mid + ribs * 0.45, 0.0, 1.0) * p1);
  col *= 0.8 + 0.2 * smoothstep(-1.0, 1.0, q.x);
  col += rgb * flash * 0.6;
  return vec4((col * m + mix(rgb, vec3(1.0), 0.5) * bleed(d, min(h.x, h.y) * 0.9) * halo) * alpha, m * alpha);
}

// A crest of water: a column rising from the base of the box that hooks over at the top and
// curls back down the other side. p0 thickness in world units, p1 sweep in radians (how far the
// hook turns past its start on the left), p2 taper of the tip (0 needle, 1 as thick as the base).
vec4 spCurl(vec2 p, vec2 h, vec3 rgb, float alpha, float p0, float p1, float p2, float flash, float halo) {
  float R = h.x * 0.82;
  vec2 c = vec2(0.0, -h.y + R);
  vec2 pc = p - c;
  float sweep = max(p1, 0.2);
  // Angular position relative to the middle of the arc, so the interval never wraps.
  float bearing = mod(atan(pc.y, pc.x) + TAU, TAU);
  float u = mod(bearing - (HALF_TAU + sweep * 0.5) + TAU, TAU);
  if (u > HALF_TAU) u -= TAU;
  float len = length(pc);
  float k = clamp((u + sweep * 0.5) / sweep, 0.0, 1.0);
  float thick = mix(p0, p0 * p2, k);
  float dArc = abs(len - R) - thick;
  if (abs(u) > sweep * 0.5) {
    float end = u > 0.0 ? sweep * 0.5 : -sweep * 0.5;
    vec2 tip = c + R * vec2(cos(HALF_TAU + sweep * 0.5 + end), sin(HALF_TAU + sweep * 0.5 + end));
    dArc = length(p - tip) - mix(p0, p0 * p2, end > 0.0 ? 1.0 : 0.0);
  }
  // The straight run up the left side, from the base to where the arc begins. Its distance is
  // taken beyond the segment's two ends only: between them it is the plain sideways distance.
  float dy = max(0.0, max(c.y - p.y, p.y - h.y));
  float dRun = length(vec2(p.x + R, dy)) - p0;
  float onArc = step(dArc, dRun);
  float d = min(dArc, dRun);
  float m = cover(d, uPixel);
  float along = mix(clamp((h.y - p.y) / max(h.y - c.y, 1.0), 0.0, 1.0) * 0.3, 0.3 + 0.7 * k, onArc);
  // Across the band: -1 its inner side, +1 the outer skin.
  float off = clamp(mix(-(p.x + R) / max(p0, 0.1), (len - R) / max(thick, 0.1), onArc), -1.0, 1.0);
  // The outer skin and the curling tip turn to foam.
  float foam = clamp(smoothstep(-0.2, 0.9, off) * 0.5 + smoothstep(0.45, 1.0, along) * 0.6, 0.0, 1.0);
  vec3 col = mix(rgb * 0.8, mix(rgb, vec3(1.0), 0.7), foam);
  col += rgb * flash;
  float a = mix(0.86, 0.45, along * along);
  return vec4((col * m + mix(rgb, vec3(1.0), 0.4) * bleed(d, min(h.x, h.y) * 0.7) * halo) * alpha, m * a * alpha);
}

// A folding fan opened upwards from the origin: p0 half-angle in radians, p1 number of ribs,
// p2 brightness of the ribs. The paper is translucent, densest near the pivot.
vec4 spFan(vec2 p, vec2 h, vec3 rgb, float alpha, float p0, float p1, float p2, float flash, float halo) {
  vec2 q = offCentre(p / h);
  float r = length(q);
  float half0 = max(p0, 0.05);
  float ang = atan(q.x, -q.y);
  float d = max(r - 1.0, (abs(ang) - half0) * max(r, 0.05)) * h.y;
  float m = cover(d, uPixel);
  float u = (ang / half0 * 0.5 + 0.5) * max(p1 - 1.0, 1.0);
  float rib = 1.0 - smoothstep(0.0, 0.07 + fwidth(u), abs(u - floor(u + 0.5)));
  float edge = 1.0 - smoothstep(0.0, 0.025 + fwidth(r), abs(r - 0.985));
  vec3 col = mix(rgb, vec3(1.0), 0.35 + 0.4 * r);
  col += mix(rgb, vec3(1.0), 0.3) * (rib * p2 + edge * 0.9) * 1.6 + rgb * flash * 0.8;
  float a = m * (0.42 + 0.30 * (1.0 - r));
  return vec4((col * a + rgb * m * halo) * alpha, a * alpha);
}

// A bough lying along x: a rod whose centreline bows by p1, p0 thick as a share of the half
// height, with bark grain to the strength of p2. Lit from above.
vec4 spBranch(vec2 p, vec2 h, vec3 rgb, float alpha, float p0, float p1, float p2, float flash, float halo) {
  vec2 q = p / h;
  float yc = p1 * q.x * q.x;
  float rad = max(p0, 0.05) * h.y;
  float dx = max(abs(q.x) - 0.90, 0.0) * h.x;
  float dy = (q.y - yc) * h.y;
  float d = length(vec2(dx, dy)) - rad;
  float m = cover(d, uPixel);
  float side = clamp(dy / rad, -1.0, 1.0);
  float streak = vnoise(vec2(q.x * 3.0, side * 2.2));
  float fleck = vnoise(vec2(q.x * 9.0, side * 5.0 + 7.0));
  vec3 col = rgb * (1.0 - 0.30 * side) * (0.82 + 0.36 * streak) * (1.0 - 0.22 * p2 * fleck);
  // A lit ridge along the top edge.
  col += mix(rgb, vec3(1.0), 0.6) * (1.0 - smoothstep(-rad * 0.95, -rad * 0.55, dy)) * 0.22;
  col += rgb * flash * 0.7;
  return vec4((col * m + rgb * bleed(d, min(h.x, h.y) * 0.9) * halo) * alpha, m * alpha);
}

// A cut gem with p0 sides and a vertex pointing up, lit from the upper left: every facet takes a
// different share of the light. Light pools in the middle, and p1 is the strength of a slow swirl
// inside it, at phase p2 radians.
vec4 spCrystal(
  vec2 p,
  vec2 h,
  vec3 rgb,
  float alpha,
  float p0,
  float p1,
  float p2,
  float flash,
  float halo
) {
  vec2 q = offCentre(p / h);
  float r = length(q);
  float n = max(floor(p0 + 0.5), 3.0);
  float an = HALF_TAU / n;
  float a = atan(q.x, -q.y);
  // Each sector is centred halfway between two vertices, on an edge's normal. Taken from the
  // diagonal (an from vertical) that puts a vertex dead centre at the top.
  float bn = mod(a, 2.0 * an) - an;
  float d = (cos(bn) * r - cos(an)) * h.y;
  float m = cover(d, uPixel);
  float sector = floor(a / (2.0 * an));
  // Every facet takes its own share of a light from the upper left.
  float lit = 0.5 + 0.5 * cos(((sector + 0.5) / n) * TAU + 2.2);
  float dIn = (cos(bn) * r - cos(an) * 0.52) * h.y;
  float table = cover(dIn, uPixel);
  float core = pow(max(1.0 - r, 0.0), 1.6);
  float swirl = vnoise(vec2(a * 1.2 + p2, r * 2.6 - p2 * 0.6));
  vec3 col = rgb * (0.3 + 0.95 * lit);
  col = mix(col, mix(rgb, vec3(1.0), 0.35) * (0.6 + 0.5 * lit), table * 0.6);
  // The swirl of light inside stays the stone's own colour, a shade paler; only its very heart
  // warms towards white, and only a little.
  col += mix(rgb, vec3(1.0), 0.2) * p1 * swirl * core * 0.55;
  col += mix(rgb, vec3(1.0), 0.85) * pow(core, 3.0) * 0.22;
  col += vec3(1.0) * flash * 0.8;
  return vec4((col * m + mix(rgb, vec3(1.0), 0.3) * bleed(d, min(h.x, h.y) * 0.9) * halo) * alpha, m * alpha);
}

// A band of light on a circle: p0 thickness (of the radius), from angle p1, sweeping p2 radians
// (either way). Bright at the head of the sweep, fading to nothing at its tail. A pure light.
vec4 spArc(vec2 p, vec2 h, vec3 rgb, float alpha, float p0, float p1, float p2, float flash, float halo) {
  vec2 q = offCentre(p / h);
  float r = length(q);
  float u = mod(atan(q.y, q.x) - p1 + TAU, TAU);
  float len = max(abs(p2), 1e-3);
  float aa = fwidth(u) + 0.01;
  float win = smoothstep(0.0, aa, u) * (1.0 - smoothstep(len, len + aa, u));
  float band = 1.0 - smoothstep(p0 * 0.5, p0 * 1.5, abs(r - 0.88));
  float head = p2 >= 0.0 ? 1.0 - u / len : u / len;
  float m = band * win;
  return vec4((mix(rgb, vec3(1.0), 0.35) * (0.6 + 0.6 * head) + rgb * flash) * m * alpha, 0.0);
}

// A small fish heading along +x: a lens of a body, a forked tail, one bright eye. p2 is the
// phase of the tail's flick.
vec4 spFish(vec2 p, vec2 h, vec3 rgb, float alpha, float p0, float p1, float p2, float flash, float halo) {
  vec2 q = p / h;
  float tail = sin(p2 * 9.0) * 0.10;
  float d = min(
    length((q - vec2(0.12, 0.0)) * vec2(1.0, 2.1)) - 0.62,
    sdTriangle(q, vec2(-0.28, 0.0), vec2(-0.96, 0.42 + tail), vec2(-0.96, -0.42 + tail))
  ) * h.y;
  float m = cover(d, uPixel);
  vec3 col = mix(rgb * 0.7, mix(rgb, vec3(1.0), 0.45), smoothstep(-0.3, 0.6, -q.y));
  col = mix(col, vec3(1.0), 1.0 - smoothstep(0.05, 0.085, length(q - vec2(0.46, -0.08))));
  col += rgb * flash * 0.6;
  return vec4((col * m + rgb * bleed(d, min(h.x, h.y) * 0.8) * halo) * alpha, m * alpha);
}

void main() {
  int shape = int(vParm.x + 0.5);
  vec2 half_ = vParm.yz;
  float p0 = vParm.w;
  float p1 = vParm2.x;
  float flags = vParm2.y;
  float flash = vParm2.z;
  float p2 = vParm2.w;
  vec3 rgb = vColor.rgb;
  float alpha = vColor.a;

  // A theme sprite: mirrored first, so every shape below is written for one handedness.
  vec2 lp = mod(floor(flags + 0.5), 2.0) >= 1.0 ? vec2(-vLocal.x, vLocal.y) : vLocal;
  if (shape == 0) outColor = spPetal(lp, half_, rgb, alpha, p0, p1, flash, vHalo);
  else if (shape == 1) outColor = spBlossom(lp, half_, rgb, alpha, p0, p1, flash, vHalo);
  else if (shape == 2) outColor = spBubble(lp, half_, rgb, alpha, p0, p1, flash, vHalo);
  else if (shape == 3) outColor = spLeaf(lp, half_, rgb, alpha, p0, p1, flash, vHalo);
  else if (shape == 4) outColor = spCurl(lp, half_, rgb, alpha, p0, p1, p2, flash, vHalo);
  else if (shape == 5) outColor = spFan(lp, half_, rgb, alpha, p0, p1, p2, flash, vHalo);
  else if (shape == 6) outColor = spBranch(lp, half_, rgb, alpha, p0, p1, p2, flash, vHalo);
  else if (shape == 7) outColor = spCrystal(lp, half_, rgb, alpha, p0, p1, p2, flash, vHalo);
  else if (shape == 8) outColor = spArc(lp, half_, rgb, alpha, p0, p1, p2, flash, vHalo);
  else if (shape == 9) outColor = spFish(lp, half_, rgb, alpha, p0, p1, p2, flash, vHalo);
  else outColor = vec4(0.0);
}
`;

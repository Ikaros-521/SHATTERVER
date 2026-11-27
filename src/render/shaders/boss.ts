/**
 * Boss parts: the shapes a character boss is drawn from, in a program of their own.
 *
 * A mecha girl is not a brick. She is line art over cel fills: armour plates with a pale bevel,
 * locks of hair, blades of feather, an eye with an iris and catchlights. She shares the instance
 * shader's vertex layout — a part is one instance, written through `Pen.bossPart` into the boss
 * batch — and nothing else: the game's own shapes never run this code, and this code never runs
 * on a frame without a character boss on screen. The renderer compiles the program the first time
 * a frame has a part to draw, and keeps a failure here to the parts (see `renderer.ts`): the
 * fight goes on with its hitboxes drawn as plain surfaces; the game never loses its frame.
 *
 * Instance layout: the same 20 floats as `shaders/instances`. Each shape reads its own subset:
 *   aPos      x, y, quad half-width, quad half-height
 *   aRotColor rotation, r, g, b
 *   aShape    alpha, shape, shape half-width, shape half-height
 *   aParm     p0, p1, flags, flash
 *   aExtra    outline width, p2, seed, -
 *
 * The seed is the one thing the sprite vertex stage does not pass: a number fixed for the life of
 * the part, from which its cracks are grown. A boss sways, so they cannot be grown from where the
 * part is on screen (the way a brick's are) without crawling.
 *
 * Every part is drawn in the alpha-blended pass, in the order it was written: a later part paints
 * over an earlier one. A body returns (premultiplied colour, coverage); a light returns 0 coverage
 * and simply adds, beneath whatever the alpha-blended pass draws after it.
 */

/** A soft radial light. p0 sharpness: 0 a haze, 1 nearly solid. A pure light. */
export const PART_GLOW = 0;
/** A plain ellipse. p0 softness (of the radius; above 0.01 it has no outline), p1 top lightening. */
export const PART_BLOB = 1;
/** An armour plate. p0 corner roundness, p1 bevel strength, p2 damage 0..1 (cracks, then leaking light). */
export const PART_PLATE = 2;
/**
 * A lock hanging down its local +y: round at the root, drawn to a point. p0 sweep of the tip, p1 how
 * long it stays full, p2 damage. Hair takes none; a skirt gore or a pauldron drawn this way does.
 */
export const PART_STRAND = 3;
/** A mechanical feather along +x. p0 fullest width, p1 strength of its joints, p2 how bright the tip burns. */
export const PART_FEATHER = 4;
/** An anime eye. p0 openness, p1 tilt, p2 how hard the foot of the iris burns. `color` is the iris. */
export const PART_EYE = 5;
/** A face that narrows to a chin. p0 narrowness of the chin, p1 shadow of the fringe. */
export const PART_FACE = 6;
/** A cut stone with p0 sides. p1 how hard its heart burns, p2 phase of the swirl. */
export const PART_GEM = 7;
/** A stroke along the quad's x axis. p0 thinness of the +x end, p1 roundness of the ends. */
export const PART_LINE = 8;
/**
 * An arc of light on the rim of the quad's ellipse: p0 thickness (of the radius), from angle p1,
 * sweeping p2 radians either way. A sweep of 0 is the whole ring, even all the way round.
 */
export const PART_ARC = 9;
/**
 * A fringe of hair in one piece, cut along the bottom into p0 points p1 deep that hang lower
 * towards the temples. p2 sheen.
 */
export const PART_FRINGE = 10;

/** How many shapes the program knows: anything at or past this draws nothing. */
export const PART_SHAPES = 11;

/** Part flag: the shape is mirrored across its own vertical axis. */
export const FLAG_PART_MIRROR = 1;

/** The sprite vertex stage, plus the part's seed. */
export const PART_VERT = `#version 300 es
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
flat out vec2 vQuad;
flat out vec4 vColor;
flat out vec4 vParm;
flat out vec4 vParm2;
flat out float vHalo;
flat out float vSeed;

void main() {
  vec2 local = aCorner * aPos.zw;
  float c = cos(aRotColor.x);
  float s = sin(aRotColor.x);
  vec2 world = aPos.xy + vec2(c * local.x - s * local.y, s * local.x + c * local.y);
  vec2 px = world * uView.x + uView.yz;
  gl_Position = vec4(px.x / uResolution.x * 2.0 - 1.0, 1.0 - px.y / uResolution.y * 2.0, 0.0, 1.0);
  vLocal = local;
  vQuad = aPos.zw;
  vColor = vec4(aRotColor.yzw, aShape.x);
  vParm = vec4(aShape.y, aShape.zw, aParm.x);
  vParm2 = vec4(aParm.y, aParm.z, aParm.w, aExtra.y);
  vHalo = aExtra.x;
  vSeed = aExtra.z;
}
`;

export const PART_FRAG = `#version 300 es
precision highp float;

in vec2 vLocal;
flat in vec2 vQuad;
flat in vec4 vColor;
flat in vec4 vParm;
flat in vec4 vParm2;
flat in float vHalo;
flat in float vSeed;

uniform float uTime;
// World units per device pixel: keeps edges antialiased at any window size.
uniform float uPixel;

out vec4 outColor;

const float TAU = 6.2831853;
const float HALF_TAU = 3.14159265;

// Line art: one deep plum for every outline and lash, so the figure reads as a single drawing.
const vec3 INK = vec3(0.135, 0.070, 0.160);
// The energy colour: the core, the tips of feathers, light leaking from cracks.
const vec3 ENERGY = vec3(1.0, 0.42, 0.88);

float sdRoundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
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

/** 0..1 coverage of a signed distance, antialiased across about one device pixel. */
float cover(float d, float px) {
  float aa = max(fwidth(d), px);
  return 1.0 - smoothstep(-aa, aa, d);
}

/** q, unless it is the exact centre: atan(0, 0) is undefined, and one undefined pixel spreads. */
vec2 offCentre(vec2 q) {
  return dot(q, q) > 1e-8 ? q : vec2(1e-4, 0.0);
}

/**
 * Cel paint: the fill inside, then a line of INK ow world units wide around it. Returns
 * (premultiplied colour, coverage), so the part is alpha blended like a surface.
 */
vec4 cel(float d, vec3 fill, float ow, float alpha) {
  float px = max(fwidth(d), uPixel);
  float inner = 1.0 - smoothstep(-px, px, d);
  float outer = 1.0 - smoothstep(-px, px, d - max(ow, 0.0));
  return vec4((fill * inner + INK * (outer - inner)) * alpha, outer * alpha);
}

/** A light: nothing is covered, the colour simply adds. */
vec4 glowOf(vec3 rgb, float amount, float alpha) {
  return vec4(rgb * amount * alpha, 0.0);
}

/**
 * How much crack there is at this pixel of a surface, inset world units inside its edge, damaged
 * dmg (0..1). Cracks are contour lines of a noise, jogged by a second, so they read as cracks
 * rather than marbling; they start at the edge and spread in, in patches, as the damage grows.
 */
float cracks(vec2 p, float inset, float dmg) {
  vec2 seed = vec2(vSeed * 0.617, vSeed * 0.373);
  float warp = vnoise(p * 0.05 + seed) * 12.0;
  float n = vnoise(p * 0.09 + seed + warp);
  float line = 1.0 - smoothstep(0.0, 0.075, abs(n - 0.5));
  float reach = mix(6.0, 34.0, dmg);
  float fromEdge = 1.0 - smoothstep(reach * 0.55, reach, inset);
  float patches = smoothstep(0.96 - dmg * 0.62, 0.99 - dmg * 0.34, vnoise(p * 0.028 + 31.0 + seed));
  return line * fromEdge * patches;
}

/** A surface with its cracks drawn in, and light leaking from them once the damage is past two fifths. */
vec3 crackOver(vec3 col, vec2 p, float inset, float dmg) {
  float on = cracks(p, inset, dmg);
  col = mix(col, INK, on * 0.92);
  return col + ENERGY * on * smoothstep(0.4, 1.0, dmg) * 0.85;
}

// A radial falloff, gone by the rim of the quad.
vec4 spGlow(vec2 p, vec2 h, vec3 rgb, float alpha, float p0) {
  vec2 q = offCentre(p / h);
  float f = pow(max(1.0 - length(q), 0.0), 2.0 + clamp(p0, 0.0, 1.0) * 7.0);
  return glowOf(rgb, f, alpha);
}

// A soft ellipse: a blush, a cast shadow, a band of sheen, a wash of light. p0 softness (of the
// radius; above 0.01 there is no outline), p1 how much the top lightens towards white.
vec4 spBlob(vec2 p, vec2 h, vec3 rgb, float alpha, float p0, float p1, float flash, float ow) {
  float r = length(offCentre(p / h));
  float up = 0.5 - 0.5 * clamp(p.y / max(h.y, 1e-3), -1.0, 1.0);
  vec3 col = mix(rgb, mix(rgb, vec3(1.0), 0.6), up * clamp(p1, 0.0, 1.0));
  col = mix(col, vec3(1.0), flash);
  float soft = clamp(p0, 0.0, 0.999);
  if (soft > 0.01) {
    float m = 1.0 - smoothstep(1.0 - soft, 1.0, r);
    return vec4(col * m * alpha, m * alpha);
  }
  float d = (r - 1.0) * min(h.x, h.y);
  return cel(d, col, ow, alpha);
}

// An armour plate, lit from the upper left in two cel tones, with a pale bevel just inside its
// edge. Damage spreads in from the edge as cracks, and past two fifths they leak light.
vec4 spPlate(vec2 p, vec2 h, vec3 rgb, float alpha, float p0, float p1, float p2, float flash, float ow) {
  float radius = clamp(p0, 0.0, 1.0) * min(h.x, h.y);
  float d = sdRoundBox(p, h, radius);
  vec2 q = p / h;
  float lit = 0.52 - 0.5 * q.y - 0.22 * q.x;
  float tone = smoothstep(0.45, 0.49, lit);
  vec3 col = mix(rgb * 0.70, rgb * 1.03 + vec3(0.035), tone);
  float inset = -d;
  float bevel = 1.0 - smoothstep(1.5, 3.0 + uPixel, inset);
  col = mix(col, mix(rgb, vec3(1.0), 0.72), bevel * clamp(p1, 0.0, 1.0) * 0.85);
  float dmg = clamp(p2, 0.0, 1.0);
  if (dmg > 0.001) col = crackOver(col, p, inset, dmg);
  col = mix(col, vec3(1.0), flash);
  return cel(d, col, ow, alpha);
}

// A lock along +y: a round root, full at the top, swept sideways as it narrows to a point. The light
// comes from the upper left, so the edge away from it falls into shadow, and a band of sheen lies
// across it a fifth of the way down. Drawn in pearl it is a plate that rounds off at its outer end.
vec4 spStrand(vec2 p, vec2 h, vec3 rgb, float alpha, float p0, float p1, float p2, float flash, float ow) {
  float t = clamp((p.y + h.y) / (2.0 * h.y), 0.0, 1.0);
  float across = p.x / h.x - p0 * t * (2.0 - t);
  float width = 1.0 - pow(t, mix(0.7, 2.6, clamp(p1, 0.0, 1.0)));
  // The root is domed, so a lock laid over hair shows no cut edge where it starts. Below the
  // dome's centre it is the plain width of the lock again.
  float root = length(vec2(p.x, min(p.y + h.y - h.x, 0.0))) - h.x;
  float d = max((abs(across) - width) * h.x, root);
  vec3 col = mix(rgb * 0.88, mix(rgb, vec3(1.0), 0.22), smoothstep(0.0, 0.85, t));
  col = mix(col, rgb * 0.70, smoothstep(0.35, 0.9, across / max(width, 0.02)));
  float sheen = 1.0 - smoothstep(0.0, 0.07, abs(t - 0.2));
  col = mix(col, mix(rgb, vec3(1.0), 0.6), sheen * 0.6 * (1.0 - smoothstep(0.3, 0.9, abs(across))));
  float dmg = clamp(p2, 0.0, 1.0);
  if (dmg > 0.001) col = crackOver(col, p, -d, dmg);
  col = mix(col, vec3(1.0), flash);
  return cel(d, col, ow, alpha);
}

// A blade along +x: narrow at the root, widest two fifths in, drawn to a point. It carries a
// spine, joints across it at even intervals, and a tip that burns.
vec4 spFeather(vec2 p, vec2 h, vec3 rgb, float alpha, float p0, float p1, float p2, float flash, float ow) {
  float t = clamp((p.x + h.x) / (2.0 * h.x), 0.0, 1.0);
  float bell = 0.38 + 0.62 * smoothstep(0.0, 0.42, t);
  float taper = 1.0 - pow(smoothstep(0.42, 1.0, t), 1.5);
  float d = (abs(p.y / h.y) - p0 * bell * taper) * h.y;
  vec3 col = mix(rgb * 0.78, mix(rgb, vec3(1.0), 0.5), smoothstep(0.0, 0.75, t));
  float spine = 1.0 - smoothstep(0.0, 2.0 + uPixel, abs(p.y));
  col = mix(col, rgb * 0.42, spine);
  // Joints across the blade at even intervals, so it reads as a thing built in sections.
  float joint = 1.0 - smoothstep(0.0, 0.1, abs(fract(p.x / 15.0) - 0.5) - 0.42);
  col = mix(col, rgb * 0.55, joint * clamp(p1, 0.0, 1.0) * 0.7 * (1.0 - spine));
  col += ENERGY * smoothstep(0.78, 0.99, t) * clamp(p2, 0.0, 1.0) * 1.5;
  col = mix(col, vec3(1.0), flash);
  return cel(d, col, ow, alpha);
}

// An anime eye: an almond of white with an iris that fills it, a slit pupil and two catchlights,
// cut from above by the upper lid — which takes the top of the almond even wide open, so the eye
// never reads as a circle. The lash is thick along the top and fine along the bottom.
vec4 spEye(vec2 p, vec2 h, vec3 rgb, float alpha, float p0, float p1, float p2, float flash, float ow) {
  vec2 q = p / h;
  float c = cos(p1);
  float s = sin(p1);
  vec2 e = vec2(c * q.x + s * q.y, -s * q.x + c * q.y);
  float dAlmond = (length(e) - 1.0) * min(h.x, h.y);
  float lid = mix(0.70, -0.92, clamp(p0, 0.0, 1.0));
  float d = max(dAlmond, (lid - e.y) * h.y);
  // White, shaded just under the lid.
  float shade = smoothstep(lid + 0.5, lid - 0.02, e.y);
  vec3 col = mix(vec3(1.0), vec3(0.80, 0.74, 0.92), shade * 0.55);
  // The iris sits a little low in the eye and takes up most of its height and most of its width:
  // what makes an eye read as anime rather than as a goggle.
  vec2 irisAt = vec2(0.0, 0.14);
  vec2 iq = (e - irisAt) / vec2(0.8, 1.06);
  float dIris = (length(iq) - 1.0) * h.y;
  float depth = clamp(iq.y, -1.0, 1.0);
  vec3 iris = mix(rgb * 0.36, mix(rgb, vec3(1.0), 0.42), depth * 0.5 + 0.5);
  iris += mix(rgb, vec3(1.0), 0.55) * smoothstep(0.0, 1.0, depth) * clamp(p2, 0.0, 1.0) * 0.8;
  col = mix(col, iris, cover(dIris, uPixel));
  col = mix(col, INK, (1.0 - smoothstep(0.0, 0.7 + uPixel, -dIris)) * 0.32);
  float dPupil = (length((e - irisAt) / vec2(0.2, 0.44)) - 1.0) * h.y;
  col = mix(col, vec3(0.09, 0.04, 0.12), cover(dPupil, uPixel));
  // Catchlights: one large high on the lit side, one small low on the other.
  float big = 1.0 - smoothstep(0.2, 0.22 + uPixel / h.y, length(e - irisAt - vec2(-0.17, -0.38)));
  float small = 1.0 - smoothstep(0.08, 0.1 + uPixel / h.y, length(e - irisAt - vec2(0.22, 0.42)));
  col = mix(col, vec3(1.0), max(big, small));
  col = mix(col, vec3(1.0), flash);
  float lash = mix(ow * 0.8, ow * 3.2, smoothstep(0.1, -0.6, e.y));
  return cel(d, col, lash, alpha);
}

// A face: an oval that narrows to a chin, with the fringe's shadow across the forehead.
vec4 spFace(vec2 p, vec2 h, vec3 rgb, float alpha, float p0, float p1, float flash, float ow) {
  vec2 q = p / h;
  float jaw = mix(1.0, clamp(p0, 0.2, 1.0), smoothstep(-0.3, 1.0, q.y));
  float d = (length(vec2(q.x / jaw, q.y)) - 1.0) * h.y;
  float far = smoothstep(0.25, 0.9, q.x) * smoothstep(-0.5, 0.8, q.y);
  vec3 col = mix(rgb, rgb * 0.88, far * 0.7);
  float brim = -0.46 + 0.09 * sin(q.x * 8.0) + 0.05 * sin(q.x * 15.0 + 1.3);
  float shade = (1.0 - smoothstep(brim - 0.06, brim + 0.06, q.y)) * clamp(p1, 0.0, 1.0);
  col = mix(col, mix(rgb * 0.80, vec3(0.90, 0.58, 0.70), 0.40), shade);
  col = mix(col, vec3(1.0), flash);
  return cel(d, col, ow, alpha);
}

// A stone with p0 sides and a vertex pointing up, lit from the upper left so every facet takes its
// own share of the light. Light pools in the heart.
vec4 spGem(vec2 p, vec2 h, vec3 rgb, float alpha, float p0, float p1, float p2, float flash, float ow) {
  vec2 q = offCentre(p / max(h, vec2(1e-3)));
  float r = length(q);
  float n = max(floor(p0 + 0.5), 3.0);
  float an = HALF_TAU / n;
  float a = atan(q.x, -q.y);
  float bn = mod(a, 2.0 * an) - an;
  float d = (cos(bn) * r - cos(an)) * h.y;
  float sector = floor(a / (2.0 * an));
  float facet = 0.5 + 0.5 * cos(((sector + 0.5) / n) * TAU + 2.2);
  vec3 col = rgb * (0.35 + 0.95 * facet);
  float dTable = (cos(bn) * r - cos(an) * 0.52) * h.y;
  col = mix(col, mix(rgb, vec3(1.0), 0.35) * (0.6 + 0.5 * facet), cover(dTable, uPixel) * 0.6);
  float swirl = vnoise(vec2(a * 1.2 + p2, r * 2.6 - p2 * 0.6));
  float heart = pow(max(1.0 - r, 0.0), 1.6);
  col += mix(rgb, vec3(1.0), 0.2) * swirl * heart * 0.55;
  col += mix(rgb, vec3(1.0), 0.85) * pow(heart, 3.0) * (0.22 + p1 * 0.7);
  col = mix(col, vec3(1.0), flash);
  return cel(d, col, ow, alpha);
}

// A stroke from end to end of the quad: a brow, a seam, a strut.
vec4 spLine(vec2 p, vec2 h, vec3 rgb, float alpha, float p0, float p1, float flash) {
  float t = clamp(p.x / max(h.x, 1e-3) * 0.5 + 0.5, 0.0, 1.0);
  float th = max(h.y * mix(1.0, clamp(p0, 0.0, 1.0), t), 0.35);
  float d = length(vec2(p.x - clamp(p.x, -h.x + th, h.x - th), p.y)) - th;
  d = mix(max(d, abs(p.x) - h.x), d, clamp(p1, 0.0, 1.0));
  float m = cover(d, uPixel);
  return vec4(mix(rgb, vec3(1.0), flash) * m * alpha, m * alpha);
}

// A band of light on the rim of the quad's ellipse: from angle p1, sweeping p2 radians either
// way. Bright at the head of the sweep, gone at its tail. A sweep of 0 is the whole ring, even all
// the way round. A pure light.
vec4 spArc(vec2 p, vec2 h, vec3 rgb, float alpha, float p0, float p1, float p2) {
  vec2 q = offCentre(p / h);
  float r = length(q);
  float u = mod(atan(q.y, q.x) - p1 + TAU, TAU);
  float len = max(abs(p2), 1e-3);
  float aa = fwidth(u) + 0.01;
  float ring = step(abs(p2), 1e-3);
  float win = mix(smoothstep(0.0, aa, u) * (1.0 - smoothstep(len, len + aa, u)), 1.0, ring);
  float band = 1.0 - smoothstep(p0 * 0.5, p0 * 1.5, abs(r - 0.9));
  float head = p2 >= 0.0 ? 1.0 - u / len : u / len;
  float m = band * win;
  return glowOf(mix(rgb, vec3(1.0), 0.35), mix((0.6 + 0.6 * head) * m, m * 1.15, ring), alpha);
}

// A fringe: the front of a head of hair in one piece. Round on top like a lock, straight down the
// sides, and cut along the bottom into p0 points p1 deep that hang lower towards the temples. That
// gives the teeth their read of separate locks with no line between them: the flank of each tooth
// away from the light is in shadow. p2 is the sheen across it.
vec4 spFringe(vec2 p, vec2 h, vec3 rgb, float alpha, float p0, float p1, float p2, float flash, float ow) {
  vec2 q = p / h;
  float sides = (abs(q.x) - 1.0) * h.x;
  float crown = length(vec2(p.x, min(p.y + h.y - h.x, 0.0))) - h.x;
  // Where this is in its tooth: 0 in a valley, 0.5 at a point, back to a valley at 1.
  float tooth = fract((q.x + 1.0) * 0.5 * max(p0, 1.0));
  float valley = abs(tooth - 0.5) * 2.0;
  float hem = (1.0 - clamp(p1, 0.05, 0.95) * valley + 0.3 * q.x * q.x - q.y) * h.y;
  float d = max(max(sides, crown), hem);
  vec3 col = mix(rgb * 0.90, mix(rgb, vec3(1.0), 0.20), smoothstep(-0.6, 0.6, q.y));
  col = mix(col, rgb * 0.72, smoothstep(0.42, 0.62, tooth) * smoothstep(-0.6, 0.0, q.y));
  float sheen = 1.0 - smoothstep(0.0, 0.09, abs(q.y + 0.55));
  col = mix(col, mix(rgb, vec3(1.0), 0.6), sheen * clamp(p2, 0.0, 1.0));
  col = mix(col, vec3(1.0), flash);
  return cel(d, col, ow, alpha);
}

void main() {
  int shape = int(vParm.x + 0.5);
  vec2 h = vParm.yz;
  float p0 = vParm.w;
  float p1 = vParm2.x;
  float flags = vParm2.y;
  float flash = vParm2.z;
  float p2 = vParm2.w;
  vec3 rgb = vColor.rgb;
  float alpha = vColor.a;
  float ow = vHalo;

  // A mirrored part first, so every shape above is written for one handedness.
  vec2 lp = mod(floor(flags + 0.5), 2.0) >= 1.0 ? vec2(-vLocal.x, vLocal.y) : vLocal;
  if (shape == 0) outColor = spGlow(lp, h, rgb, alpha, p0);
  else if (shape == 1) outColor = spBlob(lp, h, rgb, alpha, p0, p1, flash, ow);
  else if (shape == 2) outColor = spPlate(lp, h, rgb, alpha, p0, p1, p2, flash, ow);
  else if (shape == 3) outColor = spStrand(lp, h, rgb, alpha, p0, p1, p2, flash, ow);
  else if (shape == 4) outColor = spFeather(lp, h, rgb, alpha, p0, p1, p2, flash, ow);
  else if (shape == 5) outColor = spEye(lp, h, rgb, alpha, p0, p1, p2, flash, ow);
  else if (shape == 6) outColor = spFace(lp, h, rgb, alpha, p0, p1, flash, ow);
  else if (shape == 7) outColor = spGem(lp, h, rgb, alpha, p0, p1, p2, flash, ow);
  else if (shape == 8) outColor = spLine(lp, h, rgb, alpha, p0, p1, flash);
  else if (shape == 9) outColor = spArc(lp, h, rgb, alpha, p0, p1, p2);
  else if (shape == 10) outColor = spFringe(lp, h, rgb, alpha, p0, p1, p2, flash, ow);
  else outColor = vec4(0.0);
}
`;

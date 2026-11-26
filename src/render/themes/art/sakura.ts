import { PK_PETAL, PK_RING } from '../../particles';
import type { ThemeArt } from '../types';

/**
 * 樱花物语 — a Japanese garden under a full moon: blossom in the upper corners, a torii and two
 * stone lanterns at the pond's edge, petals always coming down. The middle of the field is left
 * to sky and water.
 *
 * Copy note: the shop's currency wording and the platform's review vocabulary both apply to
 * everything here (see AGENTS.md §2).
 */
export const SAKURA_ART: ThemeArt<'sakura'> = {
  id: 'sakura',
  scene: {
    helpers: `
// A stone lantern. s is measured from the middle of its foot: plinth, post, platform, a
// firebox, a broad roof, a finial.
float lantern(vec2 s) {
  float d = sdBox(s - vec2(0.0, 0.012), vec2(0.030, 0.012));
  d = min(d, sdBox(s - vec2(0.0, 0.050), vec2(0.011, 0.028)));
  d = min(d, sdBox(s - vec2(0.0, 0.086), vec2(0.028, 0.007)));
  d = min(d, sdBox(s - vec2(0.0, 0.111), vec2(0.021, 0.018)));
  d = min(d, sdTriangle(s, vec2(-0.042, 0.129), vec2(0.042, 0.129), vec2(0.0, 0.168)));
  d = min(d, sdCircle(s - vec2(0.0, 0.176), 0.009));
  return d;
}
`,
    body: `
// ── sky: navy overhead, dusky violet where it meets the hills ──
float up = clamp(a.y * 0.5 + 0.5, 0.0, 1.0);
col = mix(vec3(0.25, 0.105, 0.29), vec3(0.028, 0.026, 0.115), smoothstep(0.28, 0.92, up));

// Stars, thinning towards the horizon.
vec2 sg = far * 26.0;
vec2 scell = floor(sg);
vec2 sat = fract(sg) - 0.5 - (vec2(hash21(scell + 1.3), hash21(scell + 7.7)) - 0.5) * 0.7;
float sh = hash21(scell);
float star = (1.0 - smoothstep(0.0, 0.07 + fwidth(sg.x), length(sat))) * step(0.90, sh);
star *= 0.55 + 0.45 * sin(uTime * (1.0 + sh * 2.0) + sh * 50.0);
col += vec3(0.9, 0.85, 1.0) * star * smoothstep(0.40, 0.9, up);

// ── the moon ──
// On a wide window it hangs in the side column, below the panel at the top of it. A narrow one
// has no room beside the arena: there it sits high on the left, behind the field's dark plate,
// and is kept faint so it never competes with the bricks in front of it.
vec2 moonP = vec2(mix(-0.60, -ext.x + 0.62, wide), mix(0.74, 0.22, wide));
float md = length(far - moonP);
float disc = (1.0 - smoothstep(0.150, 0.154, md)) * mix(0.35, 1.0, wide);
col += vec3(1.0, 0.95, 0.88) * disc * (1.0 - 0.14 * smoothstep(0.5, 0.8, vnoise(far * 26.0 + 7.0)));
col += vec3(0.50, 0.36, 0.56) * exp(-md * 4.2) * 0.50 * lift * mix(0.5, 1.0, wide);

// ── high cloud, lit pink on the moon's side ──
float cl = uDetail > 0.5
  ? fbm(far * vec2(1.5, 3.6) + vec2(uTime * 0.010, 1.0))
  : vnoise(far * vec2(1.5, 3.6) + vec2(uTime * 0.010, 1.0)) * 0.6 + 0.2;
float sunlit = exp(-length(far - moonP) * 1.6);
col += mix(vec3(0.16, 0.085, 0.21), vec3(0.60, 0.35, 0.50), sunlit) * smoothstep(0.50, 0.84, cl) * smoothstep(0.10, 0.55, up);

// ── mountains: a pale far range, a darker one in front of it ──
col = mix(col, vec3(0.130, 0.092, 0.245), fill(far.y - wobble(far, -0.36, 0.105, 2.1)));
col = mix(col, vec3(0.060, 0.045, 0.160), fill(mid.y - wobble(mid, -0.44, 0.078, 3.3)));

// ── a pagoda on the far hill, a light in every storey: the middle of the left column on a wide
// window (the arena's edge would take half of it), left of centre otherwise ──
vec2 pg = mid - vec2(mix(-0.50, -(ext.x + 0.75) * 0.5, wide), -0.345);
float pag = 1e5;
float win = 1e5;
for (int i = 0; i < 4; i++) {
  float fi = float(i);
  float w = 0.082 - fi * 0.013;
  float yb = fi * 0.052;
  pag = min(pag, sdBox(pg - vec2(0.0, yb + 0.024), vec2(w * 0.42, 0.013)));
  pag = min(pag, sdBox(pg - vec2(0.0, yb + 0.050), vec2(w, 0.007)));
  win = min(win, sdBox(pg - vec2(0.0, yb + 0.024), vec2(0.0065, 0.006)));
}
pag = min(pag, sdSegment(pg, vec2(0.0, 0.212), vec2(0.0, 0.285)));
col = mix(col, vec3(0.028, 0.019, 0.080), fill(pag));
col += vec3(1.0, 0.72, 0.42) * fill(win) * 0.9 * lift;

// ── the garden: ground from the foothills down to the pond, mist along the far side of it ──
float moss = uDetail > 0.5 ? fbm(mid * vec2(9.0, 17.0) + 5.0) : vnoise(mid * vec2(9.0, 17.0) + 5.0);
col = mix(col, vec3(0.040, 0.038, 0.084) * (0.78 + 0.5 * moss), fill(mid.y - wobble(mid, -0.50, 0.03, 5.0)));
col += vec3(0.15, 0.10, 0.21) * exp(-abs(mid.y + 0.42) * 9.0) * 0.30;
// Fallen petals lie where the trees are, thickest under the corners.
float fallen = step(0.986, hash21(floor(near * 150.0))) * smoothstep(0.55, 0.95, abs(near.x) / max(ext.x, 1.0));
col += vec3(0.55, 0.34, 0.48) * fallen * 0.5 * fill(mid.y - wobble(mid, -0.50, 0.03, 5.0));

// ── sakura in bloom: lumpy masses of it hung from the upper corners, leaning in over the field ──
// A cluster is a density, not a disc: its distance from the heart, roughened by a noise field
// that is shared by all of them, so no two read as the same circle. bloomD ends up as the
// nearest cluster's density at this pixel: 0 at its heart, 1 past its rim.
float lump = fbm(mid * 6.5 + 3.0);
float bloomD = 10.0;
for (int i = 0; i < 2; i++) {
  float side = i == 0 ? -1.0 : 1.0;
  vec2 corner = vec2(side * ext.x, ext.y);
  for (int k = 0; k < 7; k++) {
    float fk = float(k);
    float h1 = hash11(fk * 1.7 + side * 3.1);
    float h2 = hash11(fk * 2.9 + side * 5.3 + 0.5);
    float h3 = hash11(fk * 4.3 + side * 7.7 + 2.5);
    // The first is the crown in the corner; the rest hang close under and beside it, so the
    // seven of them read as one tree rather than seven clouds.
    vec2 off = k == 0 ? vec2(0.14, -0.12) : vec2(0.04 + 0.62 * h1, -0.02 - 0.60 * h2);
    float r = (k == 0 ? 0.34 : 0.20 + 0.15 * h3) * (1.0 + 0.2 * wide);
    vec2 q = mid - (corner + vec2(side * off.x, off.y));
    bloomD = min(bloomD, length(q * vec2(1.0, 0.88)) / r + (lump - 0.5) * 0.9);
  }
  // …and two on each side that lean in over the field from the arena's own upper corners, where
  // the backdrop's darker plate keeps them well behind the bricks.
  vec2 q2 = mid - vec2(side * (0.88 + 0.10 * wide), 0.88);
  bloomD = min(bloomD, length(q2 * vec2(1.0, 0.92)) / 0.25 + (lump - 0.5) * 0.9);
  vec2 q3 = mid - vec2(side * (1.06 + 0.20 * wide), 0.50);
  bloomD = min(bloomD, length(q3 * vec2(1.0, 1.12)) / 0.19 + (lump - 0.5) * 0.9);
}
// The rim sits at 0.84 of a cluster's radius, so the lumps on it swing about a quarter of it.
float blossom = 1.0 - smoothstep(0.80, 0.88, bloomD);
// Lit from within: pale at the heart, violet towards the rim, flecked with single flowers and
// with the dark leaves that show between them.
vec3 bloom = mix(vec3(0.96, 0.66, 0.84), vec3(0.42, 0.20, 0.52), smoothstep(0.0, 0.95, bloomD) * 0.9);
bloom *= 0.9 + 0.2 * vnoise(mid * 30.0 + 1.0);
bloom = mix(bloom, vec3(0.16, 0.08, 0.23), step(0.905, vnoise(mid * 105.0 + 4.0)) * 0.42);
bloom += vec3(0.26, 0.22, 0.22) * step(0.94, vnoise(mid * 150.0 + 9.0));
bloom *= 0.9 + 0.2 * smoothstep(0.4, -0.6, mid.x / max(ext.x, 1.0)) * wide;
col = mix(col, bloom, blossom * 0.97);

// ── the pond: the night upside down, broken by ripples ──
// Depth below the shore line: positive in the pond, negative on land. The shore sits a little
// above the arena's floor, so the pond shows beside the arena on every window and lies, darkened
// with the rest of the scene, behind the paddle inside it.
float shore = -0.80;
float depth = shore - a.y;
float ripple = vnoise(vec2(a.x * 22.0 + uTime * 0.30, a.y * 90.0 - uTime * 2.2));
float farOut = clamp(depth * 1.5, 0.0, 1.0);
vec3 water = mix(vec3(0.085, 0.060, 0.160), vec3(0.018, 0.016, 0.075), farOut);
water += vec3(0.20, 0.11, 0.22) * smoothstep(0.62, 0.90, ripple) * 0.35;
// The moon's path, and the lanterns'.
float lanternLX = mix(-0.70, -0.86, wide);
float path = exp(-abs(near.x - moonP.x + (ripple - 0.5) * 0.10) * 11.0);
water += vec3(1.0, 0.92, 0.80) * path * smoothstep(0.35, 0.75, ripple) * 0.75;
float lamps = exp(-abs(near.x - lanternLX) * 16.0) + exp(-abs(near.x + lanternLX) * 16.0);
water += vec3(1.0, 0.70, 0.42) * lamps * smoothstep(0.30, 0.70, ripple) * 0.55 * (1.0 - farOut * 0.6);
// Petals afloat, drifting with the ripples.
vec2 fg = vec2(a.x * 60.0, a.y * 90.0 + uTime * 1.2);
vec2 fcell = floor(fg);
vec2 fsat = fract(fg) - vec2(hash21(fcell), hash21(fcell + 5.0));
float fleck = step(0.975, hash21(fcell + 2.0)) * (1.0 - smoothstep(0.0, 0.13, length(fsat * vec2(1.0, 0.6))));
water += vec3(0.95, 0.70, 0.82) * fleck * 0.45 * (1.0 - farOut);
water += vec3(0.45, 0.36, 0.52) * (1.0 - smoothstep(0.0, 0.006, depth)) * 0.5;
col = mix(col, water, smoothstep(-0.003, 0.003, depth));

// ── the boughs the blossom sits on: dark, near, reaching in from the corners ──
// Inward is towards the middle of the window, which is the opposite way on each side.
float bough = 1e5;
for (int i = 0; i < 2; i++) {
  float side = i == 0 ? -1.0 : 1.0;
  float inward = -side;
  vec2 corner = vec2(side * ext.x, ext.y);
  bough = min(bough, sdSegment(near, corner + vec2(inward * -0.06, 0.06), corner + vec2(inward * 0.72, -0.34)) - 0.011);
  bough = min(bough, sdSegment(near, corner + vec2(inward * 0.30, -0.17), corner + vec2(inward * 0.27, -0.92)) - 0.007);
  if (uDetail > 0.5) {
    bough = min(bough, sdSegment(near, corner + vec2(inward * 0.52, -0.27), corner + vec2(inward * 0.90, -0.60)) - 0.006);
    bough = min(bough, sdSegment(near, corner + vec2(inward * 0.14, -0.62), corner + vec2(inward * 0.50, -0.84)) - 0.005);
  }
}
col = mix(col, vec3(0.040, 0.025, 0.068), fill(bough));

// Single blossoms dotted along them: the nearest things in the garden.
for (int i = 0; i < 12; i++) {
  if (uDetail < 0.5 && i >= 6) break;
  float fi = float(i);
  float side = mod(fi, 2.0) < 1.0 ? -1.0 : 1.0;
  float inward = -side;
  vec2 corner = vec2(side * ext.x, ext.y);
  vec2 p = mix(corner + vec2(inward * 0.08, -0.10), corner + vec2(inward * 0.80, -0.86), hash11(fi * 3.1 + 0.7));
  p += vec2(inward * (hash11(fi * 5.7 + 2.3) - 0.5) * 0.10, (hash11(fi + 11.0) - 0.5) * 0.10);
  float r = 0.011 + 0.007 * hash11(fi * 1.9);
  col = mix(col, vec3(1.0, 0.80, 0.90), fill(sdCircle(near - p, r)));
}

// ── two stone lanterns at the pond's edge, their fireboxes lit ──
for (int i = 0; i < 2; i++) {
  vec2 s = near - vec2(i == 0 ? lanternLX : -lanternLX, shore + 0.006);
  col = mix(col, vec3(0.105, 0.090, 0.165), fill(lantern(s)));
  col += vec3(1.0, 0.70, 0.42) * fill(sdBox(s - vec2(0.0, 0.111), vec2(0.013, 0.011))) * 1.1 * lift;
  col += vec3(1.0, 0.70, 0.42) * glow(length(s - vec2(0.0, 0.111)), 0.085) * 0.42 * lift;
}

// ── a torii standing at the left of the garden: vermilion, with lacquered caps ──
// To the right of the garden on a wide window, where the side column is clear below its panel.
vec2 torii = mid - vec2(mix(0.50, ext.x - 0.62, wide), shore + 0.012);
float posts = min(
  sdSegment(torii, vec2(-0.105, 0.0), vec2(-0.095, 0.335)) - 0.0125,
  sdSegment(torii, vec2(0.105, 0.0), vec2(0.095, 0.335)) - 0.0125
);
float beams = min(sdBox(torii - vec2(0.0, 0.268), vec2(0.150, 0.011)), sdBox(torii - vec2(0.0, 0.318), vec2(0.165, 0.009)));
col = mix(col, vec3(0.36, 0.07, 0.11), fill(min(posts, beams)));
float caps = min(sdSegment(torii, vec2(-0.190, 0.352), vec2(0.190, 0.352)) - 0.010, sdCircle(torii - vec2(0.0, 0.395), 0.012));
col = mix(col, vec3(0.035, 0.040, 0.055), fill(caps));

// ── a low stone bridge over the pond, three arches, right of centre ──
vec2 bridge = near - vec2(0.42, shore + 0.034);
float crown = 0.012 * (1.0 - clamp(bridge.x * bridge.x / 0.07, 0.0, 1.0));
float deck = max(max(abs(bridge.x) - 0.27, bridge.y - crown), -(bridge.y + 0.016));
for (int k = 0; k < 3; k++) {
  deck = max(deck, -sdEllipse(bridge - vec2((float(k) - 1.0) * 0.165, -0.016), vec2(0.058, 0.022)));
}
col = mix(col, vec3(0.115, 0.100, 0.170), fill(deck));
float rail = sdBox(bridge - vec2(0.0, crown + 0.024), vec2(0.265, 0.0035));
for (int k = 0; k < 6; k++) {
  rail = min(rail, sdBox(bridge - vec2((float(k) - 2.5) * 0.105, crown + 0.012), vec2(0.0035, 0.012)));
}
col = mix(col, vec3(0.140, 0.122, 0.195), fill(rail));
`,
  },
  effects: {
    ambient: [
      {
        kind: 'petal',
        count: [14, 24, 34],
        colors: [0xffb3d9, 0xff91c8, 0xffd9ea, 0xe4b8ff],
        drift: [26, 54],
        wind: [8, 26],
        sway: 22,
        size: [7, 12],
        spin: [1.2, 3.4],
      },
    ],
    paddleTrail: {
      kind: PK_PETAL,
      count: 1,
      color: 0xffb3d9,
      speed: [10, 50],
      life: [0.9, 1.5],
      size: [5, 3],
      grav: 46,
      drag: 1.6,
      rotV: 3.2,
      alpha: 0.85,
    },
    ballTrail: {
      kind: PK_PETAL,
      count: 1,
      color: 0xffc2e0,
      speed: [6, 34],
      life: [0.55, 0.95],
      size: [6.5, 2.2],
      grav: 30,
      drag: 2.4,
      rotV: 4.4,
      alpha: 0.9,
      stride: 46,
    },
    paddleHit: [
      {
        kind: PK_PETAL,
        count: 9,
        color: 0xffb3d9,
        speed: [120, 330],
        life: [0.7, 1.2],
        size: [7, 2.5],
        spread: 1.15,
        offset: [-14, 14, -8, 0],
        grav: 150,
        drag: 2.6,
        rotV: 5,
      },
      {
        kind: PK_RING,
        count: 1,
        color: 0xff91c8,
        speed: [0, 0],
        life: [0.34, 0.34],
        size: [14, 14],
        reach: 120,
        alpha: 0.8,
      },
    ],
    bounce: [
      {
        kind: PK_RING,
        count: 1,
        color: 0xffa6d4,
        speed: [0, 0],
        life: [0.3, 0.3],
        size: [6, 6],
        reach: 58,
        alpha: 0.75,
      },
      {
        kind: PK_PETAL,
        count: 2,
        color: 0xffd3e8,
        speed: [40, 150],
        life: [0.4, 0.8],
        size: [5, 1.8],
        spread: 1.3,
        grav: 60,
        drag: 2.5,
        rotV: 5,
      },
    ],
  },
};

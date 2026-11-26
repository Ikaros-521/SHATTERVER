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

// A point part-way along a branch. t is its share of the way from a to b, and the branch bows
// sideways by bow on the way: towards the left of a to b when bow is positive.
vec2 branchPoint(vec2 a, vec2 b, float bow, float t) {
  vec2 n = vec2(-(b - a).y, (b - a).x);
  n /= max(length(n), 1e-4);
  vec2 c = (a + b) * 0.5 + n * bow;
  return mix(mix(a, c, t), mix(c, b, t), t);
}

// Distance to a branch that runs from a to b, bows by bow and thins from ra to rb: four tapered
// rods along its curve. Their rounded ends overlap, so no joint shows.
float branch(vec2 p, vec2 a, vec2 b, float bow, float ra, float rb) {
  float d = 1e5;
  vec2 prev = a;
  for (int i = 1; i <= 4; i++) {
    float t = float(i) * 0.25;
    vec2 cur = branchPoint(a, b, bow, t);
    d = min(d, sdTapered(p, prev, cur, mix(ra, rb, t - 0.25), mix(ra, rb, t)));
    prev = cur;
  }
  return d;
}

// The smaller of two distances, with the corner where they meet rounded off over roughly k:
// a union that looks grown together rather than glued.
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// A place in a tree's own frame: u in from its corner, v down from the top of the window.
vec2 limbAt(vec2 corner, float side, float spread, float u, float v) {
  return corner + vec2(side * u * spread, -v);
}

// The sakura tree that hangs into the window from one top corner. A trunk comes down out of the
// top of the frame and goes over into its long bough, which leans in over the field; two more
// boughs leave it, one dropping towards the garden and one down the outer side, and twigs leave
// those. Every limb is thinner than the one it grows from and bows under the blossom it carries.
//
// side is 1 for the tree at the left corner, which grows towards +x, and -1 for the one at the
// right, which is its mirror. spread stretches the tree in from its corner, so that it reaches
// the field on a wide window. detail 0 leaves the outer twigs out.
//
// x of the result is the distance to the trunk and its three boughs, y to the nearest limb of
// all: the blossom lets the boughs show through it and hides the twigs.
vec2 sakuraLimbs(vec2 s, vec2 corner, float side, float spread, float detail) {
  vec2 trunkA = limbAt(corner, side, spread, 0.15, -0.30);
  vec2 fork = limbAt(corner, side, spread, 0.267, 0.40);
  vec2 b1a = fork;
  vec2 b1b = limbAt(corner, side, spread, 1.06, 0.56);
  vec2 b2a = limbAt(corner, side, spread, 0.255, 0.34);
  vec2 b2b = limbAt(corner, side, spread, 0.36, 0.56);
  vec2 b3a = limbAt(corner, side, spread, 0.235, 0.22);
  vec2 b3b = limbAt(corner, side, spread, 0.09, 0.74);
  float d = branch(s, trunkA, fork, 0.008 * side, 0.026, 0.019);
  d = smin(d, branch(s, b1a, b1b, 0.11 * side, 0.017, 0.0065), 0.012);
  d = smin(d, branch(s, b2a, b2b, 0.04 * side, 0.012, 0.005), 0.010);
  d = smin(d, branch(s, b3a, b3b, -0.03 * side, 0.011, 0.005), 0.010);
  float boughs = d;
  // A twig off the long bough that drops into the field's upper corner, and one off the bough
  // that drops towards the garden.
  vec2 t1a = branchPoint(b1a, b1b, 0.11 * side, 0.52);
  vec2 t1b = limbAt(corner, side, spread, 0.80, 0.74);
  float twigs = branch(s, t1a, t1b, -0.02 * side, 0.006, 0.0025);
  vec2 t3b = limbAt(corner, side, spread, 0.30, 0.76);
  twigs = min(twigs, branch(s, b2b, t3b, -0.015 * side, 0.005, 0.0022));
  if (detail > 0.5) {
    // …one that turns up into the field's top corner, and one off the outer bough.
    vec2 t2a = branchPoint(b1a, b1b, 0.11 * side, 0.80);
    vec2 t2b = limbAt(corner, side, spread, 1.24, 0.34);
    twigs = min(twigs, branch(s, t2a, t2b, 0.02 * side, 0.0055, 0.0022));
    vec2 t4a = branchPoint(b3a, b3b, -0.03 * side, 0.60);
    vec2 t4b = limbAt(corner, side, spread, 0.03, 0.86);
    twigs = min(twigs, branch(s, t4a, t4b, 0.01 * side, 0.0045, 0.002));
  }
  return vec2(boughs, smin(d, twigs, 0.006));
}

// Distance to the nearest limb of either sakura tree, as sakuraLimbs gives it. ext is the
// window's half extents.
//
// Nothing of a tree is below its lowest twig or further in than its furthest tip, and the sky
// and the pond under them are most of the window: the limbs are only summed up inside that box.
vec2 sakuraTree(vec2 s, vec2 ext, float spread, float detail) {
  vec2 d = vec2(1e5);
  for (int i = 0; i < 2; i++) {
    float side = i == 0 ? 1.0 : -1.0;
    vec2 corner = vec2(-side * ext.x, ext.y);
    vec2 frame = vec2((s.x - corner.x) * side / spread, corner.y - s.y);
    if (frame.x > -0.2 && frame.x < 1.4 && frame.y > -0.35 && frame.y < 0.98) {
      d = min(d, sakuraLimbs(s, corner, side, spread, detail));
    }
  }
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

// ── the sakura trees: the dark limbs first, then the blossom that weighs them down ──
// Each tree hangs in from a top corner (see sakuraLimbs). On a wide window it is stretched in
// from its corner, so that its long bough reaches over the field; on a narrow one it is drawn in
// instead, so that the two trees frame the top of the window without crossing in the middle. Bark is a dark wood lit from above and a little
// from its own side of the window, so that every limb reads as round: the normal is the slope of
// the distance, taken from four samples a hair apart, and only where a limb is near.
float spread = mix(0.64, 1.25, wide);
vec2 tree = sakuraTree(mid, ext, spread, uDetail);
float limb = tree.y;
vec3 bark = vec3(0.034, 0.021, 0.048);
if (limb < 0.02) {
  vec2 e = vec2(0.004, 0.0);
  vec2 slope = vec2(
    sakuraTree(mid + e.xy, ext, spread, uDetail).y - sakuraTree(mid - e.xy, ext, spread, uDetail).y,
    sakuraTree(mid + e.yx, ext, spread, uDetail).y - sakuraTree(mid - e.yx, ext, spread, uDetail).y
  );
  float side = mid.x < 0.0 ? 1.0 : -1.0;
  float lit = max(dot(normalize(offCentre(slope)), normalize(vec2(-0.45 * side, 0.89))), 0.0);
  bark = mix(bark, vec3(0.27, 0.20, 0.34), pow(lit, 1.5));
}
col = mix(col, bark, fill(limb));

// ── sakura in bloom: a garland of it along every limb, thickest where each one ends ──
// A cluster is a density, not a disc: its distance from the heart, roughened by a noise field
// that is shared by all of them, so no two read as the same circle. bloomD ends up as the
// nearest cluster's density at this pixel: 0 at its heart, 1 past its rim. Each entry says where
// a cluster hangs in its tree's frame, as in limbAt, and how wide it is. There are more of them
// than there are limbs to carry them, and they overlap: that is what makes one canopy rather
// than a row of balls on a wire.
const vec3 clusters[15] = vec3[15](
  vec3(0.20, 0.16, 0.22),
  vec3(0.38, 0.26, 0.14),
  vec3(0.56, 0.30, 0.16),
  vec3(0.72, 0.44, 0.15),
  vec3(0.90, 0.38, 0.15),
  vec3(1.07, 0.55, 0.17),
  vec3(0.42, 0.42, 0.11),
  vec3(0.38, 0.52, 0.14),
  vec3(0.17, 0.46, 0.11),
  vec3(0.10, 0.70, 0.15),
  vec3(0.76, 0.66, 0.10),
  vec3(0.82, 0.80, 0.13),
  vec3(1.24, 0.33, 0.14),
  vec3(0.30, 0.76, 0.13),
  vec3(0.04, 0.84, 0.12)
);
float lump = fbm(mid * 6.5 + 3.0);
float bloomD = 10.0;
for (int i = 0; i < 2; i++) {
  float side = i == 0 ? 1.0 : -1.0;
  vec2 corner = vec2(-side * ext.x, ext.y);
  for (int k = 0; k < 15; k++) {
    vec2 q = mid - limbAt(corner, side, spread, clusters[k].x, clusters[k].y);
    float r = clusters[k].z * mix(0.72, 1.2, wide);
    bloomD = min(bloomD, length(q * vec2(1.0, 0.88)) / r + (lump - 0.5) * 0.9);
  }
}
// The rim sits at 0.84 of a cluster's radius, so the lumps on it swing about a quarter of it.
float blossom = 1.0 - smoothstep(0.80, 0.88, bloomD);
// The boughs show faintly through the blossom covering them, as they do on a real tree; the
// twigs do not, so no thin line is drawn across a mass of flowers.
blossom *= 1.0 - 0.5 * fill(tree.x + 0.003);
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

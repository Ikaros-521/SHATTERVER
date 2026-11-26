import { PK_BUBBLE, PK_RING } from '../../particles';
import type { ThemeArt } from '../types';

/**
 * 深海秘境 — the floor of a quiet sea: a sunken temple straight ahead with one light still
 * burning in its doorway, weed and coral thick at the sides, shafts of daylight from a surface
 * too far up to see, bubbles on their way to it.
 */
export const OCEAN_ART: ThemeArt<'ocean'> = {
  id: 'ocean',
  scene: {
    helpers: `
// A strand of weed rooted at root, h tall, swinging with the swell: thin, with frilled edges.
float weed(vec2 s, vec2 root, float h, float phase, float width) {
  vec2 q = s - root;
  float t = clamp(q.y / h, 0.0, 1.0);
  float bend = sin(uTime * 0.9 + phase + t * 2.2) * 0.14 * h * t * t;
  float w = width * (1.0 - 0.62 * t) * (0.7 + 0.5 * sin(q.y * 150.0 + phase));
  return max(abs(q.x - bend) - w, abs(q.y - h * 0.5) - h * 0.5);
}

// Coral: a hand of fingers fanning up from root. size is its reach.
float coral(vec2 s, vec2 root, float size, float seed) {
  float d = sdTapered(s, root, root + vec2(0.0, 0.45 * size), 0.045 * size, 0.03 * size);
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float ang = -0.75 + fi * 0.5 + (hash11(seed + fi) - 0.5) * 0.3;
    vec2 dir = vec2(sin(ang), cos(ang));
    vec2 knuckle = root + dir * size * (0.5 + 0.2 * hash11(seed + fi * 3.0));
    d = min(d, sdTapered(s, root + vec2(0.0, 0.2 * size), knuckle, 0.035 * size, 0.02 * size));
    d = min(d, sdTapered(s, knuckle, knuckle + vec2(dir.x * 0.6 - 0.25, 0.75) * size * 0.4, 0.02 * size, 0.008 * size));
  }
  return d;
}
`,
    body: `
// ── the water itself: black-blue depths below, lit teal towards the surface ──
float up = clamp(a.y * 0.5 + 0.5, 0.0, 1.0);
col = mix(vec3(0.006, 0.020, 0.070), vec3(0.040, 0.215, 0.340), pow(up, 1.8));
float murk = uDetail > 0.5 ? fbm(a * vec2(1.4, 2.2) + vec2(uTime * 0.012, -uTime * 0.008)) : vnoise(a * vec2(1.4, 2.2) + vec2(uTime * 0.012, -uTime * 0.008));
col += vec3(0.02, 0.08, 0.12) * smoothstep(0.45, 0.85, murk) * up;

// ── light from the surface: slow shafts that sway, fading with depth ──
vec2 sun = mid - vec2(0.0, ext.y + 0.6);
float ang = atan(sun.x, -sun.y);
float shafts = pow(0.5 + 0.5 * sin(ang * 26.0 + uTime * 0.22 + vnoise(vec2(ang * 6.0, uTime * 0.05)) * 2.0), 5.0);
shafts += 0.6 * pow(0.5 + 0.5 * sin(ang * 11.0 - uTime * 0.15), 7.0);
col += vec3(0.30, 0.75, 0.95) * shafts * smoothstep(-0.9, 0.4, mid.y) * 0.24 * lift;
col += vec3(0.35, 0.85, 1.0) * exp(-max(ext.y - a.y, 0.0) * 4.5) * 0.30 * lift;

// ── a school crossing far off: dark darts that wheel together ──
float span = ext.x * 2.0 + 0.8;
for (int i = 0; i < 10; i++) {
  if (uDetail < 0.5 && i >= 4) break;
  float fi = float(i);
  vec2 f = vec2(
    mod(far.x + uTime * (0.045 + 0.010 * fract(fi * 0.618)) + fi * 0.41, span) - ext.x - 0.4,
    0.34 + 0.24 * fract(fi * 0.754) + 0.05 * sin(uTime * 0.7 + fi)
  );
  vec2 q = far - f;
  float d = min(length(q * vec2(1.0, 2.3)) - 0.0085, sdTriangle(q, vec2(0.007, 0.0), vec2(0.017, 0.0065), vec2(0.017, -0.0065)));
  col = mix(col, vec3(0.010, 0.045, 0.095), fill(d) * 0.5);
}

// ── the sea floor, and the light that plays over it ──
float floorY = wobble(mid, -0.665, 0.035, 3.0);
float onFloor = fill(mid.y - floorY);
col = mix(col, vec3(0.020, 0.072, 0.112), onFloor);
col += vec3(0.03, 0.07, 0.07) * smoothstep(0.6, 0.9, vnoise(mid * 44.0)) * onFloor;
float caustic = vnoise(mid * 9.0 + vec2(uTime * 0.15, uTime * 0.10)) * (uDetail > 0.5 ? vnoise(mid * 11.0 - vec2(uTime * 0.12, 0.0)) : 0.6);
col += vec3(0.10, 0.30, 0.36) * smoothstep(0.28, 0.55, caustic) * onFloor * 0.42 * lift;

// ── the sunken temple, still keeping one light ──
// Centred it would sit behind the field, where the dark plate all but hides it: on a wide window
// it stands in the left column instead, scaled to fit between the arena's edge and the window's.
float templeScale = mix(1.0, max(1.0, 0.46 / max(0.44 * (ext.x - 0.75), 0.1)), wide);
vec2 t = (mid - vec2(mix(0.0, -(ext.x + 0.75) * 0.5, wide), -0.64)) * templeScale;
float temple = sdBox(t - vec2(0.0, 0.012), vec2(0.46, 0.012));
temple = min(temple, sdBox(t - vec2(0.0, 0.036), vec2(0.42, 0.012)));
for (int i = 0; i < 5; i++) {
  float fi = float(i);
  float cx = (fi - 2.0) * 0.165;
  // The middle column has fallen; its neighbours have lost their tops.
  float hgt = fi == 2.0 ? 0.10 : 0.235 - (fi == 1.0 || fi == 3.0 ? 0.02 : 0.0);
  temple = min(temple, sdBox(t - vec2(cx, 0.048 + hgt * 0.5), vec2(0.021, hgt * 0.5)));
  temple = min(temple, sdBox(t - vec2(cx, 0.048 + hgt + 0.008), vec2(0.030, 0.008)));
}
temple = min(temple, sdBox(t - vec2(0.0, 0.313), vec2(0.40, 0.014)));
temple = min(temple, sdTriangle(t, vec2(-0.43, 0.327), vec2(0.43, 0.327), vec2(0.0, 0.46)));
col = mix(col, vec3(0.020, 0.075, 0.135), fill(temple));
col += vec3(0.35, 0.95, 1.0) * fill(sdBox(t - vec2(0.0, 0.135), vec2(0.030, 0.060))) * (0.55 + 0.25 * sin(uTime * 1.3)) * lift;
col += vec3(0.20, 0.70, 0.95) * glow(length(t - vec2(0.0, 0.135)), 0.16) * 0.35 * lift;
for (int i = 0; i < 3; i++) {
  col += vec3(0.40, 0.95, 1.0) * fill(sdCircle(t - vec2((float(i) - 1.0) * 0.20, 0.312), 0.008)) * 0.8 * lift;
}

// ── a ruined wall to the right of the temple (the left column is the temple's on a wide window) ──
for (int i = 0; i < 2; i++) {
  float side = i == 0 ? -1.0 : 1.0;
  vec2 r = mid - vec2(side * mix(0.98, ext.x - 0.34, wide), -0.64);
  float d = sdBox(r - vec2(0.0, 0.05), vec2(0.16, 0.05));
  d = min(d, sdBox(r - vec2(0.10, 0.14), vec2(0.035, 0.05)));
  d = min(d, sdBox(r - vec2(-0.02, 0.13), vec2(0.025, 0.04)));
  d = min(d, sdBox(r - vec2(-0.11, 0.11), vec2(0.02, 0.03)));
  col = mix(col, vec3(0.024, 0.085, 0.140), fill(d) * (i == 0 ? 1.0 - wide : 1.0));
}

// ── weed and coral: thick at the sides, thinning towards the middle ──
for (int i = 0; i < 12; i++) {
  if (uDetail < 0.5 && i >= 6) break;
  float fi = float(i);
  float side = mod(fi, 2.0) < 1.0 ? -1.0 : 1.0;
  float k = floor(fi * 0.5) / 5.0;
  float x0 = side * ext.x * mix(0.99, 0.58, k) + (hash11(fi + 2.0) - 0.5) * 0.05;
  float rootY = wobble(vec2(x0, 0.0), -0.665, 0.035, 3.0) - 0.01;
  float h = mix(0.36, 0.13, k) * (0.7 + 0.6 * hash11(fi * 2.3 + 9.0));
  vec3 tint = mix(vec3(0.05, 0.32, 0.30), vec3(0.10, 0.55, 0.62), hash11(fi + 4.0));
  col = mix(col, tint, fill(weed(near, vec2(x0, rootY), h, fi * 1.9, 0.0075 + 0.004 * hash11(fi))) * 0.85);
}
for (int i = 0; i < 6; i++) {
  if (uDetail < 0.5 && i >= 3) break;
  float fi = float(i);
  float side = mod(fi, 2.0) < 1.0 ? -1.0 : 1.0;
  float k = floor(fi * 0.5) / 2.0;
  float x0 = side * ext.x * mix(0.93, 0.66, k) + (hash11(fi + 21.0) - 0.5) * 0.06;
  float rootY = wobble(vec2(x0, 0.0), -0.665, 0.035, 3.0) - 0.005;
  float size = mix(0.20, 0.10, k) * (0.75 + 0.5 * hash11(fi * 3.7));
  vec3 tint = mix(vec3(0.80, 0.30, 0.42), vec3(0.95, 0.55, 0.30), hash11(fi + 7.0));
  col = mix(col, tint, fill(coral(near, vec2(x0, rootY), size, fi * 4.1)) * 0.9);
}

// ── the edges of the view fall away into the dark ──
col *= 1.0 - 0.30 * smoothstep(0.5, 1.5, length(a * vec2(0.55, 0.7)));
`,
  },
  effects: {
    ambient: [
      {
        kind: 'bubble',
        count: [12, 20, 30],
        colors: [0x9feeff, 0x6fd8ff, 0xd6ffff],
        drift: [22, 46],
        wind: [-10, 10],
        sway: 10,
        size: [3, 8],
        spin: [0, 0],
      },
      {
        kind: 'fish',
        count: [4, 7, 10],
        colors: [0x397eff, 0x16d9f5, 0x8fe8ff, 0x2a5fd0],
        drift: [3, 9],
        wind: [34, 78],
        sway: 9,
        size: [11, 19],
        spin: [0, 0],
      },
      {
        kind: 'mote',
        count: [10, 18, 28],
        colors: [0x9feeff, 0xd6ffff],
        drift: [2, 6],
        wind: [-5, 5],
        sway: 5,
        size: [1.2, 2.4],
        spin: [0, 0],
      },
    ],
    paddleTrail: {
      kind: PK_BUBBLE,
      count: 1,
      color: 0xbef6ff,
      speed: [20, 80],
      life: [0.6, 1.1],
      size: [3.5, 5.5],
      offset: [-10, 10, -10, -2],
      grav: -140,
      drag: 1.4,
      alpha: 0.8,
    },
    ballTrail: {
      kind: PK_BUBBLE,
      count: 1,
      color: 0x9feeff,
      speed: [10, 60],
      life: [0.45, 0.9],
      size: [2.6, 4.2],
      grav: -110,
      drag: 2.0,
      alpha: 0.75,
      stride: 54,
    },
    paddleHit: [
      {
        kind: PK_RING,
        count: 1,
        color: 0x16d9f5,
        speed: [0, 0],
        life: [0.36, 0.36],
        size: [12, 12],
        reach: 150,
        alpha: 0.8,
      },
      {
        kind: PK_RING,
        count: 2,
        color: 0xd6ffff,
        speed: [0, 0],
        life: [0.3, 0.42],
        size: [8, 8],
        reach: 96,
        offset: [-30, 30, -4, -4],
        alpha: 0.6,
      },
      {
        kind: PK_BUBBLE,
        count: 7,
        color: 0xbef6ff,
        speed: [90, 300],
        life: [0.5, 1.0],
        size: [3, 5.5],
        spread: 1.2,
        grav: -160,
        drag: 2.2,
      },
    ],
    bounce: [
      {
        kind: PK_RING,
        count: 1,
        color: 0x397eff,
        speed: [0, 0],
        life: [0.34, 0.34],
        size: [5, 5],
        reach: 64,
        alpha: 0.75,
      },
      {
        kind: PK_BUBBLE,
        count: 2,
        color: 0x9feeff,
        speed: [30, 120],
        life: [0.4, 0.8],
        size: [2.2, 3.6],
        spread: 1.4,
        grav: -90,
        drag: 2.2,
      },
    ],
  },
};

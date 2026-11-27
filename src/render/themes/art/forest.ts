import { PK_FIRE, PK_LEAF, PK_RING } from '../../particles';
import type { ThemeArt } from '../types';

/**
 * 翠影森林 — a glade: daylight coming down in shafts that swing with the canopy, two ancients
 * flanking the field with roots spread wide, a fall on the right, a hut with one lit window,
 * and fireflies in the air.
 */
export const FOREST_ART: ThemeArt<'forest'> = {
  id: 'forest',
  scene: {
    helpers: '',
    body: `
// ── the glade's air: green dark below, lit where the canopy opens above ──
float up = clamp(a.y * 0.5 + 0.5, 0.0, 1.0);
col = mix(vec3(0.024, 0.070, 0.042), vec3(0.080, 0.215, 0.125), smoothstep(0.1, 0.9, up));
// Daylight coming through the leaves, high and a touch right of centre.
float sky = exp(-length(far - vec2(0.05, ext.y - 0.10)) * 1.7);
col += vec3(0.68, 0.62, 0.30) * sky * 0.62 * lift;

// ── hills, far off: each paler than the one in front of it ──
col = mix(col, vec3(0.21, 0.37, 0.27), fill(far.y - wobble(far, -0.14, 0.07, 1.8)));
col = mix(col, vec3(0.105, 0.235, 0.155), fill(mid.y - wobble(mid, -0.26, 0.06, 2.9)));

// ── the far wood: trunks receding into the haze, mist at their foot ──
{
  float x = mid.x * 7.5;
  float cell = floor(x);
  float fx = fract(x) - 0.5;
  float hs = hash11(cell * 1.7 + 0.3);
  float half0 = 0.035 + hs * 0.06;
  float trunk = (1.0 - smoothstep(half0 - fwidth(x), half0, abs(fx))) * step(0.22, hs);
  float haze = smoothstep(-0.30, 0.70, mid.y);
  col = mix(col, mix(vec3(0.055, 0.135, 0.088), vec3(0.13, 0.245, 0.175), haze), trunk * 0.75 * smoothstep(-0.34, -0.20, mid.y));
}
col += vec3(0.30, 0.46, 0.36) * exp(-abs(mid.y + 0.22) * 11.0) * 0.16 * lift;

// ── the glade's floor, with a trodden path ──
float floorY = wobble(mid, -0.70, 0.03, 3.6);
float onFloor = fill(mid.y - floorY);
col = mix(col, vec3(0.042, 0.108, 0.062), onFloor);
col += vec3(0.05, 0.10, 0.04) * smoothstep(0.6, 0.9, vnoise(mid * 38.0)) * onFloor;
float trodden = exp(-abs(mid.x - 0.40 * smoothstep(-0.98, -0.70, mid.y)) * 9.0) * onFloor;
col = mix(col, vec3(0.14, 0.13, 0.08), trodden * 0.45);

// ── a fall on the right, dropping out of the far wood into a pool ──
{
  // In the right column, beyond the tree that flanks the arena, where nothing stands in front.
  float fx = mix(ext.x - 0.09, ext.x - 0.10, wide);
  float top = mix(0.62, 0.50, wide);
  float foot = -0.72;
  vec2 w = near - vec2(fx, 0.0);
  float pour = vnoise(vec2(w.x * 34.0, w.y * 5.0 + uTime * 2.4)) * 0.7 + vnoise(vec2(w.x * 70.0 + 3.0, w.y * 9.0 + uTime * 3.8)) * 0.3;
  float inFall = (1.0 - smoothstep(0.050, 0.075, abs(w.x))) * smoothstep(foot - 0.01, foot + 0.03, w.y) * (1.0 - smoothstep(top - 0.05, top + 0.01, w.y));
  vec3 falling = mix(vec3(0.35, 0.70, 0.78), vec3(0.92, 1.0, 1.0), smoothstep(0.35, 0.8, pour));
  col = mix(col, falling, inFall * (0.35 + 0.65 * smoothstep(0.30, 0.75, pour)) * 0.85);
  col += vec3(0.55, 0.85, 0.85) * glow(length(w - vec2(0.0, foot)), 0.10) * 0.28 * lift;
  float pool = sdEllipse(mid - vec2(fx - 0.02, foot - 0.02), vec2(0.17, 0.035));
  col = mix(col, vec3(0.10, 0.30, 0.30), fill(pool) * 0.8);
  col += vec3(0.40, 0.70, 0.70) * fill(abs(pool) - 0.004) * 0.5 * (0.6 + 0.4 * sin(uTime * 2.0));
}

// ── a hut in the wood, its one window lit ──
{
  float hs = mix(0.55, 1.0, wide);
  vec2 hu = (mid - vec2(mix(0.40, ext.x - 0.36, wide), mix(-0.975, -0.66, wide))) / hs;
  col = mix(col, vec3(0.055, 0.048, 0.034), fill(sdBox(hu - vec2(0.0, 0.040), vec2(0.070, 0.040))));
  col = mix(col, vec3(0.040, 0.095, 0.058), fill(sdTriangle(hu, vec2(-0.092, 0.078), vec2(0.092, 0.078), vec2(0.0, 0.152))));
  col += vec3(1.0, 0.80, 0.45) * fill(sdBox(hu - vec2(-0.022, 0.038), vec2(0.015, 0.014))) * lift;
  col += vec3(1.0, 0.70, 0.38) * glow(length(hu - vec2(-0.022, 0.038)), 0.085) * 0.32 * lift;
}

// ── light through the leaves: shafts that swing as the canopy moves ──
{
  vec2 s = mid - vec2(0.05, ext.y + 0.6);
  float ang = atan(s.x, -s.y);
  float swing = (uDetail > 0.5 ? vnoise(vec2(ang * 9.0, uTime * 0.10)) : 0.5 + 0.5 * sin(ang * 3.0 + uTime * 0.10)) * 3.0;
  float rays = pow(0.5 + 0.5 * sin(ang * 34.0 + swing), 6.0) * (0.5 + 0.5 * sin(ang * 13.0 - uTime * 0.12 + 1.0));
  col += vec3(0.55, 0.70, 0.30) * rays * smoothstep(-0.75, 0.6, mid.y) * 0.30 * lift;
}

// ── two ancients flanking the glade: bark in streaks, a lit edge facing in, moss that glints ──
for (int i = 0; i < 2; i++) {
  float side = i == 0 ? -1.0 : 1.0;
  float xt = side * mix(ext.x + 0.02, 1.0, wide);
  float rad = mix(0.085, 0.130, wide);
  vec2 base = vec2(xt, -ext.y - 0.06);
  vec2 head = vec2(xt + side * 0.10, ext.y + 0.06);
  vec2 t = near;
  float d = sdTapered(t, base, head, rad * 1.25, rad * 0.8);
  // Roots spreading towards the middle, and a bough reaching in over the field.
  for (int k = 0; k < 3; k++) {
    if (uDetail < 0.5 && k >= 1) break;
    float fk = float(k);
    d = min(d, sdTapered(t, base + vec2(0.0, 0.05 + fk * 0.05), base + vec2(-side * (0.14 + fk * 0.07), -0.03), rad * 0.5, 0.012));
  }
  d = min(d, sdTapered(t, vec2(xt + side * 0.06, ext.y - 0.35), vec2(xt - side * 0.34, ext.y - 0.62), rad * 0.5, 0.018));
  float xc = xt + side * 0.10 * (t.y - base.y) / max(head.y - base.y, 0.1);
  float facing = smoothstep(0.0, rad * 0.9, (xc - t.x) * side);
  float bark = vnoise(vec2(t.x * 46.0, t.y * 3.0));
  vec3 wood = vec3(0.095, 0.078, 0.050) * (0.78 + 0.44 * bark);
  wood += vec3(0.30, 0.46, 0.24) * facing * 0.6;
  float glint = step(0.986, hash21(floor(t * 95.0))) * smoothstep(0.3, 0.9, vnoise(t * 2.0 + uTime * 0.05));
  wood += vec3(0.45, 0.95, 0.45) * glint * 0.8 * lift;
  col = mix(col, wood, fill(d));
}

// ── vines hanging from the canopy, leaves in pairs along them ──
for (int i = 0; i < 6; i++) {
  if (uDetail < 0.5 && i >= 3) break;
  float fi = float(i);
  float side = mod(fi, 2.0) < 1.0 ? -1.0 : 1.0;
  float k = floor(fi * 0.5) / 2.0;
  float x0 = side * ext.x * mix(0.94, 0.58, k) + (hash11(fi + 5.0) - 0.5) * 0.06;
  float len = mix(0.95, 0.42, k) * (0.7 + 0.6 * hash11(fi * 2.3));
  vec2 v = mid - vec2(x0, ext.y + 0.02);
  float swing = sin(uTime * 0.8 + fi * 1.3 + v.y * 3.0) * 0.025 * clamp(-v.y / len, 0.0, 1.0);
  float d = max(abs(v.x - swing) - 0.0045, max(v.y, -len));
  col = mix(col, vec3(0.075, 0.190, 0.105), fill(d));
  float seg = floor(-v.y * 14.0);
  float flip = mod(seg, 2.0) < 1.0 ? -1.0 : 1.0;
  vec2 lp = vec2(swing + flip * 0.024, -(seg + 0.5) / 14.0);
  float leaf = sdEllipse(mat2(0.88, -0.48, 0.48, 0.88) * (v - lp), vec2(0.024, 0.010));
  col = mix(col, vec3(0.12, 0.34, 0.16), fill(leaf) * step(0.0, seg) * step(-v.y, len));
}

// ── the canopy overhead: dark leaf-mass in the upper corners ──
float leaves = uDetail > 0.5 ? fbm(near * 6.5 + 9.0) : vnoise(near * 6.5 + 9.0);
float canopy = 0.0;
for (int i = 0; i < 2; i++) {
  float side = i == 0 ? -1.0 : 1.0;
  vec2 q = near - (vec2(side * ext.x, ext.y) + vec2(side * -0.05, 0.12));
  canopy = max(canopy, soft(length(q * vec2(1.0, 0.75)) - (0.55 + 0.30 * leaves), 0.02));
}
vec3 leafTone = mix(vec3(0.030, 0.095, 0.048), vec3(0.18, 0.42, 0.16), smoothstep(0.35, 0.75, leaves));
col = mix(col, leafTone, canopy * 0.92);
`,
  },
  effects: {
    ambient: [
      {
        kind: 'firefly',
        count: [9, 16, 24],
        colors: [0xe2ffb4, 0xbdff8a],
        drift: [3, 10],
        wind: [-6, 6],
        sway: 18,
        size: [2.4, 4.4],
        spin: [0, 0],
      },
      {
        kind: 'leaf',
        count: [5, 9, 14],
        colors: [0x28c77a, 0x7dff9b, 0x49d98a, 0x9fe36a],
        drift: [18, 38],
        wind: [10, 34],
        sway: 20,
        size: [8, 13],
        spin: [1.0, 3.0],
      },
      {
        kind: 'mote',
        count: [10, 18, 28],
        colors: [0xe2ffb4, 0xfff6c8],
        drift: [2, 7],
        wind: [-5, 5],
        sway: 6,
        size: [1.2, 2.4],
        spin: [0, 0],
      },
    ],
    paddleTrail: {
      kind: PK_LEAF,
      count: 1,
      color: 0x7dff9b,
      speed: [10, 60],
      life: [0.8, 1.3],
      size: [6, 3],
      offset: [-10, 10, -10, 0],
      grav: 70,
      drag: 1.8,
      rotV: 4,
      alpha: 0.9,
    },
    paddleSpark: {
      burst: {
        kind: PK_FIRE,
        count: 1,
        color: 0xe2ffb4,
        speed: [10, 40],
        life: [0.9, 1.5],
        size: [3.4, 1.4],
        drag: 1.6,
        intensity: 1.8,
      },
      chance: 0.3,
    },
    ballTrail: {
      kind: PK_FIRE,
      count: 1,
      color: 0xbdff8a,
      speed: [8, 40],
      life: [0.5, 0.95],
      size: [4.2, 1.2],
      drag: 2.2,
      alpha: 0.95,
      intensity: 1.8,
      stride: 40,
    },
    paddleHit: [
      {
        kind: PK_LEAF,
        count: 8,
        color: 0x7dff9b,
        speed: [110, 300],
        life: [0.7, 1.2],
        size: [6.5, 2.5],
        spread: 1.2,
        offset: [-16, 16, -8, 0],
        grav: 160,
        drag: 2.4,
        rotV: 6,
      },
      {
        kind: PK_RING,
        count: 1,
        color: 0x7dff9b,
        speed: [0, 0],
        life: [0.36, 0.36],
        size: [14, 14],
        reach: 124,
        alpha: 0.8,
      },
      {
        kind: PK_FIRE,
        count: 5,
        color: 0xe2ffb4,
        speed: [60, 200],
        life: [0.5, 1.0],
        size: [3.4, 1],
        spread: Math.PI,
        drag: 2.0,
        intensity: 2,
      },
    ],
    bounce: [
      {
        kind: PK_RING,
        count: 1,
        color: 0x7dff9b,
        speed: [0, 0],
        life: [0.3, 0.3],
        size: [6, 6],
        reach: 60,
        alpha: 0.75,
      },
      {
        kind: PK_FIRE,
        count: 2,
        color: 0xe2ffb4,
        speed: [40, 140],
        life: [0.4, 0.8],
        size: [3, 1],
        spread: 1.4,
        drag: 2.0,
        intensity: 2,
      },
    ],
  },
};

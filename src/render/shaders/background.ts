/** Background: a low-resolution procedural nebula, composited at full resolution with stars and a perspective grid. With a theme worn, the theme's scene takes the nebula's place and only the arena's plate is laid over it (see `render/themes`). */

export const NEBULA_FRAG = `#version 300 es
precision highp float;

in vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uColA;
uniform vec3 uColB;
uniform vec3 uColC;
// 0..1, rises with combo and big moments: the sky breathes with the action.
uniform float uEnergy;

out vec4 outColor;

float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

const mat2 ROT = mat2(0.8, 0.6, -0.6, 0.8);

float fbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.55;
  for (int i = 0; i < 5; i++) {
    sum += amp * vnoise(p);
    p = ROT * p * 2.03 + 11.7;
    amp *= 0.5;
  }
  return sum;
}

void main() {
  vec2 p = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  float t = uTime * 0.025;

  // Domain-warped noise: two slow fields distort a third, which is what makes clouds look like clouds.
  vec2 warp = vec2(fbm(p * 1.5 + vec2(t, -t * 0.6)), fbm(p * 1.5 + vec2(5.2, 1.3) - t * 0.8));
  float n = fbm(p * 2.1 + warp * 1.3 + vec2(-t * 0.5, t * 0.3));
  float n2 = fbm(p * 4.2 + warp * 1.8 + vec2(t * 0.7, -t * 0.4));

  vec3 col = uColC * (0.55 + 0.35 * n);
  col += uColA * pow(smoothstep(0.3, 0.92, n), 2.2) * 0.55;
  col += uColB * pow(smoothstep(0.4, 0.96, n2), 2.6) * 0.42;

  // Faint rays from above, like light through smog.
  float ang = atan(p.y - 0.6, p.x);
  float rays = pow(0.5 + 0.5 * sin(ang * 18.0 + uTime * 0.15), 6.0);
  col += uColA * rays * smoothstep(1.7, 0.0, length(p - vec2(0.0, 0.6))) * 0.07;

  outColor = vec4(col * (1.0 + uEnergy * 0.4), 1.0);
}
`;

export const BACKDROP_FRAG = `#version 300 es
precision highp float;

in vec2 vUv;
uniform sampler2D uNebula;
uniform vec2 uRes;
uniform float uDpr;
uniform float uTime;
// Arena rect in CSS px: centre x, centre y (y down), half width, half height
uniform vec4 uArena;
uniform vec3 uAccent;
uniform float uEnergy;
// 0..1, how close the brick field is to the danger line
uniform float uDanger;
// 1 when a theme's scene stands in for the nebula: no stars, no grid, and a softer arena plate.
uniform float uThemed;

out vec4 outColor;

float sdRoundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  // Everything below works in CSS pixels with y down, so it stays crisp at any device pixel ratio.
  vec2 px = vec2(vUv.x, 1.0 - vUv.y) * uRes / uDpr;
  vec3 col = texture(uNebula, vUv).rgb;

  vec2 ap = px - uArena.xy;
  float ad = sdRoundBox(ap, uArena.zw + vec2(6.0), 22.0);
  // How much of the arena's darker plate a pixel takes: set by either branch below.
  float inside = 0.0;

  if (uThemed < 0.5) {
    // Two parallax layers of twinkling stars.
    for (int layer = 0; layer < 2; layer++) {
      float scale = layer == 0 ? 52.0 : 27.0;
      vec2 g = px / scale + vec2(uTime * (layer == 0 ? 0.010 : 0.026), float(layer) * 3.7);
      vec2 cell = floor(g);
      vec2 f = fract(g);
      float h = hash21(cell + float(layer) * 17.0);
      vec2 pos = vec2(hash21(cell + 3.1), hash21(cell + 7.7));
      float dist = length(f - pos) * scale;
      float twinkle = 0.55 + 0.45 * sin(uTime * (1.5 + h * 3.0) + h * 40.0);
      float star = (1.0 - smoothstep(0.0, 1.2 + h * 1.5, dist)) * step(0.84, h) * twinkle;
      col += mix(vec3(0.6, 0.85, 1.0), uAccent, h) * star * (layer == 0 ? 0.5 : 0.9);
    }

    // Perspective floor scrolling towards the viewer.
    float horizon = uRes.y / uDpr * 0.36;
    float z = (px.y - horizon) / max(horizon, 1.0);
    if (z > 0.0) {
      float depth = 1.0 / (z + 0.035);
      vec2 g = vec2((px.x - uArena.x) / horizon * depth, depth * 1.6 + uTime * 0.4);
      vec2 gf = abs(fract(g) - 0.5);
      float aa = max(fwidth(g.x), fwidth(g.y));
      float line = 1.0 - smoothstep(0.012, 0.012 + aa, min(gf.x, gf.y));
      float fade = smoothstep(0.0, 0.1, z) * (1.0 - smoothstep(0.7, 1.0, z) * 0.45);
      col += uAccent * line * 0.13 * fade * (0.7 + 0.6 * uEnergy);
    }

    // The arena is a darker plate so neon bricks read against it; a soft shadow separates it from the sky.
    inside = 1.0 - smoothstep(-1.5, 1.5, ad);
    col = mix(col, col * 0.34 + uAccent * 0.022, inside);
    col *= 1.0 - 0.4 * (1.0 - smoothstep(0.0, 54.0, abs(ad))) * (1.0 - inside);
  } else {
    // A theme's scene gets the same darker plate, feathered wide, so a bough or a gate that
    // straddles the arena's edge fades across it instead of being cut by it. It is darkest over
    // the brick field (the arena's upper half), where the bricks must win every comparison, and
    // lets a little more of the scene through below the danger line, where only the balls fly.
    inside = 1.0 - smoothstep(-18.0, 18.0, ad);
    float overBricks = smoothstep(-0.2, 0.5, -ap.y / uArena.w);
    col = mix(col, col * mix(0.40, 0.20, overBricks) + uAccent * 0.012, inside);
    col *= 1.0 - 0.35 * (1.0 - smoothstep(18.0, 78.0, abs(ad))) * (1.0 - inside);
  }

  // Danger wash along the bottom of the arena as the field closes in.
  float dz = smoothstep(uArena.w * 0.42, uArena.w, ap.y) * inside;
  col += vec3(0.6, 0.04, 0.1) * dz * uDanger * (0.55 + 0.45 * sin(uTime * 9.0));

  // Scanlines (one CSS-pixel rows) and a touch of dither against banding.
  col *= 1.0 - 0.05 * step(0.5, fract(px.y));
  col += (hash21(px) - 0.5) * 0.012;

  outColor = vec4(col, 1.0);
}
`;

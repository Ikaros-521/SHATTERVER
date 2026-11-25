/**
 * Instanced SDF primitives.
 *
 * Every world-space object in the game — bricks, the paddle, shards, ball glows, shock rings,
 * laser beams, particles — is one instance in one of four shapes, drawn in a single instanced
 * call per blend mode. Bricks carry their whole look (bevel, cracks, frost, embers, boss pulse)
 * in the fragment shader, so a hit or a status change costs nothing on the CPU.
 *
 * Instance layout (20 floats):
 *   aPos      x, y, quad half-width, quad half-height
 *   aRotColor rotation, r, g, b
 *   aShape    alpha, shape, shape half-width, shape half-height
 *   aParm     p0, p1, flags, flash
 *   aExtra    halo, -, -, -
 */

export const SHAPE_BOX = 0;
export const SHAPE_GLOW = 1;
export const SHAPE_RING = 2;
export const SHAPE_STROKE = 3;

/** Bit flags for `SHAPE_BOX`. */
export const FLAG_FROST = 1;
export const FLAG_BURN = 2;
export const FLAG_CLOAK = 4;
export const FLAG_BOSS = 8;
export const FLAG_CORE = 16;
export const FLAG_METAL = 32;
export const FLAG_ELITE = 64;

export const INSTANCE_VERT = `#version 300 es
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
  vParm2 = vec4(aParm.y, aParm.z, aParm.w, 0.0);
  vHalo = aExtra.x;
}
`;

export const INSTANCE_FRAG = `#version 300 es
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

void main() {
  int shape = int(vParm.x + 0.5);
  vec2 half_ = vParm.yz;
  float p0 = vParm.w;
  float p1 = vParm2.x;
  float flags = vParm2.y;
  float flash = vParm2.z;
  vec3 rgb = vColor.rgb;
  float alpha = vColor.a;

  if (shape == 0) {
    float radius = clamp(p0, 0.0, min(half_.x, half_.y));
    float d = sdRoundBox(vLocal, half_, radius);
    float aa = max(fwidth(d), uPixel);
    float mask = (1.0 - smoothstep(-aa, aa, d)) * alpha;

    float fl = floor(flags + 0.5);
    bool frozen = mod(fl, 2.0) >= 1.0;
    bool burning = mod(floor(fl / 2.0), 2.0) >= 1.0;
    bool cloaked = mod(floor(fl / 4.0), 2.0) >= 1.0;
    bool boss = mod(floor(fl / 8.0), 2.0) >= 1.0;
    bool isCore = mod(floor(fl / 16.0), 2.0) >= 1.0;
    bool metal = mod(floor(fl / 32.0), 2.0) >= 1.0;
    bool elite = mod(floor(fl / 64.0), 2.0) >= 1.0;

    if (cloaked) {
      // A cloaked brick is a breath of an outline until something hits it.
      float outline = 1.0 - smoothstep(0.0, 1.6, abs(d + 1.2));
      float a = outline * 0.42;
      outColor = vec4(rgb * a * 0.8, a);
      return;
    }

    vec2 q = vLocal / half_;
    float hp = clamp(p1, 0.0, 1.0);
    float edge = -d;

    // Body: dark, saturated glass that holds light in proportion to remaining HP, lit from the top.
    float core = pow(max(1.0 - length(q * vec2(0.72, 1.35)), 0.0), 2.2);
    vec3 col = rgb * (0.09 + 0.27 * hp);
    col += rgb * (0.5 - 0.5 * q.y) * 0.08;
    col += rgb * core * (0.14 + 0.22 * hp);

    // Neon rim: pushed past 1.0 in HDR so the bloom pass picks it up.
    float border = 1.0 - smoothstep(1.3, 2.7, edge);
    vec3 rim = rgb * 1.75 + vec3(0.08);
    if (boss) rim = mix(rim, rgb * 2.1 + vec3(0.3), 0.5 + 0.5 * sin(uTime * 5.0 + vCenter.x * 0.045));
    if (elite) rim = mix(rim, vec3(1.0, 0.8, 0.32) * 1.7, 0.5 + 0.5 * sin(uTime * 7.0 + vCenter.y * 0.06));
    col = mix(col, rim, border);

    // Damage reads as cracks spreading in from the rim.
    if (hp < 0.999) {
      float n = vnoise((vLocal + vCenter) * 0.17);
      float lines = 1.0 - smoothstep(0.0, 0.05, abs(n - 0.5));
      col = mix(col, rgb * 0.22, lines * (1.0 - hp) * smoothstep(3.0, 9.0, edge) * 0.75);
    }

    // A slow diagonal highlight sweeps across metal bricks.
    if (metal) {
      float sweep = 1.0 - abs(q.x + q.y * 0.6 - sin(uTime * 1.3 + vCenter.y * 0.012) * 2.4);
      col += vec3(1.0, 0.95, 0.8) * pow(max(sweep, 0.0), 9.0) * 0.9;
    }

    if (frozen) {
      col = mix(col, vec3(0.78, 0.94, 1.0) * (0.5 + 0.5 * core), 0.62);
      float sparkle = pow(vnoise((vLocal + vCenter) * 0.42 + uTime * 0.35), 7.0);
      col += vec3(0.7, 0.92, 1.0) * sparkle * 2.6;
    }
    if (burning) {
      float ember = vnoise(vLocal * 0.2 + vCenter * 0.13 + vec2(0.0, uTime * 3.2));
      col += vec3(1.0, 0.42, 0.08) * smoothstep(0.45, 0.95, ember) * (1.5 + 0.6 * sin(uTime * 21.0 + vCenter.x));
    }
    if (isCore) col += rgb * core * (0.7 + 0.5 * sin(uTime * 6.0));

    // Hit flash.
    col = mix(col, vec3(1.0), clamp(flash, 0.0, 1.0));

    // Soft outer halo, fades within the quad's padding.
    float halo = exp(-max(d, 0.0) * 0.45) * (1.0 - smoothstep(0.0, 13.0, d));
    float haloStrength = 0.2 + 0.2 * hp + 0.4 * flash + vHalo;
    outColor = vec4(col * mask + rgb * halo * haloStrength * alpha, mask);
  } else if (shape == 1) {
    // Soft radial falloff; p0 adds a hot core line along the local x axis (beams).
    float len = length(vLocal / vQuad);
    float f = pow(max(1.0 - len, 0.0), 2.0 + clamp(p1, 0.0, 1.0) * 9.0);
    if (p0 > 0.0) {
      float line = exp(-pow(vLocal.y / max(vQuad.y * 0.2, 0.001), 2.0));
      line *= 1.0 - smoothstep(0.7, 1.0, abs(vLocal.x / vQuad.x));
      f += p0 * line;
    }
    outColor = vec4(rgb * (alpha * f), 0.0);
  } else if (shape == 2) {
    float dd = length(vLocal) - half_.x;
    float f = exp(-pow(dd / max(p0, 0.6), 2.0));
    outColor = vec4(rgb * (alpha * f), 0.0);
  } else {
    float radius = clamp(p0, 0.0, min(half_.x, half_.y));
    float d = abs(sdRoundBox(vLocal, half_, radius));
    float width = max(p1, 0.6);
    float f = 1.0 - smoothstep(width * 0.35, width, d);
    float glow = exp(-d * 0.3) * 0.2;
    outColor = vec4(rgb * alpha * (f * 1.7 + glow), alpha * f);
  }
}
`;

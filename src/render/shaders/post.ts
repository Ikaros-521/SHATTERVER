/**
 * Post-processing.
 *
 * bright → blur (half resolution) → blur (quarter resolution) → composite. The composite pass
 * does everything that needs the finished image: bloom, chromatic aberration, shockwave
 * refraction, gravity-lens distortion, zoom blur, glitch, grading, tone mapping, vignette, grain.
 */

export const BRIGHT_FRAG = `#version 300 es
precision highp float;

in vec2 vUv;
uniform sampler2D uTex;
uniform float uThreshold;
uniform float uKnee;

out vec4 outColor;

void main() {
  vec3 c = texture(uTex, vUv).rgb;
  float br = max(c.r, max(c.g, c.b));
  float soft = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee);
  soft = soft * soft / (4.0 * uKnee + 0.0001);
  float contribution = max(soft, br - uThreshold) / max(br, 0.0001);
  outColor = vec4(c * contribution, 1.0);
}
`;

/** Separable 9-tap Gaussian; `uDir` is one texel step along the axis being blurred, scaled by the radius. */
export const BLUR_FRAG = `#version 300 es
precision highp float;

in vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uDir;

out vec4 outColor;

void main() {
  vec3 sum = texture(uTex, vUv).rgb * 0.227027;
  sum += (texture(uTex, vUv + uDir).rgb + texture(uTex, vUv - uDir).rgb) * 0.1945946;
  sum += (texture(uTex, vUv + uDir * 2.0).rgb + texture(uTex, vUv - uDir * 2.0).rgb) * 0.1216216;
  sum += (texture(uTex, vUv + uDir * 3.0).rgb + texture(uTex, vUv - uDir * 3.0).rgb) * 0.054054;
  sum += (texture(uTex, vUv + uDir * 4.0).rgb + texture(uTex, vUv - uDir * 4.0).rgb) * 0.016216;
  outColor = vec4(sum, 1.0);
}
`;

export const COPY_FRAG = `#version 300 es
precision highp float;

in vec2 vUv;
uniform sampler2D uTex;

out vec4 outColor;

void main() {
  outColor = vec4(texture(uTex, vUv).rgb, 1.0);
}
`;

export const COMPOSITE_FRAG = `#version 300 es
precision highp float;

in vec2 vUv;
uniform sampler2D uScene;
uniform sampler2D uBloomNear;
uniform sampler2D uBloomFar;
uniform vec2 uRes;
uniform float uDpr;
uniform float uTime;

uniform float uBloom;
uniform float uExposure;
uniform float uAberration;
uniform float uZoomBlur;
uniform float uGlitch;
uniform float uDesaturate;
uniform vec3 uTint;
uniform float uTintAmount;
uniform vec4 uFlash;
uniform vec3 uEdge;
uniform float uEdgeAmount;
uniform float uVignette;
uniform float uGrain;
uniform float uScanline;

// Up to 8 concurrent shockwaves: x, y (CSS px, y down), radius (CSS px), strength.
uniform vec4 uShock[8];
uniform int uShockCount;
// One gravity lens: x, y (CSS px), radius (CSS px), strength.
uniform vec4 uLens;

out vec4 outColor;

float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

void main() {
  // Work in CSS pixels with y down for every screen-space effect.
  vec2 css = vec2(vUv.x, 1.0 - vUv.y) * uRes / uDpr;

  // Shockwaves: a travelling ring that refracts the image outwards.
  vec2 disp = vec2(0.0);
  for (int i = 0; i < 8; i++) {
    if (i >= uShockCount) break;
    vec4 s = uShock[i];
    vec2 d = css - s.xy;
    float dist = length(d);
    float band = exp(-pow((dist - s.z) / (s.z * 0.22 + 10.0), 2.0));
    disp += (d / max(dist, 1.0)) * band * s.w * 34.0;
  }
  vec2 p = css + disp;

  // Gravity lens: light spirals into the centre and is swallowed.
  {
    vec2 d = p - uLens.xy;
    float dist = length(d);
    float pull = uLens.w * smoothstep(uLens.z * 2.8, uLens.z * 0.15, dist);
    float ang = pull * 1.8;
    float c = cos(ang);
    float s = sin(ang);
    d = mat2(c, -s, s, c) * d;
    p = uLens.xy + mix(d, d * 0.08, pull);
  }

  // Back to texture coordinates (origin bottom-left) for sampling the render targets.
  vec2 suv = clamp(vec2(p.x, uRes.y / uDpr - p.y) * uDpr / uRes, vec2(0.001), vec2(0.999));

  // Glitch: whole scanline rows tear sideways.
  if (uGlitch > 0.001) {
    float band = floor(suv.y * 36.0 + uTime * 24.0);
    float tear = step(1.0 - uGlitch * 0.45, hash11(band));
    suv.x = clamp(suv.x + tear * (hash11(band + 7.0) - 0.5) * 0.12 * uGlitch, 0.0, 1.0);
  }

  // Chromatic aberration grows towards the edges; zoom blur smears radially on big hits.
  vec2 fromCentre = suv - 0.5;
  fromCentre.x *= uRes.x / uRes.y;
  vec2 ca = fromCentre * uAberration * uDpr / uRes;
  vec3 col;
  if (uZoomBlur > 0.002) {
    col = vec3(0.0);
    for (int i = 0; i < 6; i++) {
      float t = float(i) / 5.0;
      vec2 z = mix(suv, vec2(0.5), t * uZoomBlur * 0.1);
      float w = 1.0 - t * 0.6;
      col += vec3(texture(uScene, z + ca).r, texture(uScene, z).g, texture(uScene, z - ca).b) * w;
    }
    col /= 3.4;
  } else {
    col = vec3(texture(uScene, suv + ca).r, texture(uScene, suv).g, texture(uScene, suv - ca).b);
  }

  // Tone-map the scene first, then add bloom on top. Adding it before the tone map would push
  // every bright edge towards white; after it, the glow keeps its colour and reads as neon.
  col = aces(col * uExposure);
  // Soft-compressed so that a hundred overlapping glows approach white without blowing out to a flat disc.
  vec3 bloom = (texture(uBloomNear, suv).rgb * 0.62 + texture(uBloomFar, suv).rgb * 0.85) * uBloom;
  col += bloom / (1.0 + bloom * 0.8);

  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(col, vec3(lum) * vec3(0.72, 0.9, 1.28), uDesaturate);
  col *= mix(vec3(1.0), uTint, uTintAmount);

  vec2 e = abs(vUv - 0.5) * 2.0;
  float edge = pow(max(e.x * 0.94, e.y), 6.0);
  col += uEdge * edge * uEdgeAmount;

  col = mix(col, uFlash.rgb, clamp(uFlash.w, 0.0, 1.0));

  float vig = 1.0 - uVignette * pow(length((vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0) * 1.15), 2.4);
  col *= vig;
  col *= 1.0 - uScanline * 0.5 * (1.0 - abs(fract(css.y) * 2.0 - 1.0));
  col += (hash11(dot(css, vec2(1.0, 157.0)) + fract(uTime) * 91.0) - 0.5) * uGrain;

  outColor = vec4(max(col, 0.0), 1.0);
}
`;

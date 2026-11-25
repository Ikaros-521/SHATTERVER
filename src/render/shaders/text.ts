/** Damage numbers: glyph quads sampled from a single-row strip atlas. */

export const TEXT_VERT = `#version 300 es
precision highp float;

layout(location = 0) in vec2 aCorner;
// x, y, width, height (world units)
layout(location = 1) in vec4 aPos;
// rotation, r, g, b
layout(location = 2) in vec4 aRotColor;
// u0, u1, alpha, -
layout(location = 3) in vec4 aUvAlpha;

uniform vec4 uView;
uniform vec2 uResolution;

out vec2 vUv;
flat out vec4 vColor;

void main() {
  vec2 local = aCorner * aPos.zw * 0.5;
  float c = cos(aRotColor.x);
  float s = sin(aRotColor.x);
  vec2 world = aPos.xy + vec2(c * local.x - s * local.y, s * local.x + c * local.y);
  vec2 px = world * uView.x + uView.yz;
  gl_Position = vec4(px.x / uResolution.x * 2.0 - 1.0, 1.0 - px.y / uResolution.y * 2.0, 0.0, 1.0);
  vUv = vec2(mix(aUvAlpha.x, aUvAlpha.y, aCorner.x * 0.5 + 0.5), aCorner.y * 0.5 + 0.5);
  vColor = vec4(aRotColor.yzw, aUvAlpha.z);
}
`;

export const TEXT_FRAG = `#version 300 es
precision highp float;

uniform sampler2D uAtlas;
in vec2 vUv;
flat in vec4 vColor;
out vec4 outColor;

void main() {
  // The atlas holds white glyphs with a baked dark outline, uploaded un-premultiplied.
  vec4 glyph = texture(uAtlas, vUv);
  float a = glyph.a * vColor.a;
  outColor = vec4(glyph.rgb * vColor.rgb * a, a);
}
`;

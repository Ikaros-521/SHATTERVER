/**
 * Boss pictures: the pieces a character boss is drawn from, each one a quad textured from a single
 * atlas (`boss/pictures.ts` bakes it).
 *
 * A boss is line art over cel fills, which is drawn once with Canvas 2D and then moved about as
 * rigid pieces — a blade, a pauldron, a face — so nothing here has to know what she looks like. A
 * piece is one instance, written through `Pen.bossPicture` into the boss batch, in the instance
 * layout every other family uses; the game's own shapes never run this code, and this code never
 * runs on a frame without a character boss on screen. The renderer compiles the program the first
 * time a frame has a piece to draw, and keeps a failure here to the pieces (see `renderer.ts`): the
 * fight goes on with her hitboxes drawn as plain surfaces; the game never loses its frame.
 *
 * Instance layout: the same 20 floats as `shaders/instances`. A picture reads:
 *   aPos      x, y, quad half-width, quad half-height
 *   aRotColor rotation, and the tint: r, g, b
 *   aUv       alpha, u0, v0, u1
 *   aParm     v1, flags, flash, ghost
 *
 * The atlas is uploaded premultiplied, so that its edges filter cleanly and the picture can go
 * straight into the frame, which is blended premultiplied like everything else in the scene.
 */

/** Piece flag: the picture is flipped left to right in its own frame, before it is turned. */
export const FLAG_PART_MIRROR = 1;

export const PART_VERT = `#version 300 es
precision highp float;

layout(location = 0) in vec2 aCorner;
// x, y, quad half-width, quad half-height
layout(location = 1) in vec4 aPos;
// rotation, and the tint: r, g, b
layout(location = 2) in vec4 aRotColor;
// alpha, u0, v0, u1
layout(location = 3) in vec4 aUv;
// v1, flags, flash, and 1 while the piece is the shape a torn-off part leaves behind
layout(location = 4) in vec4 aParm;

uniform vec4 uView;
uniform vec2 uResolution;

out vec2 vUv;
flat out vec4 vColor;
flat out float vFlash;
flat out float vGhost;

void main() {
  vec2 local = aCorner * aPos.zw;
  float c = cos(aRotColor.x);
  float s = sin(aRotColor.x);
  vec2 world = aPos.xy + vec2(c * local.x - s * local.y, s * local.x + c * local.y);
  vec2 px = world * uView.x + uView.yz;
  gl_Position = vec4(px.x / uResolution.x * 2.0 - 1.0, 1.0 - px.y / uResolution.y * 2.0, 0.0, 1.0);
  vec2 t = aCorner * 0.5 + 0.5;
  if (aParm.y > 0.5) t.x = 1.0 - t.x;
  vUv = vec2(mix(aUv.y, aUv.w, t.x), mix(aUv.z, aParm.x, t.y));
  vColor = vec4(aRotColor.yzw, aUv.x);
  vFlash = aParm.z;
  vGhost = aParm.w;
}
`;

export const PART_FRAG = `#version 300 es
precision highp float;

uniform sampler2D uAtlas;
in vec2 vUv;
flat in vec4 vColor;
flat in float vFlash;
// 1 while the piece is the shape a torn-off part leaves behind
flat in float vGhost;
out vec4 outColor;

void main() {
  vec4 tex = texture(uAtlas, vUv);
  float a = tex.a * vColor.a;
  vec3 rgb = tex.rgb * vColor.rgb;
  // A part torn off her stays as a shape of starlight: gold where it was dark, brighter where it
  // was bright, and thin.
  float lit = dot(tex.rgb, vec3(0.3, 0.59, 0.11));
  rgb = mix(rgb, vec3(1.0, 0.8, 0.42) * (lit * 0.75 + 0.2 * a), vGhost);
  a = mix(a, a * 0.4, vGhost);
  // A hit washes the piece white; an eighth of its own colour stays, so that its lines do not vanish.
  rgb = mix(rgb, vec3(a), vFlash * 0.88);
  outColor = vec4(rgb, a);
}
`;

/**
 * Uploads the 2D-UI canvas into the WebGL frame as a full-screen textured quad.
 *
 * This is the WeChat packaging's central trick: the UI keeps its 2D canvas layout world (system
 * fonts, CJK line breaking), while the screen canvas stays WebGL for the game renderer — the
 * mini-game runtime has only one on-screen canvas. The upload runs only when the UI actually
 * redrew ({@link upload} is called from the shell exactly when `CanvasUi.frame()` returned true),
 * so a quiet menu costs nothing; the quad itself is drawn every frame beneath whatever the game
 * later adds.
 *
 * Reuses the game renderer's `GL` wrapper and its vertex-id fullscreen triangle, so there is no
 * vertex buffer and no second shader toolkit.
 */

import { FULLSCREEN_VERT, type GL } from '../render/gl';

const UI_FS = `#version 300 es
precision mediump float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uTex;
void main() {
  outColor = texture(uTex, vUv);
}
`;

export class UITextureLayer {
  private readonly program: WebGLProgram;
  private readonly tex: WebGLTexture;

  constructor(
    private readonly wrap: GL,
    private readonly uiCanvas: HTMLCanvasElement,
  ) {
    this.program = wrap.program('ui-texture', FULLSCREEN_VERT, UI_FS);
    const gl = wrap.gl;
    const tex = gl.createTexture();
    if (!tex) throw new Error('Could not allocate the UI texture');
    this.tex = tex;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  /** Re-uploads the 2D canvas' current pixels. Reallocation per call: the UI redraws are rare. */
  upload(): void {
    const gl = this.wrap.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    // FLIP_Y matches the fullscreen triangle's UV orientation (v=0 at the bottom).
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.uiCanvas);
  }

  /** Draws the quad into the currently bound framebuffer (the screen, in the shell). */
  draw(): void {
    const wrap = this.wrap;
    const gl = wrap.gl;
    // The HUD canvas is mostly transparent; without blending its empty pixels would punch
    // holes straight through the world rendered beneath.
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    wrap.gl.useProgram(this.program);
    wrap.texture(this.program, 'uTex', this.tex);
    wrap.fullscreen();
  }
}

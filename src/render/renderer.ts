import { GL, FULLSCREEN_VERT, type Target } from './gl';
import { InstanceBatch, Pen, TextBatch } from './batch';
import { BLUR_FRAG, BRIGHT_FRAG, COMPOSITE_FRAG, COPY_FRAG } from './shaders/post';
import { BACKDROP_FRAG, NEBULA_FRAG } from './shaders/background';
import { INSTANCE_FRAG, INSTANCE_VERT } from './shaders/instances';
import { TEXT_FRAG, TEXT_VERT } from './shaders/text';
import type { View } from './camera';
import { hexToRgb } from '../core/math';
import type { Layout } from './layout';
import type { PostState } from './post';
import type { SceneInfo } from './scene';
import { createGlyphAtlas } from './textAtlas';

export interface Palette {
  a: number;
  b: number;
  c: number;
  accent: number;
}

export interface FrameInput {
  layout: Layout;
  time: number;
  palette: Palette;
  /** world → CSS px, including camera shake and zoom. */
  view: View;
  post: PostState;
  info: SceneInfo;
}

/** Draw statistics for the debug overlay. */
export interface RenderStats {
  surfaces: number;
  lights: number;
  glyphs: number;
}

const INSTANCE_STRIDE = 20;
const TEXT_STRIDE = 12;
const CORNERS = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);

/**
 * The rendering pipeline.
 *
 *   nebula (1/4 res) ─┐
 *                     ├─→ scene (HDR) ─→ bright ─→ blur ×2 (1/2) ─┬─→ composite ─→ screen
 *   backdrop (full) ──┘                        └─→ blur ×2 (1/4) ─┘
 *
 * Ten draw calls in total. The scene itself is three instanced calls — surfaces, additive light,
 * glyphs — so whether there are four bricks or four hundred, the CPU cost is filling the buffers.
 */
export class Renderer {
  readonly gl: GL;
  readonly pen: Pen;
  readonly stats: RenderStats = { surfaces: 0, lights: 0, glyphs: 0 };

  private readonly canvas: HTMLCanvasElement;
  private readonly progInstance: WebGLProgram;
  private readonly progText: WebGLProgram;
  private readonly progNebula: WebGLProgram;
  private readonly progBackdrop: WebGLProgram;
  private readonly progBright: WebGLProgram;
  private readonly progBlur: WebGLProgram;
  private readonly progCopy: WebGLProgram;
  private readonly progComposite: WebGLProgram;
  private readonly instanceVaos: [WebGLVertexArrayObject, WebGLVertexArrayObject];
  private readonly textVao: WebGLVertexArrayObject;
  private readonly glyphTexture: WebGLTexture;

  private scene: Target | null = null;
  private nebula: Target | null = null;
  private halfA: Target | null = null;
  private halfB: Target | null = null;
  private quarterA: Target | null = null;
  private quarterB: Target | null = null;
  private width = 0;
  private height = 0;

  constructor(canvas: HTMLCanvasElement, capacity: { surfaces: number; lights: number; glyphs: number }) {
    this.canvas = canvas;
    const gl = new GL(canvas);
    this.gl = gl;
    const g = gl.gl;

    this.progInstance = gl.program('instance', INSTANCE_VERT, INSTANCE_FRAG);
    this.progText = gl.program('text', TEXT_VERT, TEXT_FRAG);
    this.progNebula = gl.program('nebula', FULLSCREEN_VERT, NEBULA_FRAG);
    this.progBackdrop = gl.program('backdrop', FULLSCREEN_VERT, BACKDROP_FRAG);
    this.progBright = gl.program('bright', FULLSCREEN_VERT, BRIGHT_FRAG);
    this.progBlur = gl.program('blur', FULLSCREEN_VERT, BLUR_FRAG);
    this.progCopy = gl.program('copy', FULLSCREEN_VERT, COPY_FRAG);
    this.progComposite = gl.program('composite', FULLSCREEN_VERT, COMPOSITE_FRAG);

    const glyphs = createGlyphAtlas(gl);
    this.glyphTexture = glyphs.texture;
    const surfaces = new InstanceBatch(capacity.surfaces);
    const lights = new InstanceBatch(capacity.lights);
    const text = new TextBatch(capacity.glyphs);
    this.pen = new Pen(surfaces, lights, text, glyphs);

    // One static corner buffer shared by every instanced VAO.
    const corners = g.createBuffer();
    if (!corners) throw new Error('Could not allocate the corner buffer');
    g.bindBuffer(g.ARRAY_BUFFER, corners);
    g.bufferData(g.ARRAY_BUFFER, CORNERS, g.STATIC_DRAW);

    this.instanceVaos = [this.makeInstanceVao(surfaces, corners), this.makeInstanceVao(lights, corners)];
    this.textVao = this.makeTextVao(text, corners);

    g.disable(g.DEPTH_TEST);
    g.disable(g.CULL_FACE);
  }

  private makeInstanceVao(batch: InstanceBatch, corners: WebGLBuffer): WebGLVertexArrayObject {
    const g = this.gl.gl;
    const vao = g.createVertexArray();
    const buffer = g.createBuffer();
    if (!vao || !buffer) throw new Error('Could not allocate an instance buffer');
    g.bindVertexArray(vao);

    g.bindBuffer(g.ARRAY_BUFFER, corners);
    g.enableVertexAttribArray(0);
    g.vertexAttribPointer(0, 2, g.FLOAT, false, 0, 0);

    g.bindBuffer(g.ARRAY_BUFFER, buffer);
    g.bufferData(g.ARRAY_BUFFER, batch.data.byteLength, g.DYNAMIC_DRAW);
    for (let location = 1; location <= 5; location++) {
      g.enableVertexAttribArray(location);
      g.vertexAttribPointer(location, 4, g.FLOAT, false, INSTANCE_STRIDE * 4, (location - 1) * 16);
      g.vertexAttribDivisor(location, 1);
    }
    batch.buffer = buffer;
    g.bindVertexArray(null);
    return vao;
  }

  private makeTextVao(batch: TextBatch, corners: WebGLBuffer): WebGLVertexArrayObject {
    const g = this.gl.gl;
    const vao = g.createVertexArray();
    const buffer = g.createBuffer();
    if (!vao || !buffer) throw new Error('Could not allocate the text buffer');
    g.bindVertexArray(vao);
    g.bindBuffer(g.ARRAY_BUFFER, corners);
    g.enableVertexAttribArray(0);
    g.vertexAttribPointer(0, 2, g.FLOAT, false, 0, 0);
    g.bindBuffer(g.ARRAY_BUFFER, buffer);
    g.bufferData(g.ARRAY_BUFFER, batch.data.byteLength, g.DYNAMIC_DRAW);
    for (let location = 1; location <= 3; location++) {
      g.enableVertexAttribArray(location);
      g.vertexAttribPointer(location, 4, g.FLOAT, false, TEXT_STRIDE * 4, (location - 1) * 16);
      g.vertexAttribDivisor(location, 1);
    }
    batch.buffer = buffer;
    g.bindVertexArray(null);
    return vao;
  }

  /** (Re)allocates the canvas and render targets when the window size or quality changes. */
  private ensureSize(layout: Layout): void {
    const width = Math.max(1, Math.round(layout.cssW * layout.dpr));
    const height = Math.max(1, Math.round(layout.cssH * layout.dpr));
    if (width === this.width && height === this.height && this.scene) return;
    this.canvas.width = width;
    this.canvas.height = height;
    this.width = width;
    this.height = height;

    const gl = this.gl;
    const hdr = gl.hdr;
    if (!this.scene) {
      this.scene = gl.target(width, height, hdr);
      this.nebula = gl.target(width / 4, height / 4, hdr);
      this.halfA = gl.target(width / 2, height / 2, hdr);
      this.halfB = gl.target(width / 2, height / 2, hdr);
      this.quarterA = gl.target(width / 4, height / 4, hdr);
      this.quarterB = gl.target(width / 4, height / 4, hdr);
      return;
    }
    gl.resize(this.scene, width, height);
    gl.resize(this.nebula as Target, width / 4, height / 4);
    gl.resize(this.halfA as Target, width / 2, height / 2);
    gl.resize(this.halfB as Target, width / 2, height / 2);
    gl.resize(this.quarterA as Target, width / 4, height / 4);
    gl.resize(this.quarterB as Target, width / 4, height / 4);
  }

  /** Draws the current contents of `this.pen` plus everything in `input`. Call after filling the pen. */
  render(input: FrameInput): void {
    this.ensureSize(input.layout);
    const gl = this.gl;
    const g = gl.gl;
    const W = this.width;
    const H = this.height;
    const scene = this.scene as Target;
    const nebula = this.nebula as Target;
    const halfA = this.halfA as Target;
    const halfB = this.halfB as Target;
    const quarterA = this.quarterA as Target;
    const quarterB = this.quarterB as Target;
    const { layout, time, palette, post } = input;
    const [ar, ag, ab] = hexToRgb(palette.accent);

    // ── 1. sky ──
    g.disable(g.BLEND);
    gl.bind(nebula);
    g.useProgram(this.progNebula);
    gl.set2(this.progNebula, 'uRes', W, H);
    gl.set1(this.progNebula, 'uTime', time);
    const [a1, a2, a3] = hexToRgb(palette.a);
    const [b1, b2, b3] = hexToRgb(palette.b);
    const [c1, c2, c3] = hexToRgb(palette.c);
    gl.set3(this.progNebula, 'uColA', a1, a2, a3);
    gl.set3(this.progNebula, 'uColB', b1, b2, b3);
    gl.set3(this.progNebula, 'uColC', c1, c2, c3);
    gl.set1(this.progNebula, 'uEnergy', input.info.energy);
    gl.fullscreen();

    // ── 2. scene ──
    gl.bind(scene);
    g.useProgram(this.progBackdrop);
    gl.texture(this.progBackdrop, 'uNebula', nebula.tex);
    gl.set2(this.progBackdrop, 'uRes', W, H);
    gl.set1(this.progBackdrop, 'uDpr', layout.dpr);
    gl.set1(this.progBackdrop, 'uTime', time);
    gl.set4(
      this.progBackdrop,
      'uArena',
      layout.ax + layout.aw / 2,
      layout.ay + layout.ah / 2,
      layout.aw / 2,
      layout.ah / 2,
    );
    gl.set3(this.progBackdrop, 'uAccent', ar, ag, ab);
    gl.set1(this.progBackdrop, 'uEnergy', input.info.energy);
    gl.set1(this.progBackdrop, 'uDanger', input.info.danger);
    gl.fullscreen();

    g.enable(g.BLEND);
    const dpr = layout.dpr;
    const view = input.view;
    g.useProgram(this.progInstance);
    gl.set4(this.progInstance, 'uView', view.scale * dpr, view.tx * dpr, view.ty * dpr, 0);
    gl.set2(this.progInstance, 'uResolution', W, H);
    gl.set1(this.progInstance, 'uTime', time);
    gl.set1(this.progInstance, 'uPixel', 1 / (view.scale * dpr));

    g.blendFunc(g.ONE, g.ONE_MINUS_SRC_ALPHA);
    this.drawInstances(0);
    g.blendFunc(g.ONE, g.ONE);
    this.drawInstances(1);

    g.blendFunc(g.ONE, g.ONE_MINUS_SRC_ALPHA);
    g.useProgram(this.progText);
    gl.set4(this.progText, 'uView', view.scale * dpr, view.tx * dpr, view.ty * dpr, 0);
    gl.set2(this.progText, 'uResolution', W, H);
    gl.texture(this.progText, 'uAtlas', this.glyphTexture);
    this.drawText();

    // ── 3. bloom ──
    g.disable(g.BLEND);

    gl.bind(halfA);
    g.useProgram(this.progBright);
    gl.texture(this.progBright, 'uTex', scene.tex);
    gl.set1(this.progBright, 'uThreshold', gl.hdr ? 0.9 : 0.5);
    gl.set1(this.progBright, 'uKnee', gl.hdr ? 0.5 : 0.25);
    gl.fullscreen();

    g.useProgram(this.progBlur);
    gl.bind(halfB);
    gl.texture(this.progBlur, 'uTex', halfA.tex);
    gl.set2(this.progBlur, 'uDir', 1.5 / halfA.w, 0);
    gl.fullscreen();
    gl.bind(halfA);
    gl.texture(this.progBlur, 'uTex', halfB.tex);
    gl.set2(this.progBlur, 'uDir', 0, 1.5 / halfA.h);
    gl.fullscreen();

    gl.bind(quarterA);
    g.useProgram(this.progCopy);
    gl.texture(this.progCopy, 'uTex', halfA.tex);
    gl.fullscreen();

    g.useProgram(this.progBlur);
    gl.bind(quarterB);
    gl.texture(this.progBlur, 'uTex', quarterA.tex);
    gl.set2(this.progBlur, 'uDir', 2.4 / quarterA.w, 0);
    gl.fullscreen();
    gl.bind(quarterA);
    gl.texture(this.progBlur, 'uTex', quarterB.tex);
    gl.set2(this.progBlur, 'uDir', 0, 2.4 / quarterA.h);
    gl.fullscreen();

    // ── 4. composite ──
    gl.bind(null);
    const p = this.progComposite;
    g.useProgram(p);
    gl.texture(p, 'uScene', scene.tex, 0);
    gl.texture(p, 'uBloomNear', halfA.tex, 1);
    gl.texture(p, 'uBloomFar', quarterA.tex, 2);
    gl.set2(p, 'uRes', W, H);
    gl.set1(p, 'uDpr', dpr);
    gl.set1(p, 'uTime', time);
    gl.set1(p, 'uBloom', post.bloom);
    gl.set1(p, 'uExposure', post.exposure);
    gl.set1(p, 'uAberration', post.aberration);
    gl.set1(p, 'uZoomBlur', post.zoomBlur);
    gl.set1(p, 'uGlitch', post.glitch);
    gl.set1(p, 'uDesaturate', post.desaturate);
    gl.set3(p, 'uTint', post.tint[0], post.tint[1], post.tint[2]);
    gl.set1(p, 'uTintAmount', post.tintAmount);
    gl.set4(p, 'uFlash', post.flash[0], post.flash[1], post.flash[2], post.flash[3]);
    gl.set3(p, 'uEdge', post.edge[0], post.edge[1], post.edge[2]);
    gl.set1(p, 'uEdgeAmount', post.edge[3]);
    gl.set1(p, 'uVignette', post.vignette);
    gl.set1(p, 'uGrain', post.grain);
    gl.set1(p, 'uScanline', post.scanline);
    g.uniform4fv(gl.uniform(p, 'uShock'), post.shock);
    g.uniform1i(gl.uniform(p, 'uShockCount'), post.shockCount);
    gl.set4(p, 'uLens', post.lens[0], post.lens[1], post.lens[2], post.lens[3]);
    gl.fullscreen();
  }

  /**
   * PNG of the last drawn frame. Only reliable in the same task as a `render()` call — the
   * drawing buffer is cleared once the frame is composited, so callers render first, then snapshot.
   */
  snapshot(): string {
    return this.canvas.toDataURL('image/png');
  }

  private drawInstances(which: 0 | 1): void {
    const g = this.gl.gl;
    const batch = which === 0 ? this.pen.box : this.pen.glow;
    if (which === 0) this.stats.surfaces = batch.count;
    else this.stats.lights = batch.count;
    if (batch.count === 0 || !batch.buffer) return;
    g.bindVertexArray(this.instanceVaos[which]);
    g.bindBuffer(g.ARRAY_BUFFER, batch.buffer);
    g.bufferSubData(g.ARRAY_BUFFER, 0, batch.data.subarray(0, batch.count * INSTANCE_STRIDE));
    g.drawArraysInstanced(g.TRIANGLE_STRIP, 0, 4, batch.count);
  }

  private drawText(): void {
    const g = this.gl.gl;
    const batch = this.pen.text;
    this.stats.glyphs = batch.count;
    if (batch.count === 0 || !batch.buffer) return;
    g.bindVertexArray(this.textVao);
    g.bindBuffer(g.ARRAY_BUFFER, batch.buffer);
    g.bufferSubData(g.ARRAY_BUFFER, 0, batch.data.subarray(0, batch.count * TEXT_STRIDE));
    g.drawArraysInstanced(g.TRIANGLE_STRIP, 0, 4, batch.count);
  }
}

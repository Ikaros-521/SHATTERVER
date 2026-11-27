import { GL, FULLSCREEN_VERT, type Target } from './gl';
import { InstanceBatch, Pen, TextBatch } from './batch';
import { BLUR_FRAG, BRIGHT_FRAG, COMPOSITE_FRAG, COPY_FRAG } from './shaders/post';
import { BACKDROP_FRAG, NEBULA_FRAG } from './shaders/background';
import { INSTANCE_FRAG, INSTANCE_VERT } from './shaders/instances';
import { SPRITE_FRAG, SPRITE_VERT } from './shaders/sprites';
import { PART_FRAG, PART_VERT } from './shaders/boss';
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

/**
 * The background theme worn this frame, or null for the chapters' own sky. A scene is drawn in
 * one pass at a fraction of the canvas resolution — it is scenery, soft by nature, and a full
 * resolution pass would cost more than the whole rest of the frame on a weak GPU.
 */
export interface ThemeFrame {
  /** Which theme. Its scene is compiled once, the first time it is drawn. */
  id: string;
  /** The scene's complete fragment shader (see `render/themes/background.ts`). */
  frag: string;
  /** -1..1: where the paddle sits across the arena, the layers' parallax input. */
  parallax: number;
  /** 0..1: how much of the scene's detail the quality step can afford. */
  detail: number;
  /** The scene is drawn at 1/`scale` of the canvas resolution along each axis, then let up. */
  scale: number;
  /** One frame in this many redraws the scene; the others reuse it. 1 is every frame. */
  refresh: number;
}

export interface FrameInput {
  layout: Layout;
  time: number;
  palette: Palette;
  /** world → CSS px, including camera shake and zoom. */
  view: View;
  post: PostState;
  info: SceneInfo;
  /** The background theme worn this frame. Omitted or null: the chapters' own sky. */
  theme?: ThemeFrame | null;
}

/** Draw statistics for the debug overlay. */
export interface RenderStats {
  surfaces: number;
  /** Theme sprites: in front of the surfaces, and beneath them. */
  sprites: number;
  spritesUnder: number;
  /** Boss parts: the shapes a character boss is drawn from. */
  parts: number;
  lights: number;
  glyphs: number;
}

const INSTANCE_STRIDE = 20;
const TEXT_STRIDE = 12;
const CORNERS = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
/** Theme sprites in flight per layer. The layer sheds before it overflows (see `themes/layer.ts`). */
const SPRITE_CAPACITY = 8192;
/** Boss parts in flight: a whole figure with its debris is a few hundred. */
const PART_CAPACITY = 4096;

/**
 * The rendering pipeline.
 *
 *   nebula (1/4 res) ─┐
 *                     ├─→ scene (HDR) ─→ bright ─→ blur ×2 (1/2) ─┬─→ composite ─→ screen
 *   backdrop (full) ──┘                        └─→ blur ×2 (1/4) ─┘
 *
 * With a background theme worn, a themed scene (1/2 res) takes the nebula's place and the
 * backdrop skips its stars and grid: the composite then only lays the arena's darker plate over
 * the scene, exactly as it does over the nebula.
 *
 * Ten draw calls in total. The scene itself is three instanced calls — surfaces, additive light,
 * glyphs — so whether there are four bricks or four hundred, the CPU cost is filling the buffers.
 *
 * A worn theme adds up to two more instanced calls, in the same alpha-blended pass around the
 * surfaces: its sprites beneath them, and its sprites in front of them. Both are skipped when
 * empty, and their program is compiled the first time either has something to draw — a player in
 * the stock look never compiles it.
 *
 * A character boss on screen adds one more, beneath every surface: the parts its figure is drawn
 * from. It too is skipped when empty and compiled the first time it is needed.
 */
export class Renderer {
  readonly gl: GL;
  readonly pen: Pen;
  readonly stats: RenderStats = { surfaces: 0, sprites: 0, spritesUnder: 0, parts: 0, lights: 0, glyphs: 0 };
  /**
   * Set when the WebGL context was lost and not yet reported restored (the app listens on the
   * canvas). Draw calls check it alongside `gl.isLost()` so a context that never fires
   * `webglcontextrestored` stays guarded too.
   */
  lost = false;

  private readonly canvas: HTMLCanvasElement;
  private readonly progInstance: WebGLProgram;
  private readonly progText: WebGLProgram;
  private readonly progNebula: WebGLProgram;
  private readonly progBackdrop: WebGLProgram;
  private readonly progBright: WebGLProgram;
  private readonly progBlur: WebGLProgram;
  private readonly progCopy: WebGLProgram;
  private readonly progComposite: WebGLProgram;
  /** The worn background theme's scene program, compiled the first time that theme is drawn. */
  private progTheme: WebGLProgram | null = null;
  private themeId: string | null = null;
  /** Scenes that would not compile on this device. They draw as the stock sky instead of throwing every frame. */
  private readonly brokenThemes = new Set<string>();
  /**
   * Every shader fault swallowed so far (a theme scene that would not compile). The app folds
   * these into its debug `errors`, so an automated run sees a silently degraded background.
   */
  readonly faults: unknown[] = [];
  /** The theme sprites' program, compiled the first time a frame has a sprite to draw. */
  private progSprite: WebGLProgram | null = null;
  /**
   * True once that program would not compile on this device. The sprites then simply are not
   * drawn — and the app, which reads this, draws the stock paddle and ball instead of a themed
   * one that would be missing its looks.
   */
  spritesBroken = false;
  private readonly spriteFront: InstanceBatch;
  private readonly spriteBack: InstanceBatch;
  private readonly spriteVaos: [WebGLVertexArrayObject, WebGLVertexArrayObject];
  /** The boss parts' program, compiled the first time a frame has a part to draw. */
  private progParts: WebGLProgram | null = null;
  /**
   * True once that program would not compile on this device. The parts then simply are not
   * drawn — and the app, which reads this, draws the boss's hitboxes as plain surfaces instead:
   * a fight whose boss cannot be seen where she is hit would be unplayable.
   */
  partsBroken = false;
  private readonly parts: InstanceBatch;
  private readonly partsVao: WebGLVertexArrayObject;
  /**
   * The atlas a character boss's pieces are drawn from (`boss/pictures.ts`), handed over by
   * whoever draws her. Without one her pieces are not drawn: a quad left sampling whatever else
   * happens to be bound would only show noise.
   */
  bossAtlas: WebGLTexture | null = null;
  private readonly instanceVaos: [WebGLVertexArrayObject, WebGLVertexArrayObject];
  private readonly textVao: WebGLVertexArrayObject;
  private readonly glyphTexture: WebGLTexture;

  private scene: Target | null = null;
  private nebula: Target | null = null;
  private theme: Target | null = null;
  /** Resolution divisor the theme target was last sized for. */
  private themeScale = 0;
  /** Set when the theme target holds nothing (or another theme's scene): the next frame must redraw it. */
  private themeStale = true;
  private frames = 0;
  private halfA: Target | null = null;
  /** The frame being drawn and its view, for the sprite program's uniforms. */
  private lastInput!: FrameInput;
  private lastView!: View;
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
    this.spriteFront = new InstanceBatch(SPRITE_CAPACITY);
    this.spriteBack = new InstanceBatch(SPRITE_CAPACITY);
    this.parts = new InstanceBatch(PART_CAPACITY);
    this.pen = new Pen(surfaces, lights, text, glyphs, this.spriteFront, this.spriteBack, this.parts);

    // One static corner buffer shared by every instanced VAO.
    const corners = g.createBuffer();
    if (!corners) throw new Error('Could not allocate the corner buffer');
    g.bindBuffer(g.ARRAY_BUFFER, corners);
    g.bufferData(g.ARRAY_BUFFER, CORNERS, g.STATIC_DRAW);

    this.instanceVaos = [this.makeInstanceVao(surfaces, corners), this.makeInstanceVao(lights, corners)];
    this.spriteVaos = [
      this.makeInstanceVao(this.spriteFront, corners),
      this.makeInstanceVao(this.spriteBack, corners),
    ];
    this.partsVao = this.makeInstanceVao(this.parts, corners);
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
    // A resized target is empty: the theme's scene has to be drawn into it again.
    if (this.theme) {
      gl.resize(this.theme, width / this.themeScale, height / this.themeScale);
      this.themeStale = true;
    }
  }

  /**
   * Draws the worn background theme's scene into its own target. False when there is none to
   * draw — no theme is worn, or its scene would not compile — and the caller draws the nebula.
   */
  private drawTheme(input: FrameInput): boolean {
    const theme = input.theme;
    if (!theme || this.brokenThemes.has(theme.id)) return false;
    const mark = this.profileHook;
    this.frames++;
    if (this.themeId !== theme.id) {
      try {
        this.progTheme = this.gl.program(`theme:${theme.id}`, FULLSCREEN_VERT, theme.frag);
      } catch (error) {
        // A scene that will not compile on this device costs its looks, not the frame.
        console.error(error);
        this.faults.push(error);
        this.brokenThemes.add(theme.id);
        return false;
      }
      this.themeId = theme.id;
      this.themeStale = true;
    }

    const gl = this.gl;
    const width = Math.max(1, Math.floor(this.width / theme.scale));
    const height = Math.max(1, Math.floor(this.height / theme.scale));
    if (!this.theme) {
      this.theme = gl.target(width, height, gl.hdr);
      this.themeScale = theme.scale;
      this.themeStale = true;
    } else if (this.themeScale !== theme.scale) {
      gl.resize(this.theme, width, height);
      this.themeScale = theme.scale;
      this.themeStale = true;
    }
    // A slow step may hold each scene for a few frames: the scenery drifts, it never snaps.
    if (!this.themeStale && theme.refresh > 1 && this.frames % theme.refresh !== 0) return true;
    this.themeStale = false;

    const { layout, time, info } = input;
    const p = this.progTheme as WebGLProgram;
    gl.bind(this.theme);
    gl.gl.useProgram(p);
    gl.set2(p, 'uCss', layout.cssW, layout.cssH);
    gl.set4(p, 'uArena', layout.ax + layout.aw / 2, layout.ay + layout.ah / 2, layout.aw / 2, layout.ah / 2);
    gl.set1(p, 'uTime', time);
    gl.set1(p, 'uEnergy', info.energy);
    gl.set1(p, 'uPar', theme.parallax);
    gl.set1(p, 'uDetail', theme.detail);
    gl.fullscreen();
    if (mark) mark('theme scene');
    return true;
  }

  /** Draws the current contents of `this.pen` plus everything in `input`. Call after filling the pen. */
  render(input: FrameInput): void {
    // A lost context makes every GL call a no-op at best and a throw at worst — resizing a render
    // target throws "Render target is incomplete". The app pauses the run and asks the player to
    // reload; drawing stays skipped until then (full resource rebuilding is out of scope).
    if (this.lost || this.gl.isLost()) return;
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
    // Kept for the sprite draw, which runs its own program and needs the same frame's view.
    this.lastInput = input;
    const [ar, ag, ab] = hexToRgb(palette.accent);
    const mark = this.profileHook;
    if (mark) mark('start');

    // ── 1. sky ──
    g.disable(g.BLEND);
    // A theme's scene stands in for the nebula; the backdrop below is told which it is sampling.
    const themed = this.drawTheme(input);
    if (!themed) {
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
    }
    if (mark) mark('nebula');

    // ── 2. scene ──
    gl.bind(scene);
    g.useProgram(this.progBackdrop);
    gl.texture(this.progBackdrop, 'uNebula', themed ? (this.theme as Target).tex : nebula.tex);
    gl.set1(this.progBackdrop, 'uThemed', themed ? 1 : 0);
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
    if (mark) mark('backdrop');

    g.enable(g.BLEND);
    const dpr = layout.dpr;
    const view = input.view;
    this.lastView = view;
    g.useProgram(this.progInstance);
    gl.set4(this.progInstance, 'uView', view.scale * dpr, view.tx * dpr, view.ty * dpr, 0);
    gl.set2(this.progInstance, 'uResolution', W, H);
    gl.set1(this.progInstance, 'uTime', time);
    gl.set1(this.progInstance, 'uPixel', 1 / (view.scale * dpr));

    g.blendFunc(g.ONE, g.ONE_MINUS_SRC_ALPHA);
    // A theme's drifting layer and particles go down first: the surfaces paint over them.
    this.drawSprites(1);
    if (mark) mark('sprites under');
    // A character boss stands behind the field too: whatever is summoned paints over her.
    this.drawParts();
    if (mark) mark('parts');
    this.drawInstances(0);
    if (mark) mark('surfaces');
    // …then a themed paddle's and ball's own sprites, in front of the bricks.
    this.drawSprites(0);
    if (mark) mark('sprites');
    g.blendFunc(g.ONE, g.ONE);
    this.drawInstances(1);
    if (mark) mark('lights');

    g.blendFunc(g.ONE, g.ONE_MINUS_SRC_ALPHA);
    g.useProgram(this.progText);
    gl.set4(this.progText, 'uView', view.scale * dpr, view.tx * dpr, view.ty * dpr, 0);
    gl.set2(this.progText, 'uResolution', W, H);
    gl.texture(this.progText, 'uAtlas', this.glyphTexture);
    this.drawText();
    if (mark) mark('text');

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
    if (mark) mark('bloom');

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
    if (mark) mark('composite');
  }

  /**
   * When set, called with a label after `start` and after every render pass. The pass profiler
   * installs a hook that fences the GPU, which stalls the pipeline: diagnosis only, never play.
   */
  profileHook: ((label: string) => void) | null = null;

  /**
   * PNG of the last drawn frame. Only reliable in the same task as a `render()` call — the
   * drawing buffer is cleared once the frame is composited, so callers render first, then snapshot.
   * Null when the context is lost; the scorecard composer draws a fallback background instead.
   */
  snapshot(): string | null {
    if (this.lost || this.gl.isLost()) return null;
    return this.canvas.toDataURL('image/png');
  }

  private drawInstances(which: 0 | 1): void {
    const batch = which === 0 ? this.pen.box : this.pen.glow;
    if (which === 0) this.stats.surfaces = batch.count;
    else this.stats.lights = batch.count;
    if (batch.count === 0) return;
    this.drawBatch(this.instanceVaos[which], batch);
  }

  /**
   * Draws one layer of theme sprites: `which` 0 in front of the surfaces, 1 beneath them. Nothing
   * happens while the layer is empty, which is every frame for a player in the stock look.
   */
  private drawSprites(which: 0 | 1): void {
    const batch = which === 0 ? this.spriteFront : this.spriteBack;
    if (which === 0) this.stats.sprites = batch.count;
    else this.stats.spritesUnder = batch.count;
    if (batch.count === 0) return;
    if (!this.progSprite) {
      if (this.spritesBroken) return;
      try {
        this.progSprite = this.gl.program('sprite', SPRITE_VERT, SPRITE_FRAG);
      } catch (error) {
        // The game's own shapes never run this program, so its failure costs a theme its looks
        // and nothing else. Reported like a scene that will not compile.
        console.error(error);
        this.faults.push(error);
        this.spritesBroken = true;
        return;
      }
    }
    this.drawFamily(this.progSprite, this.spriteVaos[which], batch);
  }

  /**
   * Draws the boss pieces: the pictures a character boss is drawn from. Nothing happens while the
   * batch is empty, which is every frame without a character boss on screen; like the sprites,
   * its program is compiled the first time it is needed, and a failure here costs the boss her
   * looks and nothing else.
   */
  private drawParts(): void {
    const batch = this.parts;
    this.stats.parts = batch.count;
    if (batch.count === 0) return;
    if (!this.bossAtlas) return;
    if (!this.progParts) {
      if (this.partsBroken) return;
      try {
        this.progParts = this.gl.program('parts', PART_VERT, PART_FRAG);
      } catch (error) {
        console.error(error);
        this.faults.push(error);
        this.partsBroken = true;
        return;
      }
    }
    this.gl.texture(this.progParts, 'uAtlas', this.bossAtlas);
    this.drawFamily(this.progParts, this.partsVao, batch);
  }

  /**
   * Draws one batch with a program that takes the sprite uniforms — the frame's view, the clock
   * and the pixel size — and leaves the game's own program current again.
   */
  private drawFamily(program: WebGLProgram, vao: WebGLVertexArrayObject, batch: InstanceBatch): void {
    const g = this.gl.gl;
    g.useProgram(program);
    const { layout, time } = this.lastInput;
    const dpr = layout.dpr;
    const view = this.lastView;
    g.uniform4f(this.gl.uniform(program, 'uView'), view.scale * dpr, view.tx * dpr, view.ty * dpr, 0);
    g.uniform2f(this.gl.uniform(program, 'uResolution'), this.width, this.height);
    g.uniform1f(this.gl.uniform(program, 'uTime'), time);
    g.uniform1f(this.gl.uniform(program, 'uPixel'), 1 / (view.scale * dpr));
    this.drawBatch(vao, batch);
    // Back to the game's own program: its uniforms were set once above and live on the program.
    g.useProgram(this.progInstance);
  }

  /** Uploads one instance batch and draws it with whatever program is current. */
  private drawBatch(vao: WebGLVertexArrayObject, batch: InstanceBatch): void {
    const g = this.gl.gl;
    if (!batch.buffer) return;
    g.bindVertexArray(vao);
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

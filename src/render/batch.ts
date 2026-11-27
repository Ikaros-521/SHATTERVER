import type { GlyphAtlas } from './textAtlas';
import { SHAPE_BOX, SHAPE_GLOW, SHAPE_RING, SHAPE_STROKE } from './shaders/instances';
import { FLAG_MIRROR } from './shaders/sprites';
import { FLAG_PART_MIRROR } from './shaders/boss';

/** 0xRRGGBB, or an [r, g, b] triple for HDR colours that may exceed 1. */
export type Color = number | readonly [number, number, number];

export const rgb = (hex: number): [number, number, number] => [
  ((hex >> 16) & 255) / 255,
  ((hex >> 8) & 255) / 255,
  (hex & 255) / 255,
];

const INSTANCE_STRIDE = 20;
const TEXT_STRIDE = 12;
/** World units of padding around a box, for its outer halo. Keep in sync with the shader. */
const BOX_PAD = 14;

/** CPU staging buffer for one instanced draw call. Rewritten every frame. */
export class InstanceBatch {
  count = 0;
  readonly data: Float32Array;
  buffer: WebGLBuffer | null = null;

  constructor(readonly capacity: number) {
    this.data = new Float32Array(capacity * INSTANCE_STRIDE);
  }

  reset(): void {
    this.count = 0;
  }

  /** Reserves one instance. Returns the float offset to write at, or -1 when the batch is full. */
  reserve(): number {
    return this.count < this.capacity ? this.count++ * INSTANCE_STRIDE : -1;
  }
}

export class TextBatch {
  count = 0;
  readonly data: Float32Array;
  buffer: WebGLBuffer | null = null;

  constructor(readonly capacity: number) {
    this.data = new Float32Array(capacity * TEXT_STRIDE);
  }

  reset(): void {
    this.count = 0;
  }

  reserve(): number {
    return this.count < this.capacity ? this.count++ * TEXT_STRIDE : -1;
  }
}

export interface BoxOptions {
  rot?: number;
  alpha?: number;
  /** Corner radius. Defaults to a third of the shorter half-extent. */
  radius?: number;
  /** Remaining HP fraction 0..1: drives fill light and cracks. */
  hp?: number;
  flags?: number;
  /** 0..1, white hit flash. */
  flash?: number;
  /** Extra outer halo strength. */
  halo?: number;
}

/** What a theme sprite may say about itself beyond its place and colour. Each shape reads its own subset. */
export interface SpriteOptions {
  /** First shape parameter. */
  p0?: number;
  /** Second shape parameter. */
  p1?: number;
  /** Third shape parameter. */
  p2?: number;
  /** White flash, 0..1: the shape's lit colour pushed towards white. */
  flash?: number;
  /** Strength of the additive rim around the sprite, in HDR units. */
  halo?: number;
  /** Mirror the shape across its own vertical axis. */
  mirror?: boolean;
  /** World units of quad padding beyond the half extents, for rims that reach past the shape. */
  pad?: number;
}

/** Where a picture lies in the boss atlas: the rectangle of it the picture samples. */
export interface PictureRect {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

// Scratch for the current colour, so drawing helpers never allocate.
let cr = 0;
let cg = 0;
let cb = 0;
function split(color: Color): void {
  if (typeof color === 'number') {
    cr = ((color >> 16) & 255) / 255;
    cg = ((color >> 8) & 255) / 255;
    cb = (color & 255) / 255;
  } else {
    cr = color[0];
    cg = color[1];
    cb = color[2];
  }
}

/**
 * Drawing helpers over the batches. All positions and sizes are world units, y down.
 * One `Pen` belongs to one frame.
 *
 * A pen has two layers for theme sprites, which are drawn in the alpha-blended pass with the
 * surfaces: `sprite` on this pen goes in front of every surface (a themed paddle over the
 * bricks), and the same call on {@link under} goes beneath them all (petals drifting behind the
 * field). A character boss's parts ({@link bossPicture}) go beneath every surface too, in the order
 * they were written. Everything else lands where it always did.
 */
export class Pen {
  /**
   * The batch this pen's sprites go to: `spritesFront` for the pen itself, `spritesBack` for its
   * `under`.
   */
  private readonly sprites: InstanceBatch;
  /** The same pen, for what belongs beneath the surfaces. It is its own `under`. */
  readonly under: Pen;
  /** The batch of boss parts, when the renderer gave it one. A pen over bare batches has none. */
  readonly boss: InstanceBatch | null;

  constructor(
    readonly box: InstanceBatch,
    readonly glow: InstanceBatch,
    readonly text: TextBatch,
    readonly glyphs: GlyphAtlas,
    readonly spritesFront: InstanceBatch,
    readonly spritesBack: InstanceBatch,
    boss: InstanceBatch | null = null,
    sprites: InstanceBatch = spritesFront,
  ) {
    this.sprites = sprites;
    this.boss = boss;
    this.under =
      sprites === spritesFront
        ? new Pen(box, glow, text, glyphs, spritesFront, spritesBack, boss, spritesBack)
        : this;
  }

  reset(): void {
    this.box.reset();
    this.glow.reset();
    this.text.reset();
    this.spritesFront.reset();
    this.spritesBack.reset();
    this.boss?.reset();
  }

  /** Hard surface: bricks, the paddle, shards. `hw`/`hh` are the shape's half extents. */
  surface(x: number, y: number, hw: number, hh: number, color: Color, o: BoxOptions = {}): void {
    const i = this.box.reserve();
    if (i < 0) return;
    split(color);
    const d = this.box.data;
    d[i] = x;
    d[i + 1] = y;
    d[i + 2] = hw + BOX_PAD;
    d[i + 3] = hh + BOX_PAD;
    d[i + 4] = o.rot ?? 0;
    d[i + 5] = cr;
    d[i + 6] = cg;
    d[i + 7] = cb;
    d[i + 8] = o.alpha ?? 1;
    d[i + 9] = SHAPE_BOX;
    d[i + 10] = hw;
    d[i + 11] = hh;
    d[i + 12] = o.radius ?? Math.min(hw, hh) * 0.35;
    d[i + 13] = o.hp ?? 1;
    d[i + 14] = o.flags ?? 0;
    d[i + 15] = o.flash ?? 0;
    d[i + 16] = o.halo ?? 0;
    d[i + 17] = 0;
    d[i + 18] = 0;
    d[i + 19] = 0;
  }

  /** Soft radial light. `sharp` 0..1 goes from hazy to almost solid; `core` adds a hot line along local x. */
  light(
    x: number,
    y: number,
    rx: number,
    ry: number,
    color: Color,
    alpha = 1,
    sharp = 0.5,
    rot = 0,
    core = 0,
  ): void {
    this.radial(this.glow, x, y, rx, ry, color, alpha, sharp, rot, core);
  }

  /**
   * The same light, but ordered beneath every surface drawn after it: it goes into the
   * alpha-blended batch, where the next brick simply paints over it. For layers that belong
   * behind the play field (a theme's drifting lights), where `light` would sit on top of it all.
   * It is a stock glow, so it needs no theme: the sprite program never draws it.
   */
  haze(
    x: number,
    y: number,
    rx: number,
    ry: number,
    color: Color,
    alpha = 1,
    sharp = 0.5,
    rot = 0,
    core = 0,
  ): void {
    this.radial(this.box, x, y, rx, ry, color, alpha, sharp, rot, core);
  }

  private radial(
    batch: InstanceBatch,
    x: number,
    y: number,
    rx: number,
    ry: number,
    color: Color,
    alpha: number,
    sharp: number,
    rot: number,
    core: number,
  ): void {
    const i = batch.reserve();
    if (i < 0) return;
    split(color);
    const d = batch.data;
    d[i] = x;
    d[i + 1] = y;
    d[i + 2] = rx;
    d[i + 3] = ry;
    d[i + 4] = rot;
    d[i + 5] = cr;
    d[i + 6] = cg;
    d[i + 7] = cb;
    d[i + 8] = alpha;
    d[i + 9] = SHAPE_GLOW;
    d[i + 10] = rx;
    d[i + 11] = ry;
    d[i + 12] = core;
    d[i + 13] = sharp;
    d[i + 14] = 0;
    d[i + 15] = 0;
    d[i + 16] = 0;
    d[i + 17] = 0;
    d[i + 18] = 0;
    d[i + 19] = 0;
  }

  /** A solid disc of light with a soft edge. */
  disc(x: number, y: number, radius: number, color: Color, alpha = 1, soft = 0.75): void {
    this.light(x, y, radius, radius, color, alpha, soft);
  }

  /**
   * A theme sprite: one of the decorative SDF shapes (`SHAPE_PETAL` and up, see
   * `shaders/sprites`), alpha blended like a surface. On this pen it goes in front of the
   * surfaces; on `under`, behind them. Within one layer, later sprites paint over earlier ones.
   * `hw`/`hh` are the shape's half extents.
   */
  sprite(
    shape: number,
    x: number,
    y: number,
    hw: number,
    hh: number,
    rot: number,
    color: Color,
    alpha = 1,
    o: SpriteOptions = {},
  ): void {
    const batch = this.sprites;
    const i = batch.reserve();
    if (i < 0) return;
    split(color);
    const d = batch.data;
    const pad = o.pad ?? 3;
    d[i] = x;
    d[i + 1] = y;
    d[i + 2] = hw + pad;
    d[i + 3] = hh + pad;
    d[i + 4] = rot;
    d[i + 5] = cr;
    d[i + 6] = cg;
    d[i + 7] = cb;
    d[i + 8] = alpha;
    d[i + 9] = shape;
    d[i + 10] = hw;
    d[i + 11] = hh;
    d[i + 12] = o.p0 ?? 0;
    d[i + 13] = o.p1 ?? 0;
    d[i + 14] = o.mirror ? FLAG_MIRROR : 0;
    d[i + 15] = o.flash ?? 0;
    d[i + 16] = o.halo ?? 0;
    d[i + 17] = o.p2 ?? 0;
    d[i + 18] = 0;
    d[i + 19] = 0;
  }

  /**
   * A boss picture: one piece of a character boss, a quad textured from the boss atlas (see
   * `boss/pictures.ts`), alpha blended like a surface. On every pen it goes into the same batch,
   * which the renderer draws beneath every surface of the frame, in the order the pieces were
   * written. `hw`/`hh` are the quad's half extents; `rect` the piece's rectangle in the atlas. A
   * mirrored picture is flipped left to right in its own frame before it is turned.
   */
  bossPicture(
    x: number,
    y: number,
    hw: number,
    hh: number,
    rot: number,
    rect: PictureRect,
    alpha = 1,
    flash = 0,
    mirror = false,
    /** 1: the shape a torn-off part leaves behind, drawn as starlight (see `boss/sheet.ts`). */
    ghost = 0,
  ): void {
    const batch = this.boss;
    if (!batch) return;
    const i = batch.reserve();
    if (i < 0) return;
    const d = batch.data;
    d[i] = x;
    d[i + 1] = y;
    d[i + 2] = hw;
    d[i + 3] = hh;
    d[i + 4] = rot;
    d[i + 5] = 1;
    d[i + 6] = 1;
    d[i + 7] = 1;
    d[i + 8] = alpha;
    d[i + 9] = rect.u0;
    d[i + 10] = rect.v0;
    d[i + 11] = rect.u1;
    d[i + 12] = rect.v1;
    d[i + 13] = mirror ? FLAG_PART_MIRROR : 0;
    d[i + 14] = flash;
    d[i + 15] = ghost;
    d[i + 16] = 0;
    d[i + 17] = 0;
    d[i + 18] = 0;
    d[i + 19] = 0;
  }

  /** Expanding circle, e.g. a shock ring. */
  ring(x: number, y: number, radius: number, thickness: number, color: Color, alpha = 1): void {
    const i = this.glow.reserve();
    if (i < 0) return;
    split(color);
    const d = this.glow.data;
    const extent = radius + thickness * 3.5;
    d[i] = x;
    d[i + 1] = y;
    d[i + 2] = extent;
    d[i + 3] = extent;
    d[i + 4] = 0;
    d[i + 5] = cr;
    d[i + 6] = cg;
    d[i + 7] = cb;
    d[i + 8] = alpha;
    d[i + 9] = SHAPE_RING;
    d[i + 10] = radius;
    d[i + 11] = radius;
    d[i + 12] = thickness;
    d[i + 13] = 0;
    d[i + 14] = 0;
    d[i + 15] = 0;
    d[i + 16] = 0;
    d[i + 17] = 0;
    d[i + 18] = 0;
    d[i + 19] = 0;
  }

  /** Outline of a rounded rectangle. */
  stroke(x: number, y: number, hw: number, hh: number, color: Color, width = 2, alpha = 1, radius = 0): void {
    const i = this.glow.reserve();
    if (i < 0) return;
    split(color);
    const d = this.glow.data;
    const pad = width * 3.5 + 10;
    d[i] = x;
    d[i + 1] = y;
    d[i + 2] = hw + pad;
    d[i + 3] = hh + pad;
    d[i + 4] = 0;
    d[i + 5] = cr;
    d[i + 6] = cg;
    d[i + 7] = cb;
    d[i + 8] = alpha;
    d[i + 9] = SHAPE_STROKE;
    d[i + 10] = hw;
    d[i + 11] = hh;
    d[i + 12] = radius;
    d[i + 13] = width;
    d[i + 14] = 0;
    d[i + 15] = 0;
    d[i + 16] = 0;
    d[i + 17] = 0;
    d[i + 18] = 0;
    d[i + 19] = 0;
  }

  /** A laser: hot core with a wide haze, tapered at both ends. */
  beam(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    width: number,
    color: Color,
    alpha = 1,
    core = 1,
  ): void {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    if (len < 1) return;
    const rot = Math.atan2(dy, dx);
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2;
    this.light(mx, my, len / 2 + width * 2, width * 2.8, color, alpha * 0.3, 0.15, rot);
    this.light(mx, my, len / 2 + width, width, color, alpha, 0.72, rot, core);
  }

  private glyph(
    x: number,
    y: number,
    w: number,
    h: number,
    u0: number,
    u1: number,
    color: Color,
    alpha: number,
    rot: number,
  ): void {
    const i = this.text.reserve();
    if (i < 0) return;
    split(color);
    const d = this.text.data;
    d[i] = x;
    d[i + 1] = y;
    d[i + 2] = w;
    d[i + 3] = h;
    d[i + 4] = rot;
    d[i + 5] = cr;
    d[i + 6] = cg;
    d[i + 7] = cb;
    d[i + 8] = u0;
    d[i + 9] = u1;
    d[i + 10] = alpha;
    d[i + 11] = 0;
  }

  /** Width of `text` at `size` (the glyph height in world units). */
  measure(text: string, size: number): number {
    const g = this.glyphs;
    let width = 0;
    for (const ch of text)
      width += (g.index[ch] !== undefined ? g.advance[g.index[ch] as number] : 0.5) * size;
    return width;
  }

  /** Draws `text` centred on (x, y). Returns its width. */
  label(text: string, x: number, y: number, size: number, color: Color, alpha = 1, rot = 0): number {
    const g = this.glyphs;
    const width = this.measure(text, size);
    const h = size * g.heightRatio;
    let cx = x - width / 2;
    for (const ch of text) {
      const idx = g.index[ch];
      if (idx === undefined) continue;
      const w = g.width[idx] * size;
      this.glyph(cx + w / 2, y, w, h, g.u0[idx], g.u1[idx], color, alpha, rot);
      cx += g.advance[idx] * size;
    }
    return width;
  }
}

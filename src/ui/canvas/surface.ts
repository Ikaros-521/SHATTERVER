/**
 * The drawing surface the canvas UI paints on.
 *
 * A tiny immediate-mode interface (boxes, clipped groups, positioned text) so the widget tree
 * stays independent of where it renders. Production renders into an offscreen 2D canvas — on
 * WeChat that canvas is later uploaded into the WebGL frame as a texture; tests pass any object
 * with the same methods.
 *
 * All coordinates are CSS px of the surface's logical space; the implementation owns device
 * scaling (`ctx.scale(dpr, dpr)` in production).
 */

export interface BoxStyle {
  /** Fill colour (`rgba()` string); omitted for no fill. */
  fill?: string;
  /** Stroke colour; omitted for no stroke. */
  stroke?: string;
  strokeW?: number;
  radius?: number;
  /** Cuts the top-right corner by this many px (the menu's chamfered entries); beats `radius`. */
  chamfer?: number;
}

export interface TextStyle {
  size: number;
  color: string;
  /** 'left' x is the left edge, 'center' the middle, 'right' the right edge. */
  align?: 'left' | 'center' | 'right';
  alpha?: number;
  /** CSS font-weight digits as a string, e.g. '700'. */
  weight?: string;
  /** Extra px between characters (the logo's wide tracking); drawn char by char. */
  spacing?: number;
  /** Soft glow behind the glyphs (colour); the logo hero's neon look. */
  glow?: string;
  /** Vertical gradient [top, mid, bottom] that replaces the flat colour (the logo hero). */
  gradient?: [string, string, string];
}

export interface Surface {
  /** Logical size of the surface in CSS px. */
  readonly width: number;
  readonly height: number;
  /** Fills the whole surface (call once per frame before drawing). */
  clear(color: string): void;
  /** One rounded rectangle. */
  box(x: number, y: number, w: number, h: number, style: BoxStyle): void;
  /** Runs `draw` with clipping to the rectangle; state is restored afterwards. */
  clip(x: number, y: number, w: number, h: number, draw: () => void): void;
  /** Draws one line of text with its top edge at `y`. */
  text(str: string, x: number, y: number, style: TextStyle): void;
  /** Width of `str` at `size`, in CSS px. */
  measure(str: string, size: number): number;
}

/** The production surface: a Canvas 2D context with the game's font stack. */
export class CanvasSurface implements Surface {
  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    readonly width: number,
    readonly height: number,
    private readonly font: string,
  ) {}

  clear(color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  box(x: number, y: number, w: number, h: number, style: BoxStyle): void {
    const { ctx } = this;
    ctx.beginPath();
    const cut = style.chamfer ?? 0;
    if (cut > 0) {
      // Chamfered top-right corner (the DOM menu's clip-path look).
      const c = Math.min(cut, w, h);
      ctx.moveTo(x, y);
      ctx.lineTo(x + w - c, y);
      ctx.lineTo(x + w, y + c);
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x, y + h);
      ctx.closePath();
    } else {
      const r = Math.min(style.radius ?? 0, w / 2, h / 2);
      if (r > 0 && typeof ctx.roundRect === 'function') {
        ctx.roundRect(x, y, w, h, r);
      } else {
        ctx.rect(x, y, w, h);
      }
    }
    if (style.fill) {
      ctx.fillStyle = style.fill;
      ctx.fill();
    }
    if (style.stroke) {
      ctx.strokeStyle = style.stroke;
      ctx.lineWidth = style.strokeW ?? 1;
      ctx.stroke();
    }
  }

  clip(x: number, y: number, w: number, h: number, draw: () => void): void {
    const { ctx } = this;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    draw();
    ctx.restore();
  }

  text(str: string, x: number, y: number, style: TextStyle): void {
    const { ctx } = this;
    ctx.font = `${style.weight ?? '400'} ${style.size}px ${this.font}`;
    ctx.textAlign = style.align ?? 'left';
    ctx.textBaseline = 'top';
    ctx.globalAlpha = style.alpha ?? 1;
    let fillStyle: string | CanvasGradient = style.color;
    if (style.gradient) {
      // Vertical gradient across the glyph height; the stops ride the text's own line box.
      const grad = ctx.createLinearGradient(x, y, x, y + style.size * 1.05);
      grad.addColorStop(0, style.gradient[0]);
      grad.addColorStop(0.72, style.gradient[1]);
      grad.addColorStop(1, style.gradient[2]);
      fillStyle = grad;
    }
    const spacing = style.spacing ?? 0;
    if (spacing > 0) {
      // Per-character tracking (the ctx font above already carries the weight). A centered run
      // is laid out from its total advance so the anchor stays the block's centre.
      const chars = Array.from(str);
      const width =
        chars.reduce((sum, ch) => sum + ctx.measureText(ch).width, 0) +
        spacing * Math.max(0, chars.length - 1);
      let cursor = style.align === 'center' ? x - width / 2 : style.align === 'right' ? x - width : x;
      const savedAlign = ctx.textAlign;
      ctx.textAlign = 'left';
      for (const ch of chars) {
        this.glowText(ch, cursor, y, fillStyle, style.glow);
        cursor += ctx.measureText(ch).width + spacing;
      }
      ctx.textAlign = savedAlign;
    } else {
      this.glowText(str, x, y, fillStyle, style.glow);
    }
    ctx.globalAlpha = 1;
  }

  measure(str: string, size: number): number {
    // Weight barely moves widths in the UI's faces; measuring at 400 keeps one cache dimension.
    this.ctx.font = `400 ${size}px ${this.font}`;
    return this.ctx.measureText(str).width;
  }

  /** Fills one glyph/run with the style's colour — or its gradient, prepared by {@link text}. */
  private glowText(ch: string, x: number, y: number, fill: string | CanvasGradient, glow?: string): void {
    const { ctx } = this;
    if (glow) {
      ctx.shadowColor = glow;
      ctx.shadowBlur = 12;
    }
    ctx.fillStyle = fill;
    ctx.fillText(ch, x, y);
    ctx.shadowBlur = 0;
  }
}

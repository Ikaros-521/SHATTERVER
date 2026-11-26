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
}

export interface TextStyle {
  size: number;
  color: string;
  /** 'left' x is the left edge, 'center' the middle, 'right' the right edge. */
  align?: 'left' | 'center' | 'right';
  alpha?: number;
  /** CSS font-weight digits as a string, e.g. '700'. */
  weight?: string;
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
    const r = Math.min(style.radius ?? 0, w / 2, h / 2);
    if (r > 0 && typeof ctx.roundRect === 'function') {
      ctx.roundRect(x, y, w, h, r);
    } else {
      ctx.rect(x, y, w, h);
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
    ctx.fillStyle = style.color;
    ctx.fillText(str, x, y);
    ctx.globalAlpha = 1;
  }

  measure(str: string, size: number): number {
    // Weight barely moves widths in the UI's faces; measuring at 400 keeps one cache dimension.
    this.ctx.font = `400 ${size}px ${this.font}`;
    return this.ctx.measureText(str).width;
  }
}

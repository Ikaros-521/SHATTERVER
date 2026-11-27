import type { BossOptions, Color, Pen } from '../../batch';

/**
 * A pen set down at a figure's anchor and scaled to her size, so painters work in figure units:
 * x to the right, y down, the origin at the top of the breastbone.
 *
 * A painter may give it a pose — a turn about a pivot, plus how far a hit has knocked the part —
 * and everything it then places follows it. That is what lets the head lean without its features
 * sliding off, and a shoulder shudder without the arm coming with it. One brush serves a whole
 * frame, and may serve the next: placing a part allocates nothing.
 */
export class Brush {
  /** Where the last {@link map} landed, in world units. */
  mx = 0;
  my = 0;

  private pen: Pen | null = null;
  private x = 0;
  private y = 0;
  private scale = 1;
  private tilt = 0;
  private cosT = 1;
  private sinT = 0;
  private pivotX = 0;
  private pivotY = 0;
  private knockX = 0;
  private knockY = 0;

  /** Sets the brush down: which pen, at which world position, with how many world units to a figure unit. */
  place(pen: Pen, x: number, y: number, scale: number): void {
    this.pen = pen;
    this.x = x;
    this.y = y;
    this.scale = scale;
    this.pose();
  }

  /**
   * Turns everything placed from now on by `tilt` about a pivot (figure units), then shifts it by
   * the knock. With no arguments: upright and in place.
   */
  pose(tilt = 0, pivotX = 0, pivotY = 0, knockX = 0, knockY = 0): void {
    this.tilt = tilt;
    this.cosT = Math.cos(tilt);
    this.sinT = Math.sin(tilt);
    this.pivotX = pivotX;
    this.pivotY = pivotY;
    this.knockX = knockX;
    this.knockY = knockY;
  }

  /** World position of a figure point, left in {@link mx} / {@link my}. */
  map(x: number, y: number): void {
    const dx = x - this.pivotX;
    const dy = y - this.pivotY;
    this.mx = this.x + (this.pivotX + dx * this.cosT - dy * this.sinT + this.knockX) * this.scale;
    this.my = this.y + (this.pivotY + dx * this.sinT + dy * this.cosT + this.knockY) * this.scale;
  }

  /**
   * Places one part shape. Lengths are figure units and scale with the figure; the ink outline
   * does not (a line is a line at any size); `rot` is radians in the figure's frame.
   */
  part(
    shape: number,
    x: number,
    y: number,
    hw: number,
    hh: number,
    rot: number,
    color: Color,
    alpha = 1,
    o: BossOptions = {},
  ): void {
    const pen = this.pen;
    if (!pen) return;
    const dx = x - this.pivotX;
    const dy = y - this.pivotY;
    const k = this.scale;
    pen.bossPart(
      shape,
      this.x + (this.pivotX + dx * this.cosT - dy * this.sinT + this.knockX) * k,
      this.y + (this.pivotY + dx * this.sinT + dy * this.cosT + this.knockY) * k,
      hw * k,
      hh * k,
      rot + this.tilt,
      color,
      alpha,
      o,
    );
  }

  /** A soft light in the additive pass, which is drawn over every surface. */
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
    const pen = this.pen;
    if (!pen) return;
    this.map(x, y);
    pen.light(this.mx, this.my, rx * this.scale, ry * this.scale, color, alpha, sharp, rot + this.tilt, core);
  }

  /** A beam: a hot core in a haze, from one figure point to another. */
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
    const pen = this.pen;
    if (!pen) return;
    this.map(x0, y0);
    const ax = this.mx;
    const ay = this.my;
    this.map(x1, y1);
    pen.beam(ax, ay, this.mx, this.my, width * this.scale, color, alpha, core);
  }
}

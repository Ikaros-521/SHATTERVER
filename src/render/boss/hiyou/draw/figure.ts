import type { BossFrame } from '../../types';
import { drawSheet } from '../../sheet';
import { HIYOU_SHEET } from './pieces';

/**
 * 绯樱 whole, for one frame, drawn straight onto a canvas with Canvas 2D: every picture of her sheet
 * where `place` puts it, back to front. The renderer draws her from the same placement (see
 * `../pictures.ts`), so the two cannot drift apart.
 */

/** Draws her with the top of her breastbone at the origin. */
export function drawHiyou(ctx: CanvasRenderingContext2D, frame: BossFrame): void {
  drawSheet(ctx, HIYOU_SHEET, frame);
}

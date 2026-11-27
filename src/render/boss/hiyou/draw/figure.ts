import type { BossFrame } from '../../types';
import { glow, rgba } from './brush';
import { CORE_LIGHT } from './body';
import { PIECES, coreLight, placeHiyou, type Placed } from './pieces';

/**
 * 绯樱 whole, for one frame, drawn with Canvas 2D in figure units (see `head.ts`): each piece
 * where `placeHiyou` puts it, back to front. The renderer that draws her into the game is handed
 * the same list (see `pictures.ts`), so the two cannot drift apart.
 */

/** The placement of one frame, kept from the last: placing is an action performed many times a second. */
const placed: Placed[] = [];

/** Draws her with the top of her breastbone at the origin. */
export function drawHiyou(ctx: CanvasRenderingContext2D, frame: BossFrame): void {
  ctx.save();
  // She hangs in the air: the whole of her drifts up and down a little.
  ctx.translate(frame.x, frame.y + Math.sin(frame.time * 1.1) * 3);
  const light = coreLight(frame);
  if (light) {
    const reach = CORE_LIGHT.reach + 2;
    ctx.fillStyle = glow(ctx, light.x, light.y, rgba(0xff5fd8, light.alpha), 14, CORE_LIGHT.reach);
    ctx.fillRect(light.x - reach, light.y - reach, reach * 2, reach * 2);
  }
  for (const piece of placeHiyou(frame, placed)) {
    const drawn = PIECES.get(piece.key);
    if (!drawn) continue;
    ctx.save();
    ctx.translate(piece.x, piece.y);
    if (piece.rot !== 0) ctx.rotate(piece.rot);
    if (piece.mirror) ctx.scale(-1, 1);
    ctx.globalAlpha = piece.alpha;
    drawn.paint(ctx, piece.look);
    ctx.restore();
  }
  ctx.restore();
}

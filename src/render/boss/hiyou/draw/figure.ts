import type { BossFrame, FaceId } from '../../types';
import { drawArm, drawCore, drawPauldron, drawTorso, drawWing, NECK_JOINT } from './body';
import { drawBackHair, drawHead } from './head';

/**
 * 绯樱 whole, for one frame, drawn with Canvas 2D in figure units (see `head.ts`): back to front,
 * each part where its look says it is. She hangs in the air, so the whole of her drifts up and
 * down a little; the head leans on the top of her neck.
 */

/** How far the head leans, in radians: positive droops towards her right shoulder. */
function headTilt(face: FaceId, time: number): number {
  switch (face) {
    case 'defeated':
      return 0.17;
    case 'hurt':
      return -0.07;
    case 'awakened':
      return -0.09;
    case 'smug':
      return 0.08;
    case 'angry':
      return -0.04;
    default:
      return Math.sin(time * 0.9) * 0.025;
  }
}

/** Draws her with the top of her breastbone at the origin. */
export function drawHiyou(ctx: CanvasRenderingContext2D, frame: BossFrame): void {
  const { look, time, face } = frame;
  ctx.save();
  ctx.translate(frame.x, frame.y + Math.sin(time * 1.1) * 3);

  drawWing(ctx, -1, look.LeftWing, time);
  drawWing(ctx, 1, look.RightWing, time);

  // The hair behind her goes where her head goes.
  ctx.save();
  ctx.translate(look.Head.dx, look.Head.dy);
  drawBackHair(ctx);
  ctx.restore();

  drawTorso(ctx, look.Body);
  drawArm(ctx, -1, look.LeftArm, time);
  drawArm(ctx, 1, look.RightArm, time);
  drawPauldron(ctx, -1, look.LeftShoulder, time);
  drawPauldron(ctx, 1, look.RightShoulder, time);

  // The head leans on the joint at the top of her neck.
  ctx.save();
  ctx.translate(look.Head.dx, look.Head.dy);
  ctx.translate(0, NECK_JOINT);
  ctx.rotate(headTilt(face, time));
  ctx.translate(0, -NECK_JOINT);
  drawHead(ctx, face);
  ctx.restore();

  drawCore(ctx, look.Core, look.CoreShield, time);
  ctx.restore();
}

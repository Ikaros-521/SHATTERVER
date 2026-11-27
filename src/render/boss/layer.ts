import { bakeSheet, paintSheet, type PictureAtlas } from './pictures';
import { HIYOU_SCALE, HIYOU_SHEET } from './hiyou/draw/pieces';
import type { Sheet } from './sheet';
import { restingLook, type BossFrame, type BossPartId, type PartState } from './types';
import type { World } from '../../game/world';

/**
 * The layer that draws a character boss: her sheet baked once into an atlas when she first comes
 * on screen, thrown away when she is gone for good, and every frame a call to `paintSheet` with
 * what her fight says about her.
 *
 * The fight (`game/characterBoss.ts`) owns every hitbox and every point of wear; this layer only
 * shows it. The states it produces go to her as they are — the atlas pictures are baked for intact,
 * damaged and torn alike — and the renderer degrades to nothing worse than her not being drawn if
 * a shader or an atlas fails, the same way the theme sprites do.
 *
 * Nothing here knows which levels she stands on: the world decides that (see `world.ts`), and once
 * its `character` is not null this layer follows it.
 */

export class BossLayer {
  /** Her sheet, and the atlas it was baked into. Both null while she is not on screen. */
  private sheet: Sheet | null = null;
  private atlas: PictureAtlas | null = null;
  /** The world the last frame was drawn for: re-baking waits for her to actually change. */
  private seen: World | null = null;
  /** Faults swallowed so far, so an automated run can read what a player never sees. */
  faults: unknown[] = [];
  /** True once baking failed on this device: she is left undrawn rather than half drawn. */
  broken = false;

  /**
   * Draws her for this frame, when the world has her and the renderer takes pictures. `frame` is
   * where her fight says she stands; the look is hers, handed over whole.
   */
  draw(
    renderer: { pen: import('../batch').Pen; gl: import('../gl').GL; bossAtlas: WebGLTexture | null },
    world: World,
    frame: BossFrame,
  ): void {
    const boss = world.character;
    if (!boss) {
      this.release(renderer);
      this.seen = null;
      return;
    }
    if (!this.atlas || this.sheet === null || this.seen !== world) {
      this.acquire(renderer, world);
    }
    if (!this.atlas || this.sheet === null) return;
    renderer.bossAtlas = this.atlas.texture;
    paintSheet(renderer.pen, frame, this.sheet, this.atlas, HIYOU_SCALE);
  }

  /** Frees the atlas when she is off screen or the context is going away. */
  release(renderer: { bossAtlas: WebGLTexture | null }): void {
    if (renderer.bossAtlas) renderer.bossAtlas = null;
  }

  /** Bakes her once. A failure here costs her looks and nothing else. */
  private acquire(
    renderer: { pen: import('../batch').Pen; gl: import('../gl').GL; bossAtlas: WebGLTexture | null },
    world: World,
  ): void {
    if (this.broken) return;
    try {
      // One sheet for now: hers, drawn with Canvas 2D. A set of images made for her replaces it
      // with `hiyouFromImages` and nothing else changes.
      this.sheet = HIYOU_SHEET;
      this.atlas = bakeSheet(renderer.gl, this.sheet);
      this.seen = world;
    } catch (error) {
      console.error(error);
      this.faults.push(error);
      this.broken = true;
      this.sheet = null;
      this.atlas = null;
    }
  }
}

/** The look of one part as the fight sees it, which is the shape the renderer reads. */
export type PartLook = { state: PartState; flash: number; dx: number; dy: number };

/** Builds a frame for the layer from what the world's character fight says. */
export function frameOf(world: World): BossFrame {
  const boss = world.character!;
  return {
    x: boss.state.x,
    y: boss.state.y,
    time: boss.swayT,
    face: boss.state.face,
    look: boss.state.look,
  };
}

/** Every part, whole: what she is before the fight touches her. */
export { restingLook };
export type { BossPartId };

import { bakeSheet, paintSheet, type PictureAtlas } from './pictures';
import type { Sheet } from './sheet';
import { restingLook, type BossFrame, type BossPartId, type PartState } from './types';
import type { World } from '../../game/world';

/**
 * The layer that draws a character boss: her sheet baked once into an atlas when she first comes
 * on screen, thrown away when she is gone for good, and every frame a call to `paintSheet` with
 * what her fight says about her.
 *
 * The fight (`game/characterBoss.ts`) owns every hitbox and every point of wear; this layer only
 * shows it. The states it produces go to her as they are, and the renderer degrades to nothing
 * worse than her not being drawn if a shader or an atlas fails, the same way the theme sprites do.
 *
 * Nothing here knows which levels she stands on, nor who she is: the world decides that, and hands
 * over a fight with a character's name on it. Whoever draws a character registers her art under
 * that name — a sheet drawn with Canvas 2D, or one cut from pictures (`boss/vesper`) — and the
 * layer asks for it when she is on screen. Art still on its way draws nothing; the fight does not
 * wait for it.
 */

/** A character as this layer can draw her: her sheet, and how many world units a figure unit of it is. */
export interface BossArt {
  sheet: Sheet;
  scale: number;
}

/** Where a character's art comes from. Null while it is still on its way. */
export type BossArtSource = () => BossArt | null;

/** One character's art, and what was made of it. */
interface Entry {
  source: BossArtSource;
  atlas: PictureAtlas | null;
  /** The world the atlas was baked for: it is baked again when she comes back in another. */
  seen: World | null;
  /** True once baking failed on this device: she is left undrawn rather than half drawn. */
  broken: boolean;
}

interface BossRenderer {
  pen: import('../batch').Pen;
  gl: import('../gl').GL;
  bossAtlas: WebGLTexture | null;
}

export class BossLayer {
  /** Every character anybody has said how to draw, by the name her fight knows her by. */
  private readonly art = new Map<string, Entry>();
  /** Faults swallowed so far, so an automated run can read what a player never sees. */
  faults: unknown[] = [];
  /** The character last asked for, for `status`. */
  private current: Entry | null = null;

  /**
   * Names a character's art. Called once for her, by whoever knows how she is drawn; the source
   * is asked for it on every frame she is on screen, so it may answer null until it is ready.
   */
  register(id: string, source: BossArtSource): void {
    this.art.set(id, { source, atlas: null, seen: null, broken: false });
  }

  /**
   * Draws her for this frame, when the world has her. `frame` is where her fight says she stands;
   * the look is hers, handed over whole.
   */
  draw(renderer: BossRenderer, world: World, frame: BossFrame): void {
    const boss = world.character;
    if (!boss) {
      this.release(renderer);
      return;
    }
    const entry = this.art.get(boss.def.id);
    this.current = entry ? { ...entry, seen: world } : null;
    // Nobody has said how she is drawn: nothing is put up for her.
    if (!entry) return;
    const art = entry.source();
    // Still on its way: she is not drawn this frame, and nothing here waits.
    if (!art) return;
    if (!entry.atlas || entry.seen !== world) this.acquire(renderer, world, entry, art);
    if (!entry.atlas) return;
    renderer.bossAtlas = entry.atlas.texture;
    paintSheet(renderer.pen, frame, art.sheet, entry.atlas, art.scale);
  }

  /**
   * How her art is faring, for an automated run: the character on screen, whether her atlas is
   * baked, and at what density — or that her art has not come, or failed.
   */
  status(): Record<string, unknown> {
    const boss = this.current?.seen?.character;
    const entry = boss ? this.art.get(boss.def.id) : undefined;
    if (!boss || !entry)
      return { character: boss?.def.id ?? null, atlas: false, why: 'nobody has said how she is drawn' };
    const art = entry.source();
    return {
      character: boss.def.id,
      atlas: entry.atlas !== null,
      density: entry.atlas?.scale ?? null,
      pictures: entry.atlas?.pictures.size ?? null,
      broken: entry.broken,
      why: entry.atlas ? null : entry.broken ? 'baking failed' : art ? 'not baked yet' : 'art not loaded',
    };
  }

  /** Frees every atlas while no character is on screen, or as the context is going away. */
  release(renderer: BossRenderer): void {
    if (renderer.bossAtlas) renderer.bossAtlas = null;
    for (const entry of this.art.values()) this.drop(renderer, entry);
  }

  /** Hands an atlas back to the GPU: sixteen megabytes of it are not left lying about between levels. */
  private drop(renderer: BossRenderer, entry: Entry): void {
    if (entry.atlas) renderer.gl.gl.deleteTexture(entry.atlas.texture);
    entry.atlas = null;
    entry.seen = null;
  }

  /** Bakes her once. A failure here costs her looks and nothing else. */
  private acquire(renderer: BossRenderer, world: World, entry: Entry, art: BossArt): void {
    if (entry.broken) return;
    this.drop(renderer, entry);
    try {
      entry.atlas = bakeSheet(renderer.gl, art.sheet);
      entry.seen = world;
    } catch (error) {
      console.error(error);
      this.faults.push(error);
      entry.broken = true;
      entry.atlas = null;
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

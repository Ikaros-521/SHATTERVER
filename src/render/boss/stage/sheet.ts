import type { Placed, Pose, Sheet, SheetLight } from '../sheet';
import { allShots, place, type Box, type Layer, type Shot } from '../sheet';
import type { BossFrame } from '../types';

/**
 * A character shown as one whole picture a stage of her fight: the template.
 *
 * Nothing here is drawn part by part. She is a picture — whole, then worn, then worn worse — and
 * what the fight says about her parts is read only for one thing: how much of her is standing
 * picks the picture. When the picture changes the two are cross-faded, so that she never blinks
 * from one to the next.
 *
 * Whoever cuts the pictures says where each lies (`render/boss/<id>/layout.ts`, written by
 * `tools/boss-cut/stages.py`): in figure units about the middle between her eyes, which is where
 * her hitboxes are measured from too. So a new boss is a folder of pictures and a layout; this
 * page, the fight and the renderer are the same for all of them.
 */

/** One stage's picture, with the light it throws: as `render/boss/<id>/art.ts` hands them over. */
export type StagePicture = readonly [CanvasImageSource, CanvasImageSource | null];

/** What a set of pictures has to say that the pictures cannot. */
export interface StageArt {
  /** Where each picture lies, and where its light lies (null: none). */
  stages: Readonly<Record<number, readonly [Box, Box | null]>>;
  /** The light each picture throws on the field about her: where, how far, how strong. */
  lights?: (stage: number) => readonly SheetLight[];
  /** How far the whole of her drifts from where she stands: she hangs in the air. */
  bob?: (time: number) => number;
  /** Her one motion: a lean, a breath. Left out, only the bob. */
  move?: (frame: BossFrame) => Partial<Pose>;
  /** How much of the white of a hit she takes, 0 to 1. A painting is washed out by all of it. */
  flash?: number;
  /**
   * How much light a change of picture throws on her as the new one settles, 0 to 1: strongest the
   * moment it begins, gone when it has. Left out, a little.
   */
  changeFlash?: number;
}

/** Fetches and decodes every picture of hers; a picture that will not come is left out rather than failing the lot. */
export async function loadStagePictures(
  pictures: readonly (readonly [string, string | null])[],
): Promise<readonly (StagePicture | null)[]> {
  const cache = new Map<string, Promise<HTMLImageElement | null>>();
  const one = (url: string): Promise<HTMLImageElement | null> => {
    let pending = cache.get(url);
    if (!pending) {
      pending = new Promise((resolve) => {
        const image = new Image();
        image.src = url;
        image.decode().then(
          () => resolve(image),
          () => resolve(null),
        );
      });
      cache.set(url, pending);
    }
    return pending;
  };
  return Promise.all(
    pictures.map(async ([picture, light]) => {
      const image = await one(picture);
      if (!image) return null;
      return [image, light ? await one(light) : null] as const;
    }),
  );
}

/** The picture of a stage: her, in its box. */
function pictureOf(stage: number, image: CanvasImageSource, box: Box): Shot {
  const [x0, y0] = box;
  return {
    id: `stage-${stage}`,
    variant: String(stage),
    box,
    paint: (ctx) => ctx.drawImage(image, x0, y0, box[2] - x0, box[3] - y0),
  };
}

/** Her light under a stage of her, as its own picture. */
function lightOf(stage: number, image: CanvasImageSource, box: Box): Shot {
  const [x0, y0] = box;
  return {
    id: `light-${stage}`,
    variant: String(stage),
    box,
    paint: (ctx) => ctx.drawImage(image, x0, y0, box[2] - x0, box[3] - y0),
  };
}

/**
 * How much of picture `stage` is showing: all of it while it is the picture of the moment; during
 * a change of picture, the one before thins from 1 to 0 as the new one settles from 0 to 1.
 */
export function shareOf(frame: BossFrame, stage: number): number {
  const at = frame.stage ?? 0;
  const mix = mixOf(frame);
  if (stage === at) return mix;
  // A change under way: the picture before is still up, going out.
  return stage === at - 1 && mix < 1 ? 1 - mix : 0;
}

/**
 * How far the picture showing has settled, 0 to 1. The first picture has none before it to be
 * coming after: it is settled from its first frame, whatever a fight says of it.
 */
export function mixOf(frame: BossFrame): number {
  const at = frame.stage ?? 0;
  return at === 0 ? 1 : (frame.stageMix ?? 1);
}

/** The pictures showing this frame: the one of the moment, and the one going out if a change is under way. */
function showing(frame: BossFrame): readonly number[] {
  const at = frame.stage ?? 0;
  return mixOf(frame) < 1 && at > 0 ? [at - 1, at] : [at];
}

/** How a light flickers: never quite still, never quite out. */
const flicker = (time: number): number =>
  0.82 + 0.18 * Math.sin(time * 6.1) * (0.6 + 0.4 * Math.sin(time * 2.3));

/**
 * Her sheet: a layer a picture, each showing only while it is the picture of the moment or the
 * one it is fading out of. Null where a picture is missing — she is then not drawn at all rather
 * than drawn without a stage.
 */
export function stageSheet(
  id: string,
  pictures: readonly (StagePicture | null)[],
  art: StageArt,
): Sheet | null {
  const layers: Layer[] = [];
  const count = Object.keys(art.stages).length;
  for (let stage = 0; stage < count; stage++) {
    const entry = Object.values(art.stages)[stage];
    const picture = pictures[stage];
    if (!picture || !picture[0] || !entry) return null;
    const [box, lightBox] = entry;
    const sway = art.move;
    const light = picture[1] && lightBox ? lightOf(stage, picture[1], lightBox) : null;
    if (light)
      layers.push({
        id: `light-${stage}`,
        part: null,
        group: `light-${stage}`,
        variants: 'whole',
        shots: [light],
        show: (frame) => (showing(frame).includes(stage) ? light : null),
        // It flickers, as a light does; and it comes and goes with its picture.
        move: (frame) => ({ ...(sway?.(frame) ?? {}), alpha: flicker(frame.time) * shareOf(frame, stage) }),
      });
    const shot = pictureOf(stage, picture[0], box);
    layers.push({
      id: `stage-${stage}`,
      part: null,
      group: `stage-${stage}`,
      variants: 'whole',
      shots: [shot],
      show: (frame) => (showing(frame).includes(stage) ? shot : null),
      // Fading out, or coming in: the picture before the new one thins as the new one settles.
      move: (frame) => ({ ...(sway?.(frame) ?? {}), alpha: shareOf(frame, stage) }),
      // How much of the white of a hit she takes is the artist's say; and it is the worst of what
      // her parts took, for the picture is the whole of her. A change of picture is its own flash —
      // a breath of light as the new one settles — and is added to that.
      flash: art.flash,
      flashOf,
      // A change of picture is its own light, and no blow's share is taken off it.
      glowOf: (frame) => (1 - mixOf(frame)) ** 2 * (art.changeFlash ?? 0.35),
    });
  }
  return {
    id,
    layers,
    faces: ['idle'],
    bob: art.bob ?? (() => 0),
    lights: (frame) => art.lights?.(frame.stage ?? 0) ?? [],
  };
}

/** The white of a hit on her, read off her parts: the worst of them is what shows. */
function flashOf(frame: BossFrame): number {
  let worst = 0;
  for (const look of Object.values(frame.look)) worst = Math.max(worst, look.flash);
  return worst;
}

/** Everything a sheet of stages puts down this frame — for a test to look at. */
export function placed(sheet: Sheet, frame: BossFrame): Placed[] {
  return place(sheet, frame, []);
}

export { allShots };

import { ARENA_W } from './config';
import { VESPER_DISCS, VESPER_STAGES } from '../render/boss/vesper/layout';
import type { CharacterDef, CharacterPart, DiscAt } from './character';

/**
 * 星炉占星师·薇斯珀 as the fight sees her: the second character to stand on a boss sector, and the
 * first shown as one whole picture a stage of her fight rather than drawn part by part.
 *
 * The fight is the same fight as 绯樱's — regions of her the ball can hit, each with a durability,
 * worn through as they are struck — but here the regions are the broad parts of one drawing (her
 * head with its hat, her body, her skirt, and what hangs to either side of her), laid over her by
 * `tools/boss-cut/stages.py`, and what the player sees is the picture changing whole as she is
 * worn down: whole, then torn, then torn worse.
 *
 * Numbers are first guesses, to be tuned by play.
 */

/** The regions of her a ball can strike, with how tough each is and how much of her it is. */
const REGION: Record<string, { defense: number; hp: number; weight: number; order: number }> = {
  // Her head under its hat: small, high, and the mark of a good aim.
  head: { defense: 0.1, hp: 150, weight: 0.16, order: 3 },
  // Her body: where most balls land.
  body: { defense: 0.2, hp: 240, weight: 0.3, order: 2 },
  // Her skirt: the broadest target, behind everything.
  skirt: { defense: 0.3, hp: 300, weight: 0.34, order: 0 },
  'side.L': { defense: 0.25, hp: 110, weight: 0.1, order: 1 },
  'side.R': { defense: 0.25, hp: 110, weight: 0.1, order: 1 },
};

/** The last of her pictures: what is still drawn there is not gone from her. */
const LAST = Math.max(...Object.keys(VESPER_STAGES).map(Number));

/** Every hitbox the cut laid over her, gathered by the region it belongs to. */
function partsOf(): CharacterPart[] {
  const byRegion = new Map<string, DiscAt[]>();
  for (const [region, fx, fy, radius, live] of VESPER_DISCS) {
    const list = byRegion.get(region) ?? [];
    // Gone from the first picture it is not drawn in — unless that is the last, where the drawing
    // simply runs out; what is there at the end is there throughout.
    const goneAt = live.length === 0 ? 0 : live[live.length - 1] === LAST ? null : live[live.length - 1] + 1;
    list.push({ fx, fy, radius, goneAt });
    byRegion.set(region, list);
  }
  return Object.entries(REGION).map(([id, tune]) => ({
    id,
    discs: byRegion.get(id) ?? [],
    ...tune,
  }));
}

export const VESPER: CharacterDef = {
  id: 'vesper',
  name: '星炉占星师·薇斯珀',
  parts: partsOf(),
  // No shield and no core she is guarding: she is one drawing, worn all over.
  core: null,
  shield: null,
  // Six pictures: each gives way at a share of how much of her is standing, the last when nothing is.
  stages: { until: [0.84, 0.68, 0.5, 0.32, 0.16] },
  // Figure units are measured off the pictures with her eyes 20 apart. Hers is a half-length
  // drawing and hangs close: about 470 world units across, her hat's tip clear of the HUD and
  // her skirt fading out well above the field.
  figure: 1.9,
  x: ARENA_W / 2,
  y: 290,
  swayX: 26,
  swayRate: 0.8,
  bobY: 5,
  bobRate: 1.3,
  tilt: 0.012,
  attackCd: [3.0, 2.6, 2.2, 1.8],
  attacks: [
    // From the side her lamp hangs on, twice; a molten orb that bursts; and stars from her hat.
    { kind: 'volley', from: ['side.R'], shots: 2, scatter: 0, scatterLate: 0 },
    { kind: 'orb', from: ['side.L', 'body'], shots: 1, scatter: 8, scatterLate: 10 },
    { kind: 'volley', from: ['side.R'], shots: 2, scatter: 0, scatterLate: 0 },
    { kind: 'rain', from: ['head'], shots: 6, scatter: 0, scatterLate: 0 },
  ],
  color: 0xffb347,
  reforge: { every: 11, late: 7, row: 18, count: 4 },
};

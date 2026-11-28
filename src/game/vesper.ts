import { ARENA_W } from './config';
import { VESPER_DISCS } from '../render/boss/vesper/layout';
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
 */

/**
 * The regions of her a ball can strike, with how tough each is and how much of her it is.
 *
 * A part wears by the blow, not by the damage (`characterBoss.ts`), so `hp` is blows: multiball
 * wears her down faster, a heavier ball only scores more. Her weight follows her durability — a
 * blow costs her the same share of her figure wherever it lands — so the gauge moves with the
 * blows and the pictures change evenly, however the player aims. Her head and body are reached
 * around her skirt, and no faster than it wears: they are worn about as the skirt is, and what is
 * left of her after it does not take long.
 */
const REGION: Record<string, { defense: number; hp: number; weight: number; order: number }> = {
  // Her head under its hat: small, high, and the mark of a good aim.
  head: { defense: 0.1, hp: 36, weight: 0.145, order: 3 },
  // Her body: where the ball lands once the skirt has gone.
  body: { defense: 0.2, hp: 42, weight: 0.17, order: 2 },
  // Her skirt: the broadest target, behind everything — most of the fight.
  skirt: { defense: 0.3, hp: 120, weight: 0.485, order: 0 },
  // What hangs at her sides: the cauldron to her left, the lamp to her right. Small, drawn by
  // some pictures only, and the last of her: a few blows each, for a boss whose last act was
  // chasing them took longer than the rest of the fight together.
  'side.L': { defense: 0.25, hp: 9, weight: 0.1, order: 1 },
  'side.R': { defense: 0.25, hp: 9, weight: 0.1, order: 1 },
};

/** Every hitbox the cut laid over her, gathered by the region it belongs to. */
function partsOf(): CharacterPart[] {
  const byRegion = new Map<string, DiscAt[]>();
  for (const [region, fx, fy, radius, live] of VESPER_DISCS) {
    const list = byRegion.get(region) ?? [];
    // Solid where a picture draws it and nowhere else: the cut says which pictures those are.
    list.push({ fx, fy, radius, live });
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
  // Her phases fall where her later pictures change — the third picture is her second phase, the
  // fourth her third — and her last opens just before the sixth, once no more than 0.22 of her
  // stands: her figure all but gone, and what hangs at her sides left. Cut on parts torn off
  // whole instead, five broad regions kept her in her second phase until the final blow.
  phases: [0.5, 0.32, 0.22],
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
    // From the side her lamp hangs on, twice; a molten orb from the cauldron's side; and stars
    // shaken from her hat. None of them burst: her one burst is the lamp volley kept for the last
    // phase. She throws from a part while it stands, whether the picture showing draws it or not,
    // so the lamp fires through the pictures that do not hang it out. A non-circular projectile is
    // a `visual` the renderer paints (`render/scene.ts`).
    { kind: 'volley', from: ['side.R'], shots: 2 },
    { kind: 'orb', from: ['side.L', 'body'] },
    { kind: 'volley', from: ['side.R'], shots: 2 },
    { kind: 'rain', from: ['head'], shots: 6, shot: { radius: 8, visual: 'star' } },
    // Her last stand, thrown the moment the fourth phase opens and never again: the lamp empties
    // itself in one wide burst. It needs the lamp: smash that before she is nearly out and there
    // is nothing left to empty.
    { kind: 'volley', from: ['side.R'], shots: 8, phase: 4, once: true },
  ],
  color: 0xffb347,
  reforge: { every: 11, late: 7, row: 18, count: 4 },
};

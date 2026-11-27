import { ARENA_W } from './config';
import type { CharacterDef } from './character';

/**
 * 星炉占星师·薇斯珀 as the fight sees her: the second character to stand on a boss sector, and the
 * first who is no mecha. She is a stargazer out of one illustration, cut into her parts — hat,
 * lantern, cauldron, sleeves, hair, gown and head — and each part is what the ball can hit.
 *
 * Her core is the star stuff her cauldron holds. While the cauldron stands it is behind iron; tear
 * the cauldron off, or bring her to her third phase, and the star is bare. What is torn from her
 * does not vanish: it stays as a shape of starlight (the renderer's business), which is how a
 * person comes apart on a brick-breaker's field without anyone being hurt.
 *
 * She also has a hand on the field itself: every so often she pours fresh bricks into a row of it.
 * Numbers are first guesses, to be tuned by play.
 */
export const VESPER: CharacterDef = {
  id: 'vesper',
  name: '星炉占星师·薇斯珀',
  parts: [
    // The hat: its brim is wide, so a disc a side of it and one for the crown.
    {
      id: 'hat',
      discs: [
        { fx: -68, fy: -37, radius: 24 },
        { fx: 69.5, fy: -54.5, radius: 37 },
        { fx: -4, fy: -105, radius: 24 },
      ],
      defense: 0.15,
      hp: 27,
      order: 3,
      weight: 0.14,
    },
    // The cauldron, and the star it holds.
    {
      id: 'cauldron',
      discs: [{ fx: -133, fy: 38, radius: 35 }],
      defense: 0.3,
      hp: 30,
      order: 4,
      weight: 0.12,
    },
    { id: 'core', discs: [{ fx: -129, fy: 46, radius: 14 }], defense: 0.4, hp: 42, order: 5, weight: 0.1 },
    // The lamp, and the staff it hangs from.
    {
      id: 'lantern',
      discs: [
        { fx: 147, fy: 50.5, radius: 21 },
        { fx: 117, fy: 28, radius: 12 },
      ],
      defense: 0.2,
      hp: 24,
      order: 4,
      weight: 0.1,
    },
    // The sleeves, a disc at the shoulder, one at the elbow and one at the tip.
    {
      id: 'sleeve.L',
      discs: [
        { fx: -78, fy: 113, radius: 32 },
        { fx: -108, fy: 238, radius: 27 },
        { fx: -123, fy: 313, radius: 15 },
      ],
      defense: 0.25,
      hp: 24,
      order: 2,
      weight: 0.09,
    },
    {
      id: 'sleeve.R',
      discs: [
        { fx: 74.5, fy: 113, radius: 32 },
        { fx: 104.5, fy: 238, radius: 27 },
        { fx: 127, fy: 313, radius: 15 },
      ],
      defense: 0.25,
      hp: 24,
      order: 2,
      weight: 0.09,
    },
    // The hair that spreads out behind her.
    {
      id: 'hair.L',
      discs: [
        { fx: -125.5, fy: 150.5, radius: 35 },
        { fx: -145.5, fy: 200.5, radius: 22 },
      ],
      defense: 0.1,
      hp: 18,
      order: 1,
      weight: 0.07,
    },
    {
      id: 'hair.R',
      discs: [
        { fx: 147, fy: 138, radius: 32 },
        { fx: 162, fy: 188, radius: 18 },
      ],
      defense: 0.1,
      hp: 18,
      order: 1,
      weight: 0.07,
    },
    // The gown: broadest at the hem, behind everything of hers.
    {
      id: 'robe',
      discs: [
        { fx: 4.5, fy: 63, radius: 37 },
        { fx: -0.5, fy: 213, radius: 47 },
        { fx: -68, fy: 376, radius: 45 },
        { fx: 67, fy: 376, radius: 45 },
        { fx: -0.5, fy: 403, radius: 45 },
      ],
      defense: 0.3,
      hp: 36,
      order: 0,
      weight: 0.14,
    },
    // The head, small and high under the brim.
    { id: 'head', discs: [{ fx: 7, fy: -27, radius: 24 }], defense: 0.1, hp: 18, order: 3, weight: 0.08 },
  ],
  core: 'core',
  shield: 'cauldron',
  // Four source pixels to a figure unit, and 0.8 world units to a figure unit: she stands about
  // 470 world units from the tip of her hat to her hem, under the HUD and above the field.
  figure: 0.8,
  x: ARENA_W / 2,
  y: 200,
  swayX: 30,
  swayRate: 0.8,
  bobY: 6,
  bobRate: 1.3,
  tilt: 0.012,
  attackCd: [3.0, 2.6, 2.2, 1.8],
  attacks: [
    // Her lamp fires at the paddle, twice; her cauldron (or the bare star, once the cauldron is
    // gone) lobs a molten orb that bursts; and she shakes a rain of stars from her hat.
    { kind: 'volley', from: ['lantern'], shots: 2, scatter: 0, scatterLate: 0 },
    { kind: 'orb', from: ['cauldron', 'core'], shots: 1, scatter: 8, scatterLate: 10 },
    { kind: 'volley', from: ['lantern'], shots: 2, scatter: 0, scatterLate: 0 },
    { kind: 'rain', from: ['hat'], shots: 6, scatter: 0, scatterLate: 0 },
  ],
  color: 0xffb347,
  reforge: { every: 11, late: 7, row: 18, count: 4 },
};

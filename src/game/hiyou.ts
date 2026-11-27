import { CORE_LIGHT } from '../render/boss/hiyou/draw/body';
import { HIYOU_SCALE } from '../render/boss/hiyou/draw/pieces';
import type { BossPartId } from '../render/boss/types';
import { ARENA_W } from './config';
import type { CharacterDef, CharacterPart } from './character';

/**
 * 樱之誓约·绯樱 as the fight sees her: a list of parts, each a disc the balls can hit, hung at a
 * fixed place on her figure — the one shape the simulation, the drawing and (one day) a set of
 * images all agree on.
 *
 * She is not made of bricks. Her parts live beside the brick list: the ball sweep takes them where
 * it takes the bricks, but damage, states, phases and what she says are hers, not the lattice's.
 * Nothing here knows how she is drawn — the renderer turns the same part states the fight produces
 * into a frame for whatever sheet she is made of. How a fight reads a page like this is
 * `character.ts`; the fight itself is `characterBoss.ts`.
 */

/** Figure units to world units: the same conversion the drawing uses, so parts sit on the picture. */
export const FIGURE = HIYOU_SCALE;

/** Where she stands: the anchor (top of the breastbone) rides at this x, this far down. */
export const HIYOU_X = ARENA_W / 2;
export const HIYOU_Y = 300;

/** One of her parts, hung at one place: the ten are each a single disc. */
export interface BossPart {
  id: BossPartId;
  /** Where the disc's middle lies on her figure, in figure units, about the anchor. */
  fx: number;
  fy: number;
  /** The disc's radius, in figure units. */
  radius: number;
  /** How much of every hit the armour turns away. */
  defense: number;
  /** The blows of the standard power it takes, before defence, to be worn through. */
  hp: number;
  /** Where in the drawing order it sits: what a ball hits first when discs overlap. */
  order: number;
}

/** The ten parts, with where they lie and how tough they are. Sizes in figure units. */
export const HIYOU_PARTS: readonly BossPart[] = [
  // The wings: a broad disc a side, over where the blades spread.
  { id: 'LeftWing', fx: -150, fy: -95, radius: 62, defense: 0.2, hp: 30, order: 0 },
  { id: 'RightWing', fx: 150, fy: -95, radius: 62, defense: 0.2, hp: 30, order: 0 },
  // The pauldrons, over the shoulder plates.
  { id: 'LeftShoulder', fx: -69, fy: -103, radius: 30, defense: 0.35, hp: 24, order: 1 },
  { id: 'RightShoulder', fx: 69, fy: -103, radius: 30, defense: 0.35, hp: 24, order: 1 },
  // The arms, hanging below the pauldrons.
  { id: 'LeftArm', fx: -72, fy: -25, radius: 22, defense: 0.25, hp: 20, order: 1 },
  { id: 'RightArm', fx: 72, fy: -25, radius: 22, defense: 0.25, hp: 20, order: 1 },
  // The head, small and high: hitting it is the mark of a good aim.
  { id: 'Head', fx: 0, fy: -176, radius: 34, defense: 0.1, hp: 18, order: 2 },
  // The body: the broadest target, behind everything.
  { id: 'Body', fx: 0, fy: -60, radius: 56, defense: 0.3, hp: 36, order: 0 },
  // The shield over the core, and the core itself, last of all.
  { id: 'CoreShield', fx: 0, fy: -70, radius: 34, defense: 0.5, hp: 40, order: 3 },
  { id: 'Core', fx: 0, fy: -70, radius: 16, defense: 0.4, hp: 50, order: 4 },
];

/** How much of the whole she is, each part: phases are cut on the share of parts still standing. */
export const PART_WEIGHT: Record<BossPartId, number> = {
  LeftWing: 0.09,
  RightWing: 0.09,
  LeftShoulder: 0.08,
  RightShoulder: 0.08,
  LeftArm: 0.07,
  RightArm: 0.07,
  Head: 0.08,
  Body: 0.2,
  CoreShield: 0.14,
  Core: 0.1,
};

/** The parts, in the order a ball meets them: the ones on top of the others first. */
export const HIT_ORDER: readonly BossPart[] = [...HIYOU_PARTS].sort((a, b) => b.order - a.order);

/** She as a fight reads her. */
export const HIYOU: CharacterDef = {
  id: 'hiyou',
  name: '樱之誓约·绯樱',
  parts: HIYOU_PARTS.map((part): CharacterPart => ({
    id: part.id,
    discs: [{ fx: part.fx, fy: part.fy, radius: part.radius }],
    defense: part.defense,
    hp: part.hp,
    weight: PART_WEIGHT[part.id]!,
    order: part.order,
  })),
  core: 'Core',
  shield: 'CoreShield',
  figure: FIGURE,
  x: HIYOU_X,
  y: HIYOU_Y,
  swayX: 36,
  swayRate: 0.9,
  bobY: 5,
  bobRate: 1.7,
  tilt: 0.025,
  // She gets quicker on her feet as she loses parts.
  attackCd: [2.7, 2.3, 1.9, 1.5],
  // Her wings volley, and her core's heavy orb bursts into scatter shots — wider late.
  attacks: [
    { kind: 'volley', from: ['LeftWing', 'RightWing'], shots: 2, scatter: 0, scatterLate: 0 },
    { kind: 'orb', from: ['Core'], shots: 1, scatter: 8, scatterLate: 10 },
  ],
  color: 0xff5fd8,
  reforge: null,
};

/** The blows a state of one of her parts takes. */
export const hitsPerState = (part: BossPart): number => Math.max(1, Math.round(part.hp / 3));

/** Where her core's light falls, in figure units about the anchor: the same light the drawing throws. */
export const CORE_AT = { x: 0, y: -70 - 6 };
export const CORE_LIGHT_REACH = CORE_LIGHT.reach;

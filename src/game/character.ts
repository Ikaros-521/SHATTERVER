import type { BossPartId, FaceId, PartState } from '../render/boss/types';

/**
 * A character boss as a fight: what she is made of, where it hangs on her, how she moves and what
 * she throws. One definition to a character (`hiyou.ts`, `vesper.ts`); the fight
 * (`characterBoss.ts`) reads a definition and knows nothing else about who she is — so a second
 * boss is a second page of numbers, not a second fight.
 *
 * Sizes are in figure units: the same units her pictures are laid out in, turned into world units
 * by `figure`. Nothing here knows how she is drawn.
 */

/** One hittable disc of a part: where it lies on her figure, about her anchor. */
export interface DiscAt {
  fx: number;
  fy: number;
  /** The disc's radius, in figure units. */
  radius: number;
}

export interface CharacterPart {
  id: BossPartId;
  /** Her discs of the part. A wide thing — a hat's brim, a gown's hem — is more than one. */
  discs: readonly DiscAt[];
  /** How much of every hit the armour turns away. */
  defense: number;
  /** The blows of the standard power it takes, before defence, to be worn through. */
  hp: number;
  /** How much of the whole she is: phases are cut on the share of her still standing. */
  weight: number;
  /** Where in the drawing order it sits: what a ball hits first when discs overlap. */
  order: number;
}

/** One of her attacks. */
export interface CharacterAttack {
  /** A volley fires from every part it names; an orb and a rain from the first of them standing. */
  kind: 'volley' | 'orb' | 'rain';
  /** The parts it comes from. */
  from: readonly BossPartId[];
  /** Shots a volley fires from each part; stars a rain lets fall. */
  shots: number;
  /** What an orb bursts into, early in the fight and from the third phase on. */
  scatter: number;
  scatterLate: number;
}

export interface CharacterDef {
  /** What the fight, the renderer and the dictionary know her by. */
  id: string;
  /** Her name as the run's records keep it. */
  name: string;
  parts: readonly CharacterPart[];
  /** The part deep in her that the shield guards, and the shield. Null where she has neither. */
  core: BossPartId | null;
  shield: BossPartId | null;
  /** Figure units to world units: the same conversion her drawing uses, so parts sit on the picture. */
  figure: number;
  /** Where her anchor stands, in world units. */
  x: number;
  y: number;
  /** How far she sways and bobs about it, and how fast; and how far she leans with the sway. */
  swayX: number;
  swayRate: number;
  bobY: number;
  bobRate: number;
  tilt: number;
  /** Seconds between her attacks, by phase. */
  attackCd: readonly number[];
  /** Her attacks, in the order she makes them, round and round. */
  attacks: readonly CharacterAttack[];
  /** 0xRRGGBB: the colour of her, for what her fight leaves on the field. */
  color: number;
  /** Her hold over the brick field: every so many seconds she pours bricks into a row of it. */
  reforge: { every: number; late: number; row: number; count: number } | null;
}

/** A disc of hers at one moment, in world units: what the sweep and the renderer both read. The id is the part's for the renderer, and a negative number for the ball sweep, which keys by brick id. */
export interface BossDisc {
  id: BossPartId;
  /** The disc as a sweep key: negative, and so never a brick's id. */
  key: number;
  x: number;
  y: number;
  radius: number;
  state: PartState;
  defense: number;
}

/** What the fight says about her at one moment — the whole contract with the renderer. */
export interface CharacterBossState {
  /** Where her anchor stands, in world units. */
  x: number;
  y: number;
  /** Which of her expressions the moment calls for. */
  face: FaceId;
  /** How each part is, one entry a part. */
  look: Record<BossPartId, PartLookState>;
  /** The phase 1..4. */
  phase: number;
  /** The shield is up while this is true: the core cannot be hurt. */
  shielded: boolean;
  /** 0..1, how much of her is still standing, by the parts' weights. */
  integrity: number;
  /** The line waiting to be said, if this is the moment for one. */
  line: string | null;
  /** Set once when the fight is over: she has no parts left. */
  defeated: boolean;
}

export interface PartLookState {
  state: PartState;
  /** 0..1, the white of a hit, fading. */
  flash: number;
  /** How far the last hit knocked the part, in figure units; the stepper eases it home. */
  dx: number;
  dy: number;
}

/** The states of a part, worn through in order. */
export const WEAR: readonly PartState[] = ['intact', 'damaged_1', 'damaged_2'];

/** Blows of the standard power it takes to go from one state of a part to the next. */
export const hitsPerState = (part: CharacterPart): number => Math.max(1, Math.round(part.hp / 3));

/** The parts, in the order a ball meets them: the ones on top of the others first. */
export function hitOrder(def: CharacterDef): readonly CharacterPart[] {
  return [...def.parts].sort((a, b) => b.order - a.order);
}

/**
 * Where every part that still stands sits when she leans by `tilt`: her discs are hung on the
 * figure in figure units and read in world units, so the anchor and the lean carry them along.
 * A part that is torn off is not there: no ball sweeps it, and nothing draws it.
 */
export function discsOf(
  def: CharacterDef,
  look: Record<BossPartId, PartLookState>,
  anchor: { x: number; y: number },
  tilt: number,
): BossDisc[] {
  const c = Math.cos(tilt);
  const s = Math.sin(tilt);
  const out: BossDisc[] = [];
  let at = 0;
  for (const part of hitOrder(def)) {
    const state = look[part.id]?.state;
    for (const disc of part.discs) {
      // The key is the disc's place among all of hers, standing or not, so that it never changes.
      const key = -1 - at++;
      if (state === undefined || state === 'destroyed') continue;
      const fx = disc.fx + look[part.id].dx;
      const fy = disc.fy + look[part.id].dy;
      out.push({
        id: part.id,
        key,
        x: anchor.x + (c * fx - s * fy) * def.figure,
        y: anchor.y + (s * fx + c * fy) * def.figure,
        radius: disc.radius * def.figure,
        state,
        defense: part.defense,
      });
    }
  }
  return out;
}

/** How much of her is standing, by her parts' weights: a part half broken has not lost its whole weight. */
export function integrityOf(def: CharacterDef, look: Record<BossPartId, PartLookState>): number {
  let whole = 0;
  for (const part of def.parts) {
    const state = look[part.id]?.state;
    whole +=
      part.weight *
      (state === undefined
        ? 0
        : state === 'intact'
          ? 1
          : state === 'damaged_1'
            ? 0.66
            : state === 'damaged_2'
              ? 0.33
              : 0);
  }
  return whole;
}

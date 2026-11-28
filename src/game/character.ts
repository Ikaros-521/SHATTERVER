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
  /**
   * The pictures, where she is shown one a stage, that draw this disc — it is solid in those and
   * in no other. A cauldron is hit where the cauldron is drawn, a lamp only from the picture
   * that hangs it out, and where a picture leaves the place out the ball flies through. Left
   * out where she is drawn part by part: there throughout.
   */
  live?: readonly number[];
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

// An attack is a table entry of the shot module: where from, a pattern, and what the projectile
// is. It is defined there (`bossShots.ts`) with the patterns that throw it, and re-exported here
// because her definition is read together with it.
import type { CharacterAttack, ShotSpec } from './bossShots';

export type { CharacterAttack, ShotSpec };

export interface CharacterDef {
  /** What the fight, the renderer and the dictionary know her by. */
  id: string;
  /** Her name as the run's records keep it. */
  name: string;
  parts: readonly CharacterPart[];
  /**
   * How she is shown, where she is not drawn part by part but as one whole picture a stage of the
   * fight (`render/boss/stage`): which of her parts being still on their feet means which picture.
   * The fight is the same either way — parts, wear, phases — only the picture changes whole.
   * `until[i]` is the share of her integrity at which picture `i` gives way to picture `i + 1`.
   */
  stages?: { until: readonly number[] };
  /**
   * Where her second, third and fourth phases are cut, as shares of how much of her is standing —
   * the gauge the player watches, blows inside a state counted. Left out: cut on how much of her
   * has been torn off whole, which wants a boss of many small parts (a boss of five broad regions
   * would sit three-quarters broken in her second phase).
   */
  phases?: readonly [number, number, number];
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

/**
 * A disc of hers at one moment, in world units: what the sweep and the renderer both read. The id is the part's for the renderer, and a negative number for the ball sweep, which keys by brick id.
 */
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
  /**
   * Which picture of her shows, where she is shown a picture a stage: 0 whole, the last one
   * finished. Null where she is drawn part by part. See `CharacterDef.stages`.
   */
  stage: number | null;
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
  stage: number | null = null,
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
      // Not drawn in the picture showing: not there to be hit, though its part still stands.
      if (disc.live && stage !== null && !disc.live.includes(stage)) continue;
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

/**
 * Which picture of her shows at an integrity: the first picture whose `until` she has not come down
 * to. Nothing where she is not shown in pictures. Each threshold is the integrity at which its
 * picture gives way — reached is enough — and they fall, so 1 is whole and the last picture has none.
 */
export function stageOf(def: CharacterDef, integrity: number): number | null {
  const until = def.stages?.until;
  if (!until) return null;
  let stage = 0;
  // A hair under the threshold counts as reaching it: an integrity of 0.84 arrived at by sums of
  // weights is not always the 0.84 written down.
  for (const share of until) if (integrity <= share + 1e-9) stage++;
  return stage;
}

/**
 * How much of her is standing, by her parts' weights — and, with `wear` given, by how beaten each
 * standing part is inside its state: a third of a part's blows is a third of its weight gone, so
 * that her gauge falls with every blow instead of in steps when a part changes state. Without
 * `wear` it is the step function the pictures were cut against.
 */
export function integrityOf(
  def: CharacterDef,
  look: Record<BossPartId, PartLookState>,
  wear?: Record<BossPartId, number>,
): number {
  let whole = 0;
  for (const part of def.parts) {
    const state = look[part.id]?.state;
    if (state === undefined) continue;
    let share: number;
    if (state === 'destroyed') share = 0;
    else {
      const step = state === 'intact' ? 0 : state === 'damaged_1' ? 1 : 2;
      share = 1 - step / 3;
      if (wear) {
        const blows = hitsPerState(part);
        share -= Math.min(1 / 3, (wear[part.id] ?? 0) / (blows * 3));
      }
    }
    whole += part.weight * Math.max(0, share);
  }
  return whole;
}

/**
 * What a character boss looks like right now, as her painters see it. Presentation only: the
 * simulation owns every hitbox and every point of durability, and nothing here is ever written
 * back to it.
 */

/** The parts a character boss is made of. The names are the design document's. */
export type BossPartId =
  | 'Head'
  | 'Body'
  | 'LeftShoulder'
  | 'RightShoulder'
  | 'LeftWing'
  | 'RightWing'
  | 'LeftArm'
  | 'RightArm'
  | 'CoreShield'
  | 'Core';

/**
 * How far gone a part is. The moment it tears loose and the skeleton it leaves behind are the
 * boss layer's own business (it animates the debris); painters see these four.
 */
export type PartState = 'intact' | 'damaged_1' | 'damaged_2' | 'destroyed';

/** One part as it is drawn this frame. */
export interface PartLook {
  state: PartState;
  /** 0..1: the white of a fresh hit, easing back to 0. */
  flash: number;
  /** How far the last hit knocked it, in figure units; eases back to 0. */
  dx: number;
  dy: number;
}

export type FaceId = 'idle' | 'smug' | 'surprised' | 'angry' | 'hurt' | 'awakened' | 'defeated';

/** Every part, in the order the design document lists them. */
export const BOSS_PARTS: readonly BossPartId[] = [
  'Head',
  'Body',
  'LeftShoulder',
  'RightShoulder',
  'LeftWing',
  'RightWing',
  'LeftArm',
  'RightArm',
  'CoreShield',
  'Core',
];

/** A character boss placed in the world for one frame. */
export interface BossFrame {
  /** World position of the figure's anchor: the top of the breastbone. */
  x: number;
  y: number;
  /** The boss layer's own clock. It stops when the game stops. */
  time: number;
  face: FaceId;
  look: Record<BossPartId, PartLook>;
}

/** Every part intact and at rest. */
export function restingLook(): Record<BossPartId, PartLook> {
  const look = {} as Record<BossPartId, PartLook>;
  for (const id of BOSS_PARTS) look[id] = { state: 'intact', flash: 0, dx: 0, dy: 0 };
  return look;
}

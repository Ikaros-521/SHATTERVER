import {
  discsOf,
  HIT_ORDER,
  HIYOU_PARTS,
  HIYOU_X,
  HIYOU_Y,
  hitsPerState,
  PART_WEIGHT,
  WEAR,
  type BossDisc,
  type CharacterBossState,
  type PartLookState,
} from './hiyou';
import { restingLook } from '../render/boss/types';
import type { BossPartId } from '../render/boss/types';

/** What she says, as moments: the words are the i18n's. */
export type LineMoment = 'intro' | 'phase2' | 'phase3' | 'phase4' | 'partDown' | 'defeated';

/**
 * 樱之誓约·绯樱 as a fight: her state machine, all of it plain data + logic.
 *
 * Ten parts, each a disc that wears through three states and then falls off. She has four phases,
 * cut on how much of her is standing; at the third her shield comes down for good, and at the last
 * she will not be talked to any more. What she says is handed to the world as an event: the fight
 * knows *when*, the words are somebody else's.
 *
 * Headless-testable: no rendering, no clock but the one the world gives her.
 */

/** The state a part starts in. */

/** How long the white of a hit takes to fade. */
const FLASH_TIME = 0.24;
/** How far a hit knocks the part it struck, in figure units, and how fast it goes home. */
const KNOCK = 4;
const KNOCK_HOME = 9;

export interface CharacterBoss {
  state: CharacterBossState;
  /** Hits taken per part, against its `hp`, since its last state change. */
  wear: Record<BossPartId, number>;
  tilt: number;
  swayT: number;
  /** Seconds since her last line, so that two moments do not talk over each other. */
  quietFor: number;
  /** The line waiting to be said, if any. */
  pendingLine: LineMoment | null;
  /** Seconds until her next attack. Ticks only while the fight runs. */
  attackCd: number;
  /** Which attack comes next: wings volley and core orb alternate. */
  attackPattern: 0 | 1;
}

/** Starts her, whole, at the top of the arena. */
export function startCharacterBoss(): CharacterBoss {
  const look = {} as Record<BossPartId, PartLookState>;
  const wear = {} as Record<BossPartId, number>;
  for (const part of HIYOU_PARTS) {
    look[part.id] = { state: 'intact', flash: 0, dx: 0, dy: 0 };
    wear[part.id] = 0;
  }
  return {
    state: {
      x: HIYOU_X,
      y: HIYOU_Y,
      face: 'idle',
      look,
      phase: 1,
      shielded: true,
      integrity: 1,
      line: null,
      defeated: false,
    },
    wear,
    tilt: 0,
    swayT: 0,
    quietFor: 0,
    pendingLine: 'intro',
    attackCd: 2.4,
    attackPattern: 0,
  };
}

/** How much of her is standing, by the parts' weights. */
function integrityOf(look: Record<BossPartId, PartLookState>): number {
  let whole = 0;
  for (const part of HIYOU_PARTS) {
    const state = look[part.id].state;
    whole +=
      PART_WEIGHT[part.id] *
      (state === 'intact' ? 1 : state === 'damaged_1' ? 0.66 : state === 'damaged_2' ? 0.33 : 0);
  }
  return whole;
}

/**
 * Advances her one step: sway, the fading of hits, the waiting line, the phase she has come to.
 * `dt` is the world's own delta. Emits nothing here — the world reads her.
 */
export function stepCharacterBoss(boss: CharacterBoss, dt: number): void {
  boss.swayT += dt;
  boss.state.x = HIYOU_X + Math.sin(boss.swayT * 0.9) * 36;
  boss.state.y = HIYOU_Y + Math.sin(boss.swayT * 1.7) * 5;
  boss.tilt = Math.sin(boss.swayT * 0.9) * 0.025;

  boss.quietFor += dt;
  boss.state.line = null;
  if (boss.pendingLine && boss.quietFor > 1.2) {
    boss.state.line = boss.pendingLine;
    boss.pendingLine = null;
    boss.quietFor = 0;
  }

  let flashed = false;
  for (const part of HIYOU_PARTS) {
    const look = boss.state.look[part.id];
    if (look.flash > 0) {
      look.flash = Math.max(0, look.flash - dt / FLASH_TIME);
      flashed = true;
    }
    if (look.dx !== 0 || look.dy !== 0) {
      const home = Math.min(1, (KNOCK_HOME * dt) / (Math.hypot(look.dx, look.dy) || 1));
      look.dx -= look.dx * home;
      look.dy -= look.dy * home;
      if (Math.abs(look.dx) < 0.05 && Math.abs(look.dy) < 0.05) {
        look.dx = 0;
        look.dy = 0;
      }
    }
  }
  void flashed;
}

/**
 * One blow lands on a part. `power` is the ball's power before defence; crits are the caller's.
 * Returns the damage her armour let through.
 */
export function hitCharacterPart(
  boss: CharacterBoss,
  id: BossPartId,
  power: number,
  nx: number,
  ny: number,
): number {
  const part = HIYOU_PARTS.find((each) => each.id === id);
  if (!part || boss.state.defeated) return 0;
  const look = boss.state.look[id];
  if (look.state === 'destroyed') return 0;
  if (id === 'Core' && boss.state.shielded) return 0;

  const dealt = power * (1 - part.defense);
  look.flash = 1;
  look.dx -= nx * KNOCK;
  look.dy -= ny * KNOCK;
  // A part wears by the blow, not by the point of damage: its hp is how many blows a state takes,
  // and the armour shows up as less hurt per blow. The world scores what her armour let through.
  boss.wear[id] += 1;
  while (boss.wear[id] >= hitsPerState(part) && look.state !== 'destroyed') {
    const at = WEAR.indexOf(look.state as 'intact' | 'damaged_1' | 'damaged_2');
    if (at < 0 || at >= WEAR.length - 1) {
      look.state = 'destroyed';
      break;
    }
    boss.wear[id] -= hitsPerState(part);
    look.state = WEAR[at + 1]!;
  }

  boss.state.integrity = integrityOf(boss.state.look);
  return dealt;
}

/**
 * Her next attack, due now: a volley from both wings, or a heavy orb from her core that bursts
 * into scatter shots. Later phases attack faster and scatter wider.
 */
export interface CharacterAttack {
  kind: 'wings' | 'orb';
  /** Scatter shots the orb bursts into. 0 for a volley. */
  scatter: number;
}

/** Her attack cadence, by phase: she gets quicker as she loses parts. */
const ATTACK_CD: readonly number[] = [2.7, 2.3, 1.9, 1.5];

/**
 * The attack due now, advancing her pattern and winding the clock for the one after. Only asked
 * while the fight runs — the world gates on that.
 */
export function characterAttack(boss: CharacterBoss): CharacterAttack {
  const wings = boss.attackPattern === 0;
  boss.attackPattern = wings ? 1 : 0;
  boss.attackCd = ATTACK_CD[boss.state.phase - 1] ?? 2.7;
  // The orb scatters wider the deeper the fight goes: eight shots early, ten late.
  return { kind: wings ? 'wings' : 'orb', scatter: wings ? 0 : boss.state.phase >= 3 ? 10 : 8 };
}

/** The phase she has come to, and whether this step crossed into a new one. */
export function characterPhase(boss: CharacterBoss): { phase: number; changed: boolean } {
  let standing = 0;
  let total = 0;
  for (const part of HIYOU_PARTS) {
    const state = boss.state.look[part.id].state;
    const weight = PART_WEIGHT[part.id];
    total += weight;
    if (state !== 'destroyed') standing += weight;
  }
  // By what she has lost, not what stands: the phases fall as the fight goes on, and a part half
  // broken has not lost its whole weight.
  const lost = 1 - standing / total;
  const phase = lost >= 0.85 ? 4 : lost >= 0.55 ? 3 : lost >= 0.215 ? 2 : 1;
  const changed = phase > boss.state.phase;
  if (changed) {
    boss.state.phase = phase;
    // The shield is down for good from the third phase: the core is fair game.
    if (phase >= 3) boss.state.shielded = false;
    if (phase === 2) boss.pendingLine = 'phase2';
    if (phase === 3) boss.pendingLine = 'phase3';
    if (phase === 4) boss.pendingLine = 'phase4';
  }
  return { phase, changed };
}

/** True once every part of her is gone. */
export function characterDefeated(boss: CharacterBoss): boolean {
  return HIT_ORDER.every((part) => boss.state.look[part.id].state === 'destroyed');
}

/** Her discs this moment, for the sweep and the renderer alike. */
export function characterDiscsOf(boss: CharacterBoss): BossDisc[] {
  return discsOf(boss.state.look, boss.state, boss.tilt, 0);
}

/** Reused resting look, so that a headless test can build a frame without the renderer. */
export { restingLook };

import { BOSS_EVERY, CAMPAIGN_LENGTH, isBossLevel } from './levels/generator';
import {
  discsOf,
  hitOrder,
  integrityOf,
  hitsPerState,
  stageOf,
  WEAR,
  type BossDisc,
  type CharacterAttack,
  type CharacterDef,
  type CharacterBossState,
  type PartLookState,
} from './character';
import { HIYOU } from './hiyou';
import { VESPER } from './vesper';
import type { BossPartId } from '../render/boss/types';

/**
 * A character boss as a fight: her state machine, all of it plain data + logic.
 *
 * Whoever she is (`CharacterDef`), her parts are discs that wear through three states and then
 * come off. She has four phases, cut on how much of her is standing; at the third her shield comes
 * off for good, and at the last she will not be talked to any more. What she says is handed to the
 * world as an event: the fight knows *when*, the words are somebody else's.
 *
 * Headless-testable: no rendering, no clock but the one the world gives her.
 */

/** What she says, as moments: the words are the i18n's. */
export type LineMoment = 'intro' | 'phase2' | 'phase3' | 'phase4' | 'partDown' | 'defeated';

/**
 * Who stands on the boss sectors of the campaign, by the sector's boss slot: the first keeps its
 * lattice, the second is 薇斯珀's and the last 绯樱's. Past the campaign the lattice takes over.
 */
const CAST: readonly (CharacterDef | null)[] = [null, VESPER, HIYOU];

/** The character standing on a level, if any: `opts.character` in the world is the build's say on whether she may. */
export function characterFor(level: number): CharacterDef | null {
  if (!isBossLevel(level) || level > CAMPAIGN_LENGTH) return null;
  return CAST[level / BOSS_EVERY - 1] ?? null;
}

/** How long the white of a hit takes to fade. */
const FLASH_TIME = 0.24;
/** How far a hit knocks the part it struck, in figure units, and how fast it goes home. */
const KNOCK = 4;
const KNOCK_HOME = 9;

export interface CharacterBoss {
  /** Who she is: her parts, where she stands, what she throws. */
  def: CharacterDef;
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
  /** Where she is in her list of attacks: which comes next. */
  attackAt: number;
  /** Seconds until she pours bricks into the field again, if she does. */
  reforgeCd: number;
  /** How long a change of picture takes, where she is shown one a stage: the two are cross-faded over it. */
  stageFade: number;
  /** 0..1, how far the change to the picture showing has come; 1 when it is settled. */
  stageMix: number;
}

/** Starts her, whole, at the top of the arena. 绯樱 if nobody is named. */
export function startCharacterBoss(def: CharacterDef = HIYOU): CharacterBoss {
  const look = {} as Record<BossPartId, PartLookState>;
  const wear = {} as Record<BossPartId, number>;
  for (const part of def.parts) {
    look[part.id] = { state: 'intact', flash: 0, dx: 0, dy: 0 };
    wear[part.id] = 0;
  }
  return {
    def,
    state: {
      x: def.x,
      y: def.y,
      face: 'idle',
      look,
      phase: 1,
      shielded: def.shield !== null,
      integrity: 1,
      stage: stageOf(def, 1),
      line: null,
      defeated: false,
    },
    wear,
    tilt: 0,
    swayT: 0,
    quietFor: 0,
    pendingLine: 'intro',
    attackCd: 2.4,
    attackAt: 0,
    reforgeCd: def.reforge?.every ?? 0,
    stageFade: 0.45,
    stageMix: 1,
  };
}

/**
 * Advances her one step: sway, the fading of hits, the waiting line, the phase she has come to.
 * `dt` is the world's own delta. Emits nothing here — the world reads her.
 */
export function stepCharacterBoss(boss: CharacterBoss, dt: number): void {
  const { def } = boss;
  boss.swayT += dt;
  boss.state.x = def.x + Math.sin(boss.swayT * def.swayRate) * def.swayX;
  boss.state.y = def.y + Math.sin(boss.swayT * def.bobRate) * def.bobY;
  boss.tilt = Math.sin(boss.swayT * def.swayRate) * def.tilt;

  boss.quietFor += dt;
  // A picture part-way in settles, whatever else is happening to her.
  if (boss.stageMix < 1) boss.stageMix = Math.min(1, boss.stageMix + dt / boss.stageFade);
  boss.state.line = null;
  if (boss.pendingLine && boss.quietFor > 1.2) {
    boss.state.line = boss.pendingLine;
    boss.pendingLine = null;
    boss.quietFor = 0;
  }

  for (const part of def.parts) {
    const look = boss.state.look[part.id];
    if (!look) continue;
    if (look.flash > 0) look.flash = Math.max(0, look.flash - dt / FLASH_TIME);
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
}

/** Keeps what follows from how her parts are in step with how they are: how much of her stands, and which picture of her shows. */
function settle(boss: CharacterBoss): void {
  boss.state.integrity = integrityOf(boss.def, boss.state.look);
  const stage = stageOf(boss.def, boss.state.integrity);
  // A new picture begins to come the moment it is due: the one before stays while it settles.
  if (stage !== boss.state.stage) {
    boss.state.stage = stage;
    boss.stageMix = 0;
  }
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
  const part = boss.def.parts.find((each) => each.id === id);
  const look = boss.state.look[id];
  if (!part || !look || boss.state.defeated) return 0;
  if (look.state === 'destroyed') return 0;
  if (id === boss.def.core && boss.state.shielded) return 0;

  const dealt = power * (1 - part.defense);
  look.flash = 1;
  look.dx -= nx * KNOCK;
  look.dy -= ny * KNOCK;
  // A part wears by the blow, not by the point of damage: its hp is how many blows a state takes,
  // and the armour shows up as less hurt per blow. The world scores what her armour let through.
  boss.wear[id]! += 1;
  while (boss.wear[id]! >= hitsPerState(part) && look.state !== 'destroyed') {
    const at = WEAR.indexOf(look.state as 'intact' | 'damaged_1' | 'damaged_2');
    if (at < 0 || at >= WEAR.length - 1) {
      look.state = 'destroyed';
      break;
    }
    boss.wear[id]! -= hitsPerState(part);
    look.state = WEAR[at + 1]!;
  }
  // A shield torn off by blows opens the core as surely as the third phase does.
  if (id === boss.def.shield && look.state === 'destroyed') boss.state.shielded = false;

  settle(boss);
  return dealt;
}

/**
 * The attack due now, taking the next in her list and winding the clock for the one after. Only
 * asked while the fight runs — the world gates on that.
 */
export function characterAttack(boss: CharacterBoss): CharacterAttack {
  const list = boss.def.attacks;
  const next = list[boss.attackAt] ?? list[0]!;
  boss.attackAt = (boss.attackAt + 1) % Math.max(1, list.length);
  // She gets quicker as she loses parts.
  boss.attackCd = boss.def.attackCd[boss.state.phase - 1] ?? boss.def.attackCd[0] ?? 2.5;
  // An orb scatters wider from the third phase on.
  return { ...next, scatter: boss.state.phase >= 3 ? next.scatterLate : next.scatter };
}

/**
 * The phase she has come to, and whether this step crossed into a new one. Crossing into the third
 * tears her shield off for good, if it is still on her — `fell` names it when it did — and from
 * there the core is fair game.
 */
export function characterPhase(boss: CharacterBoss): {
  phase: number;
  changed: boolean;
  /** The part this step tore off by itself, if any. */
  fell: BossPartId | null;
} {
  let standing = 0;
  let total = 0;
  for (const part of boss.def.parts) {
    const weight = part.weight;
    total += weight;
    if (boss.state.look[part.id]?.state !== 'destroyed') standing += weight;
  }
  // By what she has lost, not what stands: the phases fall as the fight goes on, and a part half
  // broken has not lost its whole weight.
  const lost = 1 - standing / total;
  const phase = lost >= 0.85 ? 4 : lost >= 0.55 ? 3 : lost >= 0.215 ? 2 : 1;
  const changed = phase > boss.state.phase;
  let fell: BossPartId | null = null;
  if (changed) {
    boss.state.phase = phase;
    // The shield is down for good from the third phase: it comes off her, and the core is fair game.
    if (phase >= 3 && boss.def.shield) {
      boss.state.shielded = false;
      const shield = boss.state.look[boss.def.shield];
      if (shield && shield.state !== 'destroyed') {
        shield.state = 'destroyed';
        boss.wear[boss.def.shield] = 0;
        settle(boss);
        fell = boss.def.shield;
      }
    }
    if (phase === 2) boss.pendingLine = 'phase2';
    if (phase === 3) boss.pendingLine = 'phase3';
    if (phase === 4) boss.pendingLine = 'phase4';
  }
  return { phase, changed, fell };
}

/** True once every part of her is gone. */
export function characterDefeated(boss: CharacterBoss): boolean {
  return hitOrder(boss.def).every((part) => boss.state.look[part.id]?.state === 'destroyed');
}

/** Her discs this moment, for the sweep and the renderer alike. */
export function characterDiscsOf(boss: CharacterBoss): BossDisc[] {
  return discsOf(boss.def, boss.state.look, boss.state, boss.tilt, boss.state.stage);
}

/** Reused resting look, so that a headless test can build a frame without the renderer. */
export { restingLook } from '../render/boss/types';

import type { RNG } from '../core/rng';
import type { Bullet } from './entities';
import type { BossDisc } from './character';
import type { BossPartId } from '../render/boss/types';

/**
 * A character's attacks as data, and the patterns that throw them.
 *
 * An attack is a table entry: which of her parts it comes from, a *pattern* — how the shots leave
 * her, one key of the registry below — and a *shot*, what the projectile is (how fast, how big,
 * how it is drawn, whether it bursts). Adding a barrage is a table entry; adding a kind of barrage
 * is a pattern here; adding a kind of projectile is a field on the spec and a painter in the
 * renderer. The world only supplies the field to fire into.
 *
 * Nothing here knows who she is: the same registry serves every character, drawn or cut from
 * pictures.
 */

/** One projectile as an attack throws it. Every field left out falls back to the pattern's own. */
export interface ShotSpec {
  /** World units a second. Left out: the pattern's pace (which grows with the level). */
  speed?: number;
  /** Hit radius. Left out: the pattern's own. */
  radius?: number;
  /**
   * How it is drawn: a key of the renderer's shot painters (`render/scene.ts`). Left out: the
   * pattern's own. Non-circular shots are painters like any other — a shard, a star — not a
   * special case.
   */
  visual?: string;
  /**
   * Seconds before it bursts into `attack.scatter` scatter shots. Left out: the pattern's own
   * (and no burst where the attack names none).
   */
  fuse?: number;
  /** Shields lost when it reaches the floor. Left out: 1. */
  damage?: number;
}

/** One of her attacks: where from, how the shots leave her, and what they are. */
export interface CharacterAttack {
  /**
   * The phase this attack is held back for: before it, the clock winds but nothing is thrown. It
   * is the first thing she throws once that phase has come.
   */
  phase?: number;
  /**
   * Hers to throw once a fight: after that it passes her by like one held back, the clock winding
   * just the same — for the one thing she keeps for the end.
   */
  once?: boolean;
  /** Where it comes from: a volley fires from every part named; the others from the first standing. */
  from: readonly BossPartId[];
  /** How the shots leave her: a key of the pattern registry (`PATTERNS`). */
  kind: string;
  /** Shots per named part (a volley), stars (a rain); an orb throws one. Left out: one. */
  shots?: number;
  /** The projectile thrown. Left out: the pattern's own. */
  shot?: ShotSpec;
  /**
   * Into how many scatter shots a bursting shot breaks; wider from the third phase
   * (`scatterLate`). Zero — or left out with no `shot.fuse` — is no burst at all: the shot then
   * flies on until it is blocked, shredded or reaches the floor, and never vanishes mid-air.
   */
  scatter?: number;
  scatterLate?: number;
}

/**
 * What a pattern needs of the world, and nothing more: where the paddle is, how fast things may
 * fly, room to fire into, and the field itself. It is the whole of the world a pattern may touch,
 * so a pattern can neither brick the field nor touch her states.
 */
export interface ShotContext {
  paddle: { x: number; y: number };
  /** The level's index, for the paces that grow with it. */
  level: number;
  /** 1 − the slow-field share: the paces that yield to a Slow Field build. */
  pace: number;
  rng: Pick<RNG, 'range'>;
  /** False when the field is full: the pattern stops early rather than overrunning it. */
  capacity(): boolean;
  /** Puts one projectile on the field. */
  spawn(bullet: Bullet): void;
  /** The standard aimed shot: paddle-aimed, standard jitter and pace. */
  shootStandard(x: number, y: number): void;
  /** Announces a shot: what the audio director and the effects hang their sounds on. */
  announce(x: number, y: number): void;
}

/** The standard pace of an aimed shot, as the lattice's turret shots fly. */
export const standardPace = (level: number, pace: number): number => Math.min(430, 230 + level * 6) * pace;

/** Where a shot at `x, y` aims at the paddle, with the standard jitter either side of true. */
export function standardAngle(ctx: ShotContext, x: number, y: number, jitter = 0.22): number {
  return Math.atan2(ctx.paddle.y - y, ctx.paddle.x - x) + ctx.rng.range(-jitter, jitter);
}

/** How a pattern throws: given the field, the parts still standing and the attack table entry. */
export type Pattern = (
  ctx: ShotContext,
  discOf: (id: BossPartId) => BossDisc | undefined,
  attack: CharacterAttack,
) => void;

/** The first of the attack's parts still standing — the others are torn off her. */
function firstStanding(
  discOf: (id: BossPartId) => BossDisc | undefined,
  attack: CharacterAttack,
): BossDisc | undefined {
  return attack.from.map(discOf).find((disc) => disc !== undefined);
}

/**
 * A volley: every part named fires `shots` standard aimed shots, or — where the entry names a
 * shot of its own — that projectile, aimed.
 */
const volley: Pattern = (ctx, discOf, attack) => {
  const perPart = attack.shots ?? 1;
  for (const id of attack.from) {
    const part = discOf(id);
    if (!part) continue;
    const x = part.x;
    const y = part.y + part.radius * 0.4;
    if (!attack.shot) {
      for (let i = 0; i < perPart && ctx.capacity(); i++) ctx.shootStandard(x, y);
      continue;
    }
    for (let i = 0; i < perPart && ctx.capacity(); i++) {
      const angle = standardAngle(ctx, x, y);
      const speed = attack.shot.speed ?? standardPace(ctx.level, ctx.pace);
      ctx.spawn({
        id: 0,
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: attack.shot.radius ?? 7,
        dead: false,
        visual: attack.shot.visual,
        damage: attack.shot.damage,
      });
    }
  }
};

/**
 * An orb: one heavy projectile from the first part standing, aimed at the paddle, slower than the
 * standard pace and growing with the level. Where the attack names a burst it carries a fuse, and
 * bursts into that many scatter shots while still over the open field; where it names none, the
 * orb is only a heavy ball, and flies on until it is blocked, shredded or reaches the floor — an
 * orb that quietly vanished mid-air would read as a bug.
 */
const orb: Pattern = (ctx, discOf, attack) => {
  const part = firstStanding(discOf, attack);
  if (!part) return;
  const spec = attack.shot ?? {};
  const angle = standardAngle(ctx, part.x, part.y, 0);
  const speed = spec.speed ?? 190 + ctx.level * 3;
  const bursts = (attack.scatter ?? 0) > 0;
  ctx.spawn({
    id: 0,
    x: part.x,
    y: part.y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    r: spec.radius ?? 16,
    dead: false,
    big: true,
    visual: spec.visual ?? 'orb',
    damage: spec.damage,
    ...(bursts ? { splitT: spec.fuse ?? 1.15, splitN: attack.scatter } : {}),
  });
  ctx.announce(part.x, part.y);
};

/**
 * A rain: `shots` stars shaken loose across the part's width, falling in a loose line towards the
 * paddle — a wall with gaps in it to find a way through.
 */
const rain: Pattern = (ctx, discOf, attack) => {
  const part = firstStanding(discOf, attack);
  if (!part) return;
  const count = attack.shots ?? 1;
  const spec = attack.shot ?? {};
  const speed = spec.speed ?? Math.min(320, 230 + ctx.level * 2) * ctx.pace;
  for (let i = 0; i < count; i++) {
    if (!ctx.capacity()) break;
    const x = part.x + ((i + 0.5) / count - 0.5) * part.radius * 4 + ctx.rng.range(-8, 8);
    const y = part.y + ctx.rng.range(0, 26);
    const angle = standardAngle(ctx, x, y, 0.16);
    ctx.spawn({
      id: 0,
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r: spec.radius ?? 8,
      dead: false,
      visual: spec.visual ?? 'star',
      damage: spec.damage,
    });
  }
  if (ctx.announce) ctx.announce(part.x, part.y);
};

/**
 * The registry: every kind of barrage a character can name. A new one is an entry here — it gets
 * the field, the parts standing and the table entry, and the world never hears of it.
 */
export const PATTERNS: Record<string, Pattern> = { volley, orb, rain };

/** Announces a shot: what the audio director and the effects hang their sounds on. */
export interface Announcer {
  announce?(x: number, y: number): void;
}

/** Throws the attack due now. A kind with no pattern throws nothing, and costs nothing. */
export function fireAttack(ctx: ShotContext, parts: readonly BossDisc[], attack: CharacterAttack): void {
  const pattern = PATTERNS[attack.kind];
  if (!pattern) return;
  const discOf = (id: BossPartId): BossDisc | undefined => parts.find((disc) => disc.id === id);
  pattern(ctx, discOf, attack);
}

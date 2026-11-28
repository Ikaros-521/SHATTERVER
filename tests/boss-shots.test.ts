import { describe, expect, it } from 'vitest';
import { fireAttack, PATTERNS, type ShotContext } from '../src/game/bossShots';
import type { BossDisc } from '../src/game/character';
import type { Bullet } from '../src/game/entities';

/**
 * The patterns that throw a character's attacks, against a recording field: what each pattern
 * spawns, from where, aimed how — and that an unknown kind costs nothing.
 */

const PADDLE = { x: 360, y: 890 };

/** A field that records what is spawned, and where the standard shots would go. */
function field(capacity = true): { ctx: ShotContext; spawned: Bullet[]; standard: { n: number } } {
  const spawned: Bullet[] = [];
  // A box, not a number: the closure adds to what the caller reads.
  const standard = { n: 0 };
  const ctx: ShotContext = {
    paddle: PADDLE,
    level: 10,
    pace: 1,
    rng: { range: (min, max) => (min + max) / 2 },
    capacity: () => capacity,
    spawn: (bullet) => spawned.push(bullet),
    shootStandard: () => {
      standard.n++;
    },
    announce: () => {},
  };
  return { ctx, spawned, standard };
}

const part = (id: string, x: number, y: number, radius = 30): BossDisc => ({
  id,
  key: -1,
  x,
  y,
  radius,
  state: 'intact',
  defense: 0.2,
});

const parts = (): BossDisc[] => [
  part('side.L', 240, 250),
  part('side.R', 480, 250),
  part('head', 360, 130, 24),
];

describe('the attack patterns', () => {
  it('has a pattern behind every kind the characters name, and nothing behind an unknown one', () => {
    // Every kind the two characters use has a pattern.
    for (const kind of ['volley', 'orb', 'rain']) expect(PATTERNS[kind], kind).toBeTypeOf('function');
    // An unknown kind costs nothing: no throw, no spawn.
    const { ctx, spawned } = field();
    expect(() => fireAttack(ctx, parts(), { kind: 'laser', from: ['head'] })).not.toThrow();
    expect(spawned).toHaveLength(0);
  });

  it('a volley: the standard shot from every part named, `shots` from each', () => {
    const { ctx, spawned, standard } = field();
    fireAttack(ctx, parts(), { kind: 'volley', from: ['side.L', 'side.R'], shots: 2 });
    // The standard shots went out of `shoot`, two a part, from just below each part's middle.
    expect(standard.n).toBe(4);
    expect(spawned).toHaveLength(0);
    // A torn-off part fires nothing of its share: the left is gone, the right still fires two.
    const short = field();
    fireAttack(short.ctx, parts().slice(1), { kind: 'volley', from: ['side.L', 'side.R'], shots: 2 });
    expect(short.standard.n).toBe(2);
  });

  it('a volley with a shot of its own throws that projectile, aimed, at its own pace', () => {
    const { ctx, spawned } = field();
    fireAttack(ctx, parts(), {
      kind: 'volley',
      from: ['side.R'],
      shots: 3,
      shot: { speed: 340, radius: 11, visual: 'shard', damage: 2 },
    });
    expect(spawned).toHaveLength(3);
    for (const bullet of spawned) {
      expect(bullet.r).toBe(11);
      expect(bullet.visual).toBe('shard');
      expect(bullet.damage).toBe(2);
      // Aimed at the paddle: vy positive and pointing down-field from y=250+12.
      expect(bullet.vy).toBeGreaterThan(0);
      // Its pace is the spec's, not the standard's.
      expect(Math.hypot(bullet.vx, bullet.vy)).toBeCloseTo(340, 5);
    }
    // Where a spec says nothing, the standard pace of the level flies.
    const plain = field();
    fireAttack(plain.ctx, parts(), { kind: 'volley', from: ['side.R'], shots: 1, shot: { radius: 9 } });
    expect(Math.hypot(plain.spawned[0]!.vx, plain.spawned[0]!.vy)).toBeCloseTo(
      Math.min(430, 230 + 10 * 6),
      5,
    );
  });

  it('an orb: one heavy ball from the first part standing, fused only where the attack bursts', () => {
    const { ctx, spawned } = field();
    fireAttack(ctx, parts(), {
      kind: 'orb',
      from: ['side.L', 'head'],
      scatter: 8,
      shot: { radius: 16, visual: 'orb', fuse: 1.15 },
    });
    expect(spawned).toHaveLength(1);
    // From the first part named that still stands — the left side, not the head.
    expect(spawned[0]!.x).toBe(240);
    expect(spawned[0]!.r).toBe(16);
    expect(spawned[0]!.big).toBe(true);
    expect(spawned[0]!.visual).toBe('orb');
    expect(spawned[0]!.splitT).toBeCloseTo(1.15, 5);
    expect(spawned[0]!.splitN).toBe(8);
    // Aimed at the paddle from where it hangs.
    const aim = Math.atan2(PADDLE.y - 250, PADDLE.x - 240);
    expect(Math.atan2(spawned[0]!.vy, spawned[0]!.vx)).toBeCloseTo(aim, 5);
    // No burst named: no fuse, and so no way to vanish mid-air.
    const quiet = field();
    fireAttack(quiet.ctx, parts(), { kind: 'orb', from: ['head'] });
    expect(quiet.spawned[0]!.splitT).toBeUndefined();
    expect(quiet.spawned[0]!.splitN).toBeUndefined();
    // Every part torn off: nothing to fire from.
    const bare = field();
    fireAttack(bare.ctx, [], { kind: 'orb', from: ['head'], scatter: 8 });
    expect(bare.spawned).toHaveLength(0);
  });

  it("a rain: stars across the part's width, all falling, and stopping at the field's capacity", () => {
    const { ctx, spawned } = field();
    fireAttack(ctx, parts(), { kind: 'rain', from: ['head'], shots: 6, shot: { radius: 8, visual: 'star' } });
    expect(spawned).toHaveLength(6);
    for (const bullet of spawned) {
      expect(bullet.vy).toBeGreaterThan(0);
      expect(bullet.visual).toBe('star');
    }
    // They spread across the part: wider than the part itself, since they span four of its radii.
    const spread = Math.max(...spawned.map((b) => b.x)) - Math.min(...spawned.map((b) => b.x));
    expect(spread).toBeGreaterThan(40);
    // A full field holds the rain back rather than overrunning it.
    const full = field(false);
    fireAttack(full.ctx, parts(), { kind: 'rain', from: ['head'], shots: 6 });
    expect(full.spawned).toHaveLength(0);
  });

  it('an empty part list, or a kind whose part is gone, throws nothing and throws no error', () => {
    const { ctx, spawned, standard } = field();
    for (const kind of ['volley', 'orb', 'rain']) {
      fireAttack(ctx, [], { kind, from: ['head'], shots: 3 });
      fireAttack(ctx, parts(), { kind, from: ['ghost'], shots: 3 });
    }
    expect(spawned).toHaveLength(0);
    expect(standard.n).toBe(0);
  });
});

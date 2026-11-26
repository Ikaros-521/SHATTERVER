import { describe, expect, it } from 'vitest';
import { onBallHitBrick } from '../src/game/combat';
import { RNG } from '../src/core/rng';
import { DIFFICULTIES, DIFFICULTY_MAP, difficultyOf } from '../src/game/difficulty';
import { buildLevel, difficultyRamp } from '../src/game/levels/generator';
import { Session } from '../src/game/session';
import type { Starter } from '../src/game/starters';

/** Same seed and level for every tier, so comparisons isolate the difficulty's own scaling. */
function plans(level: number, seed = 4242) {
  const out: Record<string, ReturnType<typeof buildLevel>> = {};
  for (const tier of DIFFICULTIES) out[tier.id] = buildLevel(level, new RNG(seed), tier);
  return out;
}

describe('difficulty: level generation (deep level, full ramp)', () => {
  const level = 13; // ramp === 1 here: the tier applies at full strength
  const p = plans(level);

  it('scales brick HP, descent and boss HP by the tier multiplier', () => {
    expect(p.hard?.hpUnit).toBe(Math.round((p.standard?.hpUnit ?? 0) * DIFFICULTY_MAP.hard.hpMult));
    expect(p.hard?.descent).toBeCloseTo((p.standard?.descent ?? 0) * DIFFICULTY_MAP.hard.descentMult, 6);
    // Boss HP rides the same multiplier through bossScale.
    const boss = plans(15);
    expect(boss.abyss?.bossScale).toBeCloseTo(
      (boss.standard?.bossScale ?? 0) * DIFFICULTY_MAP.abyss.hpMult,
      6,
    );
  });

  it('stacks extra rows above the pattern on normal levels', () => {
    expect(p.abyss!.cells.length).toBeGreaterThan(p.standard!.cells.length + 12);
    // The pattern is pushed down, so the top of the wall stays inside the grid.
    expect(Math.min(...p.abyss!.cells.map((cell) => cell.row))).toBe(0);
  });

  it('never adds extra rows or erasers to boss levels', () => {
    const boss = plans(15);
    expect(boss.abyss!.cells.length).toBe(boss.standard!.cells.length);
    expect(boss.abyss!.cells.some((cell) => cell.type === 'eraser')).toBe(false);
  });

  it('places eraser bricks from hard tier upwards, never below', () => {
    expect(p.standard!.cells.some((cell) => cell.type === 'eraser')).toBe(false);
    expect(p.hard!.cells.some((cell) => cell.type === 'eraser')).toBe(true);
    expect(p.abyss!.cells.filter((cell) => cell.type === 'eraser').length).toBeGreaterThan(
      p.hard!.cells.filter((cell) => cell.type === 'eraser').length,
    );
  });

  it('eases tier pressure in over the early campaign', () => {
    expect(difficultyRamp(1)).toBeLessThan(0.4);
    expect(difficultyRamp(9)).toBeLessThan(0.85);
    expect(difficultyRamp(17)).toBe(1);
    // Level 1 on hard is far gentler than level 13 on the same tier.
    const early = plans(1);
    expect(early.hard!.hpUnit).toBeLessThan(Math.round((p.hard?.hpUnit ?? 0) * 0.9));
  });
});

describe('difficulty: in the world', () => {
  it('narrows the paddle and slows the balls on high tiers', () => {
    const slim = new Session('campaign', 7, { difficulty: difficultyOf('abyss') });
    const plain = new Session('campaign', 7, { difficulty: difficultyOf('standard') });
    expect(slim.world.paddle.halfW).toBeLessThan(plain.world.paddle.halfW);
    expect(slim.world.ballSpeed()).toBeLessThan(plain.world.ballSpeed());
  });

  it('multiplies the score a run earns', () => {
    const scaled = new Session('campaign', 3, { difficulty: difficultyOf('hard') });
    const plain = new Session('campaign', 3, { difficulty: difficultyOf('standard') });
    // One identical ball hit in both worlds: same seed → same damage, score differs by the tier.
    const hitOnce = (session: Session): void => {
      const world = session.world;
      const brick = world.bricks.find((b) => b.type === 'normal' && !b.dead);
      expect(brick).toBeDefined();
      onBallHitBrick(world, world.balls[0]!, brick!, 0, -1, brick!.x, brick!.y);
    };
    hitOnce(plain);
    hitOnce(scaled);
    expect(scaled.run.score).toBeCloseTo(plain.run.score * DIFFICULTY_MAP.hard.scoreMult, 6);
    expect(scaled.run.difficulty).toBe('hard');
  });

  it('awards an ordinary brick exactly damage × combo × level × difficulty, with no score-wide scale', () => {
    const session = new Session('campaign', 1, { difficulty: difficultyOf('standard') });
    const world = session.world;
    let dealt = -1;
    world.events.on('hit', (e) => {
      dealt = e.dmg;
    });
    const brick = world.bricks.find((b) => b.type === 'normal' && !b.dead);
    expect(brick).toBeDefined();
    // One ball hit on level 1, combo still empty, standard tier: damage × level, nothing else.
    onBallHitBrick(world, world.balls[0]!, brick!, 0, -1, brick!.x, brick!.y);
    expect(dealt).toBeGreaterThan(0);
    expect(world.run.score).toBeCloseTo(dealt * (1 + 0 * 0.01) * (1 + 1 * 0.25) * 1, 10);
  });

  it('an eraser brick eats a ball when there are plenty, and refuses when the core is small', () => {
    const starter: Starter = {
      id: 'test',
      name: '',
      en: '',
      desc: '',
      color: 0,
      grants: { multiball: 2 },
      crystals: 0,
    };
    const session = new Session('campaign', 11, { difficulty: difficultyOf('nightmare'), level: 9, starter });
    const world = session.world;
    const eraser = world.bricks.find((brick) => brick.type === 'eraser');
    expect(eraser).toBeDefined();

    const victim = world.balls.find((ball) => ball.alive && !ball.child && !ball.ghost)!;
    onBallHitBrick(world, victim, eraser!, 0, -1, eraser!.x, eraser!.y);
    expect(victim.voided).toBe(true);
    expect(victim.alive).toBe(false);

    // With only the protected core left, the same brick bounces the ball instead of eating it.
    for (const ball of world.balls) {
      if (ball !== victim && !ball.ghost && !ball.child && !ball.voided) ball.alive = false;
    }
    const core = world.balls.find((ball) => !ball.ghost && !ball.child && !ball.voided)!;
    core.alive = true;
    expect(world.freeBallCount()).toBeLessThanOrEqual(4);
    onBallHitBrick(world, core, eraser!, 0, -1, eraser!.x, eraser!.y);
    expect(core.voided).toBe(false);
  });

  it('the abyss purge voids surplus balls over time', () => {
    const starter: Starter = {
      id: 'test',
      name: '',
      en: '',
      desc: '',
      color: 0,
      grants: { multiball: 2 },
      crystals: 0,
    };
    const session = new Session('endless', 21, { difficulty: difficultyOf('abyss'), bot: true, starter });
    // multiball ×2 puts eight balls on the field — comfortably above the protected core of four.
    expect(session.world.balls.filter((ball) => !ball.child).length).toBeGreaterThanOrEqual(6);
    const dt = 1 / 60;
    for (let i = 0; i < 60 * 40 && session.phase === 'playing'; i++) session.update(dt);
    const voided = session.world.balls.filter((ball) => ball.voided).length;
    expect(voided).toBeGreaterThanOrEqual(1);
  });
});

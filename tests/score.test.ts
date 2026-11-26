import { describe, expect, it } from 'vitest';
import { RNG } from '../src/core/rng';
import { SCORE_BRICK_CAP } from '../src/game/config';
import { applyDamage } from '../src/game/combat';
import { DIFFICULTIES, difficultyOf } from '../src/game/difficulty';
import {
  BOSS_HP,
  BRICK_HP,
  makeBrick,
  type BossRole,
  type Brick,
  type BrickType,
} from '../src/game/entities';
import { CAMPAIGN_LENGTH, buildLevel } from '../src/game/levels/generator';
import { createRun } from '../src/game/run';
import { Session } from '../src/game/session';
import { World } from '../src/game/world';

/** HP of a brick relative to its weight: what the cap is compared against. */
function hpPerWeight(brick: Brick): number {
  return brick.hp / (brick.bossRole ? BOSS_HP[brick.bossRole] : BRICK_HP[brick.type]);
}

/** Base points one brick is worth at most, before combo, level and difficulty. */
function worthOf(brick: Brick): number {
  return SCORE_BRICK_CAP * (brick.bossRole ? BOSS_HP[brick.bossRole] : BRICK_HP[brick.type]);
}

/** A loose brick with the given HP, not part of any field. */
function looseBrick(hp: number, type: BrickType = 'normal', bossRole: BossRole | null = null): Brick {
  return makeBrick({ col: 0, row: 0, type, hp, color: 0x27e0ff, seed: 1, bossRole });
}

/** A standard world standing at the start of the given level. */
function worldAtLevel(level: number): World {
  const rng = new RNG(level);
  return new World(createRun('endless', level), buildLevel(level, rng), rng.fork(), { bot: true });
}

describe('score: per-brick cap', () => {
  // A level-1 standard world that has not started: combo empty, every multiplier at its base.
  const world = new Session('campaign', 1, { difficulty: difficultyOf('standard') }).world;
  const levelMult = 1 + 1 * 0.25;

  /** Score one hit adds. `dot` is the source that builds no combo, so multipliers stay put. */
  const hit = (brick: Brick, amount: number): number => {
    const before = world.run.score;
    applyDamage(world, brick, amount, {
      x: brick.x,
      y: brick.y,
      power: amount,
      source: 'dot',
      ball: null,
      crit: false,
      explosion: false,
    });
    return world.run.score - before;
  };

  it('scores a brick under the line exactly the damage dealt', () => {
    const brick = looseBrick(SCORE_BRICK_CAP / 2);
    expect(hit(brick, 7)).toBe(7 * levelMult);
    expect(hit(brick, 100)).toBeCloseTo(100 * levelMult, 10);
  });

  it('caps a brick over the line: the whole brick is worth the cap times its weight', () => {
    // Deep-endless magnitudes: a plain brick nears 1e28 HP by level 400, a boss part far more.
    for (const [type, bossRole, hp] of [
      ['normal', null, 1e28],
      ['tough', null, 1e30],
      ['normal', 'core', 1e56],
    ] as [BrickType, BossRole | null, number][]) {
      const brick = looseBrick(hp, type, bossRole);
      // Ten non-lethal hits adding up to half the brick, so nothing but the score can fire.
      const before = world.run.score;
      for (let i = 0; i < 10; i++) hit(brick, hp / 20);
      expect(world.run.score - before).toBeCloseTo(worthOf(brick) * 0.5 * levelMult, 9);
    }
  });

  it('leaves every campaign brick on every difficulty under the line', () => {
    // Summoned bricks take the level's own `hpUnit`, so what a level starts with covers
    // everything that can appear in it. Under the line the score is the damage dealt, which is
    // what keeps every campaign score exactly what it was before the cap existed.
    let toughest = 0;
    for (const tier of DIFFICULTIES) {
      for (let level = 1; level <= CAMPAIGN_LENGTH; level++) {
        const rng = new RNG(level);
        const world = new World(createRun('campaign', level), buildLevel(level, rng, tier), rng.fork(), {
          bot: true,
        });
        for (const brick of world.bricks) toughest = Math.max(toughest, hpPerWeight(brick));
      }
    }
    expect(toughest).toBeLessThanOrEqual(SCORE_BRICK_CAP);
  });

  it('binds once endless outgrows the campaign, and not before', () => {
    const overTheLine = (level: number): boolean =>
      worldAtLevel(level).bricks.some((brick) => hpPerWeight(brick) > SCORE_BRICK_CAP);
    // Standard endless: the first two levels past the campaign still score as they are; by
    // level 30 even a plain brick is far over the line.
    expect(overTheLine(17)).toBe(false);
    expect(overTheLine(30)).toBe(true);
  });
});

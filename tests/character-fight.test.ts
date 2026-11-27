import { describe, expect, it } from 'vitest';
import { RNG } from '../src/core/rng';
import { makeBall } from '../src/game/entities';
import { CAMPAIGN_LENGTH, buildLevel } from '../src/game/levels/generator';
import { createRun } from '../src/game/run';
import { World } from '../src/game/world';
import type { BossDisc } from '../src/game/hiyou';

/**
 * 绯樱 through the world itself: what a ball does to her, what the world says about it, and whether
 * the fight can actually be won. The fight's own maths is in `character-boss.test.ts`; this is the
 * wiring — and each test here is a way the wiring had gone wrong once.
 */

const DT = 1 / 60;

function makeFight(): World {
  const rng = new RNG(7);
  const run = createRun('campaign', 7);
  return new World(run, buildLevel(CAMPAIGN_LENGTH, rng), rng.fork(), { bot: true, character: true });
}

/** Steps the world until `predicate` holds or `seconds` of game time pass. */
function runUntil(world: World, predicate: () => boolean, seconds: number): void {
  for (let t = 0; !predicate() && t < seconds; t += DT) world.update(DT);
}

/** Lands a blow on a part through the world, the way the ball sweep hands one over. */
function strike(world: World, disc: BossDisc): void {
  const ball = makeBall({
    x: disc.x,
    y: disc.y + disc.radius + 8,
    angle: -Math.PI / 2,
    speed: 400,
    radius: 8,
    mult: 1,
  });
  world.onCharacterPartHit(ball, disc.key, 0, 1, disc.x, disc.y + disc.radius);
}

/** Wears a part all the way off through the world, blow by blow. */
function tearOff(world: World, id: string, blows: number): void {
  for (let i = 0; i < blows; i++) {
    const disc = world.characterDiscs().find((each) => each.id === id);
    if (disc) strike(world, disc);
  }
}

function heard(world: World): { parts: { id: string; state: string }[]; moments: string[] } {
  const parts: { id: string; state: string }[] = [];
  const moments: string[] = [];
  world.events.on('characterPart', (e) => parts.push({ id: e.id, state: e.state }));
  world.events.on('character', (e) => {
    if (e.moment) moments.push(e.moment);
  });
  return { parts, moments };
}

/** Arms, head, shoulders and wings: 0.56 of her, past the 0.55 the third phase is cut at. */
const TO_PHASE_THREE = [
  ['LeftArm', 21],
  ['RightArm', 21],
  ['Head', 18],
  ['LeftShoulder', 24],
  ['RightShoulder', 24],
  ['LeftWing', 30],
  ['RightWing', 30],
] as const;

describe('a character boss through the world', () => {
  it('stands where her level puts her, with every part there to be hit', () => {
    const world = makeFight();
    expect(world.character).not.toBeNull();
    expect(world.characterDiscs()).toHaveLength(10);
    // Where she stands the lattice boss was never built.
    expect(world.boss).toBeNull();
    expect(world.bricks.filter((brick) => brick.boss)).toHaveLength(0);
  });

  it('says when a part of hers changes, all the way to torn off', () => {
    const world = makeFight();
    const { parts } = heard(world);
    // The head goes in six blows a state: eighteen tear it off.
    tearOff(world, 'Head', 18);
    expect(world.character!.state.look.Head.state).toBe('destroyed');
    expect(parts.filter((each) => each.id === 'Head').map((each) => each.state)).toEqual([
      'damaged_1',
      'damaged_2',
      'destroyed',
    ]);
  });

  it('has nothing where a torn-off part was: a ball flies through the gap', () => {
    const world = makeFight();
    runUntil(world, () => world.state === 'playing', 3);
    const wing = world.characterDiscs().find((each) => each.id === 'LeftWing')!;
    // A ball thrown in from her left, straight at the wing's middle: how far it gets before it
    // has crossed the space the wing hangs in. (The world sets a ball's pace to the build's own.)
    const furthest = (from: BossDisc): number => {
      const ball = makeBall({ x: from.x - 140, y: from.y, angle: 0, speed: 520, radius: 8, mult: 1 });
      world.balls.push(ball);
      let reach = ball.x;
      for (let i = 0; i < 16; i++) {
        world.update(DT);
        reach = Math.max(reach, ball.x);
      }
      return reach;
    };
    // Whole, the wing turns the ball back short of its middle.
    expect(furthest(wing)).toBeLessThan(wing.x - 20);
    tearOff(world, 'LeftWing', 30);
    expect(world.characterDiscs().map((each) => each.id)).not.toContain('LeftWing');
    // Torn off, there is nothing there: the ball goes on past where it hung.
    expect(furthest(wing)).toBeGreaterThan(wing.x - 20);
  });

  it('tears her shield off at the third phase, and opens the core', () => {
    const world = makeFight();
    const { parts, moments } = heard(world);
    for (const [id, blows] of TO_PHASE_THREE) tearOff(world, id, blows);
    expect(world.character!.state.phase).toBe(3);
    expect(world.character!.state.shielded).toBe(false);
    expect(world.character!.state.look.CoreShield.state).toBe('destroyed');
    expect(world.characterDiscs().map((each) => each.id)).not.toContain('CoreShield');
    expect(parts).toContainEqual({ id: 'CoreShield', state: 'destroyed' });
    expect(moments).toContain('phase3');
    // With the shield gone the core takes a blow and it counts.
    const before = world.totalDamage;
    strike(
      world,
      world.characterDiscs().find((each) => each.id === 'Core')!,
    );
    expect(world.totalDamage).toBeGreaterThan(before);
  });

  it('can be beaten: every part off, and the world is told she is down', () => {
    const world = makeFight();
    const { moments } = heard(world);
    for (const [id, blows] of TO_PHASE_THREE) tearOff(world, id, blows);
    tearOff(world, 'Body', 36);
    tearOff(world, 'Core', 54);
    expect(world.characterDiscs()).toHaveLength(0);
    expect(world.character!.state.defeated).toBe(true);
    expect(moments).toContain('defeated');
  });

  it('fires from the wings she has, and says nothing of the one she has lost', () => {
    const world = makeFight();
    runUntil(world, () => world.state === 'playing', 3);
    tearOff(world, 'LeftWing', 30);
    world.character!.attackPattern = 0;
    world.character!.attackCd = 0;
    const before = world.bullets.length;
    expect(() => world.update(DT)).not.toThrow();
    // One wing, two shots: the volley halves with her.
    expect(world.bullets.length - before).toBe(2);
  });
});

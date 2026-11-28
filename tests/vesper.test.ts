import { describe, expect, it } from 'vitest';
import { en } from '../src/i18n/en';
import { ja } from '../src/i18n/ja';
import { ko } from '../src/i18n/ko';
import { zh } from '../src/i18n/zh';
import { RNG } from '../src/core/rng';
import { discsOf, hitOrder, hitsPerState, integrityOf, stageOf } from '../src/game/character';
import {
  characterAttack,
  characterDefeated,
  characterDiscsOf,
  characterFor,
  characterPhase,
  hitCharacterPart,
  startCharacterBoss,
  stepCharacterBoss,
} from '../src/game/characterBoss';
import { HIYOU } from '../src/game/hiyou';
import { makeBall } from '../src/game/entities';
import { buildLevel } from '../src/game/levels/generator';
import { createRun } from '../src/game/run';
import { VESPER } from '../src/game/vesper';
import { World } from '../src/game/world';

/**
 * 薇斯珀 as a fight and through the world. She is shown in pictures — one whole drawing a stage
 * of the fight — so what is checked here above all is that the fight did not have to change for
 * it: the same regions, wear and phases as a boss drawn part by part, with a picture to show for
 * how much of her is standing.
 */

const DT = 1 / 60;

type Fight = ReturnType<typeof startCharacterBoss>;

function wearOut(boss: Fight, id: string, blows = 2000): void {
  for (let i = 0; i < blows && boss.state.look[id]?.state !== 'destroyed'; i++)
    hitCharacterPart(boss, id, 100, 0, 1);
}

function makeStand(level = 10): World {
  const rng = new RNG(11);
  const run = createRun('campaign', 11);
  return new World(run, buildLevel(level, rng), rng.fork(), { bot: true, character: true });
}

function play(world: World): void {
  for (let t = 0; world.state !== 'playing' && t < 3; t += DT) world.update(DT);
  expect(world.state).toBe('playing');
}

describe('薇斯珀 as a fight', () => {
  it('stands on the second boss sector of the campaign, as 绯樱 does on the last', () => {
    expect(characterFor(5)).toBeNull();
    expect(characterFor(10)).toBe(VESPER);
    expect(characterFor(15)).toBe(HIYOU);
    expect(characterFor(7)).toBeNull();
    expect(characterFor(20)).toBeNull();
  });

  it('is five regions of one drawing that are all of her, each laid over with hitboxes', () => {
    expect(VESPER.parts.map((part) => part.id)).toEqual(['head', 'body', 'skirt', 'side.L', 'side.R']);
    expect(VESPER.parts.reduce((sum, part) => sum + part.weight, 0)).toBeCloseTo(1, 5);
    for (const part of VESPER.parts) {
      expect(part.discs.length, part.id).toBeGreaterThan(0);
      expect(part.defense, part.id).toBeGreaterThanOrEqual(0);
      expect(part.defense, part.id).toBeLessThan(1);
      for (const disc of part.discs) expect(disc.radius, part.id).toBeGreaterThan(0);
    }
    // Whole, every hitbox of hers is swept, each under its own negative key.
    const discs = characterDiscsOf(startCharacterBoss(VESPER));
    expect(discs).toHaveLength(VESPER.parts.reduce((sum, part) => sum + part.discs.length, 0));
    expect(new Set(discs.map((disc) => disc.key)).size).toBe(discs.length);
    expect(discs.every((disc) => disc.key < 0)).toBe(true);
    // No shield and no core: she is worn all over.
    expect(VESPER.shield).toBeNull();
    expect(VESPER.core).toBeNull();
    expect(startCharacterBoss(VESPER).state.shielded).toBe(false);
  });

  it('is shown in six pictures, each giving way at a share of how much of her is standing', () => {
    const until = VESPER.stages!.until;
    expect(until).toHaveLength(5);
    expect(stageOf(VESPER, 1)).toBe(0);
    // Each threshold is crossed from above: at exactly the share the picture has given way.
    expect(stageOf(VESPER, until[0]! + 0.001)).toBe(0);
    expect(stageOf(VESPER, until[0]!)).toBe(1);
    expect(stageOf(VESPER, until[1]!)).toBe(2);
    expect(stageOf(VESPER, until[4]!)).toBe(5);
    expect(stageOf(VESPER, 0)).toBe(5);
    // Thresholds fall, and none of them is past the first.
    expect([...until].sort((a, b) => b - a)).toEqual([...until]);
    // 绯樱 is drawn part by part: no picture of her is picked.
    expect(stageOf(HIYOU, 0.5)).toBeNull();
    expect(startCharacterBoss(HIYOU).state.stage).toBeNull();
  });

  it('changes picture as she is worn down, and the change takes time to settle', () => {
    const boss = startCharacterBoss(VESPER);
    expect(boss.state.stage).toBe(0);
    expect(boss.stageMix).toBe(1);
    // Her head is 16 hundredths of her: worn off, the first picture gives way (0.84) and not the second.
    wearOut(boss, 'head');
    expect(boss.state.integrity).toBeCloseTo(0.84, 5);
    expect(boss.state.stage).toBe(1);
    // The new picture has only begun to come: the one before is still up.
    expect(boss.stageMix).toBe(0);
    stepCharacterBoss(boss, 0.2);
    expect(boss.stageMix).toBeCloseTo(0.2 / boss.stageFade, 5);
    for (let i = 0; i < 40; i++) stepCharacterBoss(boss, 0.05);
    expect(boss.stageMix).toBe(1);
    // A part half worn has not cost her its whole weight, and no picture changes for it.
    const next = startCharacterBoss(VESPER);
    const head = VESPER.parts.find((part) => part.id === 'head')!;
    for (let i = 0; i < hitsPerState(head); i++) hitCharacterPart(next, 'head', 100, 0, 1);
    expect(next.state.look.head.state).toBe('damaged_1');
    expect(next.state.stage).toBe(0);
    expect(next.stageMix).toBe(1);
  });

  it('keeps a hitbox off once the picture showing has no drawing where it lay', () => {
    const boss = startCharacterBoss(VESPER);
    const gone = VESPER.parts
      .flatMap((part) => part.discs)
      .filter((disc) => disc.goneAt !== null && disc.goneAt !== undefined);
    const throughout = VESPER.parts
      .flatMap((part) => part.discs)
      .filter((disc) => disc.goneAt === null || disc.goneAt === undefined);
    // The cut found places that are drawn in some pictures and not in others — a cauldron, a staff.
    expect(gone.length).toBeGreaterThan(0);
    expect(throughout.length).toBeGreaterThan(0);
    const whole = discsOf(VESPER, boss.state.look, { x: 0, y: 0 }, 0, 0);
    expect(whole).toHaveLength(gone.length + throughout.length);
    const first = Math.min(...gone.map((disc) => disc.goneAt!));
    const later = discsOf(VESPER, boss.state.look, { x: 0, y: 0 }, 0, first);
    // Gone from the picture, gone from the field — while their part is as whole as ever.
    expect(later.length).toBeLessThan(whole.length);
    expect(boss.state.look['side.L'].state).toBe('intact');
    // And back, where the picture before is showing.
    expect(discsOf(VESPER, boss.state.look, { x: 0, y: 0 }, 0, first - 1)).toHaveLength(whole.length);
  });

  it('makes her four attacks in a circle: lamp, orb, lamp, rain', () => {
    const boss = startCharacterBoss(VESPER);
    const seen: string[] = [];
    for (let i = 0; i < 8; i++) {
      boss.attackCd = 0;
      seen.push(`${characterAttack(boss).kind}:${boss.attackCd}`);
    }
    expect(seen).toEqual([
      'volley:3',
      'orb:3',
      'volley:3',
      'rain:3',
      'volley:3',
      'orb:3',
      'volley:3',
      'rain:3',
    ]);
    boss.state.phase = 4;
    boss.attackCd = 0;
    expect(characterAttack(boss)).toMatchObject({ kind: 'volley', from: ['side.R'], shots: 2 });
    expect(boss.attackCd).toBe(1.8);
    boss.attackCd = 0;
    expect(characterAttack(boss)).toMatchObject({ kind: 'orb', scatter: 10 });
  });

  it('is beaten only with every region gone, and shows her last picture before that', () => {
    const boss = startCharacterBoss(VESPER);
    for (const part of hitOrder(VESPER)) wearOut(boss, part.id);
    expect(characterDefeated(boss)).toBe(true);
    expect(characterDiscsOf(boss)).toHaveLength(0);
    expect(integrityOf(VESPER, boss.state.look)).toBe(0);
    expect(boss.state.stage).toBe(5);
  });

  it('is cut into four phases on how much of her is standing, as any character is', () => {
    const boss = startCharacterBoss(VESPER);
    // Both sides gone is a fifth of her: not yet the 0.215 the second phase is cut at.
    wearOut(boss, 'side.L');
    wearOut(boss, 'side.R');
    expect(boss.state.integrity).toBeCloseTo(0.8, 5);
    expect(characterPhase(boss)).toMatchObject({ phase: 1, changed: false });
    // Her head too: 0.36 lost.
    wearOut(boss, 'head');
    expect(characterPhase(boss)).toMatchObject({ phase: 2, changed: true });
    expect(boss.pendingLine).toBe('phase2');
    // Her body: 0.66 lost, past 0.55 — the third phase. Her skirt too, and nothing of her stands:
    // the last phase.
    wearOut(boss, 'body');
    expect(characterPhase(boss).phase).toBe(3);
    wearOut(boss, 'skirt');
    expect(characterPhase(boss).phase).toBe(4);
    expect(boss.state.integrity).toBe(0);
  });
});

describe('薇斯珀 through the world', () => {
  it("takes the lattice boss's place on the tenth level, whole", () => {
    const world = makeStand();
    expect(world.character?.def.id).toBe('vesper');
    expect(world.boss).toBeNull();
    expect(world.bricks.filter((brick) => brick.boss)).toHaveLength(0);
    expect(world.characterDiscs().length).toBeGreaterThan(40);
    expect(world.level.boss).not.toBeNull();
    // A build that cannot show her gets the lattice instead.
    const rng = new RNG(11);
    const plain = new World(createRun('campaign', 11), buildLevel(10, rng), rng.fork(), { bot: true });
    expect(plain.character).toBeNull();
    expect(plain.boss).not.toBeNull();
  });

  it('pours bricks into a row of the field, faster once her third phase has come', () => {
    const world = makeStand();
    play(world);
    expect(world.bricks).toHaveLength(0);
    let poured = 0;
    world.events.on('summon', (e) => (poured += e.count));
    const forge = VESPER.reforge!;
    world.character!.reforgeCd = 0;
    world.update(DT);
    expect(world.bricks).toHaveLength(forge.count);
    expect(poured).toBe(forge.count);
    expect(world.character!.reforgeCd).toBe(forge.every);
    for (const brick of world.bricks) {
      expect(brick.row).toBe(forge.row);
      expect(brick.vy).toBeGreaterThan(0);
    }
    expect(world.brickTotal).toBe(forge.count);
    world.character!.state.phase = 3;
    world.character!.reforgeCd = 0;
    for (const brick of world.bricks) brick.dead = true;
    world.update(DT);
    expect(world.character!.reforgeCd).toBe(forge.late);
  });

  it('shakes a rain of stars from her hat', () => {
    const world = makeStand();
    play(world);
    const before = world.bullets.length;
    world.character!.attackAt = 3;
    world.character!.attackCd = 0;
    world.update(DT);
    const fallen = world.bullets.slice(before);
    expect(fallen).toHaveLength(6);
    for (const bullet of fallen) expect(bullet.vy).toBeGreaterThan(0);
    const spread =
      Math.max(...fallen.map((bullet) => bullet.x)) - Math.min(...fallen.map((bullet) => bullet.x));
    expect(spread).toBeGreaterThan(40);
  });

  it('lob her orb from her left side, and from her body once that side is gone', () => {
    const world = makeStand();
    play(world);
    const lob = (): number => {
      const before = world.bullets.length;
      world.character!.attackAt = 1;
      world.character!.attackCd = 0;
      world.update(DT);
      return world.bullets.slice(before).filter((bullet) => bullet.big).length;
    };
    expect(lob()).toBe(1);
    for (let i = 0; i < 2000 && world.character!.state.look['side.L'].state !== 'destroyed'; i++) {
      const disc = world.characterDiscs().find((each) => each.id === 'side.L');
      if (disc)
        world.onCharacterPartHit(
          makeBall({ x: disc.x, y: disc.y, angle: 0, speed: 300, radius: 8, mult: 1 }),
          disc.key,
          0,
          1,
          disc.x,
          disc.y,
        );
    }
    expect(world.character!.state.look['side.L'].state).toBe('destroyed');
    expect(lob()).toBe(1);
  });

  it('says when her picture changes, and what the HUD shows of her follows it', () => {
    const world = makeStand();
    play(world);
    const stages: number[] = [];
    world.events.on('characterPart', (e) => {
      if (e.state === 'destroyed') stages.push(world.character!.state.stage!);
    });
    for (let i = 0; i < 2000 && world.character!.state.look.head.state !== 'destroyed'; i++) {
      const disc = world.characterDiscs().find((each) => each.id === 'head');
      if (disc)
        world.onCharacterPartHit(
          makeBall({ x: disc.x, y: disc.y, angle: 0, speed: 300, radius: 8, mult: 1 }),
          disc.key,
          0,
          1,
          disc.x,
          disc.y,
        );
    }
    expect(world.character!.state.stage).toBe(1);
    expect(stages.at(-1)).toBe(1);
  });
});

describe('what 薇斯珀 says', () => {
  it('has her name and her lines in every language, filed under the name her fight knows her by', () => {
    for (const dict of [zh, en, ja, ko]) {
      const hers = dict.characterBoss.vesper;
      const hiyou = dict.characterBoss.hiyou;
      expect(Object.keys(hers).sort(), 'same kinds of thing as 绯樱').toEqual(Object.keys(hiyou).sort());
      expect(Object.keys(hers.lines).sort()).toEqual(Object.keys(hiyou.lines).sort());
      expect(hers.code).toBe('VESPER');
      for (const line of ['intro', 'phase2', 'phase3', 'phase4', 'partDown', 'defeated']) {
        expect(hers.lines[line as keyof typeof hers.lines].length, line).toBeGreaterThan(0);
      }
    }
  });
});

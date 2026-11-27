import { describe, expect, it } from 'vitest';
import { en } from '../src/i18n/en';
import { ja } from '../src/i18n/ja';
import { ko } from '../src/i18n/ko';
import { zh } from '../src/i18n/zh';
import { RNG } from '../src/core/rng';
import { discsOf, hitOrder, hitsPerState, integrityOf } from '../src/game/character';
import {
  characterAttack,
  characterDefeated,
  characterDiscsOf,
  characterFor,
  characterPhase,
  hitCharacterPart,
  startCharacterBoss,
} from '../src/game/characterBoss';
import { HIYOU } from '../src/game/hiyou';
import { buildLevel } from '../src/game/levels/generator';
import { createRun } from '../src/game/run';
import { VESPER } from '../src/game/vesper';
import { World } from '../src/game/world';

/**
 * 薇斯珀 as a fight and through the world. She is the second character, so what is checked here
 * above all is that a second page of numbers really is all she is: nothing in her had to be
 * written for her alone.
 */

const DT = 1 / 60;

function wearOut(boss: ReturnType<typeof startCharacterBoss>, id: string, blows = 300): void {
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
    // An ordinary level, and the boss levels of the endless mode, keep the lattice.
    expect(characterFor(7)).toBeNull();
    expect(characterFor(20)).toBeNull();
  });

  it('is ten parts that are all of her, each hung on one disc or more', () => {
    expect(VESPER.parts).toHaveLength(10);
    expect(VESPER.parts.reduce((sum, part) => sum + part.weight, 0)).toBeCloseTo(1, 5);
    const ids = VESPER.parts.map((part) => part.id);
    expect(new Set(ids).size).toBe(10);
    expect(ids).toEqual(expect.arrayContaining([VESPER.core, VESPER.shield]));
    for (const part of VESPER.parts) {
      expect(part.discs.length, part.id).toBeGreaterThan(0);
      expect(part.defense, part.id).toBeGreaterThanOrEqual(0);
      expect(part.defense, part.id).toBeLessThan(1);
      for (const disc of part.discs) expect(disc.radius, part.id).toBeGreaterThan(0);
    }
    // The hat's brim is wide and the gown's hem is wide: they are the parts of more than one disc.
    expect(VESPER.parts.find((part) => part.id === 'hat')!.discs).toHaveLength(3);
    // Twenty-three discs, every one its own key, all of them negative, as the ball sweep needs.
    const keys = discsOf(VESPER, startCharacterBoss(VESPER).state.look, { x: 0, y: 0 }, 0).map(
      (disc) => disc.key,
    );
    expect(keys).toHaveLength(23);
    expect(keys).toHaveLength(VESPER.parts.reduce((sum, part) => sum + part.discs.length, 0));
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.every((key) => key < 0)).toBe(true);
  });

  it('has her star behind her cauldron until the cauldron is torn off', () => {
    const boss = startCharacterBoss(VESPER);
    expect(boss.state.shielded).toBe(true);
    expect(hitCharacterPart(boss, 'core', 100, 0, 1)).toBe(0);
    // Torn off by blows, long before her third phase: the star is bare from then on.
    wearOut(boss, 'cauldron');
    expect(boss.state.shielded).toBe(false);
    expect(boss.state.phase).toBe(1);
    expect(hitCharacterPart(boss, 'core', 100, 0, 1)).toBeCloseTo(60, 5);
    expect(characterDiscsOf(boss).map((disc) => disc.id)).not.toContain('cauldron');
    expect(characterDiscsOf(boss).map((disc) => disc.id)).toContain('core');
  });

  it('tears her cauldron off at the third phase if it is still there', () => {
    const boss = startCharacterBoss(VESPER);
    // Hat, gown, both sleeves, the lamp, her head and the hair of one side: 0.61 of her.
    for (const id of ['hat', 'robe', 'sleeve.L', 'sleeve.R', 'lantern', 'head', 'hair.L']) wearOut(boss, id);
    const before = boss.state.integrity;
    const crossed = characterPhase(boss);
    expect(crossed).toMatchObject({ phase: 3, changed: true, fell: 'cauldron' });
    expect(boss.state.look.cauldron.state).toBe('destroyed');
    expect(boss.state.shielded).toBe(false);
    expect(boss.state.integrity).toBeCloseTo(before - 0.12, 5);
    expect(boss.pendingLine).toBe('phase3');
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
    // She is quicker with every phase, and her orb scatters wider from the third.
    boss.state.phase = 4;
    boss.attackCd = 0;
    expect(characterAttack(boss)).toMatchObject({ kind: 'volley', from: ['lantern'], shots: 2 });
    expect(boss.attackCd).toBe(1.8);
    boss.attackCd = 0;
    expect(characterAttack(boss)).toMatchObject({ kind: 'orb', scatter: 10 });
  });

  it('is beaten only with every part gone', () => {
    const boss = startCharacterBoss(VESPER);
    // Everything but her star first: behind the cauldron, it takes nothing.
    for (const part of hitOrder(VESPER)) if (part.id !== 'core') wearOut(boss, part.id);
    wearOut(boss, 'core');
    expect(characterDefeated(boss)).toBe(true);
    expect(characterDiscsOf(boss)).toHaveLength(0);
    expect(integrityOf(VESPER, boss.state.look)).toBe(0);
  });

  it('wears a part through in the blows its hp names, three states and off', () => {
    const boss = startCharacterBoss(VESPER);
    const lantern = VESPER.parts.find((part) => part.id === 'lantern')!;
    const aState = hitsPerState(lantern);
    for (let i = 0; i < aState; i++) hitCharacterPart(boss, 'lantern', 100, 0, 1);
    expect(boss.state.look.lantern.state).toBe('damaged_1');
    expect(boss.state.look.lantern.flash).toBe(1);
  });
});

describe('薇斯珀 through the world', () => {
  it("takes the lattice boss's place on the tenth level, whole", () => {
    const world = makeStand();
    expect(world.character?.def.id).toBe('vesper');
    expect(world.boss).toBeNull();
    expect(world.bricks.filter((brick) => brick.boss)).toHaveLength(0);
    expect(world.characterDiscs()).toHaveLength(23);
    // The plan still carries the lattice def's name and code, as 绯樱's does.
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
      expect(brick.hp).toBeGreaterThan(0);
    }
    // Her bricks count towards the level like any other.
    expect(world.brickTotal).toBe(forge.count);
    // Poured again while the row is still there, nothing lands twice in a cell: only what of the
    // new run falls on free cells is added.
    world.character!.reforgeCd = 0;
    world.update(DT);
    expect(world.bricks.length).toBeGreaterThanOrEqual(forge.count);
    expect(world.bricks.length).toBeLessThanOrEqual(forge.count * 2 - 1);
    const cells = world.bricks.map((brick) => `${brick.col}:${brick.row}`);
    expect(new Set(cells).size).toBe(cells.length);
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
    // They fall, spread across the width of her hat.
    for (const bullet of fallen) expect(bullet.vy).toBeGreaterThan(0);
    const spread =
      Math.max(...fallen.map((bullet) => bullet.x)) - Math.min(...fallen.map((bullet) => bullet.x));
    expect(spread).toBeGreaterThan(40);
  });

  it('lob her orb from the cauldron, and from the bare star once the cauldron is gone', () => {
    const world = makeStand();
    play(world);
    const lob = (): number[] => {
      const before = world.bullets.length;
      world.character!.attackAt = 1;
      world.character!.attackCd = 0;
      world.update(DT);
      return world.bullets
        .slice(before)
        .filter((bullet) => bullet.big)
        .map((bullet) => bullet.y);
    };
    expect(lob()).toHaveLength(1);
    // The cauldron off: the star it held is what is left to throw from.
    for (let i = 0; i < 300 && world.character!.state.look.cauldron.state !== 'destroyed'; i++) {
      const disc = world.characterDiscs().find((each) => each.id === 'cauldron');
      if (disc) world.onCharacterPartHit({ mult: 1 } as never, disc.key, 0, 1, disc.x, disc.y);
    }
    expect(world.character!.state.look.cauldron.state).toBe('destroyed');
    expect(lob()).toHaveLength(1);
  });

  it('fires nothing from a lamp that is torn off, and goes on with the rest', () => {
    const world = makeStand();
    play(world);
    for (let i = 0; i < 300 && world.character!.state.look.lantern.state !== 'destroyed'; i++) {
      const disc = world.characterDiscs().find((each) => each.id === 'lantern');
      if (disc) world.onCharacterPartHit({ mult: 1 } as never, disc.key, 0, 1, disc.x, disc.y);
    }
    const before = world.bullets.length;
    world.character!.attackAt = 0;
    world.character!.attackCd = 0;
    expect(() => world.update(DT)).not.toThrow();
    expect(world.bullets.length).toBe(before);
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

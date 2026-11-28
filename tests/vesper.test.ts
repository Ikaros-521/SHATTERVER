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
  characterMuzzlesOf,
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
    // Whole, in her first picture, every hitbox that picture draws is swept, each under its own
    // negative key — and nothing it does not draw, the lamp's side included.
    const discs = characterDiscsOf(startCharacterBoss(VESPER));
    expect(discs).toHaveLength(
      VESPER.parts.reduce((sum, part) => sum + part.discs.filter((disc) => disc.live!.includes(0)).length, 0),
    );
    expect(discs).toHaveLength(46);
    expect(discs.map((disc) => disc.id)).not.toContain('side.R');
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
    // Her head is 0.145 of her and her left side a tenth: both worn off, she has come down to
    // 0.755 — past the first picture's 0.84, and not past the second's 0.68.
    wearOut(boss, 'head');
    wearOut(boss, 'side.L');
    expect(boss.state.integrity).toBeCloseTo(0.755, 5);
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

  it('is solid only where the picture showing draws her: a hitbox is swept in the pictures that draw it, and in no other', () => {
    const boss = startCharacterBoss(VESPER);
    const swept = (stage: number, id: string): number =>
      discsOf(VESPER, boss.state.look, { x: 0, y: 0 }, 0, stage).filter((disc) => disc.id === id).length;
    const drawn = (id: string, stage: number): number =>
      VESPER.parts.find((part) => part.id === id)!.discs.filter((disc) => disc.live!.includes(stage)).length;
    // The cut found places that are drawn in some pictures and not in others — a cauldron, a lamp.
    const pictures = VESPER.parts.flatMap((part) => part.discs.map((disc) => disc.live!.length));
    expect(Math.min(...pictures)).toBeLessThan(6);
    // Every region, every picture: hit exactly as often as it is drawn there.
    for (let stage = 0; stage <= 5; stage++)
      for (const part of VESPER.parts)
        expect(swept(stage, part.id), `${part.id} in picture ${stage}`).toBe(drawn(part.id, stage));
    // Her head and body and skirt are in every picture; the lamp's side only in the last two —
    // nothing there for a ball to strike while no picture hangs it out.
    for (const id of ['head', 'body', 'skirt'])
      for (let stage = 0; stage <= 5; stage++)
        expect(drawn(id, stage), `${id} in picture ${stage}`).toBeGreaterThan(0);
    expect(drawn('side.R', 3)).toBe(0);
    expect(drawn('side.R', 4)).toBe(1);
    expect(drawn('side.R', 5)).toBe(1);
  });

  it('can always be finished: whatever regions are left standing, the picture they add up to draws one of them', () => {
    // A region standing and whole that no picture showing draws would be a fight with no way on:
    // nothing left to strike, and no blow to change the picture.
    const parts = VESPER.parts;
    for (let mask = 1; mask < 1 << parts.length; mask++) {
      const left = parts.filter((_, at) => mask & (1 << at));
      const stage = stageOf(
        VESPER,
        left.reduce((sum, part) => sum + part.weight, 0),
      )!;
      const hittable = left.filter((part) => part.discs.some((disc) => disc.live!.includes(stage)));
      expect(hittable.length, left.map((part) => part.id).join(' + ')).toBeGreaterThan(0);
    }
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
    boss.attackAt = 0;
    boss.attackCd = 0;
    expect(characterAttack(boss)).toMatchObject({ kind: 'volley', from: ['side.R'], shots: 2 });
    expect(boss.attackCd).toBe(1.8);
  });

  it('keeps her one burst for the last phase: before it the attack passes her by, and none of them scatter', () => {
    const boss = startCharacterBoss(VESPER);
    // No attack of hers scatters before the last: the orb bursts into nothing early.
    boss.state.phase = 2;
    boss.attackAt = 1;
    boss.attackCd = 0;
    expect(characterAttack(boss)).toMatchObject({ kind: 'orb', scatter: 0 });
    // The burst is in her list, but the fourth phase has not come: the next attack is due instead,
    // and the round carries on from there — attackAt always names the one after what was thrown.
    boss.attackAt = 4;
    boss.attackCd = 0;
    expect(characterAttack(boss)).toMatchObject({ kind: 'volley', from: ['side.R'], shots: 2 });
    expect(boss.attackAt).toBe(1);
    // From the fourth phase on it is due like any other — once.
    boss.state.phase = 4;
    boss.attackAt = 4;
    boss.attackCd = 0;
    expect(characterAttack(boss)).toMatchObject({ kind: 'volley', shots: 8 });
    // And the clock wound the same throughout: she attacked no sooner for holding back.
    expect(boss.attackCd).toBe(1.8);
    // Her one burst is spent: its turn comes round again and the lamp's plain volley is due.
    boss.attackAt = 4;
    expect(characterAttack(boss)).toMatchObject({ kind: 'volley', from: ['side.R'], shots: 2 });
    expect(boss.attackAt).toBe(1);
  });

  it('is beaten only with every region gone, and shows her last picture before that', () => {
    const boss = startCharacterBoss(VESPER);
    for (const part of hitOrder(VESPER)) wearOut(boss, part.id);
    expect(characterDefeated(boss)).toBe(true);
    expect(characterDiscsOf(boss)).toHaveLength(0);
    expect(integrityOf(VESPER, boss.state.look)).toBe(0);
    expect(boss.state.stage).toBe(5);
  });

  it('is cut into four phases on her gauge, blows inside a state counted, where her later pictures change', () => {
    const boss = startCharacterBoss(VESPER);
    // Both sides gone is a fifth of her: 0.8 standing, her first phase still.
    wearOut(boss, 'side.L');
    wearOut(boss, 'side.R');
    expect(boss.state.integrity).toBeCloseTo(0.8, 5);
    expect(characterPhase(boss)).toMatchObject({ phase: 1, changed: false });
    // Her head too: 0.655 standing — the second picture showing, and still her first phase.
    wearOut(boss, 'head');
    expect(boss.state.integrity).toBeCloseTo(0.655, 5);
    expect(characterPhase(boss).phase).toBe(1);
    // Her body: 0.485 standing, past 0.5 — the second phase.
    wearOut(boss, 'body');
    expect(characterPhase(boss)).toMatchObject({ phase: 2, changed: true });
    expect(boss.pendingLine).toBe('phase2');
    // Her skirt worn into its second state: a third of it gone, 0.323 standing — not yet 0.32.
    const skirt = VESPER.parts.find((part) => part.id === 'skirt')!;
    const strike = (blows: number): void => {
      for (let i = 0; i < blows; i++) hitCharacterPart(boss, 'skirt', 100, 0, 1);
    };
    const standing = (worn: number): number => 0.485 * (2 / 3 - worn / (hitsPerState(skirt) * 3));
    strike(hitsPerState(skirt));
    expect(boss.state.integrity).toBeCloseTo(0.485 * (2 / 3), 5);
    expect(characterPhase(boss).phase).toBe(2);
    // Ten blows more: 0.283 standing — her third phase, though no part has changed state for it.
    strike(10);
    expect(boss.state.integrity).toBeCloseTo(standing(10), 5);
    expect(characterPhase(boss)).toMatchObject({ phase: 3, changed: true });
    expect(boss.pendingLine).toBe('phase3');
    // Her last opens at 0.22, with the fifth picture still showing: her figure all but gone.
    strike(20);
    expect(boss.state.integrity).toBeCloseTo(standing(30), 5);
    expect(characterPhase(boss)).toMatchObject({ phase: 4, changed: true });
    expect(boss.state.stage).toBe(4);
    expect(boss.pendingLine).toBe('phase4');
    // The lamp volley she kept for it is her next move, due within a second — not in its turn.
    expect(boss.attackAt).toBe(VESPER.attacks.findIndex((attack) => attack.phase === 4));
    expect(boss.attackCd).toBeLessThanOrEqual(1);
    expect(characterAttack(boss)).toMatchObject({ kind: 'volley', from: ['side.R'], shots: 8 });
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

  it('lob her orb without a fuse at all — her burst is the lamp volley, not the orb', () => {
    const world = makeStand();
    play(world);
    const orb = (): { big: number; fused: number } => {
      const before = world.bullets.length;
      world.character!.attackAt = 1;
      world.character!.attackCd = 0;
      world.update(DT);
      const big = world.bullets.slice(before).filter((bullet) => bullet.big);
      return { big: big.length, fused: big.filter((bullet) => bullet.splitT !== undefined).length };
    };
    // Early and late alike: a heavy ball only, flying on until it is blocked or it reaches the
    // floor — an orb that quietly vanished mid-air would read as a bug, and a burst there would
    // pile on her last-phase volley.
    expect(orb()).toEqual({ big: 1, fused: 0 });
    world.character!.state.phase = 4;
    expect(orb()).toEqual({ big: 1, fused: 0 });
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
    // Her head worn off is 0.855 of her standing: not far enough for the first picture to give way.
    expect(world.character!.state.stage).toBe(0);
    expect(stages).toEqual([0]);
    // Her body too — 0.685 standing, past the first picture's 0.84: the HUD hears of the part with
    // the picture it fell in.
    for (let i = 0; i < 2000 && world.character!.state.look.body.state !== 'destroyed'; i++) {
      const disc = world.characterDiscs().find((each) => each.id === 'body');
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
    expect(stages).toEqual([0, 1]);
  });

  it('throws from the lamp before any picture hangs it out, though there is nothing there for a ball', () => {
    const world = makeStand();
    play(world);
    // The first pictures do not draw her lamp: no hitbox of its side is swept...
    expect(world.characterDiscs().map((each) => each.id)).not.toContain('side.R');
    // ...but the side stands, so it is somewhere to throw from: its first disc, drawn or not.
    const lamp = characterMuzzlesOf(world.character!).find((each) => each.id === 'side.R')!;
    expect(lamp.x).toBeCloseTo(world.character!.state.x + 109.6656 * VESPER.figure, 5);
    const before = world.bullets.length;
    world.character!.attackAt = 0;
    world.character!.attackCd = 0;
    world.update(DT);
    const thrown = world.bullets.slice(before);
    expect(thrown).toHaveLength(2);
    for (const bullet of thrown) {
      // From the lamp's place — a frame's flight on, and her sway with it.
      const slack = Math.hypot(bullet.vx, bullet.vy) * DT + 1;
      expect(Math.abs(bullet.x - lamp.x)).toBeLessThan(slack);
      expect(Math.abs(bullet.y - (lamp.y + lamp.radius * 0.4))).toBeLessThan(slack);
    }
    // Torn off, a part is nowhere: not struck and not thrown from.
    world.character!.state.look['side.R'].state = 'destroyed';
    expect(characterMuzzlesOf(world.character!).map((each) => each.id)).not.toContain('side.R');
  });

  it('shakes her stars from the hat the picture showing draws, not from a brim it has left out', () => {
    const world = makeStand();
    play(world);
    const head = VESPER.parts.find((part) => part.id === 'head')!;
    // The fifth picture bends her hat: the tip of the brim is no longer drawn there.
    const tip = head.discs.find((disc) => !disc.live!.includes(4))!;
    expect(head.discs.indexOf(tip)).toBe(0);
    world.character!.state.stage = 4;
    const before = world.bullets.length;
    world.character!.attackAt = 3;
    world.character!.attackCd = 0;
    world.update(DT);
    // Six stars from across the first disc of her head that the picture does draw.
    const drawn = world.characterDiscs().find((each) => each.id === 'head')!;
    const stars = world.bullets.slice(before);
    expect(stars).toHaveLength(6);
    for (const star of stars) {
      expect(star.visual).toBe('star');
      expect(Math.abs(star.x - drawn.x)).toBeLessThan(drawn.radius * 2 + 8);
      expect(star.y).toBeGreaterThan(drawn.y - 8);
      expect(star.y).toBeLessThan(drawn.y + 26 + 8);
    }
  });

  it('hangs the lamp out with its pictures, and there it can be struck', () => {
    const world = makeStand();
    play(world);
    expect(world.characterDiscs().some((each) => each.id === 'side.R')).toBe(false);
    world.character!.state.stage = 4;
    expect(world.characterDiscs().filter((each) => each.id === 'side.R')).toHaveLength(1);
  });

  it('opens her last stand with the burst, and throws it once', () => {
    const world = makeStand();
    play(world);
    const boss = world.character!;
    // Steps the world `seconds` and reports the widest volley thrown meanwhile: the shots of a
    // frame that are neither stars nor the orb.
    let top = Math.max(0, ...world.bullets.map((bullet) => bullet.id));
    const widestVolley = (seconds: number): number => {
      let widest = 0;
      for (let t = 0; t < seconds * 60; t++) {
        world.update(DT);
        const fresh = world.bullets.filter((bullet) => bullet.id > top);
        for (const bullet of fresh) top = Math.max(top, bullet.id);
        widest = Math.max(widest, fresh.filter((bullet) => !bullet.visual && !bullet.big).length);
      }
      return widest;
    };
    // Whole, her lamp throws two at a time.
    expect(widestVolley(4)).toBe(2);
    // Worn to her last phase — nothing torn off for it, only worn — and within a second the lamp
    // empties itself.
    for (const id of ['skirt', 'body', 'head']) {
      while (boss.state.phase < 4 && boss.state.look[id].state !== 'destroyed') {
        hitCharacterPart(boss, id, 100, 0, 1);
        characterPhase(boss);
      }
    }
    expect(boss.state.phase).toBe(4);
    expect(boss.state.look.head.state).not.toBe('destroyed');
    expect(widestVolley(1.2)).toBe(8);
    // Spent: the rounds that follow hold the lamp's plain volley, and nothing wider.
    expect(widestVolley(8)).toBe(2);
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

import { describe, expect, it } from 'vitest';
import {
  characterAttack,
  characterDefeated,
  characterDiscsOf,
  characterMuzzlesOf,
  characterPhase,
  hitCharacterPart,
  startCharacterBoss,
  stepCharacterBoss,
} from '../src/game/characterBoss';
import type { CharacterDef } from '../src/game/character';
import { HIT_ORDER, HIYOU, HIYOU_PARTS, PART_WEIGHT, hitsPerState } from '../src/game/hiyou';
import type { BossPartId } from '../src/render/boss/types';

/** The parts, least weighted first, for tests that want to break her in a known order. */
const BY_WEIGHT = [...HIYOU_PARTS].sort((a, b) => PART_WEIGHT[a.id] - PART_WEIGHT[b.id]);

/** Wears a part through with blows of a known power, one at a time, and reports its state after each. */
function wearThrough(id: BossPartId, blows: number, power = 10) {
  const boss = startCharacterBoss();
  const states: string[] = [];
  for (let i = 0; i < blows; i++) {
    const dealt = hitCharacterPart(boss, id, power, 1, 0);
    states.push(`${boss.state.look[id].state}:${Math.round(dealt * 100) / 100}`);
  }
  return states;
}

describe('绯樱 as a fight', () => {
  it('is ten parts, each with a place, a weight and an order, and no two discs of one order overlap badly', () => {
    expect(HIYOU_PARTS).toHaveLength(10);
    expect(HIT_ORDER.map((part) => part.order)).toEqual(
      [...HIT_ORDER.map((part) => part.order)].sort((a, b) => b - a),
    );
    for (const part of HIYOU_PARTS) {
      expect(part.radius, part.id).toBeGreaterThan(0);
      expect(part.defense, part.id).toBeGreaterThanOrEqual(0);
      expect(part.defense, part.id).toBeLessThan(1);
      expect(PART_WEIGHT[part.id], part.id).toBeGreaterThan(0);
    }
    // The weights name the whole of her.
    expect(Object.values(PART_WEIGHT).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
  });

  it('lets nothing through a shielded core, and lets everything through once the shield is down', () => {
    const boss = startCharacterBoss();
    expect(hitCharacterPart(boss, 'Core', 100, 0, 1)).toBe(0);
    expect(boss.state.look.Core.state).toBe('intact');
    boss.state.shielded = false;
    expect(hitCharacterPart(boss, 'Core', 100, 0, 1)).toBe(60);
  });

  it('wears a part through three states and then off, at the pace its hp sets', () => {
    // A part wears by the blow: the body takes 12 a state (36 hp over three), whatever the blow's
    // strength, and her armour shows up as less hurt per blow — 10 turned to 7 by the body's 30%.
    const states = wearThrough('Body', 14, 10);
    // 12 blows keep the body whole, and the 13th wears it into its second state.
    expect(states[10]).toContain('intact');
    expect(states[11]).toContain('damaged_1');
    expect(states[13]).toContain('damaged_1');
    expect(states.every((state) => state.endsWith(':7'))).toBe(true);
    // 36 blows wear the whole body off.
    const full = wearThrough('Body', 36, 10);
    expect(full[35]).toContain('destroyed');
    // A weaker blow hurts less but counts the same.
    const soft = startCharacterBoss();
    expect(hitCharacterPart(soft, 'Body', 4, 0, 1)).toBeCloseTo(2.8, 5);
    expect(soft.state.look.Body.state).toBe('intact');
    expect(soft.wear.Body).toBe(1);
  });

  it('is beaten part by part, and her integrity falls with each', () => {
    const boss = startCharacterBoss();
    for (const part of BY_WEIGHT) {
      const before = boss.state.integrity;
      // Shielded or not, the core takes no blows until the shield is down.
      if (part.id === 'Core') boss.state.shielded = false;
      // A third of its blows to a state; rounding may ask for one more in the last of them.
      for (let i = 0; i < Math.ceil(part.hp / 3) * 3; i++) hitCharacterPart(boss, part.id, 100, 0, 1);
      expect(boss.state.look[part.id].state, part.id).toBe('destroyed');
      expect(boss.state.integrity, part.id).toBeLessThan(before);
    }
    expect(characterDefeated(boss)).toBe(true);
  });

  it('cuts her four phases on how much of her is standing, and drops the shield from the third', () => {
    const boss = startCharacterBoss();
    expect(boss.state.shielded).toBe(true);
    expect(characterPhase(boss).phase).toBe(1);
    const wearOut = (id: BossPartId): void => {
      const part = HIYOU_PARTS.find((each) => each.id === id)!;
      // A third of its blows to a state; rounding may ask for one more in the last of them.
      for (let i = 0; i < Math.ceil(part.hp / 3) * 3; i++) hitCharacterPart(boss, id, 100, 0, 1);
    };
    // Break the three lightest parts: 0.07 + 0.07 + 0.08 = 0.22 lost — phase 2.
    for (const id of ['LeftArm', 'RightArm', 'Head'] as BossPartId[]) wearOut(id);
    expect(characterPhase(boss).changed).toBe(true);
    expect(boss.state.phase).toBe(2);
    expect(boss.pendingLine).toBe('phase2');
    expect(boss.state.shielded).toBe(true);
    // Break three more: 0.08 + 0.08 + 0.09 + 0.09 more lost, 0.56 — past 0.55, so the third comes
    // as soon as the last of them falls, and the shield with it.
    for (const id of ['LeftShoulder', 'RightShoulder', 'LeftWing', 'RightWing'] as BossPartId[]) {
      wearOut(id);
      const at = characterPhase(boss).phase;
      expect(at, `after ${id}`).toBe(at === 3 ? 3 : 2);
    }
    expect(characterPhase(boss).phase).toBe(3);
    expect(boss.state.shielded).toBe(false);
    // A core hit lands now, where it did not at the start.
    expect(hitCharacterPart(boss, 'Core', 100, 0, 1)).toBeGreaterThan(0);
  });

  it('tears the shield off herself at the third phase, if it is still on her', () => {
    const boss = startCharacterBoss();
    const wearOut = (id: BossPartId): void => {
      const part = HIYOU_PARTS.find((each) => each.id === id)!;
      for (let i = 0; i < Math.ceil(part.hp / 3) * 3; i++) hitCharacterPart(boss, id, 100, 0, 1);
    };
    for (const id of [
      'LeftArm',
      'RightArm',
      'Head',
      'LeftShoulder',
      'RightShoulder',
      'LeftWing',
      'RightWing',
    ] as BossPartId[]) {
      wearOut(id);
    }
    // Still whole, and counted in her standing: the shield comes off with the phase.
    expect(boss.state.look.CoreShield.state).toBe('intact');
    const before = boss.state.integrity;
    const crossed = characterPhase(boss);
    expect(crossed).toMatchObject({ phase: 3, changed: true, fell: 'CoreShield' });
    expect(boss.state.look.CoreShield.state).toBe('destroyed');
    expect(boss.state.integrity).toBeCloseTo(before - PART_WEIGHT.CoreShield, 5);
    // Asked again, it has nothing more to tear off.
    expect(characterPhase(boss)).toMatchObject({ phase: 3, changed: false, fell: null });
  });

  it('has nothing where a torn-off part was', () => {
    const boss = startCharacterBoss();
    const whole = characterDiscsOf(boss);
    expect(whole).toHaveLength(10);
    for (let i = 0; i < 18; i++) hitCharacterPart(boss, 'Head', 100, 0, 1);
    expect(boss.state.look.Head.state).toBe('destroyed');
    const left = characterDiscsOf(boss);
    expect(left).toHaveLength(9);
    expect(left.map((disc) => disc.id)).not.toContain('Head');
    // The keys of the rest are as they were: a ball's memory of a part is still its own.
    expect(left.map((disc) => disc.key)).toEqual(
      whole.filter((disc) => disc.id !== 'Head').map((disc) => disc.key),
    );
    // A part still on her, worn or whole, is still swept.
    for (let i = 0; i < 7; i++) hitCharacterPart(boss, 'LeftArm', 100, 0, 1);
    expect(characterDiscsOf(boss).find((disc) => disc.id === 'LeftArm')?.state).toBe('damaged_1');
  });

  it('is not beaten while one part stands, whatever the rest', () => {
    const boss = startCharacterBoss();
    for (const part of HIT_ORDER) {
      if (part.id === 'Body') continue;
      for (let i = 0; i < 100; i++) hitCharacterPart(boss, part.id, 100, 0, 1);
    }
    expect(characterDefeated(boss)).toBe(false);
  });

  it('lets her gauge fall with every blow, not in steps when a part changes state', () => {
    const boss = startCharacterBoss();
    const body = HIYOU_PARTS.find((part) => part.id === 'Body')!;
    const hps = hitsPerState(body);
    const seen: number[] = [];
    for (let i = 0; i < hps; i++) {
      hitCharacterPart(boss, 'Body', 100, 0, 1);
      seen.push(boss.state.integrity);
    }
    // Every blow moves the gauge, none of them backwards.
    expect(new Set(seen).size).toBe(seen.length);
    for (let i = 1; i < seen.length; i++) expect(seen[i]!).toBeLessThan(seen[i - 1]!);
    // The last of them is the step the state change names: a third of the part's weight.
    expect(seen[seen.length - 1]!).toBeCloseTo(1 - PART_WEIGHT.Body! / 3, 3);
    expect(boss.state.look.Body.state).toBe('damaged_1');
  });

  it('fades the white of a hit, and eases a knocked part home', () => {
    const boss = startCharacterBoss();
    hitCharacterPart(boss, 'Head', 10, 1, 0);
    expect(boss.state.look.Head.flash).toBe(1);
    expect(boss.state.look.Head.dx).toBeLessThan(0);
    const drift = Math.hypot(boss.state.look.Head.dx, boss.state.look.Head.dy);
    stepCharacterBoss(boss, 0.1);
    expect(boss.state.look.Head.flash).toBeLessThan(1);
    expect(Math.hypot(boss.state.look.Head.dx, boss.state.look.Head.dy)).toBeLessThan(drift);
    // Long enough, everything is home and dark.
    for (let i = 0; i < 40; i++) stepCharacterBoss(boss, 0.1);
    expect(boss.state.look.Head.flash).toBe(0);
    expect(boss.state.look.Head.dx).toBe(0);
    expect(boss.state.look.Head.dy).toBe(0);
  });

  it('hangs together: her discs are where her parts are, at world scale, about her anchor', () => {
    const boss = startCharacterBoss();
    const discs = characterDiscsOf(boss);
    expect(discs).toHaveLength(10);
    // The head is above the anchor, in world units, and the body below it.
    const head = discs.find((disc) => disc.id === 'Head')!;
    const body = discs.find((disc) => disc.id === 'Body')!;
    // Above her anchor is a smaller y; her parts all hang above it.
    expect(head.y).toBeLessThan(boss.state.y);
    expect(body.y).toBeLessThan(boss.state.y);
    expect(body.y).toBeGreaterThan(head.y);
    expect(head.x).toBeCloseTo(boss.state.x, 5);
    // The sweep keys are negative, and so never a brick's id.
    for (const disc of discs) expect(disc.key).toBeLessThan(0);
    expect(new Set(discs.map((disc) => disc.key)).size).toBe(10);
  });

  it('says one line at a time, and not before a beat has passed since the last', () => {
    const boss = startCharacterBoss();
    boss.pendingLine = 'intro';
    stepCharacterBoss(boss, 0.5);
    expect(boss.state.line).toBeNull();
    stepCharacterBoss(boss, 0.8);
    expect(boss.state.line).toBe('intro');
    stepCharacterBoss(boss, 0.1);
    expect(boss.state.line).toBeNull();
    boss.pendingLine = 'phase2';
    stepCharacterBoss(boss, 5);
    expect(boss.state.line).toBe('phase2');
  });
});

describe('her attacks', () => {
  it('alternates a volley from her wings and a core orb, resets the clock, and scatters wider late', () => {
    const boss = startCharacterBoss();
    expect(boss.attackCd).toBeGreaterThan(0);
    const seen: string[] = [];
    for (let i = 0; i < 6; i++) {
      boss.attackCd = 0;
      const attack = characterAttack(boss);
      seen.push(`${attack.kind}:${attack.scatter}`);
      expect(boss.attackCd, `attack ${i}`).toBeGreaterThan(0);
    }
    expect(seen).toEqual(['volley:0', 'orb:8', 'volley:0', 'orb:8', 'volley:0', 'orb:8']);
    // Late phases scatter wider.
    boss.state.phase = 3;
    boss.attackCd = 0;
    expect(characterAttack(boss)).toMatchObject({ kind: 'volley', scatter: 0 });
    boss.attackCd = 0;
    expect(characterAttack(boss)).toMatchObject({ kind: 'orb', scatter: 10 });
  });
});

/** 绯樱 as a boss of few, broad regions would be: her phases cut on her gauge, and one attack kept for her last. */
const GAUGED: CharacterDef = {
  ...HIYOU,
  phases: [0.5, 0.32, 0.22],
  attacks: [...HIYOU.attacks, { kind: 'volley', from: ['Core'], shots: 8, phase: 4, once: true }],
};
const BURST = GAUGED.attacks.length - 1;

/** Wears every blow but the last one out of every part of hers, so many states deep. */
function wearEverywhere(boss: ReturnType<typeof startCharacterBoss>, states: number): void {
  for (const part of HIYOU_PARTS) {
    // The core is behind its shield: a test that wears everything opens it first.
    if (part.id === 'Core') boss.state.shielded = false;
    for (let i = 0; i < hitsPerState(part) * states; i++) hitCharacterPart(boss, part.id, 100, 0, 1);
  }
}

describe('a character whose phases are cut on her gauge', () => {
  it('counts the blows her parts have taken inside their states, where nothing has been torn off yet', () => {
    const boss = startCharacterBoss(GAUGED);
    // Two-thirds of the way through every part of her: nothing torn off, and by the gauge she is
    // down to a third — her second phase, where parts torn off whole would have her in her first.
    wearEverywhere(boss, 2);
    expect(boss.state.integrity).toBeCloseTo(1 / 3, 5);
    expect(characterDefeated(boss)).toBe(false);
    expect(characterPhase(boss)).toMatchObject({ phase: 2, changed: true });
    expect(boss.pendingLine).toBe('phase2');
    // 绯樱 as she is written — no cut named — is cut as before, on what has been torn off.
    const written = startCharacterBoss();
    wearEverywhere(written, 2);
    expect(characterPhase(written).phase).toBe(1);
  });

  it('tears her shield off at the third phase just the same, wherever that phase is cut', () => {
    const boss = startCharacterBoss(GAUGED);
    wearEverywhere(boss, 2);
    // Every part one blow from its last state but whole: the gauge says a twelfth of her stands.
    for (const part of HIYOU_PARTS) {
      for (let i = 0; i < hitsPerState(part) - 1; i++) hitCharacterPart(boss, part.id, 100, 0, 1);
    }
    expect(boss.state.integrity).toBeLessThan(0.22);
    expect(characterPhase(boss)).toMatchObject({ phase: 4, changed: true, fell: 'CoreShield' });
    expect(boss.state.shielded).toBe(false);
    expect(boss.state.look.CoreShield.state).toBe('destroyed');
  });
});

describe('an attack kept for a phase', () => {
  it('is her next move the moment that phase has come, and no later than a second into it', () => {
    const boss = startCharacterBoss(GAUGED);
    boss.attackAt = 2;
    boss.attackCd = 2.0;
    wearEverywhere(boss, 2);
    // The second phase came with that: nothing of hers is kept for it, and her rounds go on from
    // where they were.
    expect(characterPhase(boss).phase).toBe(2);
    expect(boss.attackAt).toBe(2);
    expect(boss.attackCd).toBe(2.0);
    // Into her last: the burst is next, and due within a second whatever the clock said.
    const wearOut = (id: BossPartId): void => {
      for (let i = 0; i < 60; i++) hitCharacterPart(boss, id, 100, 0, 1);
    };
    wearOut('Body');
    wearOut('CoreShield');
    hitCharacterPart(boss, 'LeftArm', 100, 0, 1);
    expect(boss.state.integrity).toBeLessThanOrEqual(0.22);
    expect(characterPhase(boss).phase).toBe(4);
    expect(boss.attackAt).toBe(BURST);
    expect(boss.attackCd).toBe(1.0);
    expect(characterAttack(boss)).toMatchObject({ kind: 'volley', from: ['Core'], shots: 8 });
  });

  it('is thrown once: spent, it passes her by like one held back, and the clock winds the same', () => {
    const boss = startCharacterBoss(GAUGED);
    boss.state.phase = 4;
    boss.attackAt = BURST;
    expect(characterAttack(boss)).toMatchObject({ kind: 'volley', shots: 8 });
    expect(boss.spent[BURST]).toBe(true);
    expect(boss.attackCd).toBe(1.5);
    // Its turn come round again: the next attack is due instead, and the round carries on from there.
    boss.attackAt = BURST;
    expect(characterAttack(boss)).toMatchObject({
      kind: 'volley',
      from: ['LeftWing', 'RightWing'],
      shots: 2,
    });
    expect(boss.attackAt).toBe(1);
  });

  it('leaves her nothing to throw once every one of hers is held back or spent, and costs her nothing', () => {
    const kept: CharacterDef = {
      ...HIYOU,
      attacks: [
        { kind: 'volley', from: ['Core'], shots: 8, phase: 4, once: true },
        { kind: 'orb', from: ['Core'], phase: 3, once: true },
      ],
    };
    // Held back: before the third phase neither is due, whichever of the two the round has come to.
    for (const at of [0, 1]) {
      const early = startCharacterBoss(kept);
      early.attackAt = at;
      early.attackCd = 0;
      expect(characterAttack(early).kind).toBe('');
      expect(early.attackCd).toBeGreaterThan(0);
    }
    // Spent: in her last phase with both thrown, just the same.
    const late = startCharacterBoss(kept);
    late.state.phase = 4;
    late.spent = [true, true];
    late.attackCd = 0;
    expect(characterAttack(late).kind).toBe('');
    expect(late.attackCd).toBeGreaterThan(0);
  });
});

describe('where she throws from', () => {
  it('is where her parts are, one place a part, and nowhere once it is torn off', () => {
    const boss = startCharacterBoss();
    const muzzles = characterMuzzlesOf(boss);
    expect(muzzles.map((disc) => disc.id).sort()).toEqual(HIYOU_PARTS.map((part) => part.id).sort());
    // For a boss of one disc a part, the place she throws from is the place the ball strikes.
    const discs = characterDiscsOf(boss);
    for (const muzzle of muzzles) {
      const disc = discs.find((each) => each.id === muzzle.id)!;
      expect([muzzle.x, muzzle.y, muzzle.radius]).toEqual([disc.x, disc.y, disc.radius]);
    }
    for (let i = 0; i < 18; i++) hitCharacterPart(boss, 'Head', 100, 0, 1);
    expect(characterMuzzlesOf(boss).map((disc) => disc.id)).not.toContain('Head');
  });
});

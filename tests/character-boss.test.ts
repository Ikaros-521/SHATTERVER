import { describe, expect, it } from 'vitest';
import {
  characterAttack,
  characterDefeated,
  characterDiscsOf,
  characterPhase,
  hitCharacterPart,
  startCharacterBoss,
  stepCharacterBoss,
} from '../src/game/characterBoss';
import { HIT_ORDER, HIYOU_PARTS, PART_WEIGHT } from '../src/game/hiyou';
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

  it('is not beaten while one part stands, whatever the rest', () => {
    const boss = startCharacterBoss();
    for (const part of HIT_ORDER) {
      if (part.id === 'Body') continue;
      for (let i = 0; i < 100; i++) hitCharacterPart(boss, part.id, 100, 0, 1);
    }
    expect(characterDefeated(boss)).toBe(false);
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
  it('alternates wings and core orb, resets the clock, and scatters wider late', () => {
    const boss = startCharacterBoss();
    expect(boss.attackCd).toBeGreaterThan(0);
    const seen: string[] = [];
    for (let i = 0; i < 6; i++) {
      boss.attackCd = 0;
      const attack = characterAttack(boss);
      seen.push(`${attack.kind}:${attack.scatter}`);
      expect(boss.attackCd, `attack ${i}`).toBeGreaterThan(0);
    }
    expect(seen).toEqual(['wings:0', 'orb:8', 'wings:0', 'orb:8', 'wings:0', 'orb:8']);
    // Late phases scatter wider.
    boss.state.phase = 3;
    boss.attackCd = 0;
    expect(characterAttack(boss)).toMatchObject({ kind: 'wings', scatter: 0 });
    boss.attackCd = 0;
    expect(characterAttack(boss)).toMatchObject({ kind: 'orb', scatter: 10 });
  });
});

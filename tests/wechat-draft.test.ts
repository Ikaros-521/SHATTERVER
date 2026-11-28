/**
 * The draft screen: card contents, level notes, rarity tints and the reroll/skip pair.
 */
import { describe, expect, it } from 'vitest';
import { t } from '../src/core/i18n';
import { UPGRADES, UPGRADE_MAP } from '../src/game/upgrades/defs';
import { RARITY_INFO } from '../src/game/upgrades/present';
import type { UpgradeDef } from '../src/game/upgrades/types';
import { rarityName } from '../src/i18n/content';
import { rgba } from '../src/ui/canvas/theme';
import { uniformMeasurer } from '../src/ui/canvas/text';
import { layoutWidget, type ButtonWidget, type Widget } from '../src/ui/canvas/widgets';
import { draftTree, type DraftActions, type DraftModel } from '../src/wechat/screens/draft';

const m = uniformMeasurer(0.5);

function options(): UpgradeDef[] {
  return [
    UPGRADE_MAP[UPGRADES[0]?.id as string] ?? (UPGRADES[0] as UpgradeDef),
    UPGRADES[1] as UpgradeDef,
    UPGRADES[2] as UpgradeDef,
  ];
}

function model(over: Partial<DraftModel> = {}): DraftModel {
  return {
    intro: false,
    code: '2-3',
    options: options(),
    levels: [0, 2, 5],
    crystals: 30,
    rerollCost: 25,
    skipReward: 15,
    banCosts: options().map(() => 30),
    armedBan: null,
    build: [{ id: options()[0]!.id, level: 2 }],
    armedDiscard: null,
    ...over,
  };
}

function actions(): { acts: DraftActions; state: { picked: string[]; rerolled: number; skipped: number; banned: string[] } } {
  const state = { picked: [] as string[], rerolled: 0, skipped: 0, banned: [] as string[] };
  const acts: DraftActions = {
    pick: (id) => state.picked.push(id),
    banArm: () => {},
    ban: (id) => state.banned.push(id),
    discardArm: () => {},
    discard: (id) => state.banned.push(id),
    reroll: () => state.rerolled++,
    skip: () => state.skipped++,
  };
  return { acts, state };
}

function buttons(root: Widget): ButtonWidget[] {
  const found: ButtonWidget[] = [];
  const walk = (w: Widget): void => {
    if (w.kind === 'button') found.push(w);
    if (w.kind === 'panel' || w.kind === 'row') w.children.forEach(walk);
    if (w.kind === 'scroll') walk(w.child);
  };
  walk(root);
  return found;
}

describe('draftTree', () => {
  it('builds one tinted card per option plus the reroll/skip pair', () => {
    const { acts } = actions();
    const tree = draftTree(model(), acts, 400, 800, m);
    layoutWidget(tree, 0, 0, 400, m);
    const all = buttons(tree);
    // Three option cards + a ban pill each + a build tile + reroll + skip.
    expect(all).toHaveLength(9);
    const cards = all.filter((b) => b.sub?.includes(rarityName(options()[0]!.rarity)) ?? false);
    expect(cards[0]?.sub).toContain(rarityName(options()[0]!.rarity));
    expect(cards[0]?.strokeOverride).toBe(rgba(RARITY_INFO[options()[0]!.rarity].color, 0.9));
    // Each card's ban pill quotes its own price.
    const bans = all.filter((b) => b.text.startsWith(t('draft.ban')));
    expect(bans).toHaveLength(3);
    for (const pill of bans) expect(pill.text).toContain('◆30');
  });

  it('words the level jump, NEW and maxed states like the DOM cards', () => {
    const texts: string[] = [];
    const walk = (w: Widget): void => {
      if (w.kind === 'button') texts.push(w.trailing ?? w.text);
      if (w.kind === 'label') texts.push(w.text);
      if (w.kind === 'panel' || w.kind === 'row') w.children.forEach(walk);
      if (w.kind === 'scroll') walk(w.child);
    };
    walk(draftTree(model(), actions().acts, 400, 800, m));
    expect(texts).toContain(t('draft.newUpgrade')); // level 0
    expect(texts.some((line) => line.includes('Lv 2 → 3'))).toBe(true); // mid-level
    expect(texts.some((line) => line.includes(t('draft.maxed')))).toBe(true); // at maxLevel
  });

  it('disables reroll when the crystals cannot cover the cost, and wires the actions', () => {
    const { acts, state } = actions();
    const all = buttons(draftTree(model({ crystals: 10 }), acts, 400, 800, m));
    const reroll = all.find((b) => b.text === t('draft.reroll'));
    const skip = all.find((b) => b.text === t('draft.skip'));
    expect(reroll?.disabled).toBe(true);
    expect(skip?.disabled).toBe(false);

    const rich = buttons(draftTree(model({ crystals: 100 }), acts, 400, 800, m));
    rich.find((b) => b.sub?.includes(rarityName(options()[0]!.rarity)))?.onTap();
    rich.find((b) => b.text === t('draft.reroll'))?.onTap();
    rich.find((b) => b.text === t('draft.skip'))?.onTap();
    expect(state.rerolled).toBe(1);
    expect(state.skipped).toBe(1);
    expect(state.picked).toEqual([options()[0]?.id]);
  });

  it('uses the head-start eyebrow on the intro draft', () => {
    const texts: string[] = [];
    const walk = (w: Widget): void => {
      if (w.kind === 'label') texts.push(w.text);
      if (w.kind === 'panel' || w.kind === 'row') w.children.forEach(walk);
      if (w.kind === 'scroll') walk(w.child);
    };
    walk(draftTree(model({ intro: true, code: '' }), actions().acts, 400, 800, m));
    expect(texts).toContain(t('shop.headstartEyebrow'));
  });

  it('counts off a wave sector’s bonus on the drafts it granted, and nowhere else', () => {
    const texts: string[] = [];
    const walk = (w: Widget): void => {
      if (w.kind === 'label') texts.push(w.text);
      if (w.kind === 'panel' || w.kind === 'row') w.children.forEach(walk);
      if (w.kind === 'scroll') walk(w.child);
    };
    const reward = { crystals: 150, shield: 1, picks: 3, pick: 2 };
    const lines = (over: Partial<DraftModel>): string[] => {
      texts.length = 0;
      walk(draftTree(model(over), actions().acts, 400, 800, m));
      return [...texts];
    };
    const bonus = (all: string[]): string | undefined =>
      all.find((text) => text.startsWith(t('draft.rewardTitle')));

    const texts2 = lines({ code: '5-1', reward });
    expect(texts2).toContain(t('draft.rewardEyebrow', { code: '5-1', n: 2, total: 3 }));
    expect(bonus(texts2)).toContain(t('draft.rewardCrystals', { n: 150 }));
    expect(bonus(texts2)).toContain(t('draft.rewardShield', { n: 1 }));
    expect(bonus(texts2)).toContain(t('draft.rewardPicks', { n: 3 }));

    // A full shield restored nothing: the line leaves it out rather than promising "+0".
    const full = lines({ reward: { ...reward, shield: 0 } });
    expect(bonus(full)).toBeDefined();
    expect(bonus(full)).not.toContain(t('draft.rewardShield', { n: 0 }));

    // Every other draft reads as it did.
    const plain = lines({});
    expect(plain).toContain(t('draft.eyebrow', { code: '2-3' }));
    expect(bonus(plain)).toBeUndefined();
    // So does the opening draft, whatever the model carries.
    const intro = lines({ intro: true, code: '', reward });
    expect(intro).toContain(t('shop.headstartEyebrow'));
    expect(bonus(intro)).toBeUndefined();
  });
});

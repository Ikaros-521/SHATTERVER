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
    ...over,
  };
}

function actions(): { acts: DraftActions; state: { picked: string[]; rerolled: number; skipped: number } } {
  const state = { picked: [] as string[], rerolled: 0, skipped: 0 };
  const acts: DraftActions = {
    pick: (id) => state.picked.push(id),
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
    // Three option cards + reroll + skip.
    expect(all).toHaveLength(5);
    const cards = all.slice(0, 3);
    expect(cards[0]?.sub).toContain(rarityName(options()[0]!.rarity));
    expect(cards[0]?.strokeOverride).toBe(rgba(RARITY_INFO[options()[0]!.rarity].color, 0.9));
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
    rich.find((b) => b.text === t('draft.reroll'))?.onTap();
    rich.find((b) => b.text === t('draft.skip'))?.onTap();
    rich[0]?.onTap();
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
});

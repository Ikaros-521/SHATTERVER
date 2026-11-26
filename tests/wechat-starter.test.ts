/**
 * The starter screen: difficulty selector, loadout chips and protocol cards, driven against a
 * default save shape.
 */
import { describe, expect, it } from 'vitest';
import { t } from '../src/core/i18n';
import { defaultSave, type SaveData } from '../src/core/storage';
import { STARTERS } from '../src/game/starters';
import { starterTree, type StarterActions } from '../src/wechat/screens/starter';
import { uniformMeasurer } from '../src/ui/canvas/text';
import type { ButtonWidget, Widget } from '../src/ui/canvas/widgets';
import type { DifficultyId } from '../src/game/difficulty';

const m = uniformMeasurer(0.5);

function buttonsOf(root: Widget): ButtonWidget[] {
  const found: ButtonWidget[] = [];
  const walk = (w: Widget): void => {
    if (w.kind === 'button') found.push(w);
    if (w.kind === 'panel' || w.kind === 'row') w.children.forEach(walk);
    if (w.kind === 'scroll') walk(w.child);
  };
  walk(root);
  return found;
}

function tree(save: SaveData, actions: StarterActions, difficulty: DifficultyId = 'standard'): Widget {
  return starterTree(save, { mode: 'campaign', difficulty }, actions, 400, 800, m);
}

describe('starterTree', () => {
  it('lists the five difficulty tiers with the chosen one highlighted', () => {
    const variants: string[] = [];
    const tree0 = tree(defaultSave(), {
      back(): void {},
      setDifficulty(): void {},
      toggleLoadout(): void {},
      start(): void {},
    });
    buttonsOf(tree0)
      .filter((b) => b.sub?.includes('×'))
      .forEach((b) => variants.push(b.variant));
    expect(variants).toEqual(['primary', 'ghost', 'ghost', 'ghost', 'ghost']);

    const tree1 = tree(
      defaultSave(),
      { back(): void {}, setDifficulty(): void {}, toggleLoadout(): void {}, start(): void {} },
      'abyss',
    );
    const abyss = buttonsOf(tree1).find((b) => b.sub?.includes('ABYSS'));
    expect(abyss?.variant).toBe('primary');
  });

  it('shows one card per free starter, with crystals or grants as the footnote', () => {
    const save = defaultSave();
    const cardCount = buttonsOf(
      tree(save, { back(): void {}, setDifficulty(): void {}, toggleLoadout(): void {}, start(): void {} }),
    ).filter((b) => b.sub && !b.sub.includes('×')).length;
    expect(cardCount).toBe(STARTERS.length);
  });

  it('dispatches card taps to start with the tapped starter', () => {
    const started: string[] = [];
    const actions: StarterActions = {
      back(): void {},
      setDifficulty(): void {},
      toggleLoadout(): void {},
      start: (starter) => started.push(starter.id),
    };
    const cards = buttonsOf(tree(defaultSave(), actions)).filter((b) => b.sub && !b.sub.includes('×'));
    cards[1]?.onTap();
    expect(started).toEqual([STARTERS[1]?.id]);
  });

  it('hides the loadout row when the player owns no supplies', () => {
    const texts: string[] = [];
    const walk = (w: Widget): void => {
      if (w.kind === 'label') texts.push(w.text);
      if (w.kind === 'panel' || w.kind === 'row') w.children.forEach(walk);
      if (w.kind === 'scroll') walk(w.child);
    };
    walk(
      tree(defaultSave(), {
        back(): void {},
        setDifficulty(): void {},
        toggleLoadout(): void {},
        start(): void {},
      }),
    );
    expect(texts.some((line) => line.includes(t('shop.loadoutTitle')))).toBe(false);
  });

  it('shows loadout chips with slot usage when supplies are owned', () => {
    const save = defaultSave();
    save.economy.supplies = ['cache', 'spare'];
    save.economy.loadout = ['cache'];
    const texts: string[] = [];
    const chips: ButtonWidget[] = [];
    const walk = (w: Widget): void => {
      if (w.kind === 'label') texts.push(w.text);
      if (w.kind === 'button' && w.sub === undefined) chips.push(w);
      if (w.kind === 'panel' || w.kind === 'row') w.children.forEach(walk);
      if (w.kind === 'scroll') walk(w.child);
    };
    walk(
      tree(save, { back(): void {}, setDifficulty(): void {}, toggleLoadout(): void {}, start(): void {} }),
    );
    expect(texts.some((line) => line.includes(t('shop.loadoutTitle')))).toBe(true);
    const carried = chips.find((b) => b.text === t('shop.supply.cache.name'));
    expect(carried?.variant).toBe('primary');
  });
});

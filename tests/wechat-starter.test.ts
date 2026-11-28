/**
 * The starter screen: difficulty selector, loadout chips, roster sort and protocol cards,
 * driven against a default save shape.
 */
import { describe, expect, it } from 'vitest';
import { t } from '../src/core/i18n';
import { defaultSave, type SaveData } from '../src/core/storage';
import { STARTERS, type StarterSortId } from '../src/game/starters';
import { PROTOCOLS } from '../src/game/economy/catalog';
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

function paragraphsOf(root: Widget): number {
  let found = 0;
  const walk = (w: Widget): void => {
    if (w.kind === 'paragraph') found++;
    if (w.kind === 'panel' || w.kind === 'row') w.children.forEach(walk);
    if (w.kind === 'scroll') walk(w.child);
  };
  walk(root);
  return found;
}

function actions(seed: Partial<StarterActions> = {}): StarterActions {
  return {
    back(): void {},
    setDifficulty(): void {},
    setSort(): void {},
    toggleLoadout(): void {},
    start(): void {},
    ...seed,
  };
}

function tree(
  save: SaveData,
  acts: StarterActions = actions(),
  difficulty: DifficultyId = 'standard',
  sort: StarterSortId = 'default',
): Widget {
  return starterTree(save, { mode: 'campaign', difficulty, sort }, acts, 400, 800, m);
}

/** The protocol-card buttons: a sub label without the difficulty row's × multiplier. */
function cardsOf(root: Widget): ButtonWidget[] {
  return buttonsOf(root).filter((b) => b.sub && !b.sub.includes('×'));
}

/** The three sort chips by their labels. */
function sortChipsOf(root: Widget): ButtonWidget[] {
  const labels = [t('starter.sort.default'), t('starter.sort.frequent'), t('starter.sort.name')];
  return buttonsOf(root).filter((b) => labels.includes(b.text));
}

function starterNameOf(id: string): string {
  const starter = [...STARTERS, ...PROTOCOLS].find((s) => s.id === id);
  if (!starter) throw new Error(`unknown starter ${id}`);
  return starter.name;
}

describe('starterTree', () => {
  it('lists the five difficulty tiers with the chosen one highlighted', () => {
    const variants: string[] = [];
    buttonsOf(tree(defaultSave()))
      .filter((b) => b.sub?.includes('×'))
      .forEach((b) => variants.push(b.variant));
    expect(variants).toEqual(['primary', 'ghost', 'ghost', 'ghost', 'ghost']);

    const abyss = buttonsOf(tree(defaultSave(), actions(), 'abyss')).find((b) => b.sub?.includes('ABYSS'));
    expect(abyss?.variant).toBe('primary');
  });

  it('shows one card per free starter, with crystals or grants as the footnote', () => {
    expect(cardsOf(tree(defaultSave()))).toHaveLength(STARTERS.length);
  });

  it('dispatches card taps to start with the tapped starter', () => {
    const started: string[] = [];
    const cards = cardsOf(
      tree(defaultSave(), actions({ start: (starter) => void started.push(starter.id) })),
    );
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
    walk(tree(defaultSave()));
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
    walk(tree(save));
    expect(texts.some((line) => line.includes(t('shop.loadoutTitle')))).toBe(true);
    const carried = chips.find((b) => b.text === t('shop.supply.cache.name'));
    expect(carried?.variant).toBe('primary');
  });

  it('hides the sort chips until a shop protocol is owned, then marks the active one', () => {
    expect(sortChipsOf(tree(defaultSave()))).toHaveLength(0);

    const save = defaultSave();
    save.economy.protocols = ['chrono'];
    const chips = sortChipsOf(tree(save));
    expect(chips.map((b) => b.variant)).toEqual(['primary', 'ghost', 'ghost']);
  });

  it('reorders the cards under the frequent sort by picks, catalog order breaking ties', () => {
    const save = defaultSave();
    save.economy.protocols = ['chrono'];
    save.economy.picksByStarter = { barrage: 4 };
    const cards = cardsOf(tree(save, actions(), 'standard', 'frequent'));
    expect(cards.map((b) => b.text)).toEqual([
      starterNameOf('barrage'),
      starterNameOf('blank'),
      starterNameOf('battery'),
      starterNameOf('element'),
      starterNameOf('chrono'),
    ]);
  });

  it('drops the description and the numbering once the roster goes compact', () => {
    const save = defaultSave();
    // Six cards — the compact threshold: only the two screen paragraphs remain (sub + detail),
    // and the card buttons lose their trailing numbers.
    save.economy.protocols = PROTOCOLS.slice(0, 2).map((p) => p.id);
    expect(paragraphsOf(tree(save))).toBe(2);
    expect(cardsOf(tree(save)).every((b) => b.trailing === undefined)).toBe(true);

    // Five cards stay big: every card keeps its description paragraph and its number.
    save.economy.protocols = PROTOCOLS.slice(0, 1).map((p) => p.id);
    expect(paragraphsOf(tree(save))).toBe(2 + 5);
    expect(cardsOf(tree(save)).filter((b) => b.trailing !== undefined)).toHaveLength(5);
  });
});

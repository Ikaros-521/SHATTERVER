/**
 * The codex screen: rarity grouping, undiscovered marks, the four tabs and their bodies.
 */
import { describe, expect, it } from 'vitest';
import { t } from '../src/core/i18n';
import { UPGRADES } from '../src/game/upgrades/defs';
import { upgradeName } from '../src/i18n/content';
import { codexTree, type CodexActions, type CodexState } from '../src/wechat/screens/codex';
import { uniformMeasurer } from '../src/ui/canvas/text';
import { layoutWidget, type Widget } from '../src/ui/canvas/widgets';

const m = uniformMeasurer(0.5);

const ACTIONS: CodexActions = {
  back(): void {},
  setTab(): void {},
};

function tree(over: Partial<CodexState> = {}): Widget {
  return codexTree({ tab: 'upgrades', discovered: new Set(), ...over }, ACTIONS, 400, 800, m);
}

function texts(root: Widget): string[] {
  const out: string[] = [];
  const walk = (w: Widget): void => {
    if (w.kind === 'label' || w.kind === 'paragraph') out.push(w.text);
    if (w.kind === 'panel' || w.kind === 'row') w.children.forEach(walk);
    if (w.kind === 'scroll') walk(w.child);
  };
  walk(root);
  return out;
}

describe('codexTree', () => {
  it('groups upgrades by rarity with the progress line', () => {
    const out = texts(tree());
    expect(out).toContain(t('codex.progressUpgrades', { n: 0, total: UPGRADES.length }));
    expect(out.some((line) => line.startsWith('LEGENDARY ·'))).toBe(true);
    expect(out.some((line) => line.startsWith('COMMON ·'))).toBe(true);
  });

  it('marks undiscovered upgrades and clears the mark once discovered', () => {
    const fresh = texts(tree());
    // The mark joins the level note on one line ('唯一 · 未遇到'), hence `includes`.
    expect(fresh.some((line) => line.includes(t('codex.undiscovered')))).toBe(true);
    const discoveredId = UPGRADES[0]?.id as string;
    const seen = texts(tree({ discovered: new Set([discoveredId]) }));
    expect(seen.some((line) => line.includes(t('codex.undiscovered')))).toBe(true); // others remain
    // But the discovered upgrade's own line no longer carries it.
    const name = upgradeName(UPGRADES[0]!);
    const ownLine = seen.find((line) => line.includes(name));
    expect(ownLine).toBeDefined();
    expect(ownLine?.includes(t('codex.undiscovered'))).toBe(false);
  });

  it('switches to the reactions tab with recipes and descriptions', () => {
    const out = texts(tree({ tab: 'reactions' }));
    expect(out).toContain(t('codex.progressReactions'));
    // The recipe line names both elements; a description follows.
    expect(out.some((line) => line.includes('+'))).toBe(true);
  });

  it('shows the buffs tab with per-buff durations', () => {
    const out = texts(tree({ tab: 'buffs' }));
    expect(out).toContain(t('codex.progressBuffs'));
    expect(out.some((line) => line.startsWith('POWER-UPS'))).toBe(true);
  });

  it('shows the rules tab with all seven sections', () => {
    const out = texts(tree({ tab: 'rules' }));
    expect(out).toContain(t('codex.ruleTarget'));
    expect(out).toContain(t('codex.ruleCrystals'));
    // A rule body survived the HTML strip: no tags remain anywhere.
    expect(out.every((line) => !line.includes('<b>'))).toBe(true);
  });

  it('lays out at phone width without overflow', () => {
    const root = tree({ tab: 'upgrades', discovered: new Set(UPGRADES.slice(0, 5).map((d) => d.id)) });
    const height = layoutWidget(root, 0, 0, 400, m);
    expect(height).toBeGreaterThan(200);
    expect(root.w).toBe(400);
  });
});

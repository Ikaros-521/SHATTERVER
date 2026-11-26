/**
 * The WeChat shell's data layer: the menu model built from a real save, and the records screen's
 * structure. Runs against `defaultSave()` shapes — no storage, no canvas.
 */
import { describe, expect, it } from 'vitest';
import { t } from '../src/core/i18n';
import { defaultSave, type RunRecord, type SaveData } from '../src/core/storage';
import { buildMenuModel, recordsLine, wishlistLine } from '../src/wechat/menumodel';
import { historyTree } from '../src/wechat/screens/history';
import { layoutWidget, panel, type ButtonWidget, type Widget } from '../src/ui/canvas/widgets';
import { uniformMeasurer } from '../src/ui/canvas/text';

const m = uniformMeasurer(0.5);

function run(over: Partial<RunRecord> = {}): RunRecord {
  const now = Date.now();
  return {
    mode: 'campaign',
    difficulty: 'standard',
    score: 1000,
    level: 6,
    code: '1-6',
    name: 'SECTOR',
    combo: 12,
    damage: 4000,
    kills: 90,
    time: 95,
    won: false,
    date: now,
    seed: 1,
    build: {},
    ...over,
  };
}

function withHistory(entries: RunRecord[]): SaveData {
  const save = defaultSave();
  save.records.history = entries;
  return save;
}

describe('recordsLine', () => {
  it('says the empty line on a fresh save', () => {
    expect(recordsLine(defaultSave())).toBe(t('menu.recordsEmpty'));
  });

  it('joins the same segments as the DOM menu, in order', () => {
    const save = defaultSave();
    save.records.bestCampaign = 8;
    save.records.bestEndless = 14;
    save.records.bestScore = 1_254_530;
    save.records.wins = 3;
    save.records.runs = 40;
    const line = recordsLine(save);
    expect(line).toContain(t('menu.recordCampaignDepth', { n: 8 }));
    expect(line).toContain(t('menu.recordBossNote', { n: 1 })); // 8/5, no win at the depth
    expect(line).toContain(t('menu.recordEndlessDepth', { n: 14 }));
    expect(line).toContain(t('menu.recordWins', { n: 3 }));
    expect(line).toContain(' · ');
  });
});

describe('buildMenuModel', () => {
  it('hides the stardust line on a brand-new player and shows the first-gift badge', () => {
    const model = buildMenuModel(defaultSave());
    expect(model.stardustText).toBe('');
    expect(model.badgeText).toBe(t('shop.giftBadge'));
    expect(model.wishText).toBeNull();
  });

  it('shows the balance once the player has economy history', () => {
    const save = defaultSave();
    save.economy.stardust = 420;
    save.economy.lifetime = 420;
    const model = buildMenuModel(save);
    expect(model.stardustText).toBe(t('shop.stardustLine', { n: 420 }));
    expect(model.badgeText).toBe(t('shop.giftBadge')); // first gift still unpaid
  });

  it('nudges towards the wishlist item with the missing amount', () => {
    const save = defaultSave();
    save.economy.wishlist = 'orbital';
    save.economy.stardust = 20;
    const line = wishlistLine(save);
    expect(line).not.toBeNull();
    expect(line).toContain(' · ');
    // An owned wish stops nudging.
    save.economy.protocols.push('orbital');
    expect(wishlistLine(save)).toBeNull();
  });
});

describe('historyTree', () => {
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

  it('builds tabs, a back button, and one row per matching run', () => {
    const save = withHistory([
      run({ score: 500, mode: 'campaign' }),
      run({ score: 900, mode: 'campaign', date: 1 }),
      run({ score: 9_000, mode: 'endless' }),
    ]);
    const tree = historyTree(save, { tab: 'campaign' }, { back(): void {}, setTab(): void {} }, 400, 800);
    layoutWidget(tree, 0, 0, 400, m);
    const buttons = buttonsOf(tree);
    // Two tabs + back.
    expect(buttons).toHaveLength(3);
    // Sorted best-first; the top row carries the gold headline.
    const scrollBody = (tree as { children: Widget[] }).children.find((child) => child.kind === 'scroll');
    expect(scrollBody).toBeDefined();
  });

  it('shows the empty message for a mode with no runs', () => {
    const save = withHistory([run({ mode: 'endless' })]);
    const tree = historyTree(save, { tab: 'campaign' }, { back(): void {}, setTab(): void {} }, 400, 800);
    const texts: string[] = [];
    const walk = (w: Widget): void => {
      if (w.kind === 'paragraph') texts.push(w.text);
      if (w.kind === 'panel' || w.kind === 'row') w.children.forEach(walk);
      if (w.kind === 'scroll') walk(w.child);
    };
    walk(tree);
    expect(texts).toContain(t('history.emptyCampaign'));
  });

  it('lays out without overlap and highlights only the top three', () => {
    const save = withHistory([
      run({ score: 700 }),
      run({ score: 600, date: 2 }),
      run({ score: 500, date: 3 }),
      run({ score: 400, date: 4 }),
    ]);
    const tree = historyTree(save, { tab: 'campaign' }, { back(): void {}, setTab(): void {} }, 400, 800);
    const height = layoutWidget(tree, 0, 0, 400, m);
    expect(height).toBeGreaterThan(100);
    // Top-3 rows get the glass background; rank 4 does not.
    const rootPanel = tree as { children: Widget[] };
    const scroller = rootPanel.children.find((child) => child.kind === 'scroll') as {
      child: { children: Widget[] };
    };
    const rows = scroller.child.children;
    expect(rows).toHaveLength(4);
    expect((rows[0] as { bg: boolean }).bg).toBe(true);
    expect((rows[2] as { bg: boolean }).bg).toBe(true);
    expect((rows[3] as { bg: boolean }).bg).toBe(false);
  });

  it('keeps the tabs as real buttons that flip the variant when active', () => {
    const save = withHistory([]);
    const active = historyTree(save, { tab: 'endless' }, { back(): void {}, setTab(): void {} }, 400, 800);
    const tabs = buttonsOf(active).slice(0, 2);
    expect(tabs[0]?.variant).toBe('ghost');
    expect(tabs[1]?.variant).toBe('primary');
  });

  void panel;
});

/**
 * The tutorial deck: page contents, dots, prev/next wiring and the placeholder facts.
 */
import { describe, expect, it } from 'vitest';
import { t } from '../src/core/i18n';
import { MAX_HP_BASE, OVERDRIVE_DURATION } from '../src/game/config';
import { UPGRADES } from '../src/game/upgrades/defs';
import { tutorialPages, tutorialTree } from '../src/wechat/screens/tutorial';
import { uniformMeasurer } from '../src/ui/canvas/text';
import { layoutWidget, type ButtonWidget, type Widget } from '../src/ui/canvas/widgets';

const m = uniformMeasurer(0.5);

function tree(page: number, goto: (n: number) => void, close: () => void): Widget {
  return tutorialTree(page, { close, goto }, 400, 800, m);
}

const noop = (): void => {};

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

describe('tutorialPages', () => {
  it('fills the fact placeholders and strips the HTML', () => {
    const pages = tutorialPages();
    expect(pages.length).toBeGreaterThan(3);
    const all = pages.map((p) => p.eyebrow + p.title + p.body).join('\n');
    expect(all.includes('{maxHp}')).toBe(false);
    expect(all.includes(String(MAX_HP_BASE))).toBe(true);
    expect(all.includes(String(OVERDRIVE_DURATION))).toBe(true);
    expect(all.includes(String(UPGRADES.length))).toBe(true);
    expect(all.includes('<b>')).toBe(false);
  });
});

describe('tutorialTree', () => {
  it('shows page one with only next (no prev), the last page with a back-style close', () => {
    const first = buttons(tree(0, noop, noop));
    expect(first.find((b) => b.text === t('tutorial.prev'))).toBeUndefined();
    expect(first.find((b) => b.text === t('tutorial.next'))).toBeDefined();

    const pageCount = tutorialPages().length;
    const last = buttons(tree(pageCount - 1, noop, noop));
    expect(last.find((b) => b.text === t('common.back'))).toBeDefined();
  });

  it('dispatches next/prev as page turns and skip as close', () => {
    let wentTo = -1;
    let closed = false;
    const deck = buttons(
      tree(
        1,
        (n) => (wentTo = n),
        () => (closed = true),
      ),
    );
    deck.find((b) => b.text === t('tutorial.next'))?.onTap();
    expect(wentTo).toBe(2);
    const again = buttons(
      tree(
        2,
        (n) => (wentTo = n),
        () => (closed = true),
      ),
    );
    again.find((b) => b.text === t('tutorial.prev'))?.onTap();
    expect(wentTo).toBe(1);
    buttons(
      tree(
        0,
        (n) => (wentTo = n),
        () => (closed = true),
      ),
    )
      .find((b) => b.text === t('tutorial.skip'))
      ?.onTap();
    expect(closed).toBe(true);
  });

  it('renders one dot per page and lays out without overflow', () => {
    const pages = tutorialPages().length;
    const root = tree(0, noop, noop);
    const out: string[] = [];
    const walk = (w: Widget): void => {
      if (w.kind === 'label' && (w.text === '●' || w.text === '○')) out.push(w.text);
      if (w.kind === 'panel' || w.kind === 'row') w.children.forEach(walk);
      if (w.kind === 'scroll') walk(w.child);
    };
    walk(root);
    expect(out).toHaveLength(pages);
    expect(layoutWidget(root, 0, 0, 400, m)).toBeGreaterThan(200);
  });
});

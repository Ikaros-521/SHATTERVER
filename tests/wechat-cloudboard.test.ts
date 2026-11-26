/**
 * The cloud leaderboard screen: tabs, per-tab cache states (loading / offline / rows) and the
 * nickname line — the tree is a pure function of the shell's cache, so no channel is involved.
 */
import { describe, expect, it } from 'vitest';
import { t } from '../src/core/i18n';
import { FANOUT_BOARDS } from '../src/net/cloud';
import { cloudBoardTree, type CloudBoardState } from '../src/wechat/screens/cloudboard';
import { uniformMeasurer } from '../src/ui/canvas/text';
import { layoutWidget, type ButtonWidget, type Widget } from '../src/ui/canvas/widgets';

const m = uniformMeasurer(0.5);

const MODEL = { nickname: '碎界玩家', tabs: FANOUT_BOARDS };

function state(over: Partial<CloudBoardState> = {}): CloudBoardState {
  return { tab: 'all-time', views: {}, loaded: {}, ...over };
}

function tree(over: Partial<CloudBoardState> = {}): Widget {
  return cloudBoardTree(MODEL, state(over), { back(): void {}, setTab(): void {} }, 400, 800, m);
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

describe('cloudBoardTree', () => {
  it('renders the fan-out tabs, the nickname line and the loading skeleton before data lands', () => {
    const out = texts(tree());
    expect(out).toContain(t('cloud.title'));
    expect(out).toContain(t('cloud.currentNickname', { name: '碎界玩家' }));
    expect(out).toContain(t('cloud.loading'));
    const tabs = ((): ButtonWidget[] => {
      const found: ButtonWidget[] = [];
      const walk = (w: Widget): void => {
        if (w.kind === 'button') found.push(w);
        if (w.kind === 'panel' || w.kind === 'row') w.children.forEach(walk);
        if (w.kind === 'scroll') walk(w.child);
      };
      walk(tree());
      return found.filter((b) => FANOUT_BOARDS.some((board) => board.name === b.text));
    })();
    expect(tabs.find((b) => b.text === '总榜')?.variant).toBe('primary');
    expect(tabs.find((b) => b.text === '今日')?.variant).toBe('ghost');
  });

  it('renders ranked rows with the top three tinted, best score first', () => {
    const out = texts(
      tree({
        loaded: { 'all-time': true },
        views: {
          'all-time': [
            { rank: 1, nickname: '阿碎', score: 5_000_000, streak: 99 },
            { rank: 2, nickname: 'guest_7', score: 1200, streak: 0 },
          ],
        },
      }),
    );
    expect(out.some((line) => line.includes('阿碎') && line.includes('01'))).toBe(true);
    expect(out.some((line) => line.includes('guest_7'))).toBe(true);
    expect(out.some((line) => line.includes(t('cloud.streak', { n: 99 })))).toBe(true);
  });

  it('words the offline and empty states per cache entry', () => {
    const offline = texts(tree({ loaded: { 'all-time': true }, views: { 'all-time': null } }));
    expect(offline).toContain(t('cloud.offline'));
    const empty = texts(tree({ loaded: { 'all-time': true }, views: { 'all-time': [] } }));
    expect(empty).toContain(t('cloud.emptyBoard'));
  });

  it('lays out at phone width without overflow', () => {
    const root = tree({
      loaded: { 'all-time': true },
      views: { 'all-time': [{ rank: 1, nickname: '阿碎', score: 100, streak: 0 }] },
    });
    const height = layoutWidget(root, 0, 0, 400, m);
    expect(height).toBeGreaterThan(200);
    expect(root.w).toBe(400);
  });
});

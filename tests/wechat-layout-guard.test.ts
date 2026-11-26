/**
 * Layout guard: every screen, at phone and small-phone sizes, must fit inside its viewport —
 * no widget may extend past the right or bottom edge. This is the test the pause card
 * overhang was missing.
 */
import { describe, expect, it } from 'vitest';
import { defaultSave, type SaveData } from '../src/core/storage';
import { menuTree, type MenuActions } from '../src/ui/canvas/menu';
import { uniformMeasurer } from '../src/ui/canvas/text';
import { layoutWidget, type Widget } from '../src/ui/canvas/widgets';
import { historyTree } from '../src/wechat/screens/history';
import { starterTree } from '../src/wechat/screens/starter';
import { draftTree, type DraftModel } from '../src/wechat/screens/draft';
import { resultsTree } from '../src/wechat/screens/results';
import { settingsTree } from '../src/wechat/screens/settings';
import { pauseTree } from '../src/wechat/screens/pause';
import { cloudBoardTree } from '../src/wechat/screens/cloudboard';
import { UPGRADES } from '../src/game/upgrades/defs';

const m = uniformMeasurer(0.5);

const SIZES: [string, number, number][] = [
  ['phone', 420, 760],
  ['small', 360, 640],
];

const menuActions: MenuActions = {
  campaign(): void {},
  endless(): void {},
  shop(): void {},
  tutorial(): void {},
  codex(): void {},
  history(): void {},
  cloud(): void {},
  settings(): void {},
};

const save: SaveData = defaultSave();
save.economy.stardust = 420;
save.economy.lifetime = 420;
save.economy.wishlist = 'orbital';
save.records.bestCampaign = 12;
save.records.runs = 30;
const longName = UPGRADES[0] ?? UPGRADES[1]!;

const draft: DraftModel = {
  intro: false,
  code: '2-3',
  options: [longName, UPGRADES[5] ?? longName, UPGRADES[9] ?? longName].filter(Boolean),
  levels: [0, 2, 5],
  crystals: 85,
  rerollCost: 63,
  skipReward: 20,
};

function screens(width: number, height: number): [string, Widget][] {
  return [
    [
      'menu',
      menuTree(
        menuActions,
        {
          recordsText: '闯关最深 12 · 最高分 700,000',
          stardustText: '✦ 420',
          wishText: '心愿 轨道打击 · 还差 60',
          badgeText: '可兑换',
        },
        width,
        height,
      ),
    ],
    [
      'starter',
      starterTree(
        save,
        { mode: 'campaign', difficulty: 'standard' },
        { back(): void {}, setDifficulty(): void {}, toggleLoadout(): void {}, start(): void {} },
        width,
        height,
        m,
      ),
    ],
    [
      'history',
      historyTree(save, { tab: 'campaign' }, { back(): void {}, setTab(): void {} }, width, height, m),
    ],
    ['draft', draftTree(draft, { pick(): void {}, reroll(): void {}, skip(): void {} }, width, height, m)],
    [
      'results',
      resultsTree(
        {
          won: false,
          record: {
            mode: 'endless',
            difficulty: 'standard',
            score: 144129,
            level: 41,
            code: '1-4',
            name: '赤铁矿带',
            combo: 130,
            damage: 12600,
            kills: 1670,
            time: 213,
            won: false,
            date: 1,
            seed: 1,
            build: {},
          },
          fresh: ['score'],
          rank: { rank: 1, total: 43 },
          payout: {
            earned: 38,
            runPaid: 38,
            halved: false,
            gift: 0,
            firstUse: 195,
            milestones: 0,
            milestoneCount: 0,
            total: 233,
          },
          uploadLine: null,
          uploadOk: false,
        },
        { retry(): void {}, menu(): void {} },
        width,
        m,
      ),
    ],
    [
      'settings',
      settingsTree(save, { back(): void {}, update(): void {}, setLanguage(): void {} }, width, height, m),
    ],
    ['pause', pauseTree({ resume(): void {}, abandon(): void {} }, width, height, m)],
    [
      'cloud',
      cloudBoardTree(
        {
          nickname: '碎界玩家',
          tabs: [
            { scoreboardId: 'all-time', name: '总榜' },
            { scoreboardId: 'weekly', name: '本周' },
            { scoreboardId: 'daily', name: '今日' },
            { scoreboardId: 'mode-endless', name: '无尽榜' },
            { scoreboardId: 'mode-campaign', name: '战役榜' },
            { scoreboardId: 'diff-abyss', name: '深渊榜' },
          ],
        },
        {
          tab: 'all-time',
          loaded: { 'all-time': true },
          views: {
            'all-time': [
              { rank: 1, nickname: '阿碎', score: 5_000_000, streak: 99 },
              { rank: 2, nickname: 'guest_7', score: 1200, streak: 0 },
            ],
          },
        },
        { back(): void {}, setTab(): void {} },
        width,
        height,
        m,
      ),
    ],
  ];
}

/**
 * Overflow beyond the viewport, as a readable list of offenders (empty = fits). Content below a
 * scroll region's fold is *meant* to exceed the screen — that is what scrolling is — so inside a
 * scroll only horizontal overflow counts, plus the scroll frame itself must fit.
 */
function overflows(root: Widget, width: number, height: number): string[] {
  const bad: string[] = [];
  const walk = (w: Widget, path: string, inScroll: boolean): void => {
    if (w.x + w.w > width + 0.5) bad.push(`${path}:${w.kind} right=${Math.round(w.x + w.w)}>${width}`);
    if (!inScroll && w.y + w.h > height + 0.5) {
      bad.push(`${path}:${w.kind} bottom=${Math.round(w.y + w.h)}>${height}`);
    }
    if (w.kind === 'panel' || w.kind === 'row') {
      w.children.forEach((c, i) => walk(c, `${path}/${i}`, inScroll));
    }
    if (w.kind === 'scroll') {
      if (w.y + w.h > height + 0.5) {
        bad.push(`${path}:${w.kind} bottom=${Math.round(w.y + w.h)}>${height}`);
      }
      if (w.x + w.w > width + 0.5) bad.push(`${path}:${w.kind} right=${Math.round(w.x + w.w)}>${width}`);
      walk(w.child, `${path}/s`, true);
    }
  };
  walk(root, 'root', false);
  return bad;
}

describe('layout guard: every screen fits its viewport', () => {
  for (const [sizeName, width, height] of SIZES) {
    for (const [name, tree] of screens(width, height)) {
      it(`${name} fits ${sizeName} ${width}x${height}`, () => {
        layoutWidget(tree, 0, 0, width, m);
        const bad = overflows(tree, width, height);
        expect(bad, bad.join(' | ')).toEqual([]);
      });
    }
  }
});

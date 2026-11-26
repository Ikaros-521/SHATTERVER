/**
 * The cloud leaderboard screen as a widget tree.
 *
 * Reads arrive asynchronously from the channel, so the tree is a pure function of the shell's
 * cache: `views[tab] === undefined` is the loading skeleton, `null` the offline wording, an
 * array the ranked rows. Tab ids are the shared Chedda-style ones (`all-time`, `mode-endless`,
 * …) so this screen and the channel's `knownBoards()` stay in the same vocabulary. Nickname
 * editing needs a text keyboard (`wx.showKeyboard`) and is a later slice — the current nickname
 * is shown read-only.
 */

import { t } from '../../core/i18n';
import { formatScore } from '../../core/math';
import type { BoardInfo } from '../../net/cheddaboards';
import type { TextMeasurer } from '../../ui/canvas/text';
import { uniformMeasurer } from '../../ui/canvas/text';
import {
  button,
  label,
  layoutWidget,
  panel,
  paragraph,
  row,
  scroll,
  spacer,
  type ScrollWidget,
  type Widget,
} from '../../ui/canvas/widgets';

/** One ranked entry, pre-coerced by the shell from the channel's `BoardView`. */
export interface CloudEntry {
  rank: number;
  nickname: string;
  score: number;
  streak: number;
}

export interface CloudBoardState {
  tab: string;
  /** Per-tab cache: undefined = loading, null = unreadable, else the ranked rows. */
  views: Record<string, CloudEntry[] | null | undefined>;
  loaded: Record<string, boolean>;
}

export interface CloudBoardModel {
  nickname: string;
  tabs: readonly BoardInfo[];
}

export interface CloudBoardActions {
  back(): void;
  setTab(id: string): void;
}

export function cloudBoardTree(
  model: CloudBoardModel,
  state: CloudBoardState,
  actions: CloudBoardActions,
  width: number,
  height: number,
  m: TextMeasurer = uniformMeasurer(1),
): Widget {
  const pad = Math.max(16, Math.min(26, width * 0.045));

  const children: Widget[] = [
    label('CLOUD · RANKING', { size: 11, color: 'accent', weight: '700', alpha: 0.85 }),
    label(t('cloud.title'), { size: 26, weight: '900' }),
    label(model.nickname ? t('cloud.currentNickname', { name: model.nickname }) : t('cloud.nicknameLabel'), {
      size: 12,
      color: 'inkDim',
    }),
    spacer(6),
  ];

  // Tabs in two rows: the fan-out trio, then the category boards.
  const fanout = model.tabs.slice(0, 3);
  const categories = model.tabs.slice(3);
  const tabRow = (ids: BoardInfo[]): Widget =>
    row(
      ids.map((board) =>
        button(board.name, () => actions.setTab(board.scoreboardId), {
          variant: board.scoreboardId === state.tab ? 'primary' : 'ghost',
          size: 13,
          paddingH: 12,
        }),
      ),
      { gap: 8, align: 'start' },
    );
  children.push(tabRow(fanout));
  if (categories.length > 0) {
    children.push(spacer(4));
    children.push(tabRow(categories));
  }
  children.push(spacer(4));

  // ── the board body ──
  const view = state.views[state.tab];
  if (view === undefined) {
    children.push(paragraph(t('cloud.loading'), { size: 13, color: 'inkFaint' }));
  } else if (view === null) {
    children.push(paragraph(t('cloud.offline'), { size: 13, color: 'gold', alpha: 0.85 }));
  } else if (view.length === 0) {
    children.push(paragraph(t('cloud.emptyBoard'), { size: 13, color: 'inkFaint' }));
  } else {
    children.push(
      panel(
        view.map((entry) => rowWidget(entry)),
        { padding: 0, gap: 6, bg: false, stroke: false },
      ),
    );
  }

  const build = (viewportH: number): Widget =>
    panel(
      [
        scroll(panel(children, { padding: 0, gap: 7, bg: false, stroke: false }), viewportH),
        spacer(6),
        button(t('common.back'), actions.back, { variant: 'ghost', size: 15, stretch: true }),
      ],
      { padding: pad, gap: 6, bg: false, stroke: false },
    );

  // Two-pass layout, same discipline as the other screens.
  const probe = build(height);
  layoutWidget(probe, 0, 0, width, m);
  const scroller = (probe as { children: Widget[] }).children[0] as ScrollWidget;
  const overhead = probe.h - scroller.viewportH;
  const root = build(Math.max(120, height - overhead));
  layoutWidget(root, 0, 0, width, m);
  return root;
}

/** One ranked row: score headline with the name, streak as the small note. */
function rowWidget(entry: CloudEntry): Widget {
  const top = entry.rank <= 3;
  return panel(
    [
      label(`${String(entry.rank).padStart(2, '0')} · ${entry.nickname}`, {
        size: 15,
        weight: '700',
        color: top ? 'gold' : 'ink',
      }),
      row(
        [
          label(formatScore(entry.score), {
            size: 17,
            color: 'accent',
            weight: '900',
          }),
          label(entry.streak > 0 ? t('cloud.streak', { n: entry.streak }) : '', {
            size: 11,
            color: 'inkFaint',
            alpha: 0.85,
          }),
        ],
        { gap: 10, align: 'start' },
      ),
    ],
    { padding: 12, gap: 2, bg: top, stroke: false },
  );
}

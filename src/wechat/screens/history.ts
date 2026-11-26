/**
 * The records screen (战绩排行) as a widget tree.
 *
 * Mirrors the DOM dialog: eyebrow/title/summary header, the campaign|endless tabs, the ranked
 * rows (best first, latest flagged), and a back button. The rows scroll; the header and the back
 * button stay pinned — the same three-band structure the menu uses. Rows are rebuilt from
 * `records.history` on every show, exactly like the DOM rebuilds its body.
 *
 * The DOM rows carry per-upgrade build icons; the canvas rows defer those (P1 keeps the meta
 * line, which already carries combo/damage/time/date).
 */

import { t } from '../../core/i18n';
import { formatNumber, formatScore, formatTime } from '../../core/math';
import type { RunRecord, SaveData } from '../../core/storage';
import { difficultyName } from '../../i18n/content';
import { difficultyOf } from '../../game/difficulty';
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

export interface HistoryState {
  tab: 'campaign' | 'endless';
}

export interface HistoryActions {
  back(): void;
  setTab(tab: 'campaign' | 'endless'): void;
}

export function historyTree(
  save: SaveData,
  state: HistoryState,
  actions: HistoryActions,
  width: number,
  height: number,
  m: TextMeasurer = uniformMeasurer(1),
): Widget {
  const records = save.records;
  const pad = Math.max(16, Math.min(26, width * 0.045));
  const newest = records.history.reduce((max, entry) => Math.max(max, entry.date), 0);

  const rows = records.history
    .filter((entry) => entry.mode === state.tab)
    .sort((a, b) => b.score - a.score || b.date - a.date);

  const body: Widget[] =
    rows.length === 0
      ? [
          paragraph(state.tab === 'campaign' ? t('history.emptyCampaign') : t('history.emptyEndless'), {
            size: 13,
            color: 'inkFaint',
          }),
        ]
      : rows.map((entry, index) => rowWidget(entry, index, newest));

  const summary = t('history.summary', {
    runs: records.runs,
    wins: records.wins,
    bricks: formatNumber(records.bricks),
  });

  /** Builds the whole screen around a given scroll viewport; layout runs on the result. */
  const build = (viewportH: number): Widget =>
    panel(
      [
        label('RECORDS', { size: 11, color: 'accent', weight: '700', alpha: 0.85 }),
        label(t('history.title'), { size: 26, weight: '900' }),
        paragraph(summary, { size: 12, color: 'inkDim' }),
        spacer(8),
        row(
          [
            tabButton('campaign', t('history.tabCampaign'), state.tab, actions),
            tabButton('endless', t('history.tabEndless'), state.tab, actions),
          ],
          { gap: 8, align: 'start' },
        ),
        spacer(4),
        scroll(panel(body, { padding: 0, gap: 8, bg: false, stroke: false }), viewportH),
        spacer(6),
        button(t('common.back'), actions.back, { variant: 'ghost', size: 15, stretch: true }),
      ],
      { padding: pad, gap: 6, bg: false, stroke: false },
    );

  // Two-pass layout: measure with an over-tall viewport, then fit the viewport to whatever the
  // rest of the screen actually measured — header, back button, paddings and gaps together.
  // Hand-estimated constants drift — this screen drifted within one language switch — so the
  // real frames decide.
  const probe = build(height);
  layoutWidget(probe, 0, 0, width, m);
  const scroller = findScroll(probe);
  const overhead = probe.h - scroller.viewportH;
  const root = build(Math.max(120, height - overhead));
  layoutWidget(root, 0, 0, width, m);
  return root;
}

/** The first scroll widget in the tree (each screen here has exactly one). */
function findScroll(root: Widget): ScrollWidget {
  const found: ScrollWidget[] = [];
  const walk = (w: Widget): void => {
    if (w.kind === 'scroll') found.push(w);
    if (w.kind === 'panel' || w.kind === 'row') w.children.forEach(walk);
    if (w.kind === 'scroll') walk(w.child);
  };
  walk(root);
  if (found.length === 0) throw new Error('history screen has no scroll region');
  return found[0] as ScrollWidget;
}

function tabButton(
  tab: 'campaign' | 'endless',
  text: string,
  active: string,
  actions: HistoryActions,
): Widget {
  return button(text, () => actions.setTab(tab), {
    variant: tab === active ? 'primary' : 'ghost',
    size: 14,
    paddingH: 18,
  });
}

/** One ranked run: rank+score headline, where/WIN line, then the meta row. */
function rowWidget(entry: RunRecord, index: number, newest: number): Widget {
  const rank = index + 1;
  const fresh = entry.date === newest && newest > 0;
  const where =
    entry.mode === 'campaign'
      ? t(entry.won ? 'history.whereWon' : 'history.whereLost', { code: entry.code, name: entry.name }).trim()
      : t('history.whereEndless', { level: entry.level });
  const tags: string[] = [];
  if (entry.difficulty !== 'standard') tags.push(difficultyName(difficultyOf(entry.difficulty)));
  if (entry.won) tags.push('WIN');
  if (fresh) tags.push(t('history.chipLatest'));

  const headline = `${String(rank).padStart(2, '0')} · ${formatScore(entry.score)}`;
  return panel(
    [
      label(headline, {
        size: 17,
        weight: '700',
        color: rank <= 3 ? 'gold' : 'ink',
      }),
      label(`${where}${tags.length > 0 ? ` · ${tags.join(' · ')}` : ''}`, {
        size: 12,
        color: 'accent',
        alpha: 0.8,
      }),
      label(
        t('history.stats', {
          combo: formatNumber(entry.combo),
          damage: formatNumber(entry.damage),
          time: formatTime(entry.time),
          date: dateLabel(entry.date),
        }),
        { size: 11, color: 'inkFaint' },
      ),
    ],
    { padding: 12, gap: 3, bg: rank <= 3, stroke: false },
  );
}

/** `MM.DD hh:mm`, same shape as the DOM build's date label. */
function dateLabel(date: number): string {
  const d = new Date(date);
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

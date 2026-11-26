/**
 * The results screen (结算) as a widget tree.
 *
 * Mirrors the DOM dialog at canvas fidelity: outcome eyebrow and title, the score headline with
 * its record/rank note, the six stat tiles, the 星尘 payout line, the cloud-upload status line,
 * and the retry/menu pair. Pure view — the shell assembles the model from the settled session
 * and owns the upload, updating `uploadLine` as the submit settles.
 */

import { t } from '../../core/i18n';
import { formatNumber, formatScore, formatTime } from '../../core/math';
import type { EconomyPayout, RunRecord } from '../../core/storage';
import { difficultyOf } from '../../game/difficulty';
import { difficultyName } from '../../i18n/content';
import type { TextMeasurer } from '../../ui/canvas/text';
import { uniformMeasurer } from '../../ui/canvas/text';
import {
  button,
  label,
  layoutWidget,
  panel,
  paragraph,
  row,
  spacer,
  type Widget,
} from '../../ui/canvas/widgets';

export interface ResultsModel {
  won: boolean;
  /** The run entry, null when the run did not score (debug/deep start). */
  record: RunRecord | null;
  fresh: string[];
  rank: { rank: number; total: number } | null;
  payout: EconomyPayout | null;
  /** The cloud upload's current line, or null to hide the row (`uploadOk` tints it). */
  uploadLine: string | null;
  uploadOk: boolean;
}

export interface ResultsActions {
  retry(): void;
  menu(): void;
}

export function resultsTree(
  model: ResultsModel,
  actions: ResultsActions,
  width: number,
  m: TextMeasurer = uniformMeasurer(1),
): Widget {
  const pad = Math.max(16, Math.min(26, width * 0.045));
  const record = model.record;
  const children: Widget[] = [];

  if (record) {
    const tier = difficultyOf(record.difficulty);
    const tierSuffix = tier.id !== 'standard' ? t('over.diffSuffix', { name: difficultyName(tier) }) : '';
    children.push(
      label(model.won ? 'CAMPAIGN COMPLETE' : 'RUN TERMINATED', {
        size: 11,
        color: model.won ? 'accent' : 'danger',
        weight: '700',
        alpha: 0.85,
      }),
      label(model.won ? t('over.titleWon') : t('over.titleLost'), { size: 26, weight: '900' }),
      paragraph(
        model.won
          ? `${t('over.subWon')}${tierSuffix ? `（${difficultyName(tier)}）` : ''}`
          : `${tierSuffix}${record.mode === 'campaign' ? t('over.campaignMode') : t('over.endlessMode')} · ${t('over.stopAt', { code: record.mode === 'campaign' ? `${record.code} ` : '', name: record.name })}`,
        { size: 12, color: 'inkDim' },
      ),
      spacer(6),
      // The score headline: the number everyone screenshots.
      label(formatScore(record.score), { size: 40, color: 'accent', weight: '900' }),
    );
    if (model.fresh.includes('score')) {
      children.push(label(t('over.newRecord'), { size: 12, color: 'gold', weight: '700' }));
    } else if (model.rank && model.rank.total > 1) {
      children.push(
        label(t('over.rankNote', { rank: model.rank.rank, total: model.rank.total }), {
          size: 12,
          color: 'inkFaint',
        }),
      );
    }

    // Six stat tiles, three per row, same contents as the DOM grid.
    const levelText = record.mode === 'campaign' ? record.code : t('over.endlessLevel', { n: record.level });
    const tiles: [string, string][] = [
      [t('over.tileScore'), formatScore(record.score)],
      [t('over.tileLevel'), levelText],
      [t('over.tileDamage'), formatNumber(record.damage)],
      [t('over.tileCombo'), String(record.combo)],
      [t('over.tileBricks'), formatNumber(record.kills)],
      [t('over.tileTime'), formatTime(record.time)],
    ];
    for (let i = 0; i < tiles.length; i += 2) {
      children.push(
        row([statTile(tiles[i] as [string, string]), statTile(tiles[i + 1] as [string, string])], {
          gap: 8,
          align: 'start',
        }),
      );
    }

    // The 星尘 payout: one gold total, its parts after it, the halving note when capped.
    if (model.payout && model.payout.total > 0) {
      const parts: string[] = [t('shop.earnedRun', { n: model.payout.runPaid })];
      if (model.payout.gift > 0) parts.push(t('shop.earnedGift', { n: model.payout.gift }));
      if (model.payout.firstUse > 0) parts.push(t('shop.earnedFirstUse', { n: model.payout.firstUse }));
      if (model.payout.milestones > 0) {
        parts.push(t('shop.earnedMilestone', { n: model.payout.milestones }));
      }
      children.push(
        label(t('shop.earnedLine', { n: model.payout.total }), { size: 16, color: 'gold', weight: '700' }),
        label(parts.join(' · '), { size: 11, color: 'inkFaint' }),
        ...(model.payout.halved ? [label(t('shop.earnedHalved'), { size: 11, color: 'inkFaint' })] : []),
      );
    }

    if (model.uploadLine !== null) {
      children.push(
        label(model.uploadLine, {
          size: 12,
          color: model.uploadOk ? 'inkDim' : 'gold',
          alpha: 0.9,
        }),
      );
    }
  } else {
    // An unscored run (debug start): the outcome, then nothing else to settle.
    children.push(
      label(model.won ? t('over.titleWon') : t('over.titleLost'), { size: 26, weight: '900' }),
      paragraph(model.won ? t('over.subWon') : t('over.titleLost'), { size: 12, color: 'inkDim' }),
    );
  }

  const root = panel(
    [
      panel(children, { padding: 0, gap: 6, bg: false, stroke: false }),
      spacer(8),
      button(t('over.retry'), actions.retry, { variant: 'primary', size: 15, stretch: true }),
      spacer(4),
      button(t('over.backToMenu'), actions.menu, { variant: 'ghost', size: 15, stretch: true }),
    ],
    { padding: pad, gap: 6, bg: false, stroke: false },
  );
  layoutWidget(root, 0, 0, width, m);
  return root;
}

/** One stat tile: the muted caption over the value. */
function statTile([caption, value]: [string, string]): Widget {
  return panel([label(caption, { size: 11, color: 'inkFaint' }), label(value, { size: 16, weight: '700' })], {
    padding: 10,
    gap: 2,
    bg: true,
    stroke: false,
  });
}

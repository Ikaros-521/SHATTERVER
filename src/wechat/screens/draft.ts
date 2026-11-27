/**
 * The draft screen (选择一项强化) as a widget tree.
 *
 * Three rarity-tinted cards, the reroll/skip pair with their crystal costs, and the crystal
 * balance — the DOM dialog's content at canvas fidelity. Cards show the upgrade name over its
 * rarity and code, the rule text at the next level, and the level jump (or NEW) as the trailing
 * note; the rarity tint colours the card's stroke and the rarity line. Pure view: the shell owns
 * the session and rebuilds this tree after every pick/reroll/skip.
 */

import { t } from '../../core/i18n';
import { formatNumber } from '../../core/math';
import type { SectorReward } from '../../game/session';
import type { UpgradeDef } from '../../game/upgrades/types';
import { RARITY_INFO } from '../../game/upgrades/present';
import { rarityName, upgradeDescribe, upgradeName } from '../../i18n/content';
import { rgba } from '../../ui/canvas/theme';
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

export interface DraftModel {
  /** `intro` marks the head-start draft shown before sector one opens. */
  intro: boolean;
  /** The cleared sector's display code (`1-4`); empty on the intro draft. */
  code: string;
  options: UpgradeDef[];
  /** Levels of each option in the run so far, option-index-aligned. */
  levels: number[];
  crystals: number;
  rerollCost: number;
  skipReward: number;
  /** The bonus a wave sector's clear granted, on each of the drafts it paid for; absent otherwise. */
  reward?: SectorReward | null;
}

export interface DraftActions {
  pick(id: string): void;
  reroll(): void;
  skip(): void;
}

/**
 * `upgradeDescribe` is HTML for the DOM cards (`<b>` around changed numbers); canvas draws raw
 * text, so the tags come off and only their contents stay.
 */
function stripMarkup(text: string): string {
  return text.replace(/<[^>]+>/g, '');
}

export function draftTree(
  model: DraftModel,
  actions: DraftActions,
  width: number,
  height: number,
  m: TextMeasurer = uniformMeasurer(1),
): Widget {
  const pad = Math.max(16, Math.min(26, width * 0.045));
  const reward = model.intro ? null : (model.reward ?? null);

  const children: Widget[] = [
    label(
      model.intro
        ? t('shop.headstartEyebrow')
        : reward
          ? t('draft.rewardEyebrow', { code: model.code, n: reward.pick, total: reward.picks })
          : t('draft.eyebrow', { code: model.code }),
      { size: 11, color: 'accent', weight: '700', alpha: 0.85 },
    ),
    label(t('draft.title'), { size: 26, weight: '900' }),
    label(`◆ ${formatNumber(model.crystals)}`, { size: 14, color: 'gold', weight: '700' }),
  ];
  // What the sector's clear paid, on one line: the canvas answer to the DOM draft's reward chips.
  if (reward) {
    const parts = [t('draft.rewardCrystals', { n: formatNumber(reward.crystals) })];
    if (reward.shield > 0) parts.push(t('draft.rewardShield', { n: reward.shield }));
    parts.push(t('draft.rewardPicks', { n: reward.picks }));
    children.push(label(`${t('draft.rewardTitle')} · ${parts.join(' · ')}`, { size: 12, color: 'gold' }));
  }
  children.push(spacer(8));

  model.options.forEach((def, index) => {
    const level = model.levels[index] ?? 0;
    const next = level + 1;
    const rarity = RARITY_INFO[def.rarity];
    const tint = rgba(rarity.color, 0.9);
    const levelText =
      level === 0
        ? t('draft.newUpgrade')
        : next >= def.maxLevel
          ? `Lv ${level} → ${next} · ${t('draft.maxed')}`
          : `Lv ${level} → ${next}`;
    children.push(
      panel(
        [
          button(upgradeName(def), () => actions.pick(def.id), {
            size: 17,
            paddingH: 14,
            sub: `${rarityName(def.rarity)} · ${def.code}`,
            trailing: levelText,
            stretch: true,
            strokeOverride: tint,
          }),
          paragraph(stripMarkup(upgradeDescribe(def, next)), { size: 13, color: 'inkDim' }),
          label(`${rarity.name} · ${rarity.en}`, { size: 10, colorOverride: tint, weight: '700' }),
        ],
        { padding: 12, gap: 4, bg: false, stroke: false },
      ),
    );
  });

  const build = (viewportH: number): Widget => {
    const list = panel(children, { padding: 0, gap: 7, bg: false, stroke: false });
    const body = scroll(list, viewportH);
    const foot = row(
      [
        button(t('draft.reroll'), actions.reroll, {
          variant: 'ghost',
          size: 15,
          paddingH: 16,
          sub: `◆ ${model.rerollCost}`,
          disabled: model.crystals < model.rerollCost,
          stretch: true,
        }),
        button(t('draft.skip'), actions.skip, {
          variant: 'ghost',
          size: 15,
          paddingH: 16,
          sub: `+◆ ${model.skipReward}`,
          stretch: true,
        }),
      ],
      { gap: 10, align: 'start' },
    );
    return panel([body, spacer(6), foot], { padding: pad, gap: 6, bg: false, stroke: false });
  };

  // Two-pass layout, same discipline as the other screens.
  const probe = build(height);
  layoutWidget(probe, 0, 0, width, m);
  const probeScroller = (probe as { children: Widget[] }).children[0] as ScrollWidget;
  const overhead = probe.h - probeScroller.viewportH;
  const root = build(Math.max(120, height - overhead));
  layoutWidget(root, 0, 0, width, m);
  return root;
}

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
import { UPGRADE_MAP } from '../../game/upgrades/defs';
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
  /** What banning each option costs right now, option-index-aligned. */
  banCosts: number[];
  /** The option with an open ban confirm (its pill shows the confirm pair), or null. */
  armedBan: string | null;
  /** The run's owned upgrades (id + level), acquisition order — the draft's build strip. */
  build: { id: string; level: number }[];
  /** The owned upgrade with an open discard confirm, or null. */
  armedDiscard: string | null;
}

export interface DraftActions {
  pick(id: string): void;
  reroll(): void;
  skip(): void;
  /** Opens (id) or closes (null) the ban confirm over one offered card. */
  banArm(id: string | null): void;
  /** Confirms the ban: pays the cost and drops the card off this run's pool. */
  ban(id: string): void;
  /** Opens (id) or closes (null) the discard confirm over one owned upgrade. */
  discardArm(id: string | null): void;
  /** Confirms the discard: the upgrade drops one level (or leaves at its last). */
  discard(id: string): void;
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

  // The build strip: one small tile per owned upgrade (the DOM draft's build icons). A tap arms
  // the discard confirm over that upgrade — a second tap on the same tile drops a level.
  if (model.build.length > 0) {
    const disc = model.armedDiscard;
    const held = disc ? (model.build.find((entry) => entry.id === disc)?.level ?? 0) : 0;
    const tiles = model.build.map((entry) => {
      const def = UPGRADE_MAP[entry.id];
      const armed = disc === entry.id;
      return button(def ? upgradeName(def) : entry.id, () => actions.discardArm(armed ? null : entry.id), {
        size: 11,
        variant: armed ? 'danger' : 'ghost',
        paddingH: 8,
        sub: `Lv${entry.level}`,
        stretch: true,
      });
    });
    children.push(row(tiles, { gap: 6, align: 'start', wrap: true }));
    if (disc) {
      const next = held - 1;
      const leaves = model.options.filter((option) => (option.requires?.[disc] ?? 0) > next);
      const name = disc && UPGRADE_MAP[disc] ? upgradeName(UPGRADE_MAP[disc]) : disc;
      const askText =
        held <= 1 ? t('draft.discardAsk', { name }) : t('draft.discardAskLower', { name, lv: held, next });
      const depsText =
        leaves.length > 0
          ? t('draft.discardAskDeps', { deps: leaves.map((option) => upgradeName(option)).join('、') })
          : '';
      children.push(
        panel(
          [
            paragraph(`${askText}${depsText}`, { size: 12, color: 'inkDim' }),
            row(
              [
                button(t('draft.discardConfirm'), () => actions.discard(disc), {
                  size: 11,
                  variant: 'danger',
                  paddingH: 10,
                  stretch: true,
                }),
                button(t('draft.discardCancel'), () => actions.discardArm(null), {
                  size: 11,
                  variant: 'ghost',
                  paddingH: 10,
                  stretch: true,
                }),
              ],
              { gap: 8, align: 'start' },
            ),
          ],
          { padding: 8, gap: 4, bg: false, stroke: false },
        ),
      );
    }
    children.push(spacer(4));
  }

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
    // The ban corner: its price at rest, the confirm pair once asked. Locked when the crystals
    // cannot cover it or this is the table's last card — a table banned empty has nowhere to pick.
    const banCost = model.banCosts[index] ?? 0;
    const banLocked = model.crystals < banCost || model.options.length <= 1;
    const armed = model.armedBan === def.id;
    const cardChildren: Widget[] = [
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
    ];
    if (armed) {
      cardChildren.push(
        row(
          [
            button(`${t('draft.banConfirm')} ◆${banCost}`, () => actions.ban(def.id), {
              size: 11,
              variant: 'danger',
              paddingH: 10,
              stretch: true,
            }),
            button(t('draft.banCancel'), () => actions.banArm(null), {
              size: 11,
              variant: 'ghost',
              paddingH: 10,
              stretch: true,
            }),
          ],
          { gap: 8, align: 'start' },
        ),
      );
    } else {
      cardChildren.push(
        button(`${t('draft.ban')} ◆${banCost}`, () => actions.banArm(def.id), {
          size: 11,
          variant: 'ghost',
          paddingH: 10,
          disabled: banLocked,
          stretch: true,
        }),
      );
    }
    children.push(
      panel(cardChildren, { padding: 12, gap: 4, bg: false, stroke: false }),
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

/**
 * The starter screen (选择初始协议) as a widget tree.
 *
 * Mirrors the DOM dialog: mode eyebrow, the difficulty selector with its modifier line, the
 * carried-supply chips when the player owns any, and the protocol cards — free starters first,
 * then shop-unlocked ones in price order, same as `ui.ts`. Tapping a card is the start action
 * (the DOM has no separate start button either); the back button stays pinned below the scroll.
 *
 * The difficulty choice persists through the shell (settings + storeSave), matching
 * `ui.ts`'s `updateSettings({ difficulty })`.
 */

import { t } from '../../core/i18n';
import type { SaveData } from '../../core/storage';
import { PROTOCOLS, supplyCost, slotLimit } from '../../game/economy/catalog';
import { STARTERS, type Starter } from '../../game/starters';
import { DIFFICULTIES, type DifficultyId } from '../../game/difficulty';
import {
  difficultyDetail,
  difficultyName,
  starterDesc,
  starterName,
  upgradeNameById,
} from '../../i18n/content';
import type { RunMode } from '../../game/run';
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

export interface StarterState {
  mode: RunMode;
  difficulty: DifficultyId;
}

export interface StarterActions {
  back(): void;
  setDifficulty(id: DifficultyId): void;
  /** Toggling is validated and persisted by the shell; the screen just rebuilds. */
  toggleLoadout(id: string): void;
  start(starter: Starter): void;
}

export function starterTree(
  save: SaveData,
  state: StarterState,
  actions: StarterActions,
  width: number,
  height: number,
  m: TextMeasurer = uniformMeasurer(1),
): Widget {
  const pad = Math.max(16, Math.min(26, width * 0.045));

  // Free starters first, then shop-unlocked protocols in price order — the DOM order.
  const roster: Starter[] = [...STARTERS, ...PROTOCOLS.filter((p) => save.economy.protocols.includes(p.id))];

  const children: Widget[] = [
    label(state.mode === 'campaign' ? t('starter.campaignEyebrow') : t('starter.endlessEyebrow'), {
      size: 11,
      color: 'accent',
      weight: '700',
      alpha: 0.85,
    }),
    label(t('starter.title'), { size: 26, weight: '900' }),
    paragraph(t('starter.sub'), { size: 12, color: 'inkDim' }),
    spacer(6),
  ];

  for (const tier of DIFFICULTIES) {
    const selected = tier.id === state.difficulty;
    children.push(
      button(difficultyName(tier), () => actions.setDifficulty(tier.id), {
        variant: selected ? 'primary' : 'ghost',
        size: 15,
        paddingH: 16,
        sub: `${tier.en} · ×${tier.scoreMult}`,
        ...(selected ? { trailing: '✓' } : {}),
        stretch: true,
      }),
    );
  }
  children.push(
    paragraph(difficultyDetail(state.difficulty).join(' · '), { size: 12, color: 'inkFaint' }),
    spacer(4),
  );

  // Carried supplies, only when the player owns any (the DOM hides the row otherwise).
  if (save.economy.supplies.length > 0) {
    const clears = Object.values(save.economy.winsByDifficulty).some((n) => (n ?? 0) > 0) ? 1 : 0;
    const limit = slotLimit(save.records.runs, clears);
    children.push(
      label(t('shop.loadoutTitle'), { size: 13, color: 'inkDim', weight: '700' }),
      row(
        save.economy.supplies.map((id) =>
          button(t(`shop.supply.${id}.name`), () => actions.toggleLoadout(id), {
            variant: save.economy.loadout.includes(id) ? 'primary' : 'ghost',
            size: 13,
            paddingH: 12,
          }),
        ),
        { gap: 8, align: 'start' },
      ),
      label(t('shop.slots', { used: supplyCost(save.economy.loadout), limit }), {
        size: 11,
        color: 'inkFaint',
      }),
      spacer(4),
    );
  }

  roster.forEach((starter, index) => {
    const grants = Object.entries(starter.grants)
      .map(([id, level]) => (upgradeNameById(id) ? `${upgradeNameById(id)} Lv${level}` : null))
      .filter((text): text is string => text !== null);
    children.push(
      panel(
        [
          button(starterName(starter), () => actions.start(starter), {
            size: 17,
            paddingH: 14,
            sub: starter.en,
            trailing: `0${index + 1}`,
            stretch: true,
          }),
          paragraph(starterDesc(starter), { size: 12, color: 'inkDim' }),
          label(grants.length > 0 ? grants.join(' · ') : t('starter.crystals', { n: starter.crystals }), {
            size: 12,
            color: 'gold',
            alpha: 0.85,
          }),
        ],
        { padding: 12, gap: 4, bg: false, stroke: false },
      ),
    );
  });

  const build = (viewportH: number): Widget =>
    panel(
      [
        scroll(panel(children, { padding: 0, gap: 7, bg: false, stroke: false }), viewportH),
        spacer(6),
        button(t('common.back'), actions.back, { variant: 'ghost', size: 15, stretch: true }),
      ],
      { padding: pad, gap: 6, bg: false, stroke: false },
    );

  // Two-pass layout, same discipline as the history screen: measure, then fit the viewport.
  const probe = build(height);
  layoutWidget(probe, 0, 0, width, m);
  const scroller = findScroll(probe);
  const overhead = probe.h - scroller.viewportH;
  const root = build(Math.max(120, height - overhead));
  layoutWidget(root, 0, 0, width, m);
  return root;
}

function findScroll(root: Widget): ScrollWidget {
  const found: ScrollWidget[] = [];
  const walk = (w: Widget): void => {
    if (w.kind === 'scroll') found.push(w);
    if (w.kind === 'panel' || w.kind === 'row') w.children.forEach(walk);
    if (w.kind === 'scroll') walk(w.child);
  };
  walk(root);
  if (found.length === 0) throw new Error('starter screen has no scroll region');
  return found[0] as ScrollWidget;
}

/**
 * The starter screen (选择初始协议) as a widget tree.
 *
 * Mirrors the DOM dialog: mode eyebrow, the difficulty selector with its modifier line, the
 * carried-supply chips when the player owns any, the roster's sort chips once a shop protocol
 * joins, and the protocol cards — free starters first, then shop-unlocked ones in price order,
 * arranged by the chosen sort, same as `ui.ts`. Tapping a card is the start action (the DOM has
 * no separate start button either); the back button stays pinned below the scroll.
 *
 * The difficulty and sort choices persist through the shell (settings + storeSave), matching
 * `ui.ts`'s `updateSettings({ ... })`.
 */

import { t } from '../../core/i18n';
import type { SaveData } from '../../core/storage';
import { PROTOCOLS, supplyCost, slotLimit } from '../../game/economy/catalog';
import {
  STARTERS,
  STARTER_SORT_IDS,
  sortStarters,
  type Starter,
  type StarterSortId,
} from '../../game/starters';
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
  sort: StarterSortId;
}

export interface StarterActions {
  back(): void;
  setDifficulty(id: DifficultyId): void;
  setSort(id: StarterSortId): void;
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

  // Free starters first, then shop-unlocked protocols in price order — the DOM order — then the
  // chosen sort arranges the whole roster.
  const roster: Starter[] = sortStarters(
    [...STARTERS, ...PROTOCOLS.filter((p) => save.economy.protocols.includes(p.id))],
    state.sort,
    save.economy.picksByStarter,
    starterName,
  );
  // Past the free four plus one shop protocol, tall cards stop fitting any screen: the
  // description leaves the tile and the roster reads as compact tiles, same as the DOM.
  const compact = roster.length > STARTERS.length + 1;

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

  // The roster's sort chips, once any shop protocol joins the four free starters.
  if (roster.length > STARTERS.length) {
    children.push(
      row(
        [
          label(t('starter.sort.label'), { size: 11, color: 'inkFaint' }),
          ...STARTER_SORT_IDS.map((id) =>
            button(t(`starter.sort.${id}`), () => actions.setSort(id), {
              variant: state.sort === id ? 'primary' : 'ghost',
              size: 12,
              paddingH: 10,
            }),
          ),
        ],
        { gap: 8, align: 'start' },
      ),
    );
  }

  roster.forEach((starter, index) => {
    const grants = Object.entries(starter.grants)
      .map(([id, level]) => (upgradeNameById(id) ? `${upgradeNameById(id)} Lv${level}` : null))
      .filter((text): text is string => text !== null);
    const card: Widget[] = [
      button(starterName(starter), () => actions.start(starter), {
        size: compact ? 15 : 17,
        paddingH: compact ? 10 : 14,
        sub: starter.en,
        ...(compact ? {} : { trailing: `0${index + 1}` }),
        stretch: true,
      }),
    ];
    if (!compact) card.push(paragraph(starterDesc(starter), { size: 12, color: 'inkDim' }));
    card.push(
      label(grants.length > 0 ? grants.join(' · ') : t('starter.crystals', { n: starter.crystals }), {
        size: 12,
        color: 'gold',
        alpha: 0.85,
      }),
    );
    children.push(panel(card, { padding: compact ? 8 : 12, gap: 4, bg: false, stroke: false }));
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

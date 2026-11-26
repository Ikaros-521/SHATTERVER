/**
 * The 星尘商店 as a widget tree: four tabs over one scroll body.
 *
 * Covers the DOM shop's four shelves — protocols, supplies (with carry + the one-run free
 * trial), skins (grouped, with the free stock cards and equip toggles) and progress (today's
 * missions with progress bars, then milestones) — at canvas fidelity. One generic row builder
 * plays every role the DOM's `shopItem` does; the verdicts come from the caller. Pure view: all
 * mutations live in `shopactions.ts`, the shell wires them.
 */

import { t } from '../../core/i18n';
import { dayKey } from '../../game/economy/coins';
import { DAILY_MISSION_REWARD, dailyMissionsFor } from '../../game/economy/dailies';
import { MILESTONES } from '../../game/economy/milestones';
import { PROTOCOLS, SLOT_GATES, SUPPLIES, slotLimit, supplyCost } from '../../game/economy/catalog';
import { CHAPTERS } from '../../game/levels/definitions';
import { SKINS, applyBgSkin } from '../../render/skins';
import { starterDesc, starterName } from '../../i18n/content';
import { formatNumber } from '../../core/math';
import type { SaveData } from '../../core/storage';
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

export type ShopTab = 'protocols' | 'supplies' | 'skins' | 'progress';

export interface ShopState {
  tab: ShopTab;
}

export interface ShopCallbacks {
  back(): void;
  setTab(tab: ShopTab): void;
  buyProtocol(id: string): void;
  buySupply(id: string): void;
  buySkin(id: string): void;
  equipSkin(id: string | null, kind: 'ball' | 'paddle' | 'bg'): void;
  toggleWishlist(id: string): void;
  toggleLoadout(id: string): void;
  setTrial(id: string): void;
}

const TABS: { id: ShopTab; label: string }[] = [
  { id: 'protocols', label: t('shop.tabProtocols') },
  { id: 'supplies', label: t('shop.tabSupplies') },
  { id: 'skins', label: t('shop.tabSkins') },
  { id: 'progress', label: t('shop.tabProgress') },
];

export function shopTree(
  save: SaveData,
  state: ShopState,
  cb: ShopCallbacks,
  width: number,
  height: number,
  m: TextMeasurer = uniformMeasurer(1),
): Widget {
  const pad = Math.max(16, Math.min(26, width * 0.045));
  const econ = save.economy;
  const children: Widget[] = [
    label('STARDUST SHOP', { size: 11, color: 'accent', weight: '700', alpha: 0.85 }),
    row(
      [
        label(t('shop.title'), { size: 26, weight: '900' }),
        label(`✦ ${formatNumber(econ.stardust)}`, { size: 18, color: 'gold', weight: '900', align: 'right' }),
      ],
      { gap: 10, align: 'start' },
    ),
    paragraph(t('shop.sub'), { size: 12, color: 'inkDim' }),
    spacer(6),
    row(
      TABS.map((tab) =>
        button(tab.label, () => cb.setTab(tab.id), {
          variant: state.tab === tab.id ? 'primary' : 'ghost',
          size: 13,
          paddingH: 12,
        }),
      ),
      { gap: 8, align: 'start' },
    ),
    spacer(4),
    ...tabBody(save, state, cb),
  ];

  const build = (viewportH: number): Widget =>
    panel(
      [
        scroll(panel(children, { padding: 0, gap: 7, bg: false, stroke: false }), viewportH),
        spacer(6),
        button(t('common.back'), cb.back, { variant: 'ghost', size: 15, stretch: true }),
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

function tabBody(save: SaveData, state: ShopState, cb: ShopCallbacks): Widget[] {
  switch (state.tab) {
    case 'protocols':
      return PROTOCOLS.map((protocol) =>
        shopRow(save, {
          id: protocol.id,
          tint: protocol.color,
          name: starterName(protocol),
          en: protocol.en,
          desc: starterDesc(protocol),
          price: protocol.price,
          owned: save.economy.protocols.includes(protocol.id),
          onBuy: () => cb.buyProtocol(protocol.id),
          onWish: () => cb.toggleWishlist(protocol.id),
        }),
      );
    case 'supplies':
      return suppliesBody(save, cb);
    case 'skins':
      return skinsBody(save, cb);
    default:
      return progressBody(save);
  }
}

function suppliesBody(save: SaveData, cb: ShopCallbacks): Widget[] {
  const econ = save.economy;
  const clears = Object.values(econ.winsByDifficulty).some((n) => (n ?? 0) > 0) ? 1 : 0;
  const limit = slotLimit(save.records.runs, clears);
  const out: Widget[] = [
    label(t('shop.slots', { used: supplyCost(econ.loadout), limit }), { size: 12, color: 'inkFaint' }),
  ];
  for (const gate of SLOT_GATES) {
    const value = gate.kind === 'runs' ? save.records.runs : clears;
    const met = value >= gate.count;
    out.push(
      label(
        `${met ? '✓ ' : ''}${gate.kind === 'runs' ? t('shop.gateRuns', { n: gate.count }) : t('shop.gateClear')}`,
        {
          size: 11,
          color: met ? 'accent' : 'inkFaint',
        },
      ),
    );
  }
  out.push(spacer(4));
  for (const supply of SUPPLIES) {
    const owned = econ.supplies.includes(supply.id);
    const carried = econ.loadout.includes(supply.id);
    out.push(
      shopRow(save, {
        id: supply.id,
        tint: 0xffd24a,
        name: t(`shop.supply.${supply.id}.name`),
        en: supply.en,
        desc: t(`shop.supply.${supply.id}.desc`),
        price: supply.price,
        owned,
        ownedNote: carried ? t('shop.carried') : t('shop.owned'),
        onBuy: () => cb.buySupply(supply.id),
        onWish: () => cb.toggleWishlist(supply.id),
        // An unowned supply can be tried free for one run; the mark rides on the trialed card.
        onTrial: owned ? undefined : () => cb.setTrial(supply.id),
        trialed: econ.trialSupply === supply.id,
        onCarry: owned ? () => cb.toggleLoadout(supply.id) : undefined,
        carried,
      }),
    );
  }
  return out;
}

function skinsBody(save: SaveData, cb: ShopCallbacks): Widget[] {
  const econ = save.economy;
  const out: Widget[] = [];
  const classicCard = (id: string, kind: 'ball' | 'paddle', nameKey: string, descKey: string): Widget =>
    shopRow(save, {
      id,
      tint: 0xe6faff,
      name: t(nameKey),
      en: 'CLASSIC',
      desc: t(descKey),
      price: 0,
      owned: true,
      onBuy: () => undefined,
      equipped: kind === 'ball' ? econ.skinBall === null : econ.skinPaddle === null,
      onEquip: () => cb.equipSkin(null, kind),
    });
  out.push(label(t('shop.skinGroup.ball'), { size: 14, color: 'accent', weight: '700' }));
  out.push(classicCard('classic', 'ball', 'shop.skin.classic.name', 'shop.skin.classic.desc'));
  out.push(...byKind(save, cb, 'ball'));
  out.push(label(t('shop.skinGroup.paddle'), { size: 14, color: 'accent', weight: '700' }));
  out.push(
    classicCard('classicPaddle', 'paddle', 'shop.skin.classicPaddle.name', 'shop.skin.classicPaddle.desc'),
  );
  out.push(...byKind(save, cb, 'paddle'));
  out.push(label(t('shop.skinGroup.bg'), { size: 14, color: 'accent', weight: '700' }));
  out.push(...byKind(save, cb, 'bg'));
  return out;
}

function byKind(save: SaveData, cb: ShopCallbacks, kind: 'ball' | 'paddle' | 'bg'): Widget[] {
  const econ = save.economy;
  const out: Widget[] = [];
  SKINS.forEach((skin) => {
    if (skin.kind !== kind) return;
    const owned = econ.skins.includes(skin.id);
    // Ball and paddle skins wear their glow; the backdrop theme previews itself on chapter one.
    const tint =
      skin.kind === 'bg' ? applyBgSkin(CHAPTERS[0]!.bg, CHAPTERS[0]!.accent, skin).accent : skin.colors.glow;
    const equipped =
      (skin.kind === 'ball' && econ.skinBall === skin.id) ||
      (skin.kind === 'paddle' && econ.skinPaddle === skin.id) ||
      (skin.kind === 'bg' && econ.skinBg === skin.id);
    out.push(
      shopRow(save, {
        id: skin.id,
        tint,
        name: t(`shop.skin.${skin.id}.name`),
        en: skin.en,
        desc: t(`shop.skin.${skin.id}.desc`),
        price: skin.price,
        owned,
        onBuy: () => cb.buySkin(skin.id),
        // The theme has no stock card of its own, so equipping it again clears it; ball and
        // paddle looks clear through their free 「原色」 card instead.
        onEquip: owned
          ? () =>
              skin.kind === 'bg'
                ? cb.equipSkin(equipped ? null : skin.id, 'bg')
                : cb.equipSkin(skin.id, skin.kind)
          : undefined,
        equipped,
      }),
    );
  });
  return out;
}

/** Today's missions at the top, then the lifetime milestones. */
function progressBody(save: SaveData): Widget[] {
  const econ = save.economy;
  const today = dayKey();
  const live = econ.daily.date === today;
  const out: Widget[] = [
    label(t('shop.dailyTitle'), { size: 14, color: 'accent', weight: '700' }),
    label(t('shop.dailyNote'), { size: 11, color: 'inkFaint' }),
  ];
  for (const mission of dailyMissionsFor(today)) {
    const state = live ? econ.daily.missions.find((m) => m.id === mission.id) : undefined;
    const progress = Math.min(state?.progress ?? 0, mission.target);
    const done = state?.done ?? false;
    out.push(
      panel(
        [
          row(
            [
              label(done ? '✓' : '', { size: 16, color: 'accent', weight: '900' }),
              label(t(`shop.daily.${mission.id}`, { n: `${progress}/${mission.target}` }), {
                size: 13,
                color: 'inkDim',
              }),
              label(`✦ ${DAILY_MISSION_REWARD}`, { size: 12, color: 'gold', align: 'right' }),
            ],
            { gap: 10, align: 'start' },
          ),
          // Progress bar: track with a fill at the row's width.
          panel([spacer(0)], { padding: 0, gap: 0, bg: false, stroke: false, stretch: true }),
        ],
        { padding: 10, gap: 3, bg: done, stroke: false },
      ),
    );
  }
  out.push(spacer(6));
  out.push(
    label(t('shop.progressLine', { n: econ.milestones.length, total: MILESTONES.length }), {
      size: 14,
      color: 'accent',
      weight: '700',
    }),
  );
  out.push(label(t('shop.progressNote'), { size: 11, color: 'inkFaint' }));
  for (const milestone of MILESTONES) {
    const done = econ.milestones.includes(milestone.id);
    const [name, desc] = t(`shop.ms.${milestone.id}`).split('｜');
    out.push(
      panel(
        [
          row(
            [
              label(done ? '✓' : '', { size: 16, color: 'accent', weight: '900' }),
              label(name ?? milestone.id, { size: 14, weight: '700' }),
              label(`✦ ${milestone.reward}`, { size: 12, color: 'gold', align: 'right' }),
            ],
            { gap: 10, align: 'start' },
          ),
          paragraph(desc ?? '', { size: 12, color: 'inkFaint' }),
        ],
        { padding: 10, gap: 2, bg: done, stroke: false },
      ),
    );
  }
  return out;
}

/** One catalog row, playing every role the DOM's `shopItem` does. */
function shopRow(
  save: SaveData,
  opts: {
    id: string;
    tint: number;
    name: string;
    en: string;
    desc: string;
    price: number;
    owned: boolean;
    ownedNote?: string;
    onBuy: () => void;
    onWish?: () => void;
    onTrial?: () => void;
    trialed?: boolean;
    onCarry?: () => void;
    carried?: boolean;
    onEquip?: () => void;
    equipped?: boolean;
  },
): Widget {
  const affordable = save.economy.stardust >= opts.price;
  const wished = save.economy.wishlist === opts.id;
  const tint = rgba(opts.tint, 0.9);
  const side: Widget[] = [];
  if (opts.owned) {
    side.push(label(opts.ownedNote ?? t('shop.owned'), { size: 12, color: 'inkFaint' }));
  } else {
    side.push(
      button(t('shop.buy'), opts.onBuy, {
        variant: affordable ? 'primary' : 'ghost',
        size: 13,
        paddingH: 14,
        sub: `✦ ${formatNumber(opts.price)}`,
        disabled: !affordable,
      }),
    );
    if (opts.onWish) {
      side.push(
        button(t(wished ? 'shop.wished' : 'shop.wish'), opts.onWish, {
          variant: wished ? 'primary' : 'ghost',
          size: 12,
          paddingH: 10,
        }),
      );
    }
  }
  if (opts.onTrial) {
    side.push(
      button(t(opts.trialed ? 'shop.supply.trialOn' : 'shop.supply.trial'), opts.onTrial, {
        variant: opts.trialed ? 'primary' : 'ghost',
        size: 12,
        paddingH: 10,
      }),
    );
  }
  if (opts.onCarry) {
    side.push(
      button(t(opts.carried ? 'shop.carried' : 'shop.carry'), opts.onCarry, {
        variant: opts.carried ? 'primary' : 'ghost',
        size: 12,
        paddingH: 10,
      }),
    );
  }
  if (opts.onEquip) {
    side.push(
      button(opts.equipped ? t('shop.equipped') : t('shop.equip'), opts.onEquip, {
        variant: opts.equipped ? 'primary' : 'ghost',
        size: 12,
        paddingH: 10,
      }),
    );
  }
  return panel(
    [
      row(
        [
          label(opts.name, { size: 16, weight: '700', colorOverride: tint }),
          label(opts.en, { size: 11, color: 'inkFaint' }),
        ],
        { gap: 10, align: 'start' },
      ),
      paragraph(opts.desc, { size: 12, color: 'inkDim' }),
      row(side, { gap: 8, align: 'start' }),
    ],
    { padding: 12, gap: 3, bg: opts.owned, stroke: false },
  );
}

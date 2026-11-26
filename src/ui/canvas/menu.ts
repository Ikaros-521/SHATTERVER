/**
 * The main menu, as a widget tree.
 *
 * Mirrors the DOM menu (`index.html` `#screen-menu`) in structure — logo block, the eight
 * entries with their numbered indices and English captions, and the footer line of records and
 * 星尘 — while the visual language comes from the canvas theme. Pure view: every string arrives
 * ready-formatted (i18n keys resolved, numbers formatted), and every action is a callback the
 * host wires to its own navigation, exactly like `UiActions` on the DOM side.
 *
 * The whole page scrolls as one unit when the viewport is short; the footer stays pinned below
 * the scroll viewport rather than scrolling with it.
 */

import { t } from '../../core/i18n';
import type { TextMeasurer } from './text';
import { uniformMeasurer } from './text';
import {
  button,
  label,
  layoutWidget,
  panel,
  scroll,
  spacer,
  type ScrollWidget,
  type Widget,
} from './widgets';

export interface MenuModel {
  /** The footer records line, ready to show (`menu.recordsEmpty` when nothing yet). */
  recordsText: string;
  /** The formatted 星尘 line; empty on a brand-new player (the DOM hides it too). */
  stardustText: string;
  /** The wishlist nudge line, or null when there is nothing to nudge. */
  wishText: string | null;
  /** The shop entry's trailing badge (first gift, affordable items), or null for none. */
  badgeText: string | null;
}

export interface MenuActions {
  campaign(): void;
  endless(): void;
  shop(): void;
  tutorial(): void;
  codex(): void;
  history(): void;
  cloud(): void;
  settings(): void;
}

/** The entries' English captions; shared by all four languages, same as the DOM build. */
const CAPTIONS = {
  campaign: 'CAMPAIGN · 15 SECTORS',
  endless: 'ENDLESS',
  shop: 'STARDUST SHOP',
  tutorial: 'TUTORIAL',
  codex: 'CODEX',
  history: 'RECORDS',
  cloud: 'CLOUD BOARD',
  settings: 'SETTINGS',
} as const;

/**
 * Builds the menu tree for a surface `width` px wide and `height` px tall. The returned root is
 * laid out to exactly that frame; hand it straight to `CanvasUi.setTree`. `m` is the measuring
 * text source — pass the surface so the two-pass viewport fit uses the real font metrics.
 */
export function menuTree(
  actions: MenuActions,
  model: MenuModel,
  width: number,
  height: number,
  m: TextMeasurer = uniformMeasurer(1),
): Widget {
  const pad = Math.max(18, Math.min(28, width * 0.04));
  const entrySize = 17;

  const list = panel(
    [
      entry('01', t('menu.campaign'), CAPTIONS.campaign, actions.campaign, 'primary', null),
      entry('02', t('menu.endless'), CAPTIONS.endless, actions.endless, 'primary', null),
      entry('03', t('shop.menuEntry'), CAPTIONS.shop, actions.shop, 'ghost', model.badgeText),
      entry('04', t('menu.tutorial'), CAPTIONS.tutorial, actions.tutorial, 'ghost', null),
      entry('05', t('menu.codex'), CAPTIONS.codex, actions.codex, 'ghost', null),
      entry('06', t('menu.history'), CAPTIONS.history, actions.history, 'ghost', null),
      entry('07', t('menu.cloud'), CAPTIONS.cloud, actions.cloud, 'ghost', null),
      entry('08', t('menu.settings'), CAPTIONS.settings, actions.settings, 'ghost', null),
    ],
    { padding: 0, gap: 9, bg: false, stroke: false },
  );

  const content = panel(
    [
      label('碎界', { size: 46, weight: '900' }),
      label('SHATTERVERSE', { size: 13, color: 'accent', alpha: 0.85, weight: '700' }),
      label(t('menu.tagline'), { size: 13, color: 'inkDim' }),
      spacer(14),
      list,
    ],
    { padding: pad, gap: 6, bg: false, stroke: false },
  );

  const footerRows: Widget[] = [label(model.recordsText, { size: 12, color: 'inkFaint' })];
  if (model.wishText !== null)
    footerRows.push(label(model.wishText, { size: 12, color: 'gold', alpha: 0.85 }));
  if (model.stardustText !== '') footerRows.push(label(model.stardustText, { size: 12, color: 'gold' }));

  const build = (viewportH: number): Widget =>
    panel(
      [
        scroll(content, viewportH),
        spacer(6),
        panel(footerRows, { padding: pad, gap: 3, bg: false, stroke: false }),
      ],
      { padding: 0, gap: 0, bg: false, stroke: false },
    );

  // Two-pass layout: the footer's height varies with the data (records line, wishlist, 星尘), so
  // the scroll viewport is fitted to whatever everything around it actually measures — never
  // estimated. `overhead` is the probe's whole layout minus the viewport itself.
  const probe = build(height);
  layoutWidget(probe, 0, 0, width, m);
  const probeScroller = (probe as { children: Widget[] }).children[0] as ScrollWidget;
  const overhead = probe.h - probeScroller.viewportH;
  const root = build(Math.max(120, height - overhead));
  layoutWidget(root, 0, 0, width, m);
  return root;

  function entry(
    index: string,
    text: string,
    caption: string,
    onTap: () => void,
    variant: 'primary' | 'ghost',
    badge: string | null,
  ): Widget {
    return button(text, onTap, {
      variant,
      size: entrySize,
      paddingH: 16,
      sub: caption,
      trailing: badge ?? index,
      stretch: true,
    });
  }
}

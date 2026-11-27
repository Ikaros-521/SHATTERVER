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
  paragraph,
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
  // The DOM narrow/portrait menu: a ~92vw centred column, the list ~88vw inside it.
  const pad = Math.max(20, Math.min(26, width * 0.055));
  const entrySize = 18;

  const list = panel(
    [
      entry('01', t('menu.campaign'), CAPTIONS.campaign, actions.campaign, null),
      entry('02', t('menu.endless'), CAPTIONS.endless, actions.endless, null),
      entry('03', t('shop.menuEntry'), CAPTIONS.shop, actions.shop, model.badgeText),
      entry('04', t('menu.tutorial'), CAPTIONS.tutorial, actions.tutorial, null),
      entry('05', t('menu.codex'), CAPTIONS.codex, actions.codex, null),
      entry('06', t('menu.history'), CAPTIONS.history, actions.history, null),
      entry('07', t('menu.cloud'), CAPTIONS.cloud, actions.cloud, null),
      entry('08', t('menu.settings'), CAPTIONS.settings, actions.settings, null),
    ],
    { padding: 0, gap: 8, bg: false, stroke: false },
  );

  const content = panel(
    [
      // The DOM hero: white → accent → blue vertical gradient, wide tracking, soft glow.
      label('碎界', {
        size: Math.round(Math.min(height * 0.088, width * 0.19)),
        weight: '900',
        align: 'center',
        spacing: Math.round(width * 0.024),
        gradient: ['#ffffff', '#27e0ff', '#5a86ff'],
        glow: 'rgba(39, 224, 255, 0.55)',
      }),
      label('SHATTERVERSE', {
        size: 17,
        color: 'accent',
        alpha: 0.9,
        weight: '700',
        align: 'center',
        spacing: Math.round(width * 0.052),
        glow: 'rgba(39, 224, 255, 0.7)',
      }),
      label(t('menu.tagline'), {
        size: 14,
        color: 'inkDim',
        align: 'center',
        spacing: Math.round(width * 0.012),
      }),
      spacer(12),
      list,
    ],
    { padding: pad, gap: 8, bg: false, stroke: false },
  );

  // The DOM narrow footer flows its lines centred under the list. Each line is a paragraph so a
  // records run longer than the phone width wraps instead of running off the edge.
  const footRows: Widget[] = [paragraph(model.recordsText, { size: 12, color: 'inkFaint', align: 'center' })];
  if (model.wishText !== null)
    footRows.push(paragraph(model.wishText, { size: 12, color: 'gold', alpha: 0.85, align: 'center' }));
  if (model.stardustText !== '')
    footRows.push(paragraph(model.stardustText, { size: 12, color: 'gold', align: 'center' }));

  const build = (viewportH: number): Widget =>
    panel(
      [
        scroll(content, viewportH),
        spacer(6),
        panel(footRows, { padding: 8, gap: 3, bg: false, stroke: false }),
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
    badge: string | null,
  ): Widget {
    return button(text, onTap, {
      size: entrySize,
      paddingH: 14,
      sub: caption,
      trailing: badge ?? undefined,
      index,
      chamfer: true,
      stretch: true,
    });
  }
}

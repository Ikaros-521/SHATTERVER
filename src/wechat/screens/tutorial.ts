/**
 * The tutorial screen (新手说明) as a widget tree: a paged deck over the shared i18n pages.
 *
 * The DOM build shows this as a modal overlay with dots, prev/next and skip; on the shell it is
 * a screen with the same controls — the deck state lives here, the shell just rebuilds on page
 * turns. Page bodies are the DOM's HTML strings, stripped to plain text (the bold spans carry no
 * meaning once the canvas renders them). First-run auto-show joins when the shell grows a
 * launch path that wants it; the menu entry is the route today.
 */

import { dict, t } from '../../core/i18n';
import { MAX_HP_BASE, OVERDRIVE_DURATION } from '../../game/config';
import { UPGRADES } from '../../game/upgrades/defs';
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
  type Widget,
} from '../../ui/canvas/widgets';

export interface TutorialActions {
  /** Leaving the deck from any page; the shell marks the tutorial seen. */
  close(): void;
  /** Page turns; the shell rebuilds with the new page. */
  goto(page: number): void;
}

export interface TutorialPageView {
  eyebrow: string;
  title: string;
  /** The DOM body's HTML, stripped to plain text. */
  body: string;
}

/** The active language's deck, with the fact placeholders filled. */
export function tutorialPages(): TutorialPageView[] {
  return dict().tutorial.pages.map((page) => ({
    eyebrow: page.eyebrow,
    title: page.title,
    body: page.html
      .replace(/\{maxHp\}/g, String(MAX_HP_BASE))
      .replace(/\{overdrive\}/g, String(OVERDRIVE_DURATION))
      .replace(/\{upgrades\}/g, String(UPGRADES.length))
      .replace(/<[^>]+>/g, '\n')
      .replace(/\n{2,}/g, '\n')
      .trim(),
  }));
}

export function tutorialTree(
  page: number,
  actions: TutorialActions,
  width: number,
  height: number,
  m: TextMeasurer = uniformMeasurer(1),
): Widget {
  const pad = Math.max(16, Math.min(26, width * 0.045));
  const pages = tutorialPages();
  const clamped = Math.max(0, Math.min(pages.length - 1, page));
  const current = pages[clamped] as TutorialPageView;
  const last = clamped >= pages.length - 1;

  // Dots: one per page, the active one in accent.
  const dots = row(
    pages.map((_page, i) =>
      label(i === clamped ? '●' : '○', {
        size: 12,
        color: i === clamped ? 'accent' : 'inkFaint',
      }),
    ),
    { gap: 8, align: 'start' },
  );

  const bodyLines = current.body.split('\n').filter(Boolean);
  const children: Widget[] = [
    label(current.eyebrow, { size: 11, color: 'accent', weight: '700', alpha: 0.85 }),
    label(current.title, { size: 24, weight: '900' }),
    spacer(6),
    ...bodyLines.map((line) => paragraph(line, { size: 13, color: 'inkDim', lineHeight: 1.5 })),
    spacer(8),
    dots,
    spacer(6),
    row(
      [
        ...(clamped > 0
          ? [
              button(t('tutorial.prev'), () => actions.goto(clamped - 1), {
                variant: 'ghost',
                size: 14,
                paddingH: 14,
              }),
            ]
          : []),
        button(
          last ? t('common.back') : t('tutorial.next'),
          () => (last ? actions.close() : actions.goto(clamped + 1)),
          { variant: 'primary', size: 14, paddingH: 14, stretch: true },
        ),
      ],
      { gap: 8, align: 'start' },
    ),
    spacer(4),
    button(t('tutorial.skip'), actions.close, { variant: 'ghost', size: 13, stretch: true }),
  ];

  const root = panel(
    [scroll(panel(children, { padding: 0, gap: 7, bg: false, stroke: false }), Math.max(200, height - 140))],
    { padding: pad, gap: 6, bg: false, stroke: false },
  );
  layoutWidget(root, 0, 0, width, m);
  return root;
}

/**
 * The canvas UI's widget tree: plain data in, layout and drawing as pure functions over it.
 *
 * The DOM build rebuilds its screens from data whenever they are shown; this tree follows the
 * same discipline — each `show`/`renderXxx` constructs fresh widget values, then
 * {@link layoutWidget} computes frames and {@link drawWidget} paints them through a
 * {@link Surface}. There is no retained identity, no diffing, no framework: rebuilds are cheap
 * and stateless, which is exactly what a canvas needs.
 *
 * Layout is a single vertical-flow model with just enough freedom for this game's screens:
 * `panel` stacks children with padding and a background, `row` lines children up horizontally,
 * and everything else sizes to its content. Fixed pixels in, frames out — no CSS, no cascading.
 */

import { rgba } from './theme';
import type { Theme, ThemeColors } from './theme';
import type { Surface } from './surface';
import { wrapText } from './text';
import type { TextMeasurer } from './text';

/** A palette key, so widget data never hardcodes colours the theme owns. */
export type ColorKey = keyof ThemeColors;

export type Align = 'left' | 'center' | 'right';

interface Base {
  /** Layout output: the widget's frame in the surface's CSS px space. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PanelWidget extends Base {
  kind: 'panel';
  /** Children stacked top to bottom inside the padding. */
  children: Widget[];
  /** Padding around the children; vertical rhythm comes from `gap`. */
  padding: number;
  gap: number;
  /** Glass background fill; false draws no background at all. */
  bg: boolean;
  /** Accent hairline stroke around the panel. */
  stroke: boolean;
}

export interface RowWidget extends Base {
  kind: 'row';
  children: Widget[];
  gap: number;
  /** Vertical alignment of children shorter than the row. */
  align: 'start' | 'center' | 'end';
}

export interface LabelWidget extends Base {
  kind: 'label';
  text: string;
  size: number;
  color: ColorKey;
  /** A finished `rgba()` string that wins over `color` — for data-driven colours (rarity tiers,
   *  difficulty tiers) that no fixed palette key can name. */
  colorOverride?: string;
  align: Align;
  alpha: number;
  weight: string;
}

export interface ParagraphWidget extends Base {
  kind: 'paragraph';
  text: string;
  size: number;
  color: ColorKey;
  colorOverride?: string;
  align: Align;
  alpha: number;
  /** Line height as a multiple of `size`. */
  lineHeight: number;
}

export interface ButtonWidget extends Base {
  kind: 'button';
  text: string;
  /** Second line under the label (a menu entry's caption); omit for a single-line button. */
  sub?: string;
  /** Small right-aligned note (an index, a count), vertically centred; omit when unneeded. */
  trailing?: string;
  /** True claims the full offered width (menu lists); false sizes to the content. */
  stretch: boolean;
  size: number;
  /** Font sizes of {@link sub} and {@link trailing}; derived by the builder, data here. */
  subSize: number;
  trailingSize: number;
  variant: 'primary' | 'ghost' | 'danger';
  /** Overrides the variant's stroke colour (rarity-tinted cards); fill/text stay from the variant. */
  strokeOverride?: string;
  disabled: boolean;
  /** Horizontal padding around the label; height comes from the touch-target floor. */
  paddingH: number;
  /** The action, invoked by the gesture layer when a tap lands on this widget. */
  onTap: () => void;
}

export interface SpacerWidget extends Base {
  kind: 'spacer';
  h: number;
}

/** A vertically scrolling region around one child. `offset` is written by the gesture layer. */
export interface ScrollWidget extends Base {
  kind: 'scroll';
  child: Widget;
  /** Visible height. */
  viewportH: number;
  /** Layout output: the child's full height (≥ viewport when scrollable). */
  contentH: number;
  /** Current scroll position, 0..contentH-viewportH; owned by the gesture layer. */
  offset: number;
}

export type Widget =
  PanelWidget | RowWidget | LabelWidget | ParagraphWidget | ButtonWidget | SpacerWidget | ScrollWidget;

// ───────────────────────────── builders ─────────────────────────────

/** Fresh widgets carry meaningless frame zeros; builders keep call sites short, not clever. */
export function panel(
  children: Widget[],
  opts: { padding?: number; gap?: number; bg?: boolean; stroke?: boolean } = {},
): PanelWidget {
  return {
    kind: 'panel',
    children,
    padding: opts.padding ?? 14,
    gap: opts.gap ?? 8,
    bg: opts.bg ?? true,
    stroke: opts.stroke ?? true,
    x: 0,
    y: 0,
    w: 0,
    h: 0,
  };
}

export function row(
  children: Widget[],
  opts: { gap?: number; align?: 'start' | 'center' | 'end' } = {},
): RowWidget {
  return {
    kind: 'row',
    children,
    gap: opts.gap ?? 8,
    align: opts.align ?? 'center',
    x: 0,
    y: 0,
    w: 0,
    h: 0,
  };
}

export function label(
  text: string,
  opts: {
    size?: number;
    color?: ColorKey;
    colorOverride?: string;
    align?: Align;
    alpha?: number;
    weight?: string;
  } = {},
): LabelWidget {
  return {
    kind: 'label',
    text,
    size: opts.size ?? 15,
    color: opts.color ?? 'ink',
    colorOverride: opts.colorOverride,
    align: opts.align ?? 'left',
    alpha: opts.alpha ?? 1,
    weight: opts.weight ?? '400',
    x: 0,
    y: 0,
    w: 0,
    h: 0,
  };
}

export function paragraph(
  text: string,
  opts: {
    size?: number;
    color?: ColorKey;
    colorOverride?: string;
    align?: Align;
    alpha?: number;
    lineHeight?: number;
  } = {},
): ParagraphWidget {
  return {
    kind: 'paragraph',
    text,
    size: opts.size ?? 15,
    color: opts.color ?? 'ink',
    colorOverride: opts.colorOverride,
    align: opts.align ?? 'left',
    alpha: opts.alpha ?? 1,
    lineHeight: opts.lineHeight ?? 1.45,
    x: 0,
    y: 0,
    w: 0,
    h: 0,
  };
}

/** Touch-target floor: every button is at least this tall, whatever the label size. */
export const BUTTON_MIN_H = 44;

export function button(
  text: string,
  onTap: () => void,
  opts: {
    variant?: 'primary' | 'ghost' | 'danger';
    disabled?: boolean;
    size?: number;
    paddingH?: number;
    sub?: string;
    trailing?: string;
    stretch?: boolean;
    strokeOverride?: string;
  } = {},
): ButtonWidget {
  const size = opts.size ?? 16;
  return {
    kind: 'button',
    text,
    sub: opts.sub,
    trailing: opts.trailing,
    stretch: opts.stretch ?? false,
    size,
    strokeOverride: opts.strokeOverride,
    subSize: Math.max(10, Math.round(size * 0.62)),
    trailingSize: Math.max(10, Math.round(size * 0.72)),
    variant: opts.variant ?? 'ghost',
    disabled: opts.disabled ?? false,
    paddingH: opts.paddingH ?? 18,
    onTap,
    x: 0,
    y: 0,
    w: 0,
    h: 0,
  };
}

export function spacer(h: number): SpacerWidget {
  return { kind: 'spacer', x: 0, y: 0, w: 0, h };
}

export function scroll(child: Widget, viewportH: number, offset = 0): ScrollWidget {
  return { kind: 'scroll', child, viewportH, contentH: 0, offset, x: 0, y: 0, w: 0, h: 0 };
}

// ───────────────────────────── layout ─────────────────────────────

const LABEL_LINE = 1.35; // label height as a multiple of its size

/** The width a widget claims inside a row: content width for auto widgets, the full offer otherwise. */
function autoWidth(w: Widget, width: number, m: TextMeasurer): number {
  if (w.kind === 'label') return m.measure(w.text, w.size);
  if (w.kind === 'button') return m.measure(w.text, w.size) + w.paddingH * 2;
  if (w.kind === 'spacer') return 0;
  return width;
}

/**
 * Lays `w` out at (x, y) across `width`, writing back every frame including its descendants'.
 * Returns the laid-out height. `width` is the space offered; widgets that auto-size may use less.
 */
export function layoutWidget(w: Widget, x: number, y: number, width: number, m: TextMeasurer): number {
  w.x = x;
  w.y = y;
  w.w = width;
  switch (w.kind) {
    case 'panel': {
      const innerX = x + w.padding;
      const innerW = width - w.padding * 2;
      let cy = y + w.padding;
      for (let i = 0; i < w.children.length; i++) {
        const child = w.children[i] as Widget;
        const h = layoutWidget(child, innerX, cy, innerW, m);
        cy += h + (i < w.children.length - 1 ? w.gap : 0);
      }
      w.h = cy - y + w.padding;
      return w.h;
    }
    case 'row': {
      // Auto-width widgets are measured first, then every child is laid out at its slot —
      // laying out at (0,0) and translating would leave nested panels' subtrees behind.
      const widths = w.children.map((child) => autoWidth(child, width, m));
      let height = 0;
      for (let i = 0; i < w.children.length; i++) {
        height = Math.max(height, layoutWidget(w.children[i] as Widget, x, y, widths[i] as number, m));
      }
      const total = widths.reduce((sum, cw) => sum + cw, 0) + w.gap * Math.max(0, w.children.length - 1);
      let cx = x;
      if (w.align === 'center') cx = x + (width - total) / 2;
      else if (w.align === 'end') cx = x + width - total;
      for (let i = 0; i < w.children.length; i++) {
        const child = w.children[i] as Widget;
        child.x = cx;
        child.w = widths[i] as number;
        child.y =
          w.align === 'start' ? y : w.align === 'end' ? y + height - child.h : y + (height - child.h) / 2;
        cx += (widths[i] as number) + w.gap;
      }
      w.w = width;
      w.h = height;
      return w.h;
    }
    case 'label': {
      // The frame keeps the offered width so aligned labels hit-test where they draw; the text
      // itself is anchored inside the frame by `labelX`.
      w.h = w.size * LABEL_LINE;
      return w.h;
    }
    case 'paragraph': {
      const lines = wrapText(w.text, w.size, width, m);
      w.h = lines.length * w.size * w.lineHeight;
      return w.h;
    }
    case 'button': {
      const textW = m.measure(w.text, w.size);
      const subW = w.sub !== undefined ? m.measure(w.sub, w.subSize) : 0;
      const trailingW =
        w.trailing !== undefined ? m.measure(w.trailing, w.trailingSize) + w.paddingH * 0.7 : 0;
      if (!w.stretch) w.w = Math.max(textW, subW) + w.paddingH * 2 + trailingW;
      const contentH = w.size * 2.2 + (w.sub !== undefined ? w.subSize * 1.9 : 0);
      w.h = Math.max(BUTTON_MIN_H, contentH);
      return w.h;
    }
    case 'spacer':
      return w.h;
    case 'scroll': {
      w.h = w.viewportH;
      w.contentH = layoutWidget(w.child, x, y - w.offset, width, m);
      return w.h;
    }
  }
}

// ───────────────────────────── hit testing ─────────────────────────────

/**
 * The deepest widget whose frame contains the point, or null. Children are searched back to
 * front, so later (visually on top) siblings win. A `scroll` container answers for its whole
 * viewport even where the child has gaps — the drag that scrolls it must not fall through.
 */
export function hitTest(w: Widget, px: number, py: number): Widget | null {
  if (px < w.x || px >= w.x + w.w || py < w.y || py >= w.y + w.h) return null;
  if (w.kind === 'panel' || w.kind === 'row') {
    for (let i = w.children.length - 1; i >= 0; i--) {
      const hit = hitTest(w.children[i] as Widget, px, py);
      if (hit) return hit;
    }
  }
  if (w.kind === 'scroll') return hitTest(w.child, px, py) ?? w;
  return w;
}

/** Walks every widget depth-first (front to back), parents before children. */
export function forEachWidget(w: Widget, visit: (widget: Widget) => void): void {
  visit(w);
  if (w.kind === 'panel' || w.kind === 'row') {
    for (const child of w.children) forEachWidget(child, visit);
  } else if (w.kind === 'scroll') {
    forEachWidget(w.child, visit);
  }
}

// ───────────────────────────── drawing ─────────────────────────────

function colorOf(theme: Theme, key: ColorKey, override?: string): string {
  return override ?? rgba(theme.colors[key], 1);
}

function buttonColors(
  theme: Theme,
  variant: ButtonWidget['variant'],
): { fill: string; stroke: string; text: string } {
  const glass = rgba(theme.colors.glass, theme.glassAlpha);
  switch (variant) {
    case 'primary':
      return {
        fill: rgba(theme.colors.accent, 0.16),
        stroke: rgba(theme.colors.accent, 0.9),
        text: colorOf(theme, 'ink'),
      };
    case 'danger':
      return {
        fill: rgba(theme.colors.danger, 0.14),
        stroke: rgba(theme.colors.danger, 0.8),
        text: colorOf(theme, 'ink'),
      };
    default:
      return { fill: glass, stroke: rgba(theme.colors.accent, 0.35), text: colorOf(theme, 'inkDim') };
  }
}

/** Paints `w` and its descendants at their laid-out frames. Run `layoutWidget` first. */
export function drawWidget(w: Widget, s: Surface, theme: Theme): void {
  switch (w.kind) {
    case 'panel': {
      if (w.bg) {
        s.box(w.x, w.y, w.w, w.h, {
          fill: rgba(theme.colors.glass, theme.glassAlpha),
          ...(w.stroke
            ? { stroke: rgba(theme.colors.line, 0.5), strokeW: 1, radius: theme.radius }
            : { radius: theme.radius }),
        });
      } else if (w.stroke) {
        s.box(w.x, w.y, w.w, w.h, { stroke: rgba(theme.colors.line, 0.5), strokeW: 1, radius: theme.radius });
      }
      for (const child of w.children) drawWidget(child, s, theme);
      return;
    }
    case 'row':
      for (const child of w.children) drawWidget(child, s, theme);
      return;
    case 'label':
      s.text(w.text, labelX(w), w.y, {
        size: w.size,
        color: colorOf(theme, w.color, w.colorOverride),
        align: w.align,
        alpha: w.alpha,
        weight: w.weight,
      });
      return;
    case 'paragraph': {
      const lines = wrapText(w.text, w.size, w.w, s);
      const lineHeight = w.size * w.lineHeight;
      let ly = w.y;
      for (const line of lines) {
        s.text(line, paragraphX(w), ly, {
          size: w.size,
          color: colorOf(theme, w.color, w.colorOverride),
          align: w.align,
          alpha: w.alpha,
        });
        ly += lineHeight;
      }
      return;
    }
    case 'button': {
      const colors = buttonColors(theme, w.variant);
      const alpha = w.disabled ? 0.4 : 1;
      s.box(w.x, w.y, w.w, w.h, {
        fill: colors.fill,
        stroke: w.strokeOverride ?? colors.stroke,
        strokeW: 1,
        radius: theme.radius,
      });
      if (w.sub !== undefined) {
        // Two-line button: the label sits above centre, the caption below it.
        const top = w.y + (w.h - (w.size * 1.15 + w.subSize * 1.35)) / 2;
        s.text(w.text, w.x + w.paddingH, top, {
          size: w.size,
          color: colors.text,
          align: 'left',
          alpha,
          weight: '600',
        });
        s.text(w.sub, w.x + w.paddingH, top + w.size * 1.15 + w.size * 0.15, {
          size: w.subSize,
          color: colors.text,
          align: 'left',
          alpha: alpha * 0.62,
        });
      } else {
        s.text(w.text, w.x + w.w / 2, w.y + (w.h - w.size) / 2, {
          size: w.size,
          color: colors.text,
          align: 'center',
          alpha,
          weight: '600',
        });
      }
      if (w.trailing !== undefined) {
        s.text(w.trailing, w.x + w.w - w.paddingH, w.y + (w.h - w.trailingSize) / 2, {
          size: w.trailingSize,
          color: colors.text,
          align: 'right',
          alpha: alpha * 0.55,
          weight: '600',
        });
      }
      return;
    }
    case 'spacer':
      return;
    case 'scroll':
      s.clip(w.x, w.y, w.w, w.h, () => drawWidget(w.child, s, theme));
      return;
  }
}

/** X anchor for a label within its frame, honouring its alignment. */
function labelX(w: LabelWidget): number {
  if (w.align === 'left') return w.x;
  if (w.align === 'right') return w.x + w.w;
  return w.x + w.w / 2;
}

function paragraphX(w: ParagraphWidget): number {
  if (w.align === 'left') return w.x;
  if (w.align === 'right') return w.x + w.w;
  return w.x + w.w / 2;
}

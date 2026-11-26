/**
 * Visual language for the canvas-rendered UI (the WeChat package's screens).
 *
 * The values mirror the CSS custom properties in `ui/styles.css` — one source of truth per
 * platform would drift, so the numbers here are copied from `:root` and kept in sync by review.
 * The DOM UI on web and Toy never reads this module; nothing here may change how those builds
 * look.
 */

/** 0xRRGGBB palette entries; `rgba()` composes them with an alpha at draw time. */
export interface ThemeColors {
  /** Page background behind every screen. */
  bg: number;
  /** Primary text. */
  ink: number;
  /** Secondary text. */
  inkDim: number;
  /** De-emphasised text (hints, footnotes). */
  inkFaint: number;
  /** The cyan accent: highlights, focused strokes, primary buttons. */
  accent: number;
  /** Gold: currency, rewards, best marks. */
  gold: number;
  /** Danger: destructive actions, failing states. */
  danger: number;
  /** Solid fill of glass panels (replaces the DOM's backdrop-filter blur, which canvas has no). */
  glass: number;
  /** Hairline stroke around panels and rows. */
  line: number;
}

export interface Theme {
  colors: ThemeColors;
  /** Font stack for UI text; CJK-capable faces included, same order as the DOM build. */
  font: string;
  /** Type scale in CSS px, keyed by role. */
  size: { title: number; heading: number; body: number; label: number; hint: number };
  /** Vertical rhythm and panel padding, in CSS px. */
  space: { xs: number; s: number; m: number; l: number };
  /** Panel corner radius. */
  radius: number;
  /** Panel opacity for the glass fill. */
  glassAlpha: number;
}

export const DEFAULT_THEME: Theme = {
  colors: {
    bg: 0x05060f,
    ink: 0xeaf2ff,
    inkDim: 0x9fb0cf,
    inkFaint: 0x66779c,
    accent: 0x27e0ff,
    gold: 0xffd24a,
    danger: 0xff3d5a,
    glass: 0x090d1e,
    line: 0x27e0ff,
  },
  font: `'Bahnschrift', 'DIN Alternate', 'Segoe UI', 'PingFang SC', 'Microsoft YaHei UI', 'Noto Sans SC', system-ui, sans-serif`,
  size: { title: 28, heading: 20, body: 15, label: 13, hint: 11 },
  space: { xs: 4, s: 8, m: 14, l: 22 },
  radius: 10,
  // Coarse-pointer builds raise this to 0.9 (the DOM does the same for touch); the WeChat
  // package is always touch, so the default here is already the raised value.
  glassAlpha: 0.9,
};

/** Composes a `rgba()` colour string for a 2D context from a palette entry. */
export function rgba(hex: number, alpha = 1): string {
  const r = (hex >> 16) & 255;
  const g = (hex >> 8) & 255;
  const b = hex & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

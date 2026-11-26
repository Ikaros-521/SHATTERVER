/**
 * The themes' names, and nothing else: which ids exist, and how a theme part's id is spelled.
 *
 * Every other theme module builds on this one, so it imports nothing. `THEME_IDS` is the one
 * list a new theme is added to; the catalog, the save and the registry all read it from here.
 */

export const THEME_IDS = ['sakura', 'ocean', 'forest'] as const;

/** Any theme the game knows by id. */
export type ThemeId = (typeof THEME_IDS)[number];

/** The three slots a theme dresses. */
export type ThemePartKind = 'paddle' | 'ball' | 'bg';

export const THEME_PART_KINDS: readonly ThemePartKind[] = ['paddle', 'ball', 'bg'];

/** A theme part's catalog id: the theme, the slot, an underscore between. */
export type ThemePartId = `${ThemeId}_${ThemePartKind}`;

export const themePartId = (theme: ThemeId, kind: ThemePartKind): ThemePartId => `${theme}_${kind}`;

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && (THEME_IDS as readonly string[]).includes(value);
}

export function isThemePartKind(value: unknown): value is ThemePartKind {
  return typeof value === 'string' && (THEME_PART_KINDS as readonly string[]).includes(value);
}

/** What a theme part's id names, or null for anything that is not one: a plain skin, junk. */
export function themePart(id: unknown): { theme: ThemeId; kind: ThemePartKind } | null {
  if (typeof id !== 'string') return null;
  const cut = id.lastIndexOf('_');
  if (cut <= 0) return null;
  const theme = id.slice(0, cut);
  const kind = id.slice(cut + 1);
  return isThemeId(theme) && isThemePartKind(kind) ? { theme, kind } : null;
}

export function isThemePartId(value: unknown): value is ThemePartId {
  return themePart(value) !== null;
}

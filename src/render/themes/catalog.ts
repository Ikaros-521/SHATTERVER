import { FOREST } from './facts/forest';
import { OCEAN } from './facts/ocean';
import { SAKURA } from './facts/sakura';
import { THEME_PART_KINDS, themePartId, type ThemeId, type ThemePartId, type ThemePartKind } from './ids';
import type { ThemeFacts } from './types';

/**
 * The themes the shop sells, as pure data: ids, prices, copy, colours.
 *
 * This is the module `render/skins` — and through it the save, the wallet mirror and the WeChat
 * shop — read to recognise a theme part. It imports only each theme's facts: no drawing code, no
 * shader source. Those are the renderer's (`index.ts`).
 *
 * Adding a theme: write its `ThemeFacts` under `facts/`, its `ThemeArt` under `art/` and its
 * painters under `paint/`; list its id in `ids.ts` and its facts here; give it its art and its
 * painters in `index.ts`; and give it copy in the four UI dictionaries under `shop.theme` and
 * `shop.skin`. The set price, the parts' prices and the equip and purchase rules below need no
 * change.
 */

// The ids and their spelling live in `ids.ts`; they are re-exported here so that everything
// outside the theme system has one module to import from.
export {
  THEME_IDS,
  THEME_PART_KINDS,
  isThemeId,
  isThemePartId,
  isThemePartKind,
  themePart,
  themePartId,
} from './ids';
export type { ThemeId, ThemePartId, ThemePartKind } from './ids';

/** Every theme on the shelf, in catalog order. */
export const THEME_FACTS: readonly ThemeFacts<ThemeId>[] = [SAKURA, OCEAN, FOREST];

/** A theme's facts by id. */
export function themeFacts(id: ThemeId): ThemeFacts<ThemeId> {
  return THEME_FACTS.find((theme) => theme.id === id) as ThemeFacts<ThemeId>;
}

/** One theme part as the skin shelf lists it. */
export interface ThemePartDef {
  id: ThemePartId;
  kind: ThemePartKind;
  theme: ThemeId;
  price: number;
  /** Chinese canonical; other locales override through the UI dictionary. */
  name: string;
  en: string;
  desc: string;
}

/** Every theme's parts as catalog rows: theme by theme, paddle, ball, then background. */
export function themePartDefs(): ThemePartDef[] {
  const defs: ThemePartDef[] = [];
  for (const theme of THEME_FACTS) {
    for (const kind of THEME_PART_KINDS) {
      const part = theme[kind];
      defs.push({
        id: themePartId(theme.id, kind),
        kind,
        theme: theme.id,
        price: part.price,
        name: part.name,
        en: part.en,
        desc: part.desc,
      });
    }
  }
  return defs;
}

/** The slots of `theme` the wallet does not own yet. */
export function themeMissing(owned: readonly string[], theme: ThemeId): ThemePartKind[] {
  return THEME_PART_KINDS.filter((kind) => !owned.includes(themePartId(theme, kind)));
}

/**
 * What is left to pay to own all of a theme: its set price, less what its owned parts cost. So
 * a theme never costs more bought in pieces than bought whole, and finishing a set is cheaper
 * than buying the parts still missing one by one.
 */
export function themeRemainder(owned: readonly string[], theme: ThemeId): number {
  const facts = themeFacts(theme);
  let paid = 0;
  for (const kind of THEME_PART_KINDS) {
    if (owned.includes(themePartId(theme, kind))) paid += facts[kind].price;
  }
  return Math.max(0, facts.price - paid);
}

/** The set's purchase verdict: refused when it is already complete, or the balance falls short of what is left. */
export function canBuyTheme(stardust: number, owned: readonly string[], theme: ThemeId): boolean {
  return themeMissing(owned, theme).length > 0 && stardust >= themeRemainder(owned, theme);
}

/** A theme can be worn as a set only once every one of its parts is owned. */
export function canEquipTheme(owned: readonly string[], theme: ThemeId): boolean {
  return themeMissing(owned, theme).length === 0;
}

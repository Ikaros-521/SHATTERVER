import { SAKURA_ART } from './art/sakura';
import { OCEAN_ART } from './art/ocean';
import { FOREST_ART } from './art/forest';
import { themeFragment } from './background';
import { THEME_FACTS, type ThemeId } from './catalog';
import { paintForestBall, paintForestPaddle } from './paint/forest';
import { paintOceanBall, paintOceanPaddle } from './paint/ocean';
import { paintSakuraBall, paintSakuraPaddle } from './paint/sakura';
import type { BallPainter, PaddlePainter, ThemeArt, ThemeConfig, ThemeFacts } from './types';

/**
 * The theme registry: every theme the game can draw, as complete `ThemeConfig`s — the facts the
 * shop sells it by, its art (the scene assembled into a shader, the recipes), and its painters.
 *
 * This is the only module that joins the three, and only the WebGL game imports it: the shop,
 * the save and the wallet mirror read the catalog (`catalog.ts`) and never load a scene.
 *
 * To add a theme, give it its art and its painters here (see `catalog.ts` for the rest of the
 * steps). The render layer, the save and the shop only ever talk to a `ThemeConfig` through the
 * registry, so none of them changes.
 */

/** Each theme's art, keyed by id. */
const ART: Record<ThemeId, ThemeArt<ThemeId>> = {
  sakura: SAKURA_ART,
  ocean: OCEAN_ART,
  forest: FOREST_ART,
};

/** Each theme's painters, keyed by id. A theme without painters cannot be registered. */
const PAINTERS: Record<ThemeId, { paddle: PaddlePainter; ball: BallPainter }> = {
  sakura: { paddle: paintSakuraPaddle, ball: paintSakuraBall },
  ocean: { paddle: paintOceanPaddle, ball: paintOceanBall },
  forest: { paddle: paintForestPaddle, ball: paintForestBall },
};

function themeOf(facts: ThemeFacts<ThemeId>): ThemeConfig<ThemeId> {
  const art = ART[facts.id];
  const painters = PAINTERS[facts.id];
  if (!art || !painters)
    throw new Error(`Theme "${facts.id}" is on the shelf but has no art or no painters.`);
  return {
    ...facts,
    paddle: { ...facts.paddle, paint: painters.paddle },
    ball: { ...facts.ball, paint: painters.ball },
    bg: { ...facts.bg, frag: themeFragment(art.scene) },
    effects: art.effects,
  };
}

export const THEME_CONFIGS: readonly ThemeConfig[] = THEME_FACTS.map(themeOf);

/**
 * The themes the game can draw, by id. A registry is a plain list with a lookup — no behaviour
 * of its own — so a test can build one around an extra theme to prove the rest of the system
 * does not care how many there are.
 */
export class ThemeRegistry {
  readonly all: readonly ThemeConfig[];
  private readonly byId = new Map<string, ThemeConfig>();

  constructor(configs: readonly ThemeConfig[]) {
    for (const theme of configs) {
      if (this.byId.has(theme.id)) throw new Error(`Theme "${theme.id}" is registered twice.`);
      this.byId.set(theme.id, theme);
    }
    this.all = configs;
  }

  /** The theme with this id, or null. Anything that is not a known id answers null. */
  get(id: unknown): ThemeConfig | null {
    return typeof id === 'string' ? (this.byId.get(id) ?? null) : null;
  }
}

export const THEMES = new ThemeRegistry(THEME_CONFIGS);

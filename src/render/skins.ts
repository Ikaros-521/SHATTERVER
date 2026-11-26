/**
 * The 星尘商店's cosmetic shelf: procedural skins.
 *
 * A skin is looks and nothing else — a palette of 0xRRGGBB numbers plus, for backdrop themes,
 * one fixed numeric transform. The render layer reads them at draw time, so the simulation
 * (`game/`) never knows a skin exists. Ball skins recolour the comet trail, the glow and the hot
 * core; paddle skins recolour the paddle's body and its thruster wash (overdrive, ready-meter and
 * buff tints stay stock — they are feedback, not fashion); a backdrop theme runs every chapter's
 * background palette through its transform (an HSL hue rotation with mild saturation/brightness
 * factors) — deterministic, no randomness.
 *
 * Chinese names/descriptions are canonical here; the UI reads its copy through the
 * `shop.skin.<id>` keys (see `i18n/zh.ts`), which every locale must carry. The stock looks
 * 「原色」 (ball and paddle) are not catalog entries: they are free, always owned, and expressed
 * as a null equip.
 */

export type SkinId = 'startrail' | 'molten' | 'aurora' | 'deepspace' | 'emberfall' | 'frostline' | 'duskveil' | 'neon';

export type SkinKind = 'ball' | 'bg' | 'paddle';

/** The three draw-time colours a ball skin recolours. All 0xRRGGBB. */
export interface BallSkinColors {
  /** The hot centre of the ball (drawn over the glow). */
  core: number;
  /** The halo and bloom around the ball; also the trail's fade target. */
  glow: number;
  /** The comet tail stretching behind the ball. */
  trail: number;
}

export interface BallSkinDef {
  id: SkinId;
  kind: 'ball';
  price: number;
  /** Chinese canonical; other locales override through the UI dictionary. */
  name: string;
  en: string;
  desc: string;
  colors: BallSkinColors;
}

/** A fixed numeric transform applied to every chapter's background palette. */
export interface BgSkinTransform {
  /** Hue rotation in turns, 0..1. */
  hue: number;
  /** Saturation multiplier. */
  sat: number;
  /** Lightness multiplier. */
  lum: number;
}

export interface BgSkinDef {
  id: SkinId;
  kind: 'bg';
  price: number;
  name: string;
  en: string;
  desc: string;
  transform: BgSkinTransform;
}

/** The two draw-time colours a paddle skin recolours. All 0xRRGGBB. */
export interface PaddleSkinColors {
  /** The paddle's own surface (the stock look is a cold near-white). */
  body: number;
  /** The thruster wash underneath and the soft halo while charged. */
  glow: number;
}

export interface PaddleSkinDef {
  id: SkinId;
  kind: 'paddle';
  price: number;
  name: string;
  en: string;
  desc: string;
  colors: PaddleSkinColors;
}

export type SkinDef = BallSkinDef | BgSkinDef | PaddleSkinDef;

/** Ball skins first, then paddle skins, in ascending price; the backdrop theme closes the shelf. */
export const SKINS: readonly SkinDef[] = [
  {
    id: 'startrail',
    kind: 'ball',
    price: 800,
    name: '星轨',
    en: 'STARTRAIL',
    desc: '冷白青的拖尾，像一颗星划过夜空。',
    colors: { core: 0xeafcff, glow: 0x9fd8ff, trail: 0x62e8ff },
  },
  {
    id: 'molten',
    kind: 'ball',
    price: 1000,
    name: '熔金',
    en: 'MOLTEN',
    desc: '金橙色的辉光包裹球体。',
    colors: { core: 0xfff2cc, glow: 0xffa348, trail: 0xff7a2e },
  },
  {
    id: 'aurora',
    kind: 'ball',
    price: 1200,
    name: '极光',
    en: 'AURORA',
    desc: '青紫渐变的辉光与拖尾。',
    colors: { core: 0xeffff8, glow: 0x7ce8c8, trail: 0xa86bff },
  },
  {
    id: 'deepspace',
    kind: 'ball',
    price: 1500,
    name: '深空',
    en: 'DEEPSPACE',
    desc: '深蓝的辉光底色，衬出亮银核心。',
    colors: { core: 0xf4f7ff, glow: 0x3352b8, trail: 0x1c2f6e },
  },
  {
    id: 'emberfall',
    kind: 'paddle',
    price: 600,
    name: '余烬',
    en: 'EMBERFALL',
    desc: '弹板涂装：碳橙的板身带着未散的余温，推进器光晕暖橙。',
    colors: { body: 0xffb27a, glow: 0xff7a3c },
  },
  {
    id: 'frostline',
    kind: 'paddle',
    price: 800,
    name: '霜线',
    en: 'FROSTLINE',
    desc: '弹板涂装：冰蓝钢体，推进器光晕冷冽如霜。',
    colors: { body: 0xbfe8ff, glow: 0x5ec8ff },
  },
  {
    id: 'duskveil',
    kind: 'paddle',
    price: 1000,
    name: '暮帷',
    en: 'DUSKVEIL',
    desc: '弹板涂装：暮色的紫落在一块板上，光晕沉静。',
    colors: { body: 0xc9a8ff, glow: 0x8a5cff },
  },
  {
    id: 'neon',
    kind: 'bg',
    price: 2500,
    name: '霓虹回廊',
    en: 'NEON ARCADE',
    desc: '背景主题：每章的底色与强调色做霓虹偏移。',
    transform: { hue: 5 / 12, sat: 1.28, lum: 0.92 },
  },
];

export const SKIN_MAP: Record<string, SkinDef> = Object.fromEntries(SKINS.map((skin) => [skin.id, skin]));

/** The equipped-ball value that means 「原色」: not a catalog item, never bought, always available. */
export const defaultBallSkin: string = 'classic';

/** The equipped-paddle value that means the stock paddle, same rules as the ball's 「原色」. */
export const defaultPaddleSkin: string = 'classic';

export function isSkinId(value: unknown): value is SkinId {
  return typeof value === 'string' && Object.hasOwn(SKIN_MAP, value);
}

export function isBallSkinId(value: unknown): value is SkinId {
  return isSkinId(value) && SKIN_MAP[value].kind === 'ball';
}

export function isBgSkinId(value: unknown): value is SkinId {
  return isSkinId(value) && SKIN_MAP[value].kind === 'bg';
}

export function isPaddleSkinId(value: unknown): value is SkinId {
  return isSkinId(value) && SKIN_MAP[value].kind === 'paddle';
}

/** The shop action's verdict, shared with the tests: unknown, owned or unaffordable all refuse. */
export function canBuySkin(stardust: number, ownedSkins: readonly string[], id: string): boolean {
  const def = SKIN_MAP[id];
  return def !== undefined && !ownedSkins.includes(id) && stardust >= def.price;
}

/**
 * The equip action's verdict. Null is always allowed (it clears back to the stock look); an id
 * must be an owned skin of the asked kind, so a backdrop id can never ride the ball slot and
 * a hand-edited save cannot equip something the wallet never bought.
 */
export function canEquipSkin(ownedSkins: readonly string[], id: string | null, kind: SkinKind): boolean {
  if (id === null) return true;
  const def = SKIN_MAP[id];
  return def !== undefined && def.kind === kind && ownedSkins.includes(id);
}

/** 0xRRGGBB → [h, s, l], each 0..1. Pure arithmetic, so the same input always converts alike. */
function rgbToHsl(hex: number): [number, number, number] {
  const r = ((hex >> 16) & 255) / 255;
  const g = ((hex >> 8) & 255) / 255;
  const b = (hex & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h, s, l];
}

/** [h, s, l] → 0xRRGGBB; each channel rounded and clamped to a legal byte. */
function hslToRgb(h: number, s: number, l: number): number {
  const hue = ((h % 1) + 1) % 1;
  const sat = Math.min(1, Math.max(0, s));
  const lum = Math.min(1, Math.max(0, l));
  if (sat === 0) {
    const v = Math.round(lum * 255);
    return (v << 16) | (v << 8) | v;
  }
  const q = lum < 0.5 ? lum * (1 + sat) : lum + sat - lum * sat;
  const p = 2 * lum - q;
  const channel = (t0: number): number => {
    let t = t0 % 1;
    if (t < 0) t += 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const r = Math.round(channel(hue + 1 / 3) * 255);
  const g = Math.round(channel(hue) * 255);
  const b = Math.round(channel(hue - 1 / 3) * 255);
  return (r << 16) | (g << 8) | b;
}

/**
 * Runs one chapter's background palette through a theme's transform. Deterministic: the same
 * palette, accent and skin always produce the same bytes, with every output channel a legal
 * 0xRRGGBB value, so the render layer can apply it without further guards.
 */
export function applyBgSkin(
  colors: readonly [number, number, number],
  accent: number,
  skin: BgSkinDef,
): { bg: [number, number, number]; accent: number } {
  const shift = (hex: number): number => {
    const [h, s, l] = rgbToHsl(hex);
    return hslToRgb(h + skin.transform.hue, s * skin.transform.sat, l * skin.transform.lum);
  };
  return { bg: [shift(colors[0]), shift(colors[1]), shift(colors[2])], accent: shift(accent) };
}

/**
 * A ball skin's core colour as the renderer's over-white HDR tone: the 0xRRGGBB bytes scaled to
 * the given brightness, so a 「亮银核心」 reads as bright as the stock hot core it replaces.
 */
export function ballCoreColor(core: number, brightness: number): readonly [number, number, number] {
  return [
    (((core >> 16) & 255) / 255) * brightness,
    (((core >> 8) & 255) / 255) * brightness,
    ((core & 255) / 255) * brightness,
  ];
}

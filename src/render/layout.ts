import { ARENA_H, ARENA_W } from '../game/config';
import type { Viewport } from './camera';

/** Where the arena sits in the window, plus the device pixel ratio the renderer should use. */
export interface Layout extends Viewport {
  /** Window size in CSS px. */
  cssW: number;
  cssH: number;
  /** Device pixels per CSS pixel. Capped: 4K bloom buys nothing visible and costs a lot. */
  dpr: number;
  /** True for upright screens (phones and tablets held vertically). */
  portrait: boolean;
  /**
   * Height of the HUD bands the portrait layout reserves above and below the arena. Zero on
   * non-portrait shapes, where the HUD keeps its desktop arrangement. The CSS draws its bands
   * with these exact numbers (plus safe-area insets it adds on its own).
   */
  hudTop: number;
  hudBottom: number;
}

export const MAX_DPR = { low: 1, medium: 1.5, high: 2 } as const;
export type QualityLevel = keyof typeof MAX_DPR;

/** Portrait HUD bands: top carries lives/level/score, bottom carries the build strip and the overdrive pill. */
const PORTRAIT_BAND_TOP = 58;
const PORTRAIT_BAND_BOTTOM = 96;

/**
 * Fits the fixed-aspect arena into the window.
 *
 * On wide windows the arena is capped at 56% of the width so the build panel (left) and the
 * stats panel (right) get real estate beside it. On narrow desktop windows it fills the width
 * and the HUD overlays its edges. On upright screens it reserves HUD bands above and below:
 * the freed vertical bands are where the mobile HUD lives.
 *
 * `scale` shrinks the pixel ratio below the tier's cap: the frame is drawn smaller and the
 * browser upscales it. The quality governor uses it as its last step on devices that stay slow
 * even on "low".
 */
export function computeLayout(
  cssW: number,
  cssH: number,
  quality: QualityLevel,
  deviceDpr: number,
  scale = 1,
): Layout {
  const dpr = Math.min(deviceDpr, MAX_DPR[quality]) * scale;
  const marginY = Math.min(26, cssH * 0.03);
  const marginX = Math.min(28, cssW * 0.02);
  const aspect = ARENA_W / ARENA_H;
  const portrait = cssW / cssH < 0.95;

  if (portrait) {
    const availH = Math.max(160, cssH - PORTRAIT_BAND_TOP - PORTRAIT_BAND_BOTTOM - marginY * 2);
    const aw = Math.max(120, Math.min(cssW - marginX * 2, availH * aspect));
    const ah = aw / aspect;
    return {
      cssW,
      cssH,
      dpr,
      portrait: true,
      hudTop: PORTRAIT_BAND_TOP,
      hudBottom: PORTRAIT_BAND_BOTTOM,
      ax: (cssW - aw) / 2,
      // Centre the arena in the room left between the two bands.
      ay: PORTRAIT_BAND_TOP + marginY + (availH - ah) / 2,
      aw,
      ah,
    };
  }

  const narrow = cssW / cssH < 1.15;
  const maxWidth = narrow ? cssW - marginX * 2 : Math.min(cssW - marginX * 2, cssW * 0.56);
  const maxHeight = cssH - marginY * 2;

  const aw = Math.max(120, Math.min(maxWidth, maxHeight * aspect));
  const ah = aw / aspect;
  return {
    cssW,
    cssH,
    dpr,
    portrait: false,
    hudTop: 0,
    hudBottom: 0,
    ax: (cssW - aw) / 2,
    ay: (cssH - ah) / 2,
    aw,
    ah,
  };
}

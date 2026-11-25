import { ARENA_H, ARENA_W } from '../game/config';
import type { Viewport } from './camera';

/** Where the arena sits in the window, plus the device pixel ratio the renderer should use. */
export interface Layout extends Viewport {
  /** Window size in CSS px. */
  cssW: number;
  cssH: number;
  /** Device pixels per CSS pixel. Capped: 4K bloom buys nothing visible and costs a lot. */
  dpr: number;
}

export const MAX_DPR = { low: 1, medium: 1.5, high: 2 } as const;
export type QualityLevel = keyof typeof MAX_DPR;

/**
 * Fits the fixed-aspect arena into the window, centred.
 *
 * On wide windows the arena is capped at 56% of the width so the build panel (left) and the
 * stats panel (right) get real estate beside it. On narrow windows it simply fills the width.
 */
export function computeLayout(cssW: number, cssH: number, quality: QualityLevel, deviceDpr: number): Layout {
  const dpr = Math.min(deviceDpr, MAX_DPR[quality]);
  const marginY = Math.min(26, cssH * 0.03);
  const marginX = Math.min(28, cssW * 0.02);
  const aspect = ARENA_W / ARENA_H;

  const narrow = cssW / cssH < 1.15;
  const maxWidth = narrow ? cssW - marginX * 2 : Math.min(cssW - marginX * 2, cssW * 0.56);
  const maxHeight = cssH - marginY * 2;

  const aw = Math.max(120, Math.min(maxWidth, maxHeight * aspect));
  const ah = aw / aspect;
  return {
    cssW,
    cssH,
    dpr,
    ax: (cssW - aw) / 2,
    ay: (cssH - ah) / 2,
    aw,
    ah,
  };
}

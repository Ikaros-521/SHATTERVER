import type { QualityLevel } from './layout';

/**
 * Everything the composite shader needs beyond the scene itself.
 *
 * `Fx` writes into this every frame; the renderer uploads it as uniforms. Screen-space values
 * (shockwaves, lens, flash) are in CSS pixels with y down, matching the shader's convention.
 */
export interface PostState {
  bloom: number;
  exposure: number;
  /** Chromatic aberration at the screen edge, in CSS px. */
  aberration: number;
  zoomBlur: number;
  glitch: number;
  desaturate: number;
  tint: [number, number, number];
  tintAmount: number;
  /** rgb + amount (0..1). */
  flash: [number, number, number, number];
  /** rgb + amount of the screen-edge glow. */
  edge: [number, number, number, number];
  vignette: number;
  grain: number;
  scanline: number;
  /** Up to 8 shockwaves, 4 floats each: x, y, radius, strength. */
  shock: Float32Array;
  shockCount: number;
  /** x, y, radius, strength of the single gravity lens. Strength 0 disables it. */
  lens: [number, number, number, number];
}

export function createPost(quality: QualityLevel): PostState {
  return {
    bloom: quality === 'low' ? 0.8 : 1,
    exposure: 1.08,
    aberration: 0.7,
    zoomBlur: 0,
    glitch: 0,
    desaturate: 0,
    tint: [1, 1, 1],
    tintAmount: 0,
    flash: [1, 1, 1, 0],
    edge: [1, 1, 1, 0],
    vignette: 0.42,
    grain: 0.035,
    scanline: 0.05,
    shock: new Float32Array(32),
    shockCount: 0,
    lens: [0, 0, 0, 0],
  };
}

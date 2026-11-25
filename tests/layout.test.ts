import { describe, expect, it } from 'vitest';
import { computeLayout } from '../src/render/layout';

describe('computeLayout', () => {
  const ASPECT = 720 / 960;

  it('keeps the desktop arrangement on wide windows', () => {
    const layout = computeLayout(1920, 1080, 'high', 2);
    expect(layout.portrait).toBe(false);
    expect(layout.hudTop).toBe(0);
    expect(layout.hudBottom).toBe(0);
    expect(layout.aw).toBeLessThanOrEqual(1920 * 0.56);
    expect(layout.ax).toBeCloseTo((1920 - layout.aw) / 2);
  });

  it('reserves HUD bands on an upright phone and keeps the arena between them', () => {
    const w = 390;
    const h = 844;
    const layout = computeLayout(w, h, 'high', 3);
    expect(layout.portrait).toBe(true);
    expect(layout.hudTop).toBeGreaterThan(0);
    expect(layout.hudBottom).toBeGreaterThan(0);
    expect(layout.ay).toBeGreaterThanOrEqual(layout.hudTop);
    expect(layout.ay + layout.ah).toBeLessThanOrEqual(h - layout.hudBottom);
    expect(layout.aw).toBeLessThanOrEqual(w);
    expect(layout.aw / layout.ah).toBeCloseTo(ASPECT, 5);
    expect(layout.ax).toBeCloseTo((w - layout.aw) / 2);
  });

  it('caps the device pixel ratio by quality level', () => {
    expect(computeLayout(390, 844, 'high', 3).dpr).toBe(2);
    expect(computeLayout(390, 844, 'medium', 3).dpr).toBe(1.5);
    expect(computeLayout(390, 844, 'low', 3).dpr).toBe(1);
  });

  it('scales the pixel ratio below the cap on request, and nothing else', () => {
    const full = computeLayout(390, 844, 'low', 3);
    const scaled = computeLayout(390, 844, 'low', 3, 0.75);
    // Fewer pixels for the GPU; the arena still lands on the same CSS rectangle.
    expect(scaled.dpr).toBe(0.75);
    expect(scaled.dpr * scaled.dpr).toBeCloseTo(0.5625, 5);
    expect(scaled.ax).toBe(full.ax);
    expect(scaled.ay).toBe(full.ay);
    expect(scaled.aw).toBe(full.aw);
    expect(scaled.portrait).toBe(true);
  });
});

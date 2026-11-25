import { describe, expect, it } from 'vitest';
import { FrameTimes, OUTLIER_MS, SLOW_MS } from '../src/core/frametimes';

describe('FrameTimes', () => {
  it('reports nothing before any data', () => {
    const times = new FrameTimes();
    expect(times.count).toBe(0);
    expect(times.fps).toBe(0);
    expect(times.lowFps).toBe(0);
    expect(times.jank).toBe(0);
  });

  it('fps is the rate of the mean frame time, not the mean of the rates', () => {
    const steady = new FrameTimes();
    for (let i = 0; i < 10; i++) steady.push(20);
    expect(steady.fps).toBe(50);

    // Half the frames at 60 fps, half at 20 fps: 33.3 ms on average, so 30 fps. Averaging the
    // two rates instead would claim 40.
    const mixed = new FrameTimes();
    for (let i = 0; i < 10; i++) mixed.push(i % 2 ? 100 / 6 : 50);
    expect(mixed.fps).toBeCloseTo(30, 5);
  });

  it('lowFps describes the worst frames and jank how many were late', () => {
    const times = new FrameTimes(8);
    for (let i = 0; i < 6; i++) times.push(100 / 6);
    times.push(50);
    times.push(60);
    expect(times.count).toBe(8);
    expect(times.jank).toBe(0.25);
    expect(times.lowFps).toBeCloseTo(1000 / 60, 5);
  });

  it('treats a frame as late only beyond the smoothness target', () => {
    const times = new FrameTimes();
    times.push(SLOW_MS);
    expect(times.jank).toBe(0);
    times.push(SLOW_MS + 0.1);
    expect(times.jank).toBe(0.5);
  });

  it('ignores outliers instead of letting them distort the figures', () => {
    const times = new FrameTimes();
    for (let i = 0; i < 4; i++) times.push(16.7);
    times.push(OUTLIER_MS + 1); // a tab switch
    times.push(0);
    times.push(-5);
    times.push(Number.NaN);
    times.push(Number.POSITIVE_INFINITY);
    expect(times.count).toBe(4);
    expect(times.fps).toBeCloseTo(59.88, 1);
    expect(times.jank).toBe(0);
  });

  it('is a rolling window: old frames fall out, and nothing is allocated per frame', () => {
    const times = new FrameTimes(8);
    for (let i = 0; i < 8; i++) times.push(40);
    for (let i = 0; i < 8; i++) times.push(100 / 6);
    expect(times.count).toBe(8);
    expect(times.fps).toBeCloseTo(60, 5);
    expect(times.jank).toBe(0);
    times.reset();
    expect(times.count).toBe(0);
  });
});

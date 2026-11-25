import { describe, expect, it } from 'vitest';
import { RNG, hashCombine, hashString } from '../src/core/rng';
import { formatNumber, formatTime, angleDelta, damp } from '../src/core/math';

describe('RNG', () => {
  it('produces the same stream for the same seed', () => {
    const a = new RNG(1234);
    const b = new RNG(1234);
    const seqA = Array.from({ length: 2000 }, () => a.next());
    const seqB = Array.from({ length: 2000 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('diverges for different seeds', () => {
    const a = new RNG(1);
    const b = new RNG(2);
    expect(a.next()).not.toBe(b.next());
  });

  it('is uniform over [0, 1)', () => {
    const rng = new RNG(7);
    const buckets = new Array<number>(20).fill(0);
    let outOfRange = 0;
    for (let i = 0; i < 200_000; i++) {
      const v = rng.next();
      if (v < 0 || v >= 1) outOfRange++;
      buckets[Math.floor(v * 20)]++;
    }
    expect(outOfRange).toBe(0);
    for (const count of buckets) expect(Math.abs(count - 10_000)).toBeLessThan(800);
  });

  it('int() is inclusive on both ends', () => {
    const rng = new RNG(99);
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < 5000; i++) {
      const v = rng.int(3, 6);
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    expect(min).toBe(3);
    expect(max).toBe(6);
  });

  it('shuffle() is a permutation and deterministic', () => {
    const input = Array.from({ length: 50 }, (_, i) => i);
    const a = new RNG(5).shuffle([...input]);
    const b = new RNG(5).shuffle([...input]);
    expect(a).toEqual(b);
    expect([...a].sort((x, y) => x - y)).toEqual(input);
  });

  it('weighted() ignores zero weights and returns null when nothing qualifies', () => {
    const rng = new RNG(11);
    expect(rng.weighted(['a', 'b'], (s) => (s === 'a' ? 0 : 1))).toBe('b');
    expect(rng.weighted(['a'], () => 0)).toBeNull();
    expect(rng.weighted([], () => 1)).toBeNull();
  });

  it('fork() yields independent streams', () => {
    const a = new RNG(42);
    const b = a.fork();
    expect(a.next()).not.toBe(b.next());
  });

  it('hashes are stable and combine order-sensitively', () => {
    expect(hashString('shatterverse')).toBe(hashString('shatterverse'));
    expect(hashString('a')).not.toBe(hashString('b'));
    expect(hashCombine(1, 2)).not.toBe(hashCombine(2, 1));
    expect(hashCombine(1, 2)).toBe(hashCombine(1, 2));
  });
});

describe('math helpers', () => {
  it('formatNumber abbreviates', () => {
    expect(formatNumber(999)).toBe('999');
    expect(formatNumber(1000)).toBe('1K');
    expect(formatNumber(1234)).toBe('1.23K');
    expect(formatNumber(15_000)).toBe('15K');
    expect(formatNumber(150_000)).toBe('150K');
    expect(formatNumber(1_500_000)).toBe('1.5M');
    expect(formatNumber(1_234_567)).toBe('1.23M');
    expect(formatNumber(2_300_000_000)).toBe('2.3B');
    expect(formatNumber(1e15)).toBe('1Qa');
    expect(formatNumber(-1234)).toBe('-1.23K');
    expect(formatNumber(Number.POSITIVE_INFINITY)).toBe('∞');
  });

  it('formatTime', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(65)).toBe('1:05');
    expect(formatTime(3725)).toBe('1:02:05');
  });

  it('angleDelta takes the short way round', () => {
    expect(angleDelta(0.1, -0.1)).toBeCloseTo(-0.2);
    expect(angleDelta(3, -3)).toBeCloseTo(2 * Math.PI - 6);
  });

  it('damp converges to the target without overshooting', () => {
    let v = 0;
    for (let i = 0; i < 600; i++) v = damp(v, 10, 20, 1 / 60);
    expect(v).toBeCloseTo(10, 4);
  });
});

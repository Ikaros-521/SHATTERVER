import { describe, expect, it } from 'vitest';
import { CHARS } from '../src/render/textAtlas';
import { formatNumber } from '../src/core/math';

describe('glyph atlas strip', () => {
  it('carries every glyph in-canvas text can need', () => {
    // The only canvas text is damage numbers from `formatNumber` (digits, decimal point, sign,
    // unit letters, "∞" for non-finite values) plus the crit mark painted by the caller.
    const values = [0, 999, 1234, 1500, 1.5e6, 2.5e9, 3.4e12, 5e15, 9e21, -42, NaN, Infinity];
    for (const value of values) {
      for (const ch of formatNumber(value)) expect(CHARS, `${value} → ${formatNumber(value)}`).toContain(ch);
      expect(CHARS).toContain('!');
    }
  });

  it('has no duplicate glyphs', () => {
    expect(new Set([...CHARS]).size).toBe(CHARS.length);
  });
});

import { describe, expect, it } from 'vitest';
import { decodeSave, encodeSave } from '../src/core/savecodec';

/** Replaces one base64 character with a different valid one, so the blob stays well-formed. */
function flipChar(blob: string, at: number): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const ch = blob[at];
  expect(ch, `flip position ${at} inside the blob`).toBeDefined();
  const next = alphabet[(alphabet.indexOf(ch) + 7) % alphabet.length];
  return blob.slice(0, at) + next + blob.slice(at + 1);
}

describe('save codec', () => {
  it('round-trips a lived-in payload with CJK, astral glyphs and JSON escapes', () => {
    const json = JSON.stringify({
      stardust: 4321,
      bestScore: 987_654,
      name: '测试扇区・深淵',
      emoji: '🌌✨🛡️',
      escapes: '"\\\n\t/',
      list: [1, 2.5, -7, 1e21],
      empty: { deep: [] },
    });
    expect(decodeSave(encodeSave(json))).toBe(json);
  });

  it('round-trips a lone-surrogate escape exactly (JSON.parse can hand one back)', () => {
    const json = '{"name":"\\ud83d"}';
    expect(decodeSave(encodeSave(json))).toBe(json);
  });

  it('stores nothing readable: no field names, no values, not parseable JSON', () => {
    const blob = encodeSave(JSON.stringify({ stardust: 4321, bestScore: 999_999 }));
    expect(blob.startsWith('SVX1:')).toBe(true);
    expect(blob).not.toContain('stardust');
    expect(blob).not.toContain('4321');
    expect(blob).not.toContain('999999');
    expect(() => JSON.parse(blob)).toThrow();
  });

  it('re-randomizes every write, so identical payloads never encode alike', () => {
    const json = JSON.stringify({ stardust: 1 });
    expect(encodeSave(json)).not.toBe(encodeSave(json));
  });

  it('rejects a single flipped character anywhere in the blob', () => {
    const blob = encodeSave(JSON.stringify({ stardust: 4321, history: [{ score: 1_000_000 }] }));
    // 'SVX1:' plus eleven characters cover the 12-byte nonce/checksum header; flip inside the
    // header (keystream breaks) and deep in the payload (checksum breaks) — both must fail.
    for (const at of [8, blob.length - 20, Math.floor(blob.length / 2)]) {
      expect(decodeSave(flipChar(blob, at))).toBeNull();
    }
  });

  it('rejects truncation, invalid base64, and values that are not ours', () => {
    const blob = encodeSave(JSON.stringify({ stardust: 1 }));
    expect(decodeSave(blob.slice(0, -4))).toBeNull();
    expect(decodeSave('SVX1:')).toBeNull();
    expect(decodeSave('SVX1:****')).toBeNull();
    expect(decodeSave(JSON.stringify({ stardust: 1 }))).toBeNull();
    expect(decodeSave('')).toBeNull();
    expect(decodeSave(null)).toBeNull();
    expect(decodeSave(undefined as unknown as string | null)).toBeNull();
  });

  it('round-trips an empty payload and a long one (full-size save)', () => {
    expect(decodeSave(encodeSave(''))).toBe('');
    const big = JSON.stringify({
      history: Array.from({ length: 50 }, (_, i) => ({ score: i, name: `玩家${i}号・扇区记录` })),
      padding: 'x'.repeat(40_000),
    });
    expect(decodeSave(encodeSave(big))).toBe(big);
  });
});

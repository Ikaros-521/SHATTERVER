import { describe, expect, it } from 'vitest';
import docs from '../docs/nickname-blocklist.md?raw';
import { BLOCKED_CJK, BLOCKED_SUBSTRINGS, BLOCKED_WHOLE } from '../src/net/blocklist';

/**
 * The shipped module stores the lists base64-encoded so the game bundle carries no prohibited
 * vocabulary. The readable master is `docs/nickname-blocklist.md`; this suite fails if the two
 * drift apart, and checks that the encoded data still decodes into the shape the matcher expects.
 */

function section(markdown: string, heading: string): string[] {
  const at = markdown.indexOf(`## ${heading}`);
  expect(at, `missing section: ${heading}`).toBeGreaterThanOrEqual(0);
  const open = markdown.indexOf('```text', at);
  expect(open, `missing code block after: ${heading}`).toBeGreaterThanOrEqual(0);
  const start = markdown.indexOf('\n', open) + 1;
  const close = markdown.indexOf('```', start);
  expect(close, `unterminated code block after: ${heading}`).toBeGreaterThan(0);
  return markdown
    .slice(start, close)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

describe('nickname blocklist data', () => {
  it('ships exactly the terms listed in docs/nickname-blocklist.md', () => {
    expect([...BLOCKED_SUBSTRINGS]).toEqual(section(docs, 'BLOCKED_SUBSTRINGS'));
    expect([...BLOCKED_WHOLE]).toEqual(section(docs, 'BLOCKED_WHOLE'));
    expect([...BLOCKED_CJK]).toEqual(section(docs, 'BLOCKED_CJK'));
  });

  it('decodes to plain lowercase ASCII terms with no duplicates', () => {
    const all = [...BLOCKED_SUBSTRINGS, ...BLOCKED_WHOLE];
    expect(all.length).toBeGreaterThan(100);
    for (const term of all) expect(term).toMatch(/^[a-z0-9]+$/);
    expect(new Set(all).size).toBe(all.length);
  });

  it('decodes the CJK list to plain Han terms with no duplicates and no ASCII mix-ins', () => {
    expect(BLOCKED_CJK.length).toBeGreaterThan(20);
    for (const term of BLOCKED_CJK) expect(term).toMatch(/^\p{Script=Han}+$/u);
    const all = [...BLOCKED_CJK, ...BLOCKED_SUBSTRINGS, ...BLOCKED_WHOLE];
    expect(new Set(all).size).toBe(all.length);
  });
});

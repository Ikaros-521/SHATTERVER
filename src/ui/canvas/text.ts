/**
 * Text measuring and line-breaking for the canvas UI.
 *
 * Canvas 2D gives measurement (`measureText`) but no layout: line breaking is this module's job.
 * The rules are CJK-aware because the game ships four languages — Latin text breaks at spaces
 * and after hyphens, while CJK text may break after any ideograph, kana or full-width punctuation
 * (the browser does the same for the DOM build). A run longer than the whole line is hard-split
 * rather than left to overflow.
 *
 * Everything is pure and takes the measurer as an argument, so tests run without a canvas.
 */

/** Measures one string at one px size. Backed by `measureText` in production. */
export type TextMeasurer = {
  measure: (text: string, size: number) => number;
};

/** A measurer where every character costs half its em — deterministic for tests. */
export function uniformMeasurer(ratio = 0.5): TextMeasurer {
  return {
    measure: (text, size) => [...text].length * size * ratio,
  };
}

/**
 * True when a line of text may break *after* this character. CJK ideographs, kana, Hangul
 * syllables, and full-width or CJK punctuation all allow a break at their right edge; Latin
 * script does not (word boundaries are found by scanning for the breakable characters instead).
 */
export function breakableAfter(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  if (char === ' ') return true;
  if (char === '-' || char === ',' || char === '/' || char === ':') return true;
  // Hiragana + Katakana
  if (code >= 0x3040 && code <= 0x30ff) return true;
  // CJK punctuation and full-width forms
  if (code >= 0x3000 && code <= 0x303f) return true;
  if (code >= 0xff00 && code <= 0xffef) return true;
  // CJK Unified Ideographs and extensions most fonts actually carry
  if (code >= 0x3400 && code <= 0x9fff) return true;
  // Compatibility ideographs
  if (code >= 0xf900 && code <= 0xfaff) return true;
  // Hangul syllables
  if (code >= 0xac00 && code <= 0xd7af) return true;
  return false;
}

const HYPHEN_SLOP = 1; // rounding slack so a line exactly at the limit is not split

/**
 * Breaks `text` into lines that each measure at most `maxWidth` px at `size`.
 *
 * Break opportunities sit after breakable characters and inside spaces; a single unbreakable run
 * wider than the line is split at whatever character crosses the edge. Trailing spaces never
 * survive onto a line. Returns at least one line (an empty input yields one empty line). All
 * offsets are code-point based, so astral-plane characters never corrupt a breakpoint.
 */
export function wrapText(text: string, size: number, maxWidth: number, m: TextMeasurer): string[] {
  const lines: string[] = [];
  let line = '';
  let lineLen = 0; // code points in `line`
  let breakAt = -1; // code-point offset just past the last breakpoint on this line

  const chars = [...text];
  let i = 0;
  while (i < chars.length) {
    const candidate = line + (chars[i] as string);
    if (m.measure(candidate, size) <= maxWidth + HYPHEN_SLOP) {
      line = candidate;
      lineLen++;
      if (breakableAfter(chars[i] as string)) breakAt = lineLen;
      i++;
      continue;
    }
    // The character overflows the line. Break at the last opportunity if there is one.
    if (breakAt > 0) {
      const parts = [...line];
      lines.push(parts.slice(0, breakAt).join('').trimEnd());
      const rest = parts.slice(breakAt).join('');
      line = rest;
      lineLen = parts.length - breakAt;
      breakAt = -1;
      // Re-scan the carried-over remainder for its own breakpoints.
      let scan = 0;
      for (const ch of [...rest]) {
        scan++;
        if (breakableAfter(ch)) breakAt = scan;
      }
      // The overflowing character may still not fit the new line; it is handled next loop.
      continue;
    }
    // No opportunity on this line: hard-break here rather than overflow.
    lines.push(line.trimEnd());
    line = chars[i] as string;
    lineLen = 1;
    breakAt = breakableAfter(chars[i] as string) ? 1 : -1;
    i++;
  }
  lines.push(line.trimEnd());
  return lines;
}

/**
 * Shortens `text` to fit `maxWidth` px at `size`, ending with `mark` when characters were cut.
 * Already-fitting text is returned untouched; a `maxWidth` narrower than the mark alone returns
 * just the mark.
 */
export function truncate(text: string, size: number, maxWidth: number, m: TextMeasurer, mark = '…'): string {
  if (m.measure(text, size) <= maxWidth) return text;
  const markWidth = m.measure(mark, size);
  let out = '';
  for (const char of text) {
    if (m.measure(out + char + mark, size) > maxWidth) break;
    out += char;
  }
  if (markWidth > maxWidth) return '';
  return out + mark;
}

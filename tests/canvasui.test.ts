/**
 * The canvas UI kit: line breaking, layout, hit testing and draw calls — all pure, driven by an
 * injected measurer (half-em per character) so tests are deterministic without a canvas.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_THEME } from '../src/ui/canvas/theme';
import { CanvasSurface } from '../src/ui/canvas/surface';
import { truncate, uniformMeasurer, wrapText } from '../src/ui/canvas/text';
import {
  BUTTON_MIN_H,
  button,
  drawWidget,
  hitTest,
  label,
  layoutWidget,
  panel,
  paragraph,
  row,
  scroll,
  type ButtonWidget,
  type Widget,
} from '../src/ui/canvas/widgets';

const m = uniformMeasurer(0.5); // every character costs half its em

describe('wrapText', () => {
  it('breaks CJK text at any character', () => {
    // 10 px per character at size 20; a 100 px line holds exactly ten.
    const lines = wrapText('碎界是一款把砖块打成碎片的弹球游戏', 20, 100, m);
    expect(lines[0]).toHaveLength(10);
    expect(lines.join('')).toBe('碎界是一款把砖块打成碎片的弹球游戏');
    for (const line of lines) expect(m.measure(line, 20)).toBeLessThanOrEqual(101);
  });

  it('breaks Latin text at spaces, never inside words', () => {
    expect(wrapText('aaa bbb ccc', 10, 40, m)).toEqual(['aaa bbb', 'ccc']);
    expect(wrapText('aaa bbb ccc', 10, 20, m)).toEqual(['aaa', 'bbb', 'ccc']);
  });

  it('keeps CJK breaks tight while Latin words stay whole in mixed text', () => {
    const lines = wrapText('中文 abc 中文', 10, 40, m);
    // '中文 abc 中' is exactly 9 characters = 40 px, so the line fills up and breaks after the
    // ideograph; the Latin word 'abc' was never split.
    expect(lines[0]).toBe('中文 abc 中');
    expect(lines).toHaveLength(2);
    expect(lines.join('')).toBe('中文 abc 中文');
    for (const line of lines) expect(m.measure(line, 10)).toBeLessThanOrEqual(41);
  });

  it('hard-splits a run that cannot fit a line at all', () => {
    expect(wrapText('aaaaaaaa', 10, 20, m)).toEqual(['aaaa', 'aaaa']);
  });

  it('returns one empty line for empty input', () => {
    expect(wrapText('', 10, 100, m)).toEqual(['']);
  });
});

describe('truncate', () => {
  it('returns text untouched when it fits', () => {
    expect(truncate('碎界', 10, 100, m)).toBe('碎界');
  });

  it('cuts and marks when it does not', () => {
    expect(truncate('碎界碎界碎界', 10, 19, m)).toBe('碎界…'); // 3 chars + mark = 20 > 19
    expect(truncate('碎界碎界碎界', 10, 14, m)).toBe('碎…'); // 2 chars + mark = 15 > 14
  });
});

describe('layoutWidget', () => {
  it('stacks panel children with padding and gap', () => {
    const tree = panel([label('A', { size: 10 }), label('B', { size: 10 })], { padding: 14, gap: 8 });
    const h = layoutWidget(tree, 0, 0, 100, m);
    // 14 + 13.5 + 8 + 13.5 + 14
    expect(h).toBeCloseTo(63);
    const [a, b] = tree.children;
    expect(a?.y).toBe(14);
    expect(b?.y).toBeCloseTo(35.5);
    // Children span the panel's inner width, not the full offer.
    expect(a?.x).toBe(14);
    expect(a?.w).toBe(72);
  });

  it('gives buttons the touch-target floor and label-derived width', () => {
    const b = button('开始', () => undefined, { size: 16 });
    const h = layoutWidget(b, 0, 0, 200, m);
    expect(b.h).toBe(BUTTON_MIN_H); // 16 * 2.2 = 35.2 < 44
    expect(b.w).toBe(2 * 16 * 0.5 + 36);
    expect(h).toBe(BUTTON_MIN_H);
  });

  it('sizes a paragraph from its wrapped line count', () => {
    const p = paragraph('碎界碎界碎界碎界碎界碎界', { size: 10, lineHeight: 2 });
    const h = layoutWidget(p, 0, 0, 50, m); // 5 px per character → ten per line → two lines
    expect(h).toBeCloseTo(2 * 10 * 2);
  });

  it('places row children left to right, centred vertically and horizontally', () => {
    const left = button('L', () => undefined, { size: 10 }); // 5 + 36 = 41 wide, 44 tall
    const right = label('R', { size: 10 }); // 5 wide, 13.5 tall
    const r = row([left, right], { gap: 10, align: 'center' });
    layoutWidget(r, 0, 0, 200, m);
    expect(left.x).toBe((200 - 56) / 2); // total = 41 + 10 + 5 = 56
    expect(right.x).toBe(left.x! + left.w + 10);
    expect(right.y).toBe((44 - 13.5) / 2);
    expect(left.y).toBe(0);
  });

  it('lays scroll children at the offset and reports the content height', () => {
    const inner = panel([label('A', { size: 10 }), label('B', { size: 10 }), label('C', { size: 10 })], {
      padding: 14,
      gap: 8,
    });
    const sc = scroll(inner, 50, 20);
    const h = layoutWidget(sc, 0, 0, 100, m);
    expect(h).toBe(50);
    expect(sc.contentH).toBeCloseTo(14 * 2 + 13.5 * 3 + 8 * 2);
    expect(inner.y).toBe(-20);
  });
});

describe('hitTest', () => {
  function tree(): { root: Widget; b: ButtonWidget } {
    const b = button('打', () => undefined, { size: 10, paddingH: 10 }); // 15 wide, 44 tall
    const root = panel([label('标题', { size: 20 }), row([b], { gap: 0 })], { padding: 10, gap: 10 });
    layoutWidget(root, 0, 0, 100, m);
    return { root, b };
  }

  it('returns the deepest widget under the point', () => {
    const { root, b } = tree();
    // Row starts at y = 10 + 27 + 10 = 47; the button is its only, centred child.
    expect(hitTest(root, b.x + 1, b.y + 1)).toBe(b);
    // Inside the panel but in the gap between children: the panel answers for itself.
    expect(hitTest(root, 50, 44)).toBe(root);
    // Outside everything.
    expect(hitTest(root, 500, 500)).toBeNull();
  });

  it('answers for a scroll viewport and maps its offset', () => {
    const inner = panel([button('远处的按钮', () => undefined, { size: 10, paddingH: 10 })], { padding: 10 });
    const sc = scroll(inner, 40, 10);
    layoutWidget(sc, 0, 0, 100, m);
    const b = inner.children[0] as ButtonWidget;
    // offset 10 lifts the child panel to y=-10, so the button's frame sits at y=0: still inside
    // the 40 px viewport, and hit exactly where it draws.
    expect(b.y).toBe(0);
    expect(hitTest(sc, b.x + 1, b.y + 1)).toBe(b);
    expect(hitTest(sc, 50, 500)).toBeNull(); // below the viewport
  });
});

describe('drawWidget', () => {
  /** A recording surface: enough of CanvasSurface to check what the tree paints. */
  class FakeSurface {
    boxes: { x: number; y: number; w: number; h: number; fill?: string; stroke?: string }[] = [];
    texts: { str: string; x: number; y: number; alpha: number }[] = [];
    clips: { x: number; y: number; w: number; h: number }[] = [];
    surface = {
      width: 400,
      height: 800,
      clear: (): void => undefined,
      box: (x: number, y: number, w: number, h: number, style: { fill?: string; stroke?: string }): void => {
        this.boxes.push({ x, y, w, h, fill: style.fill, stroke: style.stroke });
      },
      clip: (x: number, y: number, w: number, h: number, draw: () => void): void => {
        this.clips.push({ x, y, w, h });
        draw();
      },
      text: (str: string, x: number, y: number, style: { size: number; alpha?: number }): void => {
        this.texts.push({ str, x, y, alpha: style.alpha ?? 1 });
      },
      measure: (str: string, size: number): number => m.measure(str, size),
    };
  }

  it('paints a button as box plus centred text, dimmed when disabled', () => {
    const f = new FakeSurface();
    const theme = DEFAULT_THEME;
    const enabled = button('开始', () => undefined, { size: 10, paddingH: 10 });
    layoutWidget(enabled, 0, 0, 100, m);
    drawWidget(enabled, f.surface, theme);
    expect(f.boxes).toHaveLength(1);
    expect(f.texts).toEqual([{ str: '开始', x: enabled.w / 2, y: (44 - 10) / 2, alpha: 1 }]);

    const disabled = button('开始', () => undefined, { disabled: true, size: 10, paddingH: 10 });
    layoutWidget(disabled, 0, 0, 100, m);
    const f2 = new FakeSurface();
    drawWidget(disabled, f2.surface, theme);
    expect(f2.texts[0]?.alpha).toBe(0.4);
  });

  it('clips scroll contents to the viewport', () => {
    const f = new FakeSurface();
    const sc = scroll(label('内容', { size: 10 }), 40);
    layoutWidget(sc, 0, 0, 100, m);
    drawWidget(sc, f.surface, DEFAULT_THEME);
    expect(f.clips).toEqual([{ x: 0, y: 0, w: 100, h: 40 }]);
    expect(f.texts).toHaveLength(1);
  });
});

describe('CanvasSurface.text', () => {
  it('configures font, alignment and alpha on the context', () => {
    const calls: { font?: string; align?: string; baseline?: string; alpha?: number }[] = [];
    const ctx = {
      set font(value: string) {
        calls.push({ font: value });
      },
      set textAlign(value: CanvasTextAlign) {
        calls[calls.length - 1]!.align = value;
      },
      set textBaseline(value: CanvasTextBaseline) {
        calls[calls.length - 1]!.baseline = value;
      },
      set globalAlpha(value: number) {
        calls[calls.length - 1]!.alpha = value;
      },
      set fillStyle(_value: string) {
        // not asserted
      },
      fillText: (): void => undefined,
      measureText: (): TextMetrics => ({ width: 42 }) as TextMetrics,
    } as unknown as CanvasRenderingContext2D;
    const s = new CanvasSurface(ctx, 400, 800, 'TestFont');
    s.text('你好', 10, 20, { size: 16, color: '#fff', align: 'center', weight: '700' });
    expect(calls[0]).toMatchObject({ align: 'center', baseline: 'top', alpha: 1 });
    expect(calls[0]?.font).toContain('700 16px TestFont');
    expect(s.measure('你好', 16)).toBe(42);
  });
});

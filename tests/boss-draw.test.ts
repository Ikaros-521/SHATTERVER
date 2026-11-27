import { describe, expect, it } from 'vitest';
import {
  bothHalves,
  chained,
  cubicPoints,
  faults,
  joined,
  mirrored,
  trace,
} from '../src/render/boss/hiyou/draw/brush';
import { drawHiyou } from '../src/render/boss/hiyou/draw/figure';
import { EYE_AT, eyeOpening, FACE } from '../src/render/boss/hiyou/draw/head';
import { BOSS_PARTS, restingLook, type FaceId, type PartState } from '../src/render/boss/types';
import { fakeCanvas } from './fake-canvas';

/** A canvas that only remembers the path it is given, command by command. */
function recorder(): { calls: string[]; ctx: CanvasRenderingContext2D } {
  const calls: string[] = [];
  const ctx = {
    beginPath: () => calls.push('begin'),
    moveTo: (x: number, y: number) => calls.push(`M ${x} ${y}`),
    lineTo: (x: number, y: number) => calls.push(`L ${x} ${y}`),
    quadraticCurveTo: (a: number, b: number, c: number, d: number) => calls.push(`Q ${a} ${b} ${c} ${d}`),
    bezierCurveTo: (a: number, b: number, c: number, d: number, e: number, f: number) =>
      calls.push(`C ${a} ${b} ${c} ${d} ${e} ${f}`),
    closePath: () => calls.push('Z'),
  } as unknown as CanvasRenderingContext2D;
  return { calls, ctx };
}

/** A path of M and C, cubic by cubic: each one's points, ten samples to a cubic. */
function stretches(d: string): [number, number][][] {
  const tokens = d.trim().split(/[\s,]+/);
  const out: [number, number][][] = [];
  let at = 0;
  let cur: [number, number] = [0, 0];
  while (at < tokens.length) {
    const op = tokens[at++];
    if (op === 'M' || op === 'C') {
      const n = tokens.slice(at, at + (op === 'M' ? 2 : 6)).map(Number);
      if (op === 'M') {
        cur = [n[0]!, n[1]!];
        at += 2;
      } else {
        out.push(
          cubicPoints(cur[0], cur[1], n[0]!, n[1]!, n[2]!, n[3]!, n[4]!, n[5]!, 10).map(
            ([x, y]): [number, number] => [x, y],
          ),
        );
        cur = [n[4]!, n[5]!];
        at += 6;
      }
    } else if (op !== 'Z') {
      throw new Error(`the test cannot read "${op}".`);
    }
  }
  return out;
}

/** Every point a path of M and C runs through. */
const outline = (d: string): [number, number][] => stretches(d).flat();

const span = (points: [number, number][], axis: 0 | 1): number => {
  const values = points.map((p) => p[axis]);
  return Math.max(...values) - Math.min(...values);
};

describe('paths for drawing with Canvas 2D', () => {
  it('runs cubics on from one another, each as it was given', () => {
    const { calls, ctx } = recorder();
    trace(
      ctx,
      chained(
        [
          [0, 0, 1, 1, 2, 2, 3, 3],
          [3, 3, 4, 4, 5, 5, 6, 6],
        ],
        true,
      ),
    );
    expect(calls).toEqual(['begin', 'M 0 0', 'C 1 1 2 2 3 3', 'C 4 4 5 5 6 6', 'Z']);
  });

  it('refuses a cubic that is not eight numbers', () => {
    // A cubic given with its start point left out reads as a command the canvas cannot make, and
    // the rest of the path is quietly dropped: an eye's outline ends up cut off by a straight line.
    expect(() => chained([[0, 0, 1, 1, 2, 2]])).toThrow(/eight numbers/);
    expect(() =>
      chained([
        [0, 0, 1, 1, 2, 2, 3, 3],
        [3, 3, 4, 4, 5, 5, 6, 6, 7],
      ]),
    ).toThrow(/eight numbers/);
    expect(() => chained([])).toThrow(/eight numbers/);
  });

  it('leaves out what it cannot read, and says nothing', () => {
    // Which is why nothing may hand `trace` a path built by joining numbers by hand.
    const { calls, ctx } = recorder();
    trace(ctx, 'M 0 0 C 1 1 2 2 3 3 4');
    expect(calls).toEqual(['begin', 'M 0 0', 'C 1 1 2 2 3 3']);
  });

  it('closes a shape round both sides of the middle', () => {
    // Written from the top of the middle down the right side to the bottom of the middle.
    const { calls, ctx } = recorder();
    trace(ctx, bothHalves('M 0 -10 C 8 -10 8 0 0 10'));
    expect(calls).toEqual(['begin', 'M 0 -10', 'C 8 -10 8 0 0 10', 'C -8 0 -8 -10 0 -10', 'Z']);
  });

  it('turns x about and nothing else', () => {
    expect(mirrored('M 1 -2 Q 3 -4 5 -6 L 7 -8 Z')).toBe('M -1 -2 Q -3 -4 -5 -6 L -7 -8 Z');
  });

  it('joins two sampled curves end to end', () => {
    const curve = cubicPoints(0, 0, 0, 0, 0, 0, 1, 0, 3);
    const whole = joined(curve, curve);
    expect(whole).toHaveLength(5);
    // The second curve's first point is dropped, and the way along is read again over the whole.
    // (The curve is x = t³: all three of its control points but the last are at the origin.)
    expect(whole[0]).toEqual([0, 0, 0]);
    expect(whole[1]).toEqual([0.125, 0, 0.25]);
    expect(whole[2]).toEqual([1, 0, 0.5]);
    expect(whole[3]).toEqual([0.125, 0, 0.75]);
    expect(whole[4]).toEqual([1, 0, 1]);
  });
});

describe("绯樱's head, by the proportions it is drawn to", () => {
  // In widths of the face across the eyes, read off drawn anime faces. See the head of head.ts.
  const face = outline(FACE);
  const width = span(face, 0);
  const eye = outline(eyeOpening(1));
  const [ex] = EYE_AT;

  it('is a tall head with a small chin', () => {
    expect(width).toBeCloseTo(80.6, 0);
    // The crown 0.6 widths above the middle of the eyes, the chin a little over half way down again.
    expect(EYE_AT[1] - Math.min(...face.map((p) => p[1]))).toBeCloseTo(70.5, 0);
    expect(Math.max(...face.map((p) => p[1]))).toBeCloseTo(-117, 0);
    // Full to the level of the nose, then drawn in: a third of the way up from the chin the jaw is
    // three quarters as wide as the face, a sixth of the way up less than half.
    const rows = face.filter((p) => p[0] > 0);
    const halfAt = (y: number): number => {
      const near = rows.reduce((best, p) => (Math.abs(p[1] - y) < Math.abs(best[1] - y) ? p : best));
      return near[0];
    };
    expect(halfAt(-134) / (width / 2)).toBeGreaterThan(0.7);
    expect(halfAt(-134) / (width / 2)).toBeLessThan(0.85);
    expect(halfAt(-122) / (width / 2)).toBeLessThan(0.6);
  });

  it('sets the eyes wide apart, their outer corners at the edge of the face', () => {
    const eyeWidth = span(eye, 0);
    expect(eyeWidth / width).toBeCloseTo(0.285, 1);
    expect(span(eye, 1) / width).toBeCloseTo(0.21, 1);
    const gap = 2 * (ex - eyeWidth / 2);
    expect(gap / width).toBeGreaterThan(0.36);
    expect(gap / width).toBeLessThan(0.42);
    expect(ex + eyeWidth / 2).toBeLessThan(width / 2);
  });

  it('reads the whole of the eye, and only closes upwards', () => {
    const { calls, ctx } = recorder();
    trace(ctx, eyeOpening(1));
    // Both stretches of the lid and both of the lower lid: a path that stopped early loses its last.
    expect(calls.filter((c) => c.startsWith('C'))).toHaveLength(4);
    expect(calls.at(-1)).toBe('Z');
    // y grows downwards, so a lid that comes down is a larger number. The lid is the first two
    // stretches of the outline; the lower lid never moves.
    const lidTop = (open: number): number =>
      Math.min(
        ...stretches(eyeOpening(open))
          .slice(0, 2)
          .flat()
          .map((p) => p[1]),
      );
    expect(lidTop(1)).toBeLessThan(lidTop(0.5));
    expect(lidTop(0.5)).toBeLessThan(lidTop(0.05));
  });
});

describe('绯樱 drawn whole', () => {
  it('reads every path to its end and hands the canvas only finite numbers, whatever her face and her state', () => {
    const { ctx, bad } = fakeCanvas();
    const faces: FaceId[] = ['idle', 'smug', 'surprised', 'angry', 'hurt', 'awakened', 'defeated'];
    const states: PartState[] = ['intact', 'damaged_1', 'damaged_2', 'destroyed'];
    const before = faults.unread;
    for (const face of faces) {
      for (const state of states) {
        const look = restingLook();
        for (const id of BOSS_PARTS)
          look[id] = { state, flash: state === 'damaged_1' ? 0.6 : 0, dx: 1.5, dy: -2 };
        // Her face and her hair are not drawn by state: a head that is gone is a fight that is over.
        look.Head = { state: 'intact', flash: 0, dx: 0, dy: 0 };
        for (const time of [0, 1.234, 40]) {
          drawHiyou(ctx, { x: 0, y: 0, time, face, look });
        }
      }
    }
    expect(faults.unread).toBe(before);
    expect(bad).toEqual([]);
  });

  it('draws a part that is gone not at all', () => {
    const whole = fakeCanvas();
    const intact = restingLook();
    drawHiyou(whole.ctx, { x: 0, y: 0, time: 0, face: 'idle', look: intact });
    const hurt = fakeCanvas();
    const damaged = restingLook();
    for (const id of [
      'LeftWing',
      'RightWing',
      'LeftArm',
      'RightArm',
      'LeftShoulder',
      'RightShoulder',
    ] as const) {
      damaged[id] = { state: 'destroyed', flash: 0, dx: 0, dy: 0 };
    }
    drawHiyou(hurt.ctx, { x: 0, y: 0, time: 0, face: 'idle', look: damaged });
    expect(hurt.fills()).toBeLessThan(whole.fills() / 2);
  });
});

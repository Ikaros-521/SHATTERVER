import { describe, expect, it } from 'vitest';
import type { Box, Layer } from '../src/render/boss/sheet';
import { allShots, place } from '../src/render/boss/sheet';
import { stageSheet, type StagePicture } from '../src/render/boss/stage/sheet';
import { VESPER_STAGES } from '../src/render/boss/vesper/layout';
import { vesperMotion } from '../src/render/boss/vesper/motion';
import type { BossFrame } from '../src/render/boss/types';

/**
 * A character shown as one whole picture a stage of her fight: the template, and 薇斯珀's six
 * pictures through it. What is checked is what the template promises — that the picture of the
 * moment is the only one up, that a change of picture cross-fades, that nothing is drawn without
 * its picture, and that every picture lies where the cut said it does.
 */

const COUNT = Object.keys(VESPER_STAGES).length;
const pictures = (): (StagePicture | null)[] =>
  Array.from({ length: COUNT }, () => [{} as CanvasImageSource, {} as CanvasImageSource] as const);

function frame(stage: number, mix = 1, time = 1.7): BossFrame {
  return { x: 360, y: 230, time, face: 'idle', look: {}, stage, stageMix: mix };
}

/** What is placed, as `[group, alpha]`, in the order it goes down. */
const laid = (sheet: ReturnType<typeof stageSheet>, at: BossFrame): [string, number][] =>
  place(sheet!, at, []).map((piece) => [piece.group, +piece.alpha.toFixed(3)]);

describe('a character shown in stage pictures', () => {
  it('is a layer a picture, with a light under each that has one', () => {
    const sheet = stageSheet('vesper', pictures(), { stages: VESPER_STAGES, ...vesperMotion })!;
    expect(sheet.id).toBe('vesper');
    expect(sheet.layers.map((layer) => layer.id)).toEqual([
      'light-0',
      'stage-0',
      'light-1',
      'stage-1',
      'light-2',
      'stage-2',
      'light-3',
      'stage-3',
      'light-4',
      'stage-4',
      'light-5',
      'stage-5',
    ]);
    expect(allShots(sheet)).toHaveLength(2 * COUNT);
    // Nothing of her belongs to a part: the picture is the whole of her.
    expect(sheet.layers.every((layer) => layer.part === null)).toBe(true);
  });

  it('shows the picture of the moment, whole, and nothing else', () => {
    const sheet = stageSheet('vesper', pictures(), { stages: VESPER_STAGES, ...vesperMotion })!;
    expect(laid(sheet, frame(0))).toEqual([
      ['light-0', expect.any(Number)],
      ['stage-0', 1],
    ]);
    expect(laid(sheet, frame(3)).map(([group]) => group)).toEqual(['light-3', 'stage-3']);
    // Without a stage said, the first picture shows — a frame from a fight that knows no better.
    expect(laid(sheet, { ...frame(0), stage: null }).map(([group]) => group)).toEqual(['light-0', 'stage-0']);
  });

  it('cross-fades from one picture to the next: the old one thins as the new one settles', () => {
    const sheet = stageSheet('vesper', pictures(), { stages: VESPER_STAGES, ...vesperMotion })!;
    const at = (mix: number): [string, number][] =>
      laid(sheet, frame(2, mix)).filter(([g]) => g.startsWith('stage'));
    // Hardly begun: the last picture is nearly whole, the new one hardly there.
    expect(at(0.1)).toEqual([
      ['stage-1', 0.9],
      ['stage-2', 0.1],
    ]);
    expect(at(0.5)).toEqual([
      ['stage-1', 0.5],
      ['stage-2', 0.5],
    ]);
    expect(at(0.95)).toEqual([
      ['stage-1', 0.05],
      ['stage-2', 0.95],
    ]);
    // Settled: only the new one.
    expect(at(1)).toEqual([['stage-2', 1]]);
    // The light goes with its picture: both are up while the change is under way, and each as much as its picture.
    const lights = (mix: number): Record<string, number> =>
      Object.fromEntries(laid(sheet, frame(2, mix)).filter(([g]) => g.startsWith('light')));
    expect(Object.keys(lights(0.3)).sort()).toEqual(['light-1', 'light-2']);
    expect(Object.keys(lights(1)).sort()).toEqual(['light-2']);
    // The first picture has none before it to fade from: begun or settled, it shows whole.
    expect(laid(sheet, frame(0, 0)).filter(([g]) => g.startsWith('stage'))).toEqual([['stage-0', 1]]);
    // A picture two stages on is not part of a change: only the one next to the new one is.
    expect(at(0.4)).toEqual([
      ['stage-1', 0.6],
      ['stage-2', 0.4],
    ]);
  });

  it('moves as one — a breath, never a part against another — and its light flickers', () => {
    const sheet = stageSheet('vesper', pictures(), { stages: VESPER_STAGES, ...vesperMotion })!;
    const here = place(sheet!, frame(4, 1, 1.0), []).find((piece) => piece.group === 'stage-4')!;
    const there = place(sheet!, frame(4, 1, 2.3), []).find((piece) => piece.group === 'stage-4')!;
    expect([there.x, there.y]).not.toEqual([here.x, here.y]);
    // The light is never still, and never out.
    const l1 = place(sheet!, frame(4, 1, 1.0), []).find((piece) => piece.group === 'light-4')!.alpha;
    const l2 = place(sheet!, frame(4, 1, 1.7), []).find((piece) => piece.group === 'light-4')!.alpha;
    expect(l1).toBeGreaterThan(0.5);
    expect(l2).toBeGreaterThan(0.5);
    expect(l1).not.toBe(l2);
  });

  it('takes the white of a hit from the worst of her parts, as much of it as the picture can take', () => {
    const sheet = stageSheet('vesper', pictures(), { stages: VESPER_STAGES, ...vesperMotion })!;
    const hurt = {
      ...frame(2),
      look: {
        skirt: { state: 'intact' as const, flash: 0.4, dx: 0, dy: 0 },
        head: { state: 'intact' as const, flash: 1, dx: 3, dy: -2 },
      },
    };
    // Set the clock the same for both, so that only the knock differs.
    const piece = place(sheet!, hurt, []).find((each) => each.group === 'stage-2')!;
    expect(piece.flash).toBeCloseTo(vesperMotion.flash!, 5);
    // A hit knocks a part; the picture is not knocked with it — it is the whole of her. (What moves
    // it is only her breath, which is the same for a frame with nothing knocked.)
    const calm = place(sheet!, frame(2, 1, hurt.time), []).find((each) => each.group === 'stage-2')!;
    expect([piece.x, piece.y]).toEqual([calm.x, calm.y]);
    // Placed still, as for a picture made of her, nothing is breathed out of place.
    expect(place(sheet!, frame(1), [], true).find((each) => each.group === 'stage-1')!.alpha).toBe(1);
  });

  it('throws a breath of light on her as a picture changes, strongest as it begins and gone when it has settled', () => {
    const sheet = stageSheet('vesper', pictures(), { stages: VESPER_STAGES, ...vesperMotion })!;
    const calm = { ...frame(1, 1), look: {} };
    const white = (mix: number): number =>
      place(sheet!, { ...calm, stage: 1, stageMix: mix }, []).find((each) => each.group === 'stage-1')!.flash;
    // Settled, and with nothing struck: no light at all.
    expect(white(1)).toBe(0);
    // It falls away as the new picture settles — the square of what is left of the change.
    expect(white(0)).toBeCloseTo(vesperMotion.changeFlash!, 5);
    expect(white(0.5)).toBeCloseTo(vesperMotion.changeFlash! * 0.25, 5);
    expect(white(0.9)).toBeCloseTo(vesperMotion.changeFlash! * 0.01, 5);
    // The picture going out takes it too: the light is of the moment, not of either picture.
    expect(
      place(sheet!, { ...calm, stage: 1, stageMix: 0 }, []).find((each) => each.group === 'stage-0')!.flash,
    ).toBeCloseTo(vesperMotion.changeFlash!, 5);
    // Her light is not lit by it: the flash is on her, not on what she throws.
    expect(
      place(sheet!, { ...calm, stage: 1, stageMix: 0 }, []).find((each) => each.group === 'light-1')!.flash,
    ).toBe(0);
    // And the first picture, which nothing comes after, has none.
    expect(
      place(sheet!, { ...calm, stage: 0, stageMix: 0 }, []).find((each) => each.group === 'stage-0')!.flash,
    ).toBe(0);
  });

  it('is not drawn at all rather than without a stage', () => {
    const less = pictures();
    less[3] = null;
    expect(stageSheet('vesper', less, { stages: VESPER_STAGES, ...vesperMotion })).toBeNull();
    expect(stageSheet('vesper', [], { stages: VESPER_STAGES, ...vesperMotion })).toBeNull();
    // A stage the layout knows of and no picture came for is not a stage.
    const fewer: Record<number, readonly [Box, Box | null]> = { 0: VESPER_STAGES[0]!, 1: VESPER_STAGES[1]! };
    const sheet = stageSheet('vesper', pictures().slice(0, 2), { stages: fewer, ...vesperMotion })!;
    expect(sheet.layers).toHaveLength(4);
    expect(laid(sheet, frame(5))).toEqual([]);
    // A picture with no light to throw is drawn without one.
    const dim = pictures();
    dim[0] = [{} as CanvasImageSource, null];
    expect(
      stageSheet('vesper', dim, { stages: VESPER_STAGES, ...vesperMotion })!.layers.map(
        (layer: Layer) => layer.id,
      ),
    ).not.toContain('light-0');
  });

  it('lays every picture where the cut said, in figure units about the middle between her eyes', () => {
    const sheet = stageSheet('vesper', pictures(), { stages: VESPER_STAGES, ...vesperMotion })!;
    for (const layer of sheet.layers) {
      if (!layer.id.startsWith('stage-')) continue;
      const stage = Number(layer.id.slice(6));
      expect(layer.shots[0]!.box).toEqual(VESPER_STAGES[stage]![0]);
    }
    // The pictures are of one figure seen six times: they lie about much the same place, and are
    // much the same size — so that she does not jump when the picture changes.
    const widths = Object.values(VESPER_STAGES).map(([box]) => box[2] - box[0]);
    const heights = Object.values(VESPER_STAGES).map(([box]) => box[3] - box[1]);
    expect(Math.max(...widths) / Math.min(...widths)).toBeLessThan(1.35);
    expect(Math.max(...heights) / Math.min(...heights)).toBeLessThan(1.35);
    for (const [box] of Object.values(VESPER_STAGES)) {
      // Her eyes are the origin: the picture runs well above them (the hat) and below (the skirt).
      expect(box[1]).toBeLessThan(-80);
      expect(box[3]).toBeGreaterThan(100);
    }
  });
});

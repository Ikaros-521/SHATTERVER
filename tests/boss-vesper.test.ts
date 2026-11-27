import { describe, expect, it } from 'vitest';
import { VESPER } from '../src/game/vesper';
import { fitScale } from '../src/render/boss/pictures';
import { allShots, place, type Layer, type Sheet } from '../src/render/boss/sheet';
import { restingLook, type BossFrame } from '../src/render/boss/types';
import { VESPER_PICTURES } from '../src/render/boss/vesper/art';
import { VESPER_CORE } from '../src/render/boss/vesper/layout';
import { outline, vesperSheet } from '../src/render/boss/vesper/sheet';
import { fakeCanvas } from './fake-canvas';

/**
 * Vesper as a sheet of layers: her illustration cut into parts, each with its light, each torn off
 * into starlight. What is checked here is the cutting and the ghosting — that the layout agrees
 * with the fight's parts, that a torn-off part stays as a shape and goes under her, that nothing
 * is worn the same way twice by accident, and that none of it is drawn in the air around her.
 */

/** A picture of nothing, for every picture of hers: the sheet only needs something to draw. */
const pictures = (): Record<string, CanvasImageSource> =>
  Object.fromEntries(Object.keys(VESPER_PICTURES).map((name) => [name, {}])) as Record<
    string,
    CanvasImageSource
  >;

const PARTS = VESPER.parts.map((part) => part.id);
const AT_REST = restingLook(PARTS);

function frame(look = AT_REST, time = 1.7): BossFrame {
  return { x: 360, y: 200, time, face: 'idle', look };
}

/** A context that counts what is drawn into it, and remembers where its lines went. */
function counting(): {
  ctx: CanvasRenderingContext2D;
  strokes: () => number;
  fills: () => number;
  lines: () => [number, number][];
  bad: () => string[];
  rects: () => [string, number[]][];
} {
  const { ctx, bad, fills } = fakeCanvas();
  let strokes = 0;
  const lines: [number, number][] = [];
  // What was filled over a rectangle, and in what colour.
  const rects: [string, number[]][] = [];
  const fillRect = ctx.fillRect.bind(ctx);
  ctx.fillRect = (...values: number[]): void => {
    rects.push([String(ctx.fillStyle), values]);
    fillRect(values[0]!, values[1]!, values[2]!, values[3]!);
  };
  ctx.stroke = (): void => {
    strokes++;
  };
  const lineTo = ctx.lineTo.bind(ctx);
  ctx.lineTo = (x: number, y: number): void => {
    lines.push([x, y]);
    lineTo(x, y);
  };
  return { ctx, strokes: () => strokes, fills, lines: () => lines, bad: () => bad, rects: () => rects };
}

describe('薇斯珀 as a sheet', () => {
  it('is cut into a layer a part, back to front, with the light of six of them under them', () => {
    const sheet = vesperSheet(pictures())!;
    expect(sheet.id).toBe('vesper');
    expect(sheet.layers.map((layer) => layer.id)).toEqual([
      'glow-robe',
      'robe',
      'hair.L',
      'hair.R',
      'glow-sleeve.L',
      'sleeve.L',
      'glow-sleeve.R',
      'sleeve.R',
      'head',
      'core',
      'glow-cauldron',
      'cauldron',
      'glow-lantern',
      'lantern',
      'glow-hat',
      'hat',
    ]);
    // Every part the fight knows her by has its layer, and no layer belongs to a part she has not.
    const owners = sheet.layers.map((layer) => layer.part).filter((part) => part !== null);
    expect([...owners].sort()).toEqual([...PARTS].sort());
    // A picture a state — her core is a light, and is one picture three times over — and a light.
    const shots = allShots(sheet);
    expect(shots.filter((shot) => !shot.id.startsWith('glow-'))).toHaveLength(30);
    expect(shots.filter((shot) => shot.id.startsWith('glow-'))).toHaveLength(6);
  });

  it('lays every picture inside the figure the fight hangs her parts on', () => {
    const sheet = vesperSheet(pictures())!;
    for (const layer of sheet.layers) {
      for (const shot of layer.shots) {
        const [x0, y0, x1, y1] = shot.box;
        expect(x1, shot.id).toBeGreaterThan(x0);
        expect(y1, shot.id).toBeGreaterThan(y0);
        // Nothing is off the figure: the widest she gets is a hat's brim and a gown's hem.
        expect(x0, shot.id).toBeGreaterThan(-215);
        expect(x1, shot.id).toBeLessThan(215);
        expect(y0, shot.id).toBeGreaterThan(-175);
        expect(y1, shot.id).toBeLessThan(480);
      }
    }
    // Her star hangs where its layer is anchored, at the cauldron's middle.
    const core = sheet.layers.find((layer) => layer.id === 'core')!;
    expect(core.home).toEqual({ x: VESPER_CORE.at[0], y: VESPER_CORE.at[1] });
    expect(core.shots[0]!.box).toEqual(VESPER_CORE.box);
  });

  it('is torn off into starlight: the shape stays, whole and still, under the rest of her', () => {
    const sheet = vesperSheet(pictures())!;
    for (const part of PARTS) {
      const look = restingLook(PARTS);
      look[part]!.state = 'destroyed';
      look[part]!.dx = 3;
      look[part]!.dy = -2;
      const placed = place(sheet, frame(look), []);
      const ghost = placed[0]!;
      expect(ghost.ghost, part).toBe(1);
      expect(ghost.group, part).toBe(part);
      expect(ghost.shot.id, part).toBe(`${part}.intact`);
      // Where the part was drawn before anything moved it — not where the blow knocked it.
      expect(ghost.x, part).toBe(part === 'core' ? VESPER_CORE.at[0] : 0);
      expect(ghost.y, part).toBe(part === 'core' ? VESPER_CORE.at[1] : 0);
      expect(ghost.rot, part).toBe(0);
      // Everything else of her is still herself, over it.
      expect(placed.slice(1).every((piece) => piece.ghost === 0)).toBe(true);
      expect(placed.slice(1).some((piece) => piece.group === part)).toBe(false);
    }
    // Whole, nothing of her is a ghost.
    expect(place(sheet, frame(), []).every((piece) => piece.ghost === 0)).toBe(true);
  });

  it('lets her light go out with its part, and flicker while it burns', () => {
    const sheet = vesperSheet(pictures())!;
    const lamp = sheet.layers.find((layer) => layer.id === 'glow-lantern')!;
    const here = frame();
    const early = place(sheet, here, []).find((piece) => piece.group === 'glow-lantern')!;
    const later = place(sheet, frame(AT_REST, 2.3), []).find((piece) => piece.group === 'glow-lantern')!;
    expect(early.alpha).toBeGreaterThan(0.3);
    expect(later.alpha).toBeGreaterThan(0.3);
    expect(early.alpha).not.toBe(later.alpha);
    // Angry, she burns higher.
    const angry = frame(AT_REST, 2.3);
    angry.face = 'awakened';
    const lit = place(sheet, angry, []).find((piece) => piece.group === 'glow-lantern')!;
    expect(lit.alpha).toBeCloseTo(later.alpha * 1.35, 5);
    // Torn off, the lamp throws nothing.
    const gone = restingLook(PARTS);
    gone.lantern!.state = 'destroyed';
    expect(lamp.show(frame(gone), gone.lantern!)).toBeNull();
    expect(place(sheet, frame(gone), []).some((piece) => piece.group === 'glow-lantern')).toBe(false);
  });

  it('moves as she does: her lantern swings on its hook, her hat rides behind her head', () => {
    const sheet = vesperSheet(pictures())!;
    const of = (id: string, at: BossFrame, still = false): number =>
      place(sheet, at, [], still).find((piece) => piece.group === id)!.rot;
    const other = frame(AT_REST, 3.1);
    expect(of('lantern', frame())).not.toBe(of('lantern', other));
    expect(of('hat', frame())).not.toBe(of('hat', other));
    // Placed still, as for a picture made of her, nothing is turned.
    expect(of('lantern', other, true)).toBe(0);
    expect(of('hat', other, true)).toBe(0);
    // A knock carries the light of a part with the part.
    const knocked = restingLook(PARTS);
    knocked.lantern!.dx = 2.5;
    const placed = place(sheet, frame(knocked), []);
    const part = placed.find((piece) => piece.group === 'lantern')!;
    const light = placed.find((piece) => piece.group === 'glow-lantern')!;
    expect(light.x! - part.x!).toBeCloseTo(0, 5);
  });

  it('takes a blow as a brightening, not a washing out', () => {
    const sheet = vesperSheet(pictures())!;
    const hurt = restingLook(PARTS);
    hurt.robe!.flash = 1;
    expect(place(sheet, frame(hurt), []).find((piece) => piece.group === 'robe')!.flash).toBeCloseTo(0.35, 5);
    // Her light is not hit at all, and what a torn-off part leaves behind takes no white.
    hurt.lantern!.flash = 1;
    expect(place(sheet, frame(hurt), []).find((piece) => piece.group === 'glow-lantern')!.flash).toBe(0);
    hurt.hat!.flash = 1;
    hurt.hat!.state = 'destroyed';
    expect(place(sheet, frame(hurt), [])[0]!.flash).toBe(0);
    // A layer that says nothing about it takes the white whole, as line art does.
    const bare: Layer = {
      id: 'plate',
      part: 'robe',
      group: 'plate',
      variants: 'whole',
      shots: [{ id: 'plate.whole', variant: 'whole', box: [0, 0, 1, 1], paint: () => {} }],
      show: () => null,
    };
    expect(place({ ...sheet, layers: [bare] }, frame(hurt), [])).toEqual([]);
    bare.show = () => bare.shots[0]!;
    expect(place({ ...sheet, layers: [bare] }, frame(hurt), [])[0]!.flash).toBe(1);
  });

  it('is not drawn at all rather than without an arm', () => {
    const whole = pictures();
    delete whole['hat'];
    expect(vesperSheet(whole)).toBeNull();
    expect(vesperSheet({})).toBeNull();
    // A light that did not come costs her that light and nothing else.
    const dim = pictures();
    delete dim['glow-robe'];
    const sheet: Sheet = vesperSheet(dim)!;
    expect(sheet.layers.map((layer) => layer.id)).not.toContain('glow-robe');
    expect(sheet.layers.map((layer) => layer.id)).toContain('robe');
  });

  it('wears the same cracks every time, and only on herself', () => {
    const sheet = vesperSheet(pictures())!;
    const shot = (id: string) => allShots(sheet).find((each) => each.id === id)!;
    const painted = (
      id: string,
    ): {
      strokes: number;
      fills: number;
      lines: [number, number][];
      bad: string[];
      ops: string[];
      rects: [string, number[]][];
    } => {
      const { ctx, strokes, fills, lines, bad, rects } = counting();
      const ops: string[] = [];
      Object.defineProperty(ctx, 'globalCompositeOperation', {
        get: (): string => ops[ops.length - 1] ?? '',
        set: (value: string) => ops.push(value),
      });
      shot(id).paint(ctx);
      return { strokes: strokes(), fills: fills(), lines: lines(), bad: bad(), ops, rects: rects() };
    };
    // Whole, she is not cracked and not dulled.
    expect(painted('robe.intact').strokes).toBe(0);
    expect(painted('robe.intact').fills).toBe(0);
    expect(painted('robe.intact').rects).toEqual([]);
    // Worn, she is — the same way every time.
    const once = painted('robe.damaged_1');
    const twice = painted('robe.damaged_1');
    expect(once.strokes).toBeGreaterThan(4);
    expect(twice).toEqual(once);
    // Far gone, pieces have left her: holes, and more cracks than before.
    const late = painted('robe.damaged_2');
    expect(late.fills).toBeGreaterThan(0);
    expect(late.strokes).toBeGreaterThan(once.strokes);
    expect(late.bad).toEqual([]);
    // Cracks are laid on what is there and taken out of what is there, and the brush is put back.
    expect(once.ops).toEqual(['source-atop', 'destination-out', 'source-over']);
    expect(late.ops).toEqual(['source-atop', 'destination-out', 'source-over']);
    // She is dulled first, the further gone the darker, over her whole picture.
    const box = shot('robe.intact').box;
    expect(once.rects).toHaveLength(1);
    expect(once.rects[0]![1]).toEqual([box[0], box[1], box[2] - box[0], box[3] - box[1]]);
    expect(late.rects[0]![0]).not.toBe(once.rects[0]![0]);
    // Another part cracks another way.
    expect(painted('lantern.damaged_1').lines).not.toEqual(once.lines);
  });

  it('keeps the cracks off her face, and off her star', () => {
    const sheet = vesperSheet(pictures())!;
    const head = allShots(sheet).find((shot) => shot.id === 'head.damaged_2')!;
    const { ctx, strokes, lines } = counting();
    const ops: string[] = [];
    Object.defineProperty(ctx, 'globalCompositeOperation', {
      get: (): string => ops[ops.length - 1] ?? '',
      set: (value: string) => ops.push(value),
    });
    head.paint(ctx);
    expect(strokes()).toBeGreaterThan(0);
    expect(ops).toEqual(['source-atop', 'destination-out', 'source-over']);
    // Her face, in the figure's frame, less a margin for the length of a crack.
    for (const [x, y] of lines()) {
      const onFace = x > -22 + 2 && x < 36 - 2 && y > -44 + 2 && y < 6 - 2;
      expect(onFace, `a crack's end at ${x.toFixed(1)}, ${y.toFixed(1)}`).toBe(false);
    }
    // Her star is a light: it does not crack, it only goes out.
    const core = allShots(sheet).find((shot) => shot.id === 'core.damaged_2')!;
    const star = counting();
    core.paint(star.ctx);
    expect(star.strokes()).toBe(0);
    expect(star.fills()).toBe(0);
  });

  it('finds the rim of what was drawn, off the canvas, and nothing where there is none to read', () => {
    const box: [number, number, number, number] = [0, 0, 10, 10];
    // Ten pixels to a unit, the box at the canvas's corner. A disc of them, 40 pixels about the
    // middle of it, with air around: its rim is a ring four units out from its middle.
    const disc = (radius: number): CanvasRenderingContext2D => {
      const { ctx } = fakeCanvas();
      return Object.assign(ctx, {
        getTransform: () => ({ a: 10, d: 10, e: 0, f: 0 }),
        getImageData: (left: number, top: number, w: number, h: number) => {
          const data = new Uint8ClampedArray(w * h * 4);
          for (let y = 0; y < h; y++)
            for (let x = 0; x < w; x++)
              if (Math.hypot(left + x - 50, top + y - 50) < radius) data[(y * w + x) * 4 + 3] = 255;
          return { data, width: w, height: h };
        },
      }) as CanvasRenderingContext2D;
    };
    const rim = outline(disc(40), box);
    expect(rim.length).toBeGreaterThan(12);
    for (const [x, y] of rim) {
      // In the figure's frame: the disc's middle is at (5, 5), its rim four units out.
      expect(Math.hypot(x - 5, y - 5)).toBeGreaterThan(3);
      expect(Math.hypot(x - 5, y - 5)).toBeLessThan(5);
    }
    // A canvas that cannot be read, or that will not be, has no rim to offer.
    expect(outline(fakeCanvas().ctx, box)).toEqual([]);
    const blind = Object.assign(fakeCanvas().ctx, {
      getTransform: () => ({ a: 10, d: 10, e: 0, f: 0 }),
      getImageData: (): never => {
        throw new Error('tainted');
      },
    }) as CanvasRenderingContext2D;
    expect(outline(blind, box)).toEqual([]);
  });

  it('fits an atlas at a density worth having', () => {
    const sheet = vesperSheet(pictures())!;
    // Three states of nine parts and six lights, in 2048 square: no denser than 2.4, and not so
    // coarse that she blurs on a phone.
    const density = fitScale(sheet);
    expect(density).toBeLessThanOrEqual(2.4);
    expect(density).toBeGreaterThanOrEqual(1.4);
  });

  it('throws her lamp and her cauldron on the field, and her star once the cauldron is gone', () => {
    const sheet = vesperSheet(pictures())!;
    expect(sheet.lights(frame()).map((light) => light.x)).toEqual([127, -129]);
    const gone = restingLook(PARTS);
    gone.cauldron!.state = 'destroyed';
    const after = sheet.lights(frame(gone));
    expect(after.map((light) => light.x)).toEqual([127, -129]);
    expect(after[1]!.alpha).toBeGreaterThan(0.2);
    gone.core!.state = 'destroyed';
    expect(sheet.lights(frame(gone))).toHaveLength(1);
    gone.lantern!.state = 'destroyed';
    expect(sheet.lights(frame(gone))).toHaveLength(0);
  });
});

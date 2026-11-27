import { describe, expect, it } from 'vitest';
import { faults } from '../src/render/boss/hiyou/draw/brush';
import { AT_REST, PIECES, placeHiyou, type Placed } from '../src/render/boss/hiyou/draw/pieces';
import { ATLAS_SCALE, ATLAS_SIZE, GUTTER, packRows, pieceSizes } from '../src/render/boss/pictures';
import {
  BOSS_PARTS,
  restingLook,
  type BossFrame,
  type FaceId,
  type PartLook,
  type PartState,
} from '../src/render/boss/types';
import { fakeCanvas } from './fake-canvas';

const FACES: FaceId[] = ['idle', 'smug', 'surprised', 'angry', 'hurt', 'awakened', 'defeated'];
const STATES: PartState[] = ['intact', 'damaged_1', 'damaged_2', 'destroyed'];

describe('every piece she is made of', () => {
  it('has bounds that hold something, and draws whole and hurt without a fault', () => {
    const { ctx, bad } = fakeCanvas();
    const before = faults.unread;
    for (const [key, piece] of PIECES) {
      const [x0, y0, x1, y1] = piece.box;
      expect(x1, key).toBeGreaterThan(x0);
      expect(y1, key).toBeGreaterThan(y0);
      piece.paint(ctx, AT_REST);
      piece.paint(ctx, { state: 'damaged_2', flash: 0.7, dx: 0, dy: 0 });
    }
    expect(faults.unread).toBe(before);
    expect(bad).toEqual([]);
  });
});

describe('the atlas her pieces are baked into', () => {
  const sizes = pieceSizes(ATLAS_SCALE);

  it('has a size for every piece', () => {
    expect(sizes.map(([key]) => key).sort()).toEqual([...PIECES.keys()].sort());
  });

  it('holds every piece of her, none over another and none past the edge', () => {
    const slots = packRows(sizes, ATLAS_SIZE);
    expect(slots).not.toBeNull();
    const rects = sizes.map(([key, width, height]) => {
      const [x, y] = slots!.get(key)!;
      return { key, x, y, width, height };
    });
    for (const r of rects) {
      expect(r.x, `${r.key} from the left`).toBeGreaterThanOrEqual(GUTTER);
      expect(r.y, `${r.key} from the top`).toBeGreaterThanOrEqual(GUTTER);
      expect(r.x + r.width + GUTTER, `${r.key} to the right`).toBeLessThanOrEqual(ATLAS_SIZE);
      expect(r.y + r.height + GUTTER, `${r.key} to the bottom`).toBeLessThanOrEqual(ATLAS_SIZE);
    }
    for (const a of rects) {
      for (const b of rects) {
        if (a === b) continue;
        const apart =
          a.x + a.width + GUTTER * 2 <= b.x ||
          b.x + b.width + GUTTER * 2 <= a.x ||
          a.y + a.height + GUTTER * 2 <= b.y ||
          b.y + b.height + GUTTER * 2 <= a.y;
        if (!apart) throw new Error(`${a.key} and ${b.key} share the atlas.`);
      }
    }
  });

  it('refuses what will not fit, rather than lay one picture over another', () => {
    expect(
      packRows(
        [
          ['a', 100, 100],
          ['b', 100, 100],
        ],
        150,
      ),
    ).toBeNull();
    expect(packRows([['a', 200, 20]], 199)).toBeNull();
    expect(packRows([['a', 20, 200]], 199)).toBeNull();
  });

  it('fills a row from the tallest down before it starts another', () => {
    const slots = packRows(
      [
        ['low', 60, 10],
        ['tall', 10, 30],
        ['wide', 30, 10],
      ],
      100,
      1,
    )!;
    expect(slots.get('tall')).toEqual([1, 1]);
    // A pixel of gutter to the left of each, on top of the pixel of the one before.
    expect(slots.get('low')).toEqual([13, 1]);
    // Too wide for what is left of the row: the next one, below the tallest.
    expect(slots.get('wide')).toEqual([1, 33]);
  });
});

describe('where her pieces go', () => {
  const gone: PartLook = { state: 'destroyed', flash: 0, dx: 0, dy: 0 };
  const frameOf = (face: FaceId, time: number, look = restingLook()): BossFrame => ({
    x: 0,
    y: 0,
    time,
    face,
    look,
  });
  const wholeLook = restingLook();
  const whole = placeHiyou(frameOf('idle', 0, wholeLook), []);

  it('places only pieces that exist, back to front', () => {
    for (const placed of whole) expect(PIECES.has(placed.key), placed.key).toBe(true);
    const keys = whole.map((placed) => placed.key);
    const front = [
      'blade.8',
      'spar.R.intact',
      'backHair',
      'hover',
      'torso.intact',
      'arm.R.intact',
      'pauldron.R.intact',
      'face.idle',
      'hairFront',
      'coreGem',
      'shield',
    ].map((key) => keys.indexOf(key));
    expect(front.every((at) => at >= 0)).toBe(true);
    expect([...front].sort((a, b) => a - b)).toEqual(front);
  });

  it('is all of her when nothing is hurt: eighteen blades, and the rest once or twice', () => {
    const count = (pattern: RegExp): number => whole.filter((placed) => pattern.test(placed.key)).length;
    expect(count(/^blade\.\d$/)).toBe(18);
    expect(count(/^spar\./)).toBe(2);
    expect(count(/^torso\./)).toBe(1);
    expect(count(/^arm\./)).toBe(2);
    expect(count(/^pauldron\./)).toBe(2);
    expect(count(/^face\./)).toBe(1);
    expect(
      whole
        .map((placed) => placed.key)
        .filter((key) => /backHair|hover|hairFront|core|shield/.test(key))
        .sort(),
    ).toEqual(['backHair', 'coreArc0', 'coreArc1', 'coreGem', 'hairFront', 'hover', 'shield']);
  });

  it('drops the pieces of a part that is gone, and only those', () => {
    // Where and how every piece was placed, without the look it was placed with: looks are made afresh for each frame.
    const placedOf = (list: Placed[]): Omit<Placed, 'look'>[] => list.map(({ look: _look, ...rest }) => rest);
    for (const id of BOSS_PARTS) {
      const look = restingLook();
      look[id] = gone;
      const placed = placeHiyou(frameOf('idle', 0, look), []);
      expect(
        placed.filter((piece) => piece.look === gone),
        id,
      ).toHaveLength(0);
      // Every other part's pieces are still placed, just where they were.
      expect(placedOf(placed)).toEqual(placedOf(whole.filter((piece) => piece.look !== wholeLook[id])));
    }
  });

  it('tears off the lowest blades as a wing gives way, and only there', () => {
    const torn = (state: PartState): string[] => {
      const look = restingLook();
      look.RightWing = { state, flash: 0, dx: 0, dy: 0 };
      return placeHiyou(frameOf('idle', 0, look), [])
        .filter((placed) => placed.key.endsWith('~'))
        .map((placed) => `${placed.key}${placed.mirror ? ' left' : ' right'}`);
    };
    expect(torn('intact')).toEqual([]);
    expect(torn('damaged_1')).toEqual(['blade.8~ right']);
    // The lowest blade is placed first, as it is drawn first.
    expect(torn('damaged_2')).toEqual(['blade.8~ right', 'blade.7~ right']);
  });

  it('shows every face as its own piece, and no other', () => {
    for (const face of FACES) {
      const shown = placeHiyou(frameOf(face, 0), []).filter((placed) => placed.key.startsWith('face.'));
      expect(shown.map((placed) => placed.key)).toEqual([`face.${face}`]);
    }
  });

  it('gives the left its own pieces where the light would come out wrong, and turns the right blades over', () => {
    const keys = whole.map((placed) => placed.key);
    for (const part of ['arm', 'pauldron', 'spar']) {
      expect(keys).toContain(`${part}.L.intact`);
      expect(keys).toContain(`${part}.R.intact`);
    }
    const blades = whole.filter((placed) => /^blade\.\d/.test(placed.key));
    expect(blades.filter((placed) => placed.mirror)).toHaveLength(9);
    for (const placed of blades) expect(placed.mirror).toBe(placed.x < 0);
    // A blade turned over points the other way, and leans the same way.
    const right = whole.find((placed) => placed.key === 'blade.0' && !placed.mirror)!;
    const left = whole.find((placed) => placed.key === 'blade.0' && placed.mirror)!;
    expect(left.x).toBe(-right.x);
    expect(left.rot).toBe(-right.rot);
  });

  it('says the same thing every time for the same frame, in numbers that are all finite', () => {
    for (const face of FACES) {
      for (const state of STATES) {
        const look = restingLook();
        for (const id of BOSS_PARTS) look[id] = { state, flash: 0.4, dx: 1.5, dy: -2 };
        for (const time of [0, 1.234, 40]) {
          const frame = frameOf(face, time, look);
          const first = placeHiyou(frame, []).map((placed) => ({ ...placed }));
          const again: Placed[] = [];
          expect(placeHiyou(frame, again).map((placed) => ({ ...placed }))).toEqual(first);
          expect(first.length).toBeGreaterThan(0);
          for (const placed of first) {
            for (const value of [placed.x, placed.y, placed.rot, placed.alpha]) {
              expect(Number.isFinite(value), `${placed.key}: ${value}`).toBe(true);
            }
            expect(placed.alpha).toBeGreaterThan(0);
            expect(placed.alpha).toBeLessThanOrEqual(1);
          }
        }
      }
    }
  });
});

import { describe, expect, it } from 'vitest';
import { drawHiyou } from '../src/render/boss/hiyou/draw/figure';
import { HIYOU_SHEET, hiyouFromImages, placeHiyou } from '../src/render/boss/hiyou/draw/pieces';
import { ATLAS_SCALE, ATLAS_SIZE, fitScale, packRows, shotSizes } from '../src/render/boss/pictures';
import {
  about,
  allShots,
  imageSlots,
  place,
  sheetFromImages,
  sizeOf,
  whole,
  type Box,
  type ImageSlot,
  type Layer,
  type Sheet,
  type Shot,
} from '../src/render/boss/sheet';
import { BOSS_PARTS, restingLook, type BossFrame, type FaceId } from '../src/render/boss/types';
import { fakeCanvas } from './fake-canvas';

const FACES: FaceId[] = ['idle', 'smug', 'surprised', 'angry', 'hurt', 'awakened', 'defeated'];

const shot = (id: string, box: Box, variant = 'whole'): Shot => ({ id, variant, box, paint: () => {} });
const sheetOf = (layers: Layer[], faces: FaceId[] = ['idle']): Sheet => ({
  id: 'toy',
  faces,
  layers,
  bob: () => 0,
  lights: () => [],
});
const wholeLayer = (
  id: string,
  part: Layer['part'],
  group: string,
  shots: Shot[],
  more: Partial<Layer> = {},
): Layer => ({
  id,
  part,
  group,
  variants: 'whole',
  shots,
  show: whole(shots),
  ...more,
});
const frameWith = (look = restingLook(), face: FaceId = 'idle', time = 0): BossFrame => ({
  x: 0,
  y: 0,
  time,
  face,
  look,
});
const GONE = { state: 'destroyed', flash: 0, dx: 0, dy: 0 } as const;
const near = (values: number[]): number[] => values.map((value) => Math.round(value * 1e6) / 1e6);

/** Where a point of a placed picture lies in the figure, in figure units. */
const where = (
  placed: { x: number; y: number; rot: number; mirror: boolean },
  x: number,
  y: number,
): number[] => {
  const c = Math.cos(placed.rot);
  const s = Math.sin(placed.rot);
  const turned = placed.mirror ? -x : x;
  return [placed.x + c * turned - s * y, placed.y + s * turned + c * y];
};

describe('a sheet of layers', () => {
  const a = shot('a', [0, 0, 1, 1]);
  const b = shot('b', [0, 0, 1, 1]);
  const sheet = sheetOf([
    wholeLayer('A', 'Body', 'body', [a], {
      home: { x: 3, y: -2, rot: 0.5, mirror: true },
      move: (frame) => ({ x: 10 * frame.time, alpha: 0.5 }),
    }),
    wholeLayer('B', null, 'free', [b]),
  ]);

  it('places each layer anchored, moved, and knocked with its part', () => {
    const look = restingLook();
    look.Body = { state: 'damaged_1', flash: 0.25, dx: 1.5, dy: -4 };
    const [first, second] = place(sheet, frameWith(look, 'idle', 2), []);
    expect(first).toMatchObject({
      shot: a,
      group: 'body',
      x: 3 + 20 + 1.5,
      y: -2 - 4,
      rot: 0.5,
      mirror: true,
      alpha: 0.5,
      look: look.Body,
    });
    expect(second).toMatchObject({ shot: b, group: 'free', x: 0, y: 0, rot: 0, mirror: false, alpha: 1 });
  });

  it('placed still, is anchored and knocked, and nothing more', () => {
    const look = restingLook();
    look.Body = { state: 'intact', flash: 0, dx: 1.5, dy: -4 };
    const [still] = place(sheet, frameWith(look, 'idle', 2), [], true);
    expect(still).toMatchObject({ x: 4.5, y: -6, rot: 0.5, mirror: true, alpha: 1 });
  });

  it('drops a layer whose part is destroyed, or that has nothing to show', () => {
    const look = restingLook();
    look.Body = { ...GONE };
    expect(place(sheet, frameWith(look), []).map((placed) => placed.shot.id)).toEqual(['b']);
    const silent = sheetOf([wholeLayer('S', null, 's', [a], { show: () => null })]);
    expect(place(silent, frameWith(), [])).toEqual([]);
  });

  it('turns about a point other than its origin, and that point stays where it is', () => {
    const pose = about(10, 0, Math.PI / 2);
    expect(near([pose.x!, pose.y!, pose.rot!])).toEqual(near([10, -10, Math.PI / 2]));
    const turning = sheetOf([
      wholeLayer('T', null, 't', [a], {
        move: () => about(10, 0, Math.PI / 2),
      }),
    ]);
    const [placed] = place(turning, frameWith(), []);
    // The layer's point (10, 0) is carried to its origin and round a quarter turn: still (10, 0).
    const c = Math.cos(placed.rot);
    const s = Math.sin(placed.rot);
    expect(near([placed.x + c * 10 - s * 0, placed.y + s * 10 + c * 0])).toEqual([10, 0]);
  });

  it('counts a picture that lies in two layers once, and refuses two pictures of one name', () => {
    const shared = shot('s', [0, 0, 1, 1]);
    const both = sheetOf([wholeLayer('L', null, 'l', [shared]), wholeLayer('R', null, 'r', [shared])]);
    expect(allShots(both).map((each) => each.id)).toEqual(['s']);
    const twin = shot('s', [0, 0, 2, 2]);
    expect(() =>
      allShots(sheetOf([wholeLayer('L', null, 'l', [shared]), wholeLayer('R', null, 'r', [twin])])),
    ).toThrow(/named "s"/);
  });
});

describe('the brief for a set of images', () => {
  it('gives a group one box that holds every picture of it where it is anchored, turned as it is anchored', () => {
    const upright = shot('u', [0, 0, 10, 2]);
    const aside = shot('m', [0, 0, 4, 4]);
    const sheet = sheetOf([
      wholeLayer('u', 'Body', 'g', [upright], {
        variants: 'state',
        home: { rot: Math.PI / 2 },
        move: () => ({ x: 100 }),
      }),
      wholeLayer('m', 'Body', 'g', [aside], { variants: 'state', home: { x: 5, y: 5, mirror: true } }),
    ]);
    const slots = imageSlots(sheet);
    expect(slots.map((slot) => [slot.name, slot.by, slot.part])).toEqual([
      ['g.intact', 'state', 'Body'],
      ['g.damaged_1', 'state', 'Body'],
      ['g.damaged_2', 'state', 'Body'],
    ]);
    // Turned a quarter turn the first lies 2 wide and 10 tall; the other, flipped, from x 1 to 5.
    for (const slot of slots) expect(near([...slot.box])).toEqual([-2, 0, 5, 10]);
  });

  it('names a face group by its expressions, and anything else but once', () => {
    const slots = imageSlots(
      sheetOf(
        [
          wholeLayer(
            'f',
            'Head',
            'face',
            FACES.map((face) => shot(`f.${face}`, [0, 0, 1, 1], face)),
            {
              variants: 'face',
            },
          ),
          wholeLayer('h', null, 'hover', [shot('h', [0, 0, 1, 1])]),
        ],
        FACES,
      ),
    );
    expect(slots.map((slot) => slot.name)).toEqual([...FACES.map((face) => `face.${face}`), 'hover.whole']);
  });

  it('has one picture made for a group and the one that shares it, the other way about', () => {
    const sheet = sheetOf([
      wholeLayer('r', 'RightWing', 'wing.R', [shot('w', [20, -10, 40, 10], 'intact')], {
        variants: 'state',
      }),
      wholeLayer('r1', 'RightWing', 'wing.R', [shot('w1', [20, -10, 40, 10], 'damaged_1')], {
        variants: 'state',
      }),
      wholeLayer('l', 'LeftWing', 'wing.L', [shot('l', [-40, -10, -20, 10], 'intact')], {
        variants: 'state',
        shares: 'wing.R',
      }),
      wholeLayer('l1', 'LeftWing', 'wing.L', [shot('l1', [-40, -10, -20, 10], 'damaged_1')], {
        variants: 'state',
        shares: 'wing.R',
      }),
    ]);
    const slots = imageSlots(sheet);
    // A group comes in every state, whether a layer for each was spelled out or not.
    const states = ['intact', 'damaged_1', 'damaged_2'];
    expect(slots.map((slot) => [slot.name, slot.shared ?? null])).toEqual([
      ...states.map((state) => [`wing.R.${state}`, null] as const),
      ...states.map((state) => [`wing.L.${state}`, 'wing.R'] as const),
    ]);
    // The image is asked for once, by the group that has it.
    const asked: string[] = [];
    const made = sheetFromImages(
      'toy',
      slots,
      (name) => {
        asked.push(name);
        return {} as CanvasImageSource;
      },
      { bob: () => 0, lights: () => [] },
    );
    expect(asked).toEqual([
      ...states.map((state) => `wing.R.${state}`),
      ...states.map((state) => `wing.R.${state}`),
    ]);
    // …and drawn over the left box the other way about: its right edge along the box's left.
    const calls: [string, ...number[]][] = [];
    const ctx = {
      save: () => {},
      restore: () => {},
      translate: (x: number) => calls.push(['translate', x]),
      scale: (x: number) => calls.push(['scale', x]),
      drawImage: (_image: unknown, ...args: number[]) => calls.push(['draw', ...args]),
    } as unknown as CanvasRenderingContext2D;
    made.layers.find((layer) => layer.id === 'wing.L')!.shots[0]!.paint(ctx);
    // …and drawn over the left box the other way about: the picture's left edge along the box's
    // right edge (-20), so that its 20 wide lie back from there to -40.
    expect(calls).toEqual([
      ['translate', -20],
      ['scale', -1],
      ['draw', 0, -10, 20, 20],
    ]);
  });

  it('refuses to stretch a shared picture over a box that is not the other one’s reflection', () => {
    const sheet = sheetOf([
      wholeLayer('r', 'RightWing', 'wing.R', [shot('w', [20, -10, 40, 10])], { variants: 'state' }),
      wholeLayer('l', 'LeftWing', 'wing.L', [shot('l', [-40, -12, -20, 10])], {
        variants: 'state',
        shares: 'wing.R',
      }),
    ]);
    expect(() => imageSlots(sheet)).toThrow(/not each other's reflection/);
    const round = sheetOf([
      wholeLayer('a', null, 'a', [shot('a', [-1, 0, 1, 1])], { shares: 'b' }),
      wholeLayer('b', null, 'b', [shot('b', [-1, 0, 1, 1])], { shares: 'a' }),
    ]);
    expect(() => imageSlots(round)).toThrow(/share each other's images/);
  });

  it('refuses a group whose layers disagree about their part or their variants', () => {
    const sheet = sheetOf([
      wholeLayer('x', 'Head', 'g', [shot('x', [0, 0, 1, 1])]),
      wholeLayer('y', 'Body', 'g', [shot('y', [0, 0, 1, 1])]),
    ]);
    expect(() => imageSlots(sheet)).toThrow(/disagree/);
  });
});

describe('a sheet made of images', () => {
  const slots: ImageSlot[] = [
    {
      name: 'wing.L.intact',
      group: 'wing.L',
      variant: 'intact',
      by: 'state',
      part: 'LeftWing',
      box: [-10, -5, 0, 5],
    },
    {
      name: 'wing.L.damaged_1',
      group: 'wing.L',
      variant: 'damaged_1',
      by: 'state',
      part: 'LeftWing',
      box: [-10, -5, 0, 5],
    },
    { name: 'face.idle', group: 'face', variant: 'idle', by: 'face', part: 'Head', box: [-2, -2, 2, 2] },
    { name: 'face.smug', group: 'face', variant: 'smug', by: 'face', part: 'Head', box: [-2, -2, 2, 2] },
    { name: 'core.whole', group: 'core', variant: 'whole', by: 'whole', part: 'Core', box: [-1, -1, 1, 1] },
  ];
  // No image for the wing's damaged state: the wing is left out whole.
  const images: Record<string, CanvasImageSource> = {
    'wing.L.intact': {} as CanvasImageSource,
    'face.idle': {} as CanvasImageSource,
    'face.smug': {} as CanvasImageSource,
    'core.whole': {} as CanvasImageSource,
  };
  const sheet = sheetFromImages('toy', slots, (name) => images[name], {
    bob: () => 0,
    lights: () => [],
    home: (group) => (group === 'core' ? { y: 9 } : undefined),
    move: (group) => (group === 'face' ? () => ({ rot: 0.3 }) : undefined),
  });

  it('is a layer for every group that has all its images, and not one for a group that lacks any', () => {
    expect(
      sheet.layers.map((layer) => [layer.id, layer.part, layer.variants, layer.shots.map((each) => each.id)]),
    ).toEqual([
      ['face', 'Head', 'face', ['face.idle', 'face.smug']],
      ['core', 'Core', 'whole', ['core.whole']],
    ]);
    expect(sheet.faces).toEqual(['idle', 'smug']);
  });

  it('stretches each image over its slot', () => {
    const calls: unknown[][] = [];
    const ctx = {
      drawImage: (...args: unknown[]) => calls.push(args),
    } as unknown as CanvasRenderingContext2D;
    sheet.layers[1]!.shots[0]!.paint(ctx);
    expect(calls).toEqual([[images['core.whole'], -1, -1, 2, 2]]);
  });

  it('shows the image of the part’s state, or of her expression', () => {
    const look = restingLook();
    look.Core = { state: 'damaged_2', flash: 0, dx: 0, dy: 0 };
    const shown = place(sheet, frameWith(look, 'smug'), []);
    expect(shown.map((placed) => placed.shot.id)).toEqual(['face.smug', 'core.whole']);
    // Moved as it is told: the face leans. A sheet made of images is not told where a group is
    // anchored — its boxes say where everything lies — so the core sits where its box has it.
    expect(shown[0]).toMatchObject({ x: 0, y: 0, rot: 0.3, mirror: false });
    expect(shown[1]).toMatchObject({ x: 0, y: 0, rot: 0, mirror: false });
    const [x0, y0, x1, y1] = shown[1]!.shot.box;
    expect(near(where(shown[1]!, (x0 + x1) / 2, (y0 + y1) / 2))).toEqual([0, 0]);
  });
});

describe('the brief for images of 绯樱', () => {
  const slots = imageSlots(HIYOU_SHEET);

  /** Her, whole but for one variant of one slot, placed where she is anchored. */
  const anchored = (slot: ImageSlot, out = [] as ReturnType<typeof place>) => {
    const look = restingLook();
    if (slot.part && slot.by === 'state') {
      look[slot.part] = { ...look[slot.part], state: slot.variant as (typeof look.Body)['state'] };
    }
    const frame = frameWith(look, slot.by === 'face' ? (slot.variant as FaceId) : 'idle');
    return place(HIYOU_SHEET, frame, out, true).filter((placed) => placed.group === slot.group);
  };

  it('is thirty-three images: wings, arms and pauldrons in three states each side, her face seven ways', () => {
    expect(slots).toHaveLength(33);
    const count = (by: string): number => slots.filter((slot) => slot.by === by).length;
    expect(count('state')).toBe(21);
    expect(count('face')).toBe(7);
    expect(count('whole')).toBe(5);
    // A group's states come together, in order: the easiest thing to hand to whoever draws them.
    const states = ['intact', 'damaged_1', 'damaged_2'];
    const of = (group: string, variants: readonly string[]): string[] =>
      variants.map((variant) => `${group}.${variant}`);
    expect(slots.map((slot) => slot.name)).toEqual([
      ...of('wing.L', states),
      ...of('wing.R', states),
      'hairBack.whole',
      'hover.whole',
      ...of('torso', states),
      ...of('arm.L', states),
      ...of('pauldron.L', states),
      ...of('arm.R', states),
      ...of('pauldron.R', states),
      ...of('face', FACES),
      'hairFront.whole',
      'core.whole',
      'shield.whole',
    ]);
  });

  it('gives every image a box that holds all of its group, whichever way it is drawn', () => {
    for (const slot of slots) {
      const mine = anchored(slot);
      expect(mine.length, slot.name).toBeGreaterThan(0);
      for (const placed of mine) {
        const cos = Math.cos(placed.rot);
        const sin = Math.sin(placed.rot);
        const [x0, y0, x1, y1] = placed.shot.box;
        for (const [x, y] of [
          [x0, y0],
          [x1, y0],
          [x0, y1],
          [x1, y1],
        ] as const) {
          const turned = placed.mirror ? -x : x;
          const wx = placed.x + cos * turned - sin * y;
          const wy = placed.y + sin * turned + cos * y;
          expect(wx, `${slot.name}: x of ${placed.shot.id}`).toBeGreaterThanOrEqual(slot.box[0] - 1e-6);
          expect(wx, `${slot.name}: x of ${placed.shot.id}`).toBeLessThanOrEqual(slot.box[2] + 1e-6);
          expect(wy, `${slot.name}: y of ${placed.shot.id}`).toBeGreaterThanOrEqual(slot.box[1] - 1e-6);
          expect(wy, `${slot.name}: y of ${placed.shot.id}`).toBeLessThanOrEqual(slot.box[3] + 1e-6);
        }
      }
    }
  });

  it('is the same on her left as on her right, the other way about', () => {
    for (const slot of slots) {
      const tag = slot.group.slice(-2);
      if (tag !== '.L') continue;
      const other = slots.find(
        (each) => each.group === `${slot.group.slice(0, -2)}.R` && each.variant === slot.variant,
      );
      expect(other, slot.name).toBeDefined();
      expect(near([...other!.box])).toEqual(near([-slot.box[2], slot.box[1], -slot.box[0], slot.box[3]]));
    }
  });

  it('tells how large each image is to be drawn', () => {
    const [w, h] = sizeOf(slots[0]!.box);
    expect([Math.ceil(w * ATLAS_SCALE), Math.ceil(h * ATLAS_SCALE)]).toEqual([735, 538]);
    expect(sizeOf(slots.find((slot) => slot.name === 'core.whole')!.box)).toEqual([38, 38]);
  });
});

describe('绯樱 from a set of images', () => {
  const slots = imageSlots(HIYOU_SHEET);
  const images: Record<string, CanvasImageSource> = Object.fromEntries(
    slots.map((slot) => [slot.name, {} as CanvasImageSource]),
  );
  const sheet = hiyouFromImages((name) => images[name]);

  it('is thirteen layers — one a group — with a picture for every image', () => {
    expect(sheet.layers).toHaveLength(13);
    expect(sheet.faces).toEqual(FACES);
    expect(allShotsFor(sheet).map((each) => each.id)).toEqual(slots.map((slot) => slot.name));
  });

  it('moves each group as it moves drawn with Canvas 2D, where the cut makes no difference', () => {
    const faces: FaceId[] = ['idle', 'angry', 'defeated'];
    for (const face of faces) {
      for (const state of ['intact', 'damaged_1', 'damaged_2'] as const) {
        const look = restingLook();
        for (const id of BOSS_PARTS) look[id] = { ...look[id], state };
        const frame = frameWith(look, face, 1.25);
        const drawn = placeHiyou(frame, []);
        const fromImages = place(sheet, frame, []);
        // A wing is nine blades and a spar drawn, and one picture made of images; the core three and one.
        // A wing is nine blades and a spar drawn, and one picture made of images; the core three and one.
        for (const group of ['wing.L', 'wing.R', 'core']) {
          expect(drawn.filter((placed) => placed.group === group).length, group).toBeGreaterThan(1);
          expect(
            fromImages.filter((placed) => placed.group === group),
            group,
          ).toHaveLength(1);
        }
        // Where the middle of every other part of her lies in the figure, this frame. The two sheets
        // tell it from different origins — a picture made for her lies where its group is anchored,
        // box and all — so it is the point that is compared, not how each got there.
        for (const group of [
          'hairBack',
          'hover',
          'torso',
          'arm.L',
          'pauldron.L',
          'arm.R',
          'pauldron.R',
          'face',
          'hairFront',
          'shield',
        ]) {
          const one = fromImages.find((placed) => placed.group === group);
          expect(one, group).toBeDefined();
          expect(one!.shot.id, group).toBe(
            slots.find((slot) => slot.group === group && slot.variant === one!.shot.variant)!.name,
          );
          const [bx0, by0, bx1, by1] = one!.shot.box;
          const middle = near(where(one!, (bx0 + bx1) / 2, (by0 + by1) / 2));
          for (const placed of drawn.filter((each) => each.group === group)) {
            const [x0, y0, x1, y1] = placed.shot.box;
            expect(
              [...near(where(placed, (x0 + x1) / 2, (y0 + y1) / 2)), placed.mirror, placed.alpha],
              `${group} ${placed.shot.id}`,
            ).toEqual([...middle, one!.mirror, one!.alpha]);
          }
        }
      }
    }
  });

  it('shows the image of the state and the expression asked for', () => {
    const look = restingLook();
    look.RightWing = { ...look.RightWing, state: 'damaged_2' };
    look.LeftArm = { ...look.LeftArm, state: 'damaged_1' };
    look.CoreShield = { ...GONE };
    const shown = place(sheet, frameWith(look, 'smug', 0), []).map((placed) => placed.shot.id);
    expect(shown).toContain('wing.R.damaged_2');
    expect(shown).toContain('wing.L.intact');
    expect(shown).toContain('arm.L.damaged_1');
    expect(shown).toContain('face.smug');
    expect(shown.filter((id) => id.startsWith('shield.'))).toEqual([]);
  });

  it('leaves a group out altogether when one of its images is missing — and the group that shares it', () => {
    const hole = hiyouFromImages((name) => (name === 'pauldron.R.damaged_1' ? undefined : images[name]));
    // The left pauldron is drawn from the right's picture: with one of them gone, neither can be.
    expect(hole.layers.map((layer) => layer.id)).not.toContain('pauldron.R');
    expect(hole.layers.map((layer) => layer.id)).not.toContain('pauldron.L');
    expect(hole.layers).toHaveLength(11);
  });

  it('is baked less dense than the sheet drawn with Canvas 2D, and fits at that density', () => {
    expect(fitScale(HIYOU_SHEET)).toBe(ATLAS_SCALE);
    const fit = fitScale(sheet);
    expect(fit).toBeLessThan(ATLAS_SCALE);
    expect(fit).toBeGreaterThan(1);
    expect(packRows(shotSizes(sheet, fit), ATLAS_SIZE)).not.toBeNull();
  });

  it('draws without a fault, whatever her face and her state', () => {
    const { ctx, bad } = fakeCanvas();
    for (const face of FACES) {
      for (const state of ['intact', 'damaged_1', 'damaged_2', 'destroyed'] as const) {
        const look = restingLook();
        for (const id of BOSS_PARTS) look[id] = { ...look[id], state, flash: 0.5 };
        drawHiyou(ctx, frameWith(look, face, 3));
      }
    }
    expect(bad).toEqual([]);
  });
});

/** Every picture of a sheet, once. */
function allShotsFor(sheet: Sheet): Shot[] {
  return allShots(sheet);
}

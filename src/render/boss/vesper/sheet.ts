import { RNG } from '../../../core/rng';
import {
  about,
  byState,
  DRAWN,
  sizeOf,
  type Box,
  type Layer,
  type Pose,
  type Sheet,
  type SheetLight,
  type Shot,
} from '../sheet';
import type { BossFrame, BossPartId, FaceId } from '../types';
import type { VesperImages } from './art';
import { VESPER_CORE, VESPER_GLOWS, VESPER_LAYERS } from './layout';

/**
 * Vesper as a sheet of layers: her illustration cut into the parts she is fought as, each one a
 * picture that moves its own way — the hat lifts a beat behind her, the hair drifts, the lantern
 * swings on its hook, the cauldron floats free — and each with the light it throws drawn under it.
 *
 * Her states are not pictures of their own. The damage is drawn when the atlas is baked: cracks of
 * starlight, and at the last holes, laid only on what is already there, the same every time. A part
 * torn off leaves its shape behind as starlight (`ghost`): she comes apart the way a constellation
 * would, and nothing of it reads as a person being hurt.
 *
 * The layout is measured off the illustration itself (`layout.ts`): nothing here is placed by eye.
 */

/** Her parts back to front, which is the order her pictures are layered in. */
const BACK_TO_FRONT: readonly BossPartId[] = [
  'robe',
  'hair.L',
  'hair.R',
  'sleeve.L',
  'sleeve.R',
  'head',
  'core',
  'cauldron',
  'lantern',
  'hat',
];

/** The parts that carry cracks: her face and her core are lights, and do not crack. */
const CRACKED: ReadonlySet<BossPartId> = new Set<BossPartId>([
  'hat',
  'hair.L',
  'hair.R',
  'sleeve.L',
  'sleeve.R',
  'robe',
  'cauldron',
  'lantern',
  'head',
]);

/** Her face, in the figure's frame: no crack is laid across it. */
const FACE: Box = [-22, -44, 36, 6];

/** The key a part's picture is filed under in the layout: a dot would not do in a name. */
const filed = (part: string): string => part.replace('.', '_');

const boxOf = (part: string): Box => (part === 'core' ? VESPER_CORE.box : VESPER_LAYERS[filed(part)]!);
/** Where a part's frame is anchored when nothing moves: her star hangs where her cauldron's middle is. */
const homeOf = (part: string): Partial<Pose> | undefined =>
  part === 'core' ? { x: VESPER_CORE.at[0], y: VESPER_CORE.at[1] } : undefined;
const glowOf = (part: string): Box | undefined => VESPER_GLOWS[filed(part)];

/** A pose with a little more to its height. */
const lifted = (pose: Partial<Pose>, dy: number): Partial<Pose> => ({ ...pose, y: (pose.y ?? 0) + dy });

/** How a part of hers hangs when she leans: it turns a little about a point of its own. */
const sway =
  (
    px: number,
    py: number,
    rate: number,
    phase: number,
    amount: number,
  ): ((frame: BossFrame) => Partial<Pose>) =>
  (frame) =>
    about(px, py, Math.sin(frame.time * rate + phase) * amount);

/** How each of her moves. Nothing here is larger than a few figure units: she hangs in the air, she does not dance. */
const MOTION: Readonly<Record<BossPartId, (frame: BossFrame) => Partial<Pose>>> = {
  // The gown breathes with her.
  robe: (frame) => lifted(about(0, 0, Math.sin(frame.time * 0.45) * 0.003), Math.sin(frame.time * 1.3) * 0.8),
  // Her hair drifts out behind her, a side at its own pace.
  'hair.L': sway(-14, -22, 0.7, 1.0, 0.018),
  'hair.R': sway(16, -20, 0.6, 2.2, 0.016),
  'sleeve.L': sway(-24, 14, 0.8, 0.4, 0.012),
  'sleeve.R': sway(38, 12, 0.75, 1.9, 0.012),
  head: sway(0, 0, 0.9, 0.3, 0.012),
  // The hat rides a beat behind her head, and bobs.
  hat: (frame) =>
    lifted(about(-2, -95, Math.sin(frame.time * 0.9 + 0.6) * 0.02), Math.sin(frame.time * 1.7 + 0.5) * 1.2),
  // The cauldron floats on its own, and turns; the star it held turns where it hangs.
  cauldron: (frame) =>
    lifted(
      {
        ...about(-129, 40, Math.sin(frame.time * 0.9 + 0.8) * 0.03),
        x: Math.sin(frame.time * 0.5 + 0.2) * 2,
      },
      Math.sin(frame.time * 1.1 + 1.3) * 5,
    ),
  core: (frame) => ({ rot: frame.time * 0.8, alpha: 0.85 + 0.15 * Math.sin(frame.time * 5) }),
  // The lantern swings on its hook.
  lantern: sway(147, -4, 1.3, 0.4, 0.05),
};

/** How far a part has been knocked by the last blow: its light is knocked with it. */
const knocked = (frame: BossFrame, part: BossPartId): { x: number; y: number } => {
  const look = frame.look[part];
  return { x: look?.dx ?? 0, y: look?.dy ?? 0 };
};

/** How bright her light burns: it flickers, and burns higher when she is angry or awakened. */
const flicker = (frame: BossFrame, rate: number): number => {
  const t = frame.time;
  const temper = frame.face === 'awakened' ? 1.35 : frame.face === 'angry' ? 1.15 : 1;
  return (0.8 + 0.2 * Math.sin(t * rate) * (0.6 + 0.4 * Math.sin(t * rate * 0.37 + 1))) * temper;
};

/** The light of her lamp and her cauldron on the field about her, in the figure's frame. */
const lights = (frame: BossFrame): readonly SheetLight[] => {
  const out: SheetLight[] = [];
  if (frame.look.lantern?.state !== 'destroyed')
    out.push({ x: 127, y: 42, reach: 96, color: 0xffb347, alpha: 0.2 * flicker(frame, 6.1), sharp: 0.3 });
  if (frame.look.cauldron?.state !== 'destroyed')
    out.push({ x: -129, y: 40, reach: 84, color: 0xff9a3c, alpha: 0.17 * flicker(frame, 3.3), sharp: 0.3 });
  else if (frame.look.core?.state !== 'destroyed')
    out.push({ x: -129, y: 46, reach: 70, color: 0xffd27a, alpha: 0.26 * flicker(frame, 8), sharp: 0.35 });
  return out;
};

/** A name to a seed: the same part cracks the same way every time, on every machine. */
const seedOf = (name: string): number => {
  let seed = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) seed = Math.imul(seed ^ name.charCodeAt(i), 0x01000193);
  return seed >>> 0;
};

/** How a worn part is dulled: the colour laid over it, further gone the second time. */
const DULL: readonly [string, string] = ['rgba(104,92,96,0.17)', 'rgba(66,54,60,0.32)'];

/** Whether a point of the figure lies on her face, a little way out from it. */
const onFace = (part: BossPartId, x: number, y: number): boolean =>
  part === 'head' && x > FACE[0] - 1.5 && x < FACE[2] + 1.5 && y > FACE[1] - 1.5 && y < FACE[3] + 1.5;

/**
 * Where the outline of what has just been drawn runs, in the figure's frame: a sample of the points
 * on its rim. Read back off the canvas, so that it is the rim of whatever was drawn; an empty list
 * where the canvas cannot be read.
 */
export function outline(ctx: CanvasRenderingContext2D, box: Box): [number, number][] {
  if (typeof ctx.getImageData !== 'function' || typeof ctx.getTransform !== 'function') return [];
  const [x0, y0, x1, y1] = box;
  const t = ctx.getTransform();
  if (!(t.a > 0) || !(t.d > 0)) return [];
  const w = Math.ceil(t.a * (x1 - x0));
  const h = Math.ceil(t.d * (y1 - y0));
  if (w < 8 || h < 8 || w * h > 4_000_000) return [];
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(t.a * x0 + t.e, t.d * y0 + t.f, w, h).data;
  } catch {
    return [];
  }
  const rim: [number, number][] = [];
  // A step sized to the picture, so that a long rim is sampled and a short one is not stepped over.
  const stride = Math.max(1, Math.round(Math.sqrt((w * h) / 2600)));
  const alpha = (px: number, py: number): number => data[(py * w + px) * 4 + 3]!;
  for (let py = stride; py < h - stride; py += stride) {
    for (let px = stride; px < w - stride; px += stride) {
      if (alpha(px, py) < 200) continue;
      const bare = (qx: number, qy: number): boolean => alpha(qx, qy) < 60;
      if (bare(px, py - stride) || bare(px, py + stride) || bare(px - stride, py) || bare(px + stride, py)) {
        rim.push([(px + 0.5 - t.e) / t.a, (py + 0.5 - t.f) / t.d]);
      }
    }
  }
  return rim;
}

/**
 * Lays the wear of a state on what is already drawn, so that it reads from across the field before
 * any crack is made out: the part is dulled, cracks of starlight run in from its rim, and pieces
 * are gone from it — notches out of the outline, and at the last holes within. None of it lands in
 * the air around her, and none of it on her face.
 */
function wear(ctx: CanvasRenderingContext2D, box: Box, part: BossPartId, stage: 1 | 2): void {
  const [x0, y0] = box;
  const [w, h] = sizeOf(box);
  const rng = new RNG(seedOf(part));
  const rim = outline(ctx, box).filter(([x, y]) => !onFace(part, x, y));
  const within = (): [number, number] => [x0 + rng.range(0.08, 0.92) * w, y0 + rng.range(0.08, 0.92) * h];

  // Dulled. Her face is what she is, not what she wears: it is left as it was.
  ctx.globalCompositeOperation = 'source-atop';
  if (part === 'head') {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0, w, h);
    ctx.rect(FACE[0], FACE[1], FACE[2] - FACE[0], FACE[3] - FACE[1]);
    ctx.clip('evenodd');
  }
  ctx.fillStyle = DULL[stage - 1]!;
  ctx.fillRect(x0, y0, w, h);
  if (part === 'head') ctx.restore();

  // Cracks, from her rim inwards where there is a rim to start them.
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const cracks = (Math.round((w * h) / 6000) + 2) * stage;
  for (let i = 0; i < cracks; i++) {
    const start = rim.length > 0 ? rim[rng.int(0, rim.length - 1)]! : within();
    let x = start[0];
    let y = start[1];
    // Inwards, at a point off the middle of her: a crack runs in, it does not wander at random.
    let heading = Math.atan2(y0 + h / 2 - y, x0 + w / 2 - x) + rng.range(-0.8, 0.8);
    const steps = rng.int(3, 7);
    let drawn = 0;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let step = 0; step < steps; step++) {
      heading += rng.range(-0.8, 0.8);
      const nx = x + Math.cos(heading) * rng.range(1.4, 3.4);
      const ny = y + Math.sin(heading) * rng.range(1.4, 3.4);
      if (onFace(part, nx, ny)) break;
      x = nx;
      y = ny;
      ctx.lineTo(x, y);
      drawn++;
    }
    if (drawn === 0) continue;
    // A dark seam, and the light showing through it.
    ctx.strokeStyle = 'rgba(8,6,16,0.85)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,176,70,0.95)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }

  // Pieces gone. Far gone, more of them and bigger, and some from within her.
  ctx.globalCompositeOperation = 'destination-out';
  const bites = Math.min(stage === 2 ? 34 : 14, Math.round(rim.length / (stage === 2 ? 6 : 14)) + 2 * stage);
  for (let i = 0; i < bites; i++) {
    const offRim = rim.length > 0 && (stage === 1 || rng.chance(0.7));
    const at = offRim ? rim[rng.int(0, rim.length - 1)]! : within();
    if (onFace(part, at[0], at[1])) continue;
    const reach = rng.range(1.1, 2) * (stage === 2 ? 1.6 : 1);
    const turn = rng.range(0, Math.PI * 2);
    ctx.beginPath();
    for (let corner = 0; corner < 5; corner++) {
      const angle = turn + (corner / 5) * Math.PI * 2;
      const r = reach * rng.range(0.6, 1.2);
      if (corner === 0) ctx.moveTo(at[0] + Math.cos(angle) * r, at[1] + Math.sin(angle) * r);
      else ctx.lineTo(at[0] + Math.cos(angle) * r, at[1] + Math.sin(angle) * r);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}

/** One state of a part: her picture, worn as the state says. */
function shotOf(part: BossPartId, variant: string, image: CanvasImageSource): Shot {
  const box = boxOf(part);
  const [x0, y0] = box;
  const [w, h] = sizeOf(box);
  const stage = variant === 'damaged_2' ? 2 : variant === 'damaged_1' ? 1 : 0;
  return {
    id: `${part}.${variant}`,
    variant,
    box,
    // A worn state is baked a little coarse: it is cracked, and the cracks read the better for it.
    density: stage === 0 ? 1 : 0.7,
    paint: (ctx) => {
      ctx.drawImage(image, x0, y0, w, h);
      if (stage > 0 && CRACKED.has(part)) wear(ctx, box, part, stage === 2 ? 2 : 1);
    },
  };
}

/** One of her parts: a picture a state, torn off into starlight. */
function partLayer(part: BossPartId, images: VesperImages): Layer | null {
  const image = images[part];
  if (!image) return null;
  const shots = DRAWN.map((state) => shotOf(part, state, image));
  return {
    id: part,
    part,
    group: part,
    variants: 'state',
    shots,
    show: byState(shots),
    move: MOTION[part],
    home: homeOf(part),
    ghost: true,
    // She is a painting: a blow brightens her, it does not wash her out.
    flash: 0.35,
  };
}

/** The light a part throws, drawn under it and gone with it. */
function glowLayer(part: BossPartId, images: VesperImages): Layer | null {
  const image = images[`glow-${part}`];
  const box = glowOf(part);
  if (!image || !box) return null;
  const [x0, y0] = box;
  const [w, h] = sizeOf(box);
  const shot: Shot = {
    id: `glow-${part}`,
    variant: 'whole',
    box,
    // A light is a blur: a fifth of the atlas's density is more than it can show.
    density: 0.2,
    paint: (ctx) => ctx.drawImage(image, x0, y0, w, h),
  };
  const move = MOTION[part];
  return {
    id: `glow-${part}`,
    part: null,
    group: `glow-${part}`,
    variants: 'whole',
    shots: [shot],
    show: (frame) => (frame.look[part]?.state === 'destroyed' ? null : shot),
    // It goes where its part goes, knocked with it, and flickers.
    move: (frame) => {
      const pose = move(frame);
      const knock = knocked(frame, part);
      return { ...pose, x: (pose.x ?? 0) + knock.x, y: (pose.y ?? 0) + knock.y, alpha: flicker(frame, 6.3) };
    },
  };
}

/** She hangs in the air: the whole of her rises and settles, a little. */
const bob = (time: number): number => Math.sin(time * 1.3) * 1.2;

/**
 * Her sheet from her pictures: a layer a part, with its light under it. Null if a part's picture
 * is missing — she is then not drawn at all rather than drawn without an arm.
 */
export function vesperSheet(images: VesperImages): Sheet | null {
  const layers: Layer[] = [];
  for (const part of BACK_TO_FRONT) {
    const glow = glowLayer(part, images);
    if (glow) layers.push(glow);
    const layer = partLayer(part, images);
    if (!layer) return null;
    layers.push(layer);
  }
  // She has the one face her illustration gave her.
  const faces: readonly FaceId[] = ['idle'];
  return { id: 'vesper', layers, faces, bob, lights };
}

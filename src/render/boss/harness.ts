import { CHAPTERS } from '../../game/levels/definitions';
import { Session } from '../../game/session';
import type { View } from '../camera';
import { Fx } from '../fx';
import { computeLayout, type Layout } from '../layout';
import { Renderer } from '../renderer';
import { drawScene, type SceneInfo } from '../scene';
import { drawBackHair, drawHead } from './hiyou/draw/head';
import { drawHiyou } from './hiyou/draw/figure';
import { faults } from './hiyou/draw/brush';
import { ATLAS_SCALE, bakeSheet, paintSheet } from './pictures';
import { drawPlaced, imageSlots, place, sizeOf, type Placed, type Sheet } from './sheet';
import { makeBakingCanvas } from '../textAtlas';
import { HIYOU_SCALE, HIYOU_SHEET, hiyouFromImages } from './hiyou/draw/pieces';
import {
  restingLook,
  type BossFrame,
  type BossPartId,
  type FaceId,
  type PartLook,
  type PartState,
} from './types';

/**
 * 绯樱立绘预览(开发专用,不进任何平台包)。
 *
 * 用真实的 `Renderer` 出图:同一套泛光与合成,所以这里看到的就是她在竞技场里的样子。场景是一个
 * 清空了砖块的关卡,只为给出场地、挡板和球作参照。她走的是游戏里那条路:部件先烤进图集
 * (`pictures.ts`),每帧只摆贴图四边形。
 *
 * `window.__bossHarness` 上有 `errors`(着色器或烘焙的失败)、`stats()`(绘制统计、读不完的路径数)、
 * `pictures`(图集里的部件数)和 `step(秒)`:按需画一帧,给动画帧被节流的自动化截图用。
 *
 * URL 参数:
 *   view   = figure | head | side | arena   只看立绘(放大)、只看头部、只看右肩甲(各再放大),或按竞技场里的真实比例看。默认 figure。
 *   face   = idle | smug | surprised | angry | hurt | awakened | defeated
 *   damage = 0 | 1 | 2        右肩甲与右机翼的受损档。
 *   at     = 秒              定格的时刻;不传则走时钟(发丝与羽片在飘)。
 *   sheet  = faces | damage  并排对比:七个表情一排,或「完整 / 重损」两个并排。此时其余参数不用。
 *   art    = head | faces | figure  不走 WebGL,把 Canvas 2D 画稿直接放大画出来:画稿阶段用它对着调。faces 是七个表情一排,figure 是整身。
 *   focus  = x,y   zoom = 每单位像素数   放大看人物坐标里的某一点(如 focus=21.6,-167.5&zoom=40 看右眼)。
 *   source = image   场景模式下改走图片模式:先用 Canvas 2D 图层合成出一组「图」(当作生图模型的输出),
 *                    再按图片规格装成图层表、烤图集、绘制——和真图片走同一条路。
 */

const FACES: readonly FaceId[] = ['idle', 'smug', 'surprised', 'angry', 'hurt', 'awakened', 'defeated'];
const STATES: readonly PartState[] = ['intact', 'damaged_1', 'damaged_2'];
const VIEWS = ['figure', 'head', 'side', 'arena'] as const;
const SHEETS = ['faces', 'damage'] as const;
const ARTS = ['head', 'faces', 'figure'] as const;

const params = new URLSearchParams(location.search);
const pick = <T extends string>(name: string, allowed: readonly T[], fallback: T): T => {
  const value = params.get(name);
  return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
};
const face = pick('face', FACES, 'idle');
const view = pick('view', VIEWS, 'figure');
const sheet = pick('sheet', SHEETS, 'none');
const art = pick('art', ARTS, 'none');
const damage = Math.min(2, Math.max(0, Math.floor(Number(params.get('damage') ?? 0)) || 0));
const at = Number(params.get('at'));
const frozen = params.has('at') && Number.isFinite(at);
/** `source=image`: her from a set of images made for her, not the sheet drawn with Canvas 2D. */
const source = params.get('source') === 'image' ? 'image' : 'draw';

/** Where she stands in the arena. The anchor is the top of her breastbone. */
const ANCHOR_X = 360;
const ANCHOR_Y = 300;

const debug = {
  errors: [] as unknown[],
  stats: (): unknown => ({}),
  step: (_seconds: number): void => {},
  pictures: 0,
  /** Layers in the sheet on screen, and the pixels to a figure unit its atlas was baked at. */
  layers: 0,
  atlasScale: 0,
  /** The boss batch of the last frame drawn, twenty floats a picture, to look at what was asked for. */
  batch: (): number[] => [],
  /** The atlas as it stands in the GPU, as a PNG at half size: to look at what was baked. */
  atlasImage: (): string => '',
  /** Where a picture lies in the atlas on screen. */
  pictured: (_id: string): unknown => null,
  /** The images of the last set made for her with `source=image`, to look at one by one. */
  images: new Map<string, HTMLCanvasElement>(),
  /** What a set of images made for her has to hold, each with its size in pixels. */
  slots: (): unknown[] =>
    imageSlots(HIYOU_SHEET).map((slot) => {
      const [w, h] = sizeOf(slot.box);
      return {
        name: slot.name,
        by: slot.by,
        part: slot.part,
        box: slot.box,
        px: [Math.ceil(w * ATLAS_SCALE), Math.ceil(h * ATLAS_SCALE)],
        shared: slot.shared,
      };
    }),
};
(window as unknown as { __bossHarness: typeof debug }).__bossHarness = debug;

/** The page's one canvas, which it cannot run without. */
function pageCanvas(): HTMLCanvasElement {
  const el = document.querySelector('canvas');
  if (!el) throw new Error('The harness page has no canvas.');
  return el;
}

const canvas = pageCanvas();

/** The Canvas 2D drawing itself, blown up on the page: no WebGL, no arena, just the art. */
function runArt(mode: (typeof ARTS)[number]): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas is not available.');
  const draw = (): void => {
    try {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#0b0818';
      ctx.fillRect(0, 0, w, h);
      // `focus` (a figure point, "x,y") and `zoom` (px per unit) look at one detail instead.
      const point = (params.get('focus') ?? '').split(',').map(Number);
      const detail = params.has('zoom') && point.length === 2 && point.every(Number.isFinite);
      const k = detail
        ? Number(params.get('zoom'))
        : Math.min(
            w / (mode === 'figure' ? 680 : 156),
            h / (mode === 'figure' ? 400 : mode === 'faces' ? 210 : 168),
          );
      ctx.translate(w / 2, h / 2);
      ctx.scale(k, k);
      if (detail) ctx.translate(-point[0]!, -point[1]!);
      else ctx.translate(0, mode === 'figure' ? 84 : 180);
      if (mode === 'figure') {
        // Her right pauldron and right wing take the damage: the parts the arena's balls reach first.
        const look = restingLook();
        look.RightShoulder.state = STATES[damage] ?? 'intact';
        look.RightWing.state = STATES[damage] ?? 'intact';
        drawHiyou(ctx, { x: 0, y: 0, time: frozen ? at : 0, face, look });
      } else if (mode === 'faces') {
        // The seven faces in a row, each a head and its hair, 142 apart.
        FACES.forEach((each, i) => {
          ctx.save();
          ctx.translate((i - 3) * 142, 0);
          drawBackHair(ctx);
          drawHead(ctx, each);
          ctx.restore();
        });
      } else {
        drawBackHair(ctx);
        drawHead(ctx, face);
      }
    } catch (error) {
      debug.errors.push(error);
    }
  };
  debug.stats = () => ({ unreadPaths: faults.unread });
  window.addEventListener('resize', draw);
  draw();
}

/**
 * A set of images for her, made from the sheet drawn with Canvas 2D: what a model would have to
 * draw, each the shape of its slot. Every picture of a group is drawn where it is anchored, turned
 * as it is anchored, for the variant its image is named for.
 */
function mockImages(): (name: string) => CanvasImageSource | undefined {
  const made = new Map<string, HTMLCanvasElement>();
  const placed: Placed[] = [];
  for (const slot of imageSlots(HIYOU_SHEET)) {
    // A group that shares has no image of its own: the other's is made, and flipped when placed.
    if (slot.shared) continue;
    const look = restingLook();
    if (slot.part && slot.by === 'state')
      look[slot.part] = { ...look[slot.part], state: slot.variant as PartState };
    const frame: BossFrame = {
      x: 0,
      y: 0,
      time: 0,
      face: slot.by === 'face' ? (slot.variant as FaceId) : 'idle',
      look,
    };
    const [w, h] = sizeOf(slot.box);
    const canvas = makeBakingCanvas();
    canvas.width = Math.ceil(w * ATLAS_SCALE);
    canvas.height = Math.ceil(h * ATLAS_SCALE);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas is not available.');
    ctx.setTransform(ATLAS_SCALE, 0, 0, ATLAS_SCALE, -slot.box[0] * ATLAS_SCALE, -slot.box[1] * ATLAS_SCALE);
    for (const each of place(HIYOU_SHEET, frame, placed, true)) {
      // By the layer's group, not the picture's: a picture may serve two groups (the blades, both wings).
      if (each.group === slot.group) drawPlaced(ctx, each);
    }
    made.set(slot.name, canvas);
  }
  debug.images = made;
  return (name) => made.get(name);
}

function runScene(): void {
  const renderer = new Renderer(canvas, { surfaces: 16384, lights: 46000, glyphs: 4096 });
  debug.stats = () => ({ ...renderer.stats, unreadPaths: faults.unread });
  // Her pictures are baked once, here at the start, and drawn from the atlas every frame. With
  // `source=image`, a set of images is made from the sheet drawn with Canvas 2D — standing in for a
  // set a model drew — and her sheet is built from that instead: the road a set of images takes.
  const sheetUsed: Sheet = source === 'image' ? hiyouFromImages(mockImages()) : HIYOU_SHEET;
  const atlas = bakeSheet(renderer.gl, sheetUsed);
  renderer.bossAtlas = atlas.texture;
  debug.pictures = atlas.pictures.size;
  debug.layers = sheetUsed.layers.length;
  debug.atlasScale = atlas.scale;
  debug.atlasImage = () => {
    const g = renderer.gl.gl;
    const side = (g.getParameter(g.MAX_TEXTURE_SIZE) as number) >= 2048 ? 2048 : 0;
    const whole = g.createFramebuffer();
    if (!whole) return '';
    const before = g.getParameter(g.FRAMEBUFFER_BINDING);
    g.bindFramebuffer(g.FRAMEBUFFER, whole);
    g.framebufferTexture2D(g.FRAMEBUFFER, g.COLOR_ATTACHMENT0, g.TEXTURE_2D, atlas.texture, 0);
    const px = new Uint8Array(side * side * 4);
    g.readPixels(0, 0, side, side, g.RGBA, g.UNSIGNED_BYTE, px);
    g.bindFramebuffer(g.FRAMEBUFFER, before);
    g.deleteFramebuffer(whole);
    const half = side / 2;
    const out = document.createElement('canvas');
    out.width = half;
    out.height = half;
    const ctx = out.getContext('2d');
    if (!ctx) return '';
    const img = ctx.createImageData(half, half);
    // Upside down in the GPU, and premultiplied: set both right, one pixel in two.
    for (let y = 0; y < half; y++) {
      for (let x = 0; x < half; x++) {
        const from = ((side - 1 - y * 2) * side + x * 2) * 4;
        const a = px[from + 3]! / 255;
        const to = (y * half + x) * 4;
        for (let c = 0; c < 3; c++) img.data[to + c] = a > 0 ? Math.min(255, px[from + c]! / a) : 0;
        img.data[to + 3] = px[from + 3]!;
      }
    }
    ctx.putImageData(img, 0, 0);
    return out.toDataURL('image/png');
  };
  debug.batch = () => {
    const batch = renderer.pen.boss!;
    return Array.from(batch.data.subarray(0, batch.count * 20));
  };
  debug.pictured = (id) => atlas.pictures.get(id) ?? null;
  const fx = new Fx(2000, { shake: true, flashes: true, quality: 'high' });
  const info: SceneInfo = { danger: 0, energy: 0 };

  // A sector with its bricks taken out: the frame, the paddle and the parked balls stay, as a
  // reference for how big she is next to them. She rules the third chapter's last sector.
  const session = new Session('campaign', 20261127, {
    bot: true,
    starter: { id: 'harness', name: '', en: '', desc: '', color: 0, grants: {}, crystals: 0 },
  });
  const world = session.world;
  world.bricks.length = 0;
  world.state = 'playing';
  const chapter = CHAPTERS[2] ?? CHAPTERS[0];

  /** Every part at rest but for the right pauldron and the right wing, at a given state. */
  const lookWith = (state: PartState): Record<BossPartId, PartLook> => {
    const look = restingLook();
    look.RightShoulder.state = state;
    look.RightWing.state = state;
    return look;
  };

  /** The figures on screen this run, with where each stands. */
  const figures: { x: number; face: FaceId; look: Record<BossPartId, PartLook> }[] = [];
  if (sheet === 'faces') {
    // Heads only: a whole figure is wider than the gap between them, and her wings would cover her
    // neighbour's face.
    const head = restingLook();
    for (const id of Object.keys(head) as BossPartId[]) if (id !== 'Head') head[id].state = 'destroyed';
    FACES.forEach((each, i) => figures.push({ x: ANCHOR_X + (i - 3) * 170, face: each, look: { ...head } }));
  } else if (sheet === 'damage') {
    figures.push({ x: ANCHOR_X - 310, face: 'idle', look: lookWith('intact') });
    figures.push({ x: ANCHOR_X + 310, face: 'idle', look: lookWith('damaged_2') });
  } else {
    figures.push({ x: ANCHOR_X, face, look: lookWith(STATES[damage] ?? 'intact') });
  }

  let layout: Layout = computeLayout(1, 1, 'high', 1);

  /** A view of scale k centred on a figure-space point. */
  const centre = (k: number, x: number, y: number): View => ({
    scale: k,
    tx: layout.cssW / 2 - x * k,
    ty: layout.cssH / 2 - y * k,
  });

  /** The view for this run. She is about 620 wide across the wings and 345 tall; her head 120. */
  const currentView = (): View => {
    const w = layout.cssW;
    const h = layout.cssH;
    if (sheet === 'faces') return centre(Math.min(w / 1240, h / 230), ANCHOR_X, ANCHOR_Y - 138);
    if (sheet === 'damage') return centre(Math.min(w / 1260, h / 400), ANCHOR_X, ANCHOR_Y - 78);
    if (view === 'arena') return fx.camera.view(layout);
    if (view === 'head') return centre(Math.min(w / 300, h / 250), ANCHOR_X, ANCHOR_Y - 138);
    // Her right pauldron, with the root of the right wing behind it: where the damage shows.
    if (view === 'side') return centre(Math.min(w / 320, h / 260), ANCHOR_X + 86, ANCHOR_Y - 84);
    return centre(Math.min(w / 680, h / 400), ANCHOR_X, ANCHOR_Y - 78);
  };

  const fit = (): void => {
    layout = computeLayout(window.innerWidth, window.innerHeight, 'high', window.devicePixelRatio || 1);
  };
  window.addEventListener('resize', fit);
  fit();

  let faultsSeen = 0;
  const frame = (now: number): void => {
    const time = frozen ? at : now / 1000;
    try {
      const current = currentView();
      renderer.pen.reset();
      // A sheet shows the figures on the bare sky: the arena would only be in the way.
      if (sheet === 'none') drawScene(renderer.pen, world, fx, chapter, time, info);
      for (const figure of figures) {
        const shown: BossFrame = { x: figure.x, y: ANCHOR_Y, time, face: figure.face, look: figure.look };
        paintSheet(renderer.pen, shown, sheetUsed, atlas, HIYOU_SCALE);
      }
      renderer.render({
        layout,
        time,
        palette: { a: chapter.bg[0], b: chapter.bg[1], c: chapter.bg[2], accent: chapter.accent },
        view: current,
        post: fx.post,
        info,
      });
      // A shader that would not compile is swallowed by the renderer; an automated look has to see it.
      for (const fault of renderer.faults.slice(faultsSeen)) debug.errors.push(fault);
      faultsSeen = renderer.faults.length;
    } catch (error) {
      debug.errors.push(error);
    }
    requestAnimationFrame(frame);
  };
  // Draws one frame at a given moment, whatever the browser is doing with its animation frames: for
  // an automated look at a page whose rAF is throttled.
  debug.step = (seconds: number): void => frame(seconds * 1000);
  requestAnimationFrame(frame);
}

// A set-up that throws is kept where an automated look will find it, not left to the console.
try {
  if (art !== 'none') runArt(art);
  else runScene();
} catch (error) {
  debug.errors.push(error);
}

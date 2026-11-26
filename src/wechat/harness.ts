/**
 * 微信运行时模拟器(开发专用,不进任何平台包)。
 *
 * 在浏览器里跑真实的 `src/wechat/game.ts`:注入一个最小 `wx` 实现(createCanvas、
 * getSystemInfoSync、onTouch*),pointer 事件被转发成触摸事件,然后动态 import 入口——注入必须
 * 先于入口执行,所以用动态 import 而不是静态。屏幕 canvas 显示在页面上;offscreen canvas 与
 * 微信一致,不进 DOM。这条链验证的正是真机会跑的 WebGL 纹理装配,而不是 2D 预览页的捷径。
 */
interface HarnessTouchHandler {
  (event: {
    touches: { clientX: number; clientY: number }[];
    changedTouches: { clientX: number; clientY: number }[];
  }): void;
}

const handlers: { start: HarnessTouchHandler[]; move: HarnessTouchHandler[]; end: HarnessTouchHandler[] } = {
  start: [],
  move: [],
  end: [],
};
let screenCanvas: HTMLCanvasElement | null = null;
let created = 0;

const wxStub = {
  createCanvas: (): HTMLCanvasElement => {
    created++;
    const canvas = document.createElement('canvas');
    if (created === 1) {
      canvas.id = 'screen';
      document.body.appendChild(canvas);
      screenCanvas = canvas;
    }
    return canvas;
  },
  getSystemInfoSync: () => ({
    windowWidth: window.innerWidth,
    windowHeight: window.innerHeight,
    pixelRatio: window.devicePixelRatio || 1,
  }),
  onTouchStart: (cb: HarnessTouchHandler): void => {
    handlers.start.push(cb);
  },
  onTouchMove: (cb: HarnessTouchHandler): void => {
    handlers.move.push(cb);
  },
  onTouchEnd: (cb: HarnessTouchHandler): void => {
    handlers.end.push(cb);
  },
};
(window as { wx?: unknown }).wx = wxStub;

function forward(kind: 'start' | 'move' | 'end', event: PointerEvent): void {
  const touch = { clientX: event.clientX, clientY: event.clientY };
  const payload =
    kind === 'end' ? { touches: [], changedTouches: [touch] } : { touches: [touch], changedTouches: [touch] };
  for (const cb of handlers[kind]) cb(payload);
}

function listen(name: 'pointerdown' | 'pointermove' | 'pointerup', kind: 'start' | 'move' | 'end'): void {
  document.addEventListener(name, (event) => {
    if (event instanceof PointerEvent && screenCanvas) forward(kind, event);
  });
}
listen('pointerdown', 'start');
listen('pointermove', 'move');
listen('pointerup', 'end');

void import('./game');

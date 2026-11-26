/**
 * Canvas UI 预览页(开发专用,不进任何平台包)。
 *
 * `vite dev` 下访问 `/preview.html`;普通构建的入口只有 `index.html`,本页与入口
 * `preview.ts` 不会进入 dist。微信端的手势桥(`wx.onTouch*` → 这里同样的三个
 * pointer 调用)在构建线落地时替换这段事件绑定。
 */
import { CanvasUi } from './root';
import { CanvasSurface } from './surface';
import { DEFAULT_THEME } from './theme';
import { menuTree, type MenuActions, type MenuModel } from './menu';

const model: MenuModel = {
  recordsText: '闯关最深 8(击败 BOSS ×1) · 无尽最深 第 14 关 · 最高分 1,254,530 · 胜局 3',
  stardustText: '星尘 420',
  wishText: '心愿:轨道打击 · 还差 60',
  badgeText: '首礼',
};

const seen: string[] = [];
const actions = new Proxy(
  {},
  {
    get: (_target, key) => () => {
      seen.push(String(key));
      console.log('menu action:', String(key));
    },
  },
) as unknown as MenuActions;

function boot(): void {
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  let ui: CanvasUi;

  const rebuild = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas is not available');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const surface = new CanvasSurface(ctx, w, h, DEFAULT_THEME.font);
    ui = new CanvasUi({ surface });
    ui.setTree(menuTree(actions, model, w, h));
  };
  rebuild();
  window.addEventListener('resize', rebuild);

  canvas.addEventListener('pointerdown', (e) => ui.pointerDown(e.offsetX, e.offsetY));
  canvas.addEventListener('pointermove', (e) => ui.pointerMove(e.offsetX, e.offsetY));
  canvas.addEventListener('pointerup', (e) => ui.pointerUp(e.offsetX, e.offsetY));

  const tick = (): void => {
    ui.frame();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

boot();

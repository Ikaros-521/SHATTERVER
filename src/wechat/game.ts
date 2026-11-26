/**
 * The WeChat mini-game entry (`game.js` after the build).
 *
 * The shell this port grows from: screen canvas (WebGL) + offscreen 2D canvas for the UI, the
 * touch bridge, and the canvas-rendered main menu composited over the GL frame by
 * {@link UITextureLayer}. The game world (Renderer/Session) joins this same rAF once the screens
 * are ported; the menu's `MenuActions` are the seam where real navigation plugs in.
 *
 * Coordinates: the UI surface works in logical px (`windowWidth × windowHeight`), the canvases
 * are sized in physical px (`× pixelRatio`, capped at 2 like the preview), and the 2D context's
 * transform bridges the two.
 */

import { CanvasUi } from '../ui/canvas/root';
import { menuTree, type MenuActions, type MenuModel } from '../ui/canvas/menu';
import { CanvasSurface } from '../ui/canvas/surface';
import { DEFAULT_THEME } from '../ui/canvas/theme';
import { GL } from '../render/gl';
import { UITextureLayer } from './uitexture';

const DPR_CAP = 2;

function boot(): void {
  const sys = wx.getSystemInfoSync();
  const dpr = Math.min(DPR_CAP, sys.pixelRatio);
  const width = sys.windowWidth;
  const height = sys.windowHeight;

  // First createCanvas = the on-screen canvas; second = offscreen, for the 2D UI.
  const screen = wx.createCanvas();
  screen.width = Math.round(width * dpr);
  screen.height = Math.round(height * dpr);
  const wrap = new GL(screen);

  const uiCanvas = wx.createCanvas();
  uiCanvas.width = screen.width;
  uiCanvas.height = screen.height;
  const ctx = uiCanvas.getContext('2d');
  if (!ctx) throw new Error('2D context is not available');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const surface = new CanvasSurface(ctx, width, height, DEFAULT_THEME.font);
  const ui = new CanvasUi({ surface, theme: DEFAULT_THEME });
  const layer = new UITextureLayer(wrap, uiCanvas);

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
  // Placeholder model, same as the preview page: the real one comes with the settings/economy
  // screens, wired from the same save the DOM build reads.
  const model: MenuModel = {
    recordsText: '',
    stardustText: '',
    wishText: null,
    badgeText: null,
  };
  ui.setTree(menuTree(actions, model, width, height));

  wx.onTouchStart((event) => {
    const touch = event.touches[0];
    if (touch) ui.pointerDown(touch.clientX, touch.clientY);
  });
  wx.onTouchMove((event) => {
    const touch = event.touches[0];
    if (touch) ui.pointerMove(touch.clientX, touch.clientY);
  });
  wx.onTouchEnd((event) => {
    const touch = event.changedTouches[0];
    if (touch) ui.pointerUp(touch.clientX, touch.clientY);
  });

  const bg = DEFAULT_THEME.colors.bg;
  wrap.gl.clearColor(((bg >> 16) & 255) / 255, ((bg >> 8) & 255) / 255, (bg & 255) / 255, 1);

  function frame(): void {
    if (ui.frame()) layer.upload();
    wrap.bind(null);
    wrap.gl.clear(wrap.gl.COLOR_BUFFER_BIT);
    layer.draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

boot();

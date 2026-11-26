/**
 * The WeChat mini-game entry (`game.js` after the build).
 *
 * The shell this port grows from: screen canvas (WebGL) + offscreen 2D canvas for the UI, the
 * touch bridge, and a small in-shell screen router over the canvas-rendered screens. The save is
 * loaded once through `core/storage` (which routes to `wx` storage under `__WECHAT__`), and every
 * navigation rebuilds the active screen's tree from it — the data-rebuild discipline the DOM UI
 * also follows. The game world (Renderer/Session) joins this same rAF once the gameplay screens
 * are ported.
 *
 * Coordinates: the UI surface works in logical px (`windowWidth × windowHeight`), the canvases
 * are sized in physical px (`× pixelRatio`, capped at 2 like the preview), and the 2D context's
 * transform bridges the two.
 */

import { CanvasUi } from '../ui/canvas/root';
import { menuTree, type MenuActions } from '../ui/canvas/menu';
import { CanvasSurface } from '../ui/canvas/surface';
import { DEFAULT_THEME } from '../ui/canvas/theme';
import { GL } from '../render/gl';
import { loadSave, type SaveData } from '../core/storage';
import { buildMenuModel } from './menumodel';
import { historyTree, type HistoryState } from './screens/history';
import { UITextureLayer } from './uitexture';

const DPR_CAP = 2;

/** The screens the shell can show so far. Gameplay screens join as they are ported. */
type ShellScreen = { kind: 'menu' } | ({ kind: 'history' } & HistoryState);

function boot(): void {
  const sys = wx.getSystemInfoSync();
  const dpr = Math.min(DPR_CAP, sys.pixelRatio);
  const width = sys.windowWidth;
  const height = sys.windowHeight;
  const save: SaveData = loadSave();

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

  let current: ShellScreen = { kind: 'menu' };

  const rebuild = (): void => {
    if (current.kind === 'menu') {
      ui.setTree(menuTree(menuActions, buildMenuModel(save), width, height, surface));
    } else {
      ui.setTree(historyTree(save, { tab: current.tab }, historyActions, width, height, surface));
    }
  };

  const stub =
    (name: string): (() => void) =>
    (): void => {
      console.log('not ported yet:', name);
    };
  const menuActions: MenuActions = {
    campaign: stub('campaign'),
    endless: stub('endless'),
    shop: stub('shop'),
    tutorial: stub('tutorial'),
    codex: stub('codex'),
    settings: stub('settings'),
    cloud: stub('cloud'),
    history: () => {
      current = { kind: 'history', tab: 'campaign' };
      rebuild();
    },
  };
  const historyActions = {
    back: () => {
      current = { kind: 'menu' };
      rebuild();
    },
    setTab: (tab: 'campaign' | 'endless'): void => {
      current = { kind: 'history', tab };
      rebuild();
    },
  };
  rebuild();
  // Debug/automation handle, same spirit as the DOM build's `__shatterverse`.
  (globalThis as { __shell?: unknown }).__shell = {
    ui,
    save,
    screen: () => current,
    rebuild,
  };

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

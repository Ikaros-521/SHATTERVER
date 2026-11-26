/**
 * The WeChat mini-game entry (`game.js` after the build).
 *
 * The shell this port grows from: screen canvas (WebGL) + offscreen 2D canvas for the UI, the
 * touch bridge, and a small in-shell screen router over the canvas-rendered screens. The save is
 * loaded once through `core/storage` (which routes to `wx` storage under `__WECHAT__`), and every
 * navigation rebuilds the active screen's tree from it — the data-rebuild discipline the DOM UI
 * also follows. The game world (Renderer/Session) joins this same rAF once the gameplay screens
 * are ported; the starter screen's `start` action is the seam where it plugs in.
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
import { loadSave, storeSave, type SaveData } from '../core/storage';
import { SUPPLY_MAP, isSupplyId, slotLimit, supplyCost } from '../game/economy/catalog';
import type { Starter } from '../game/starters';
import type { DifficultyId } from '../game/difficulty';
import type { RunMode } from '../game/run';
import { buildMenuModel } from './menumodel';
import { historyTree, type HistoryState } from './screens/history';
import { starterTree } from './screens/starter';
import { WorldBinding } from './world';
import { UITextureLayer } from './uitexture';

const DPR_CAP = 2;

/** The screens the shell can show so far. Remaining screens join as they are ported. */
type ShellScreen =
  | { kind: 'menu' }
  | { kind: 'starter'; mode: RunMode; difficulty: DifficultyId }
  | ({ kind: 'history' } & HistoryState)
  | { kind: 'run' };

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
  /** The live run, when one is on the screen. The shell owns the rAF it advances in. */
  let world: WorldBinding | null = null;
  let lastTime = 0;

  const rebuild = (): void => {
    if (current.kind === 'menu') {
      ui.setTree(menuTree(menuActions, buildMenuModel(save), width, height, surface));
    } else if (current.kind === 'starter') {
      ui.setTree(
        starterTree(
          save,
          { mode: current.mode, difficulty: current.difficulty },
          starterActions,
          width,
          height,
          surface,
        ),
      );
    } else if (current.kind === 'history') {
      ui.setTree(historyTree(save, { tab: current.tab }, historyActions, width, height, surface));
    }
  };

  const stub =
    (name: string): (() => void) =>
    (): void => {
      console.log('not ported yet:', name);
    };
  const menuActions: MenuActions = {
    campaign: (): void => {
      current = { kind: 'starter', mode: 'campaign', difficulty: save.settings.difficulty };
      rebuild();
    },
    endless: (): void => {
      current = { kind: 'starter', mode: 'endless', difficulty: save.settings.difficulty };
      rebuild();
    },
    shop: stub('shop'),
    tutorial: stub('tutorial'),
    codex: stub('codex'),
    settings: stub('settings'),
    cloud: stub('cloud'),
    history: (): void => {
      current = { kind: 'history', tab: 'campaign' };
      rebuild();
    },
  };
  const historyActions = {
    back: (): void => {
      current = { kind: 'menu' };
      rebuild();
    },
    setTab: (tab: 'campaign' | 'endless'): void => {
      current = { kind: 'history', tab };
      rebuild();
    },
  };
  const starterActions = {
    back: (): void => {
      current = { kind: 'menu' };
      rebuild();
    },
    setDifficulty: (id: DifficultyId): void => {
      if (current.kind !== 'starter') return;
      current = { ...current, difficulty: id };
      // Same persistence path as the DOM's `updateSettings({ difficulty })`.
      save.settings.difficulty = id;
      storeSave(save);
      rebuild();
    },
    toggleLoadout: (id: string): void => {
      // Mirrors `App.toggleLoadout`: owning is a precondition, slots are earned by playing.
      if (!isSupplyId(id)) return;
      const econ = save.economy;
      if (!econ.supplies.includes(id)) return;
      const index = econ.loadout.indexOf(id);
      if (index >= 0) econ.loadout.splice(index, 1);
      else {
        const clears = Object.values(econ.winsByDifficulty).some((n) => (n ?? 0) > 0) ? 1 : 0;
        if (supplyCost(econ.loadout) + SUPPLY_MAP[id].slots > slotLimit(save.records.runs, clears)) return;
        econ.loadout.push(id);
      }
      storeSave(save);
      rebuild();
    },
    start: (starter: Starter): void => {
      if (current.kind !== 'starter') return;
      const { mode, difficulty } = current;
      // The game world takes the screen canvas over: menus yield, the run renders full-screen.
      world = new WorldBinding(screen, save, mode, starter, difficulty, width, height, dpr, {
        onFinish: (): void => {
          world?.dispose();
          world = null;
          current = { kind: 'menu' };
          rebuild();
        },
        onDraft: (options, choose) => {
          console.log('draft:', options.map((option) => option.id).join('/'));
          void choose;
        },
      });
      current = { kind: 'run' };
      // The menu tree stays installed but is not composited during a run; force a repaint on return.
      ui.markDirty();
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
    if (!touch) return;
    if (current.kind === 'run') world?.pointer(touch.clientX);
    else ui.pointerDown(touch.clientX, touch.clientY);
  });
  wx.onTouchMove((event) => {
    const touch = event.touches[0];
    if (!touch) return;
    if (current.kind === 'run') world?.pointer(touch.clientX);
    else ui.pointerMove(touch.clientX, touch.clientY);
  });
  wx.onTouchEnd((event) => {
    const touch = event.changedTouches[0];
    if (!touch) return;
    if (current.kind === 'run') world?.releasePointer();
    else ui.pointerUp(touch.clientX, touch.clientY);
  });

  const bg = DEFAULT_THEME.colors.bg;
  wrap.gl.clearColor(((bg >> 16) & 255) / 255, ((bg >> 8) & 255) / 255, (bg & 255) / 255, 1);

  function frame(now: number): void {
    const dt = Math.min(0.05, Math.max(0, (now - lastTime) / 1000));
    lastTime = now;
    if (current.kind === 'run' && world) {
      // The run owns the whole screen: world renders itself, no UI texture this frame.
      world.frame(dt, now / 1000);
      requestAnimationFrame(frame);
      return;
    }
    if (ui.frame()) layer.upload();
    wrap.bind(null);
    // The Renderer may have left a different viewport/program behind on a run→menu transition.
    wrap.gl.viewport(0, 0, wrap.gl.drawingBufferWidth, wrap.gl.drawingBufferHeight);
    wrap.gl.clear(wrap.gl.COLOR_BUFFER_BIT);
    layer.draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

boot();

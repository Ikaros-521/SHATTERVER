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
import { loadSave, storeSave, type SaveData, type Settings } from '../core/storage';
import { setLang, type Lang } from '../core/i18n';
import { AudioDirector } from '../audio/director';
import { SUPPLY_MAP, isSupplyId, slotLimit, supplyCost } from '../game/economy/catalog';
import type { Starter } from '../game/starters';
import { RNG, randomSeed } from '../core/rng';
import { UPGRADES } from '../game/upgrades/defs';
import { settleFinishedRun } from '../game/finish';
import type { DifficultyId } from '../game/difficulty';
import type { RunMode } from '../game/run';
import { WeChatChannel } from '../net/wechatchannel';
import type { BoardInfo } from '../net/cheddaboards';
import { FANOUT_BOARDS } from '../net/cloud';
import { buildMenuModel } from './menumodel';
import { cloudBoardTree, type CloudBoardState } from './screens/cloudboard';
import { codexTree, type CodexTab } from './screens/codex';
import { shopTree, type ShopTab } from './screens/shop';
import {
  buyProtocol,
  buySkin,
  buySupply,
  equipSkin,
  setTrialSupply,
  toggleLoadout,
  toggleWishlist,
} from './shopactions';
import { tutorialTree } from './screens/tutorial';
import { draftTree } from './screens/draft';
import { historyTree, type HistoryState } from './screens/history';
import { pauseTree, type PauseActions } from './screens/pause';
import { resultsTree, type ResultsModel } from './screens/results';
import { settingsTree } from './screens/settings';
import { starterTree } from './screens/starter';
import { WorldBinding } from './world';
import { drawHud, hudSignature, pauseButtonRect } from './hud';
import { UITextureLayer } from './uitexture';

const DPR_CAP = 2;

/** The screens the shell can show so far. Remaining screens join as they are ported. */
type ShellScreen =
  | { kind: 'menu' }
  | { kind: 'starter'; mode: RunMode; difficulty: DifficultyId }
  | ({ kind: 'history' } & HistoryState)
  | { kind: 'run' }
  | { kind: 'pause' }
  | { kind: 'draft' }
  | { kind: 'results' }
  | { kind: 'settings' }
  | { kind: 'codex'; tab: CodexTab }
  | { kind: 'shop'; tab: ShopTab }
  | { kind: 'tutorial'; page: number }
  | ({ kind: 'cloud' } & CloudBoardState);

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
  // A non-null alias in this scope: TS does not carry the narrowing into `frame`'s closure.
  const hudCtx: CanvasRenderingContext2D = ctx;

  const surface = new CanvasSurface(ctx, width, height, DEFAULT_THEME.font);
  const ui = new CanvasUi({ surface, theme: DEFAULT_THEME });
  const layer = new UITextureLayer(wrap, uiCanvas);
  // The audio stack: synthesized BGM and SFX through WeChat's WebAudio shim or the browser's
  // AudioContext (see `audio/page.ts`). Silent until the first touch unlocks it.
  const audio = new AudioDirector();
  audio.setVolumes(save.settings.music, save.settings.sfx);

  let current: ShellScreen = { kind: 'menu' };
  /** The live run, when one is on the screen. The shell owns the rAF it advances in. */
  let world: WorldBinding | null = null;
  let lastTime = 0;
  /** The last scored run's choices, for the results screen's retry. */
  let lastRun: { mode: RunMode; starter: Starter; difficulty: DifficultyId } | null = null;
  let resultsModel: ResultsModel | null = null;
  // The WeChat cloud channel, this package's own leaderboard backend. In the browser harness
  // `wx.cloud` is absent and every submit resolves to the offline wording — which is exactly
  // the degradation a dead network gets on device.
  const cloud = new WeChatChannel();

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
    } else if (current.kind === 'draft') {
      const session = world?.session;
      if (!session) return;
      ui.setTree(
        draftTree(
          {
            intro: session.run.level === 1 && session.rerolls === 0 && session.phase === 'draft',
            code: session.world.level.code,
            options: session.draft,
            levels: session.draft.map((def) => session.run.upgrades[def.id] ?? 0),
            crystals: session.run.crystals,
            rerollCost: session.rerollCost,
            skipReward: session.skipReward,
          },
          draftActions,
          width,
          height,
          surface,
        ),
      );
    } else if (current.kind === 'results' && resultsModel) {
      ui.setTree(resultsTree(resultsModel, resultsActions, width, surface));
    } else if (current.kind === 'pause') {
      ui.setTree(pauseTree(pauseActions, width, height, surface));
    } else if (current.kind === 'settings') {
      ui.setTree(settingsTree(save, settingsActions, width, height, surface));
    } else if (current.kind === 'codex') {
      ui.setTree(
        codexTree(
          { tab: current.tab, discovered: new Set(save.records.discovered) },
          {
            back: (): void => {
              current = { kind: 'menu' };
              rebuild();
            },
            setTab: (tab: CodexTab): void => {
              if (current.kind !== 'codex') return;
              current = { kind: 'codex', tab };
              rebuild();
            },
          },
          width,
          height,
          surface,
        ),
      );
    } else if (current.kind === 'shop') {
      ui.setTree(
        shopTree(
          save,
          { tab: current.tab },
          {
            back: (): void => {
              current = { kind: 'menu' };
              rebuild();
            },
            setTab: (tab: ShopTab): void => {
              if (current.kind !== 'shop') return;
              current = { kind: 'shop', tab };
              rebuild();
            },
            buyProtocol: (id: string): void => {
              buyProtocol(save, id);
              rebuild();
            },
            buySupply: (id: string): void => {
              buySupply(save, id);
              rebuild();
            },
            buySkin: (id: string): void => {
              buySkin(save, id);
              rebuild();
            },
            equipSkin: (id: string | null, kind): void => {
              equipSkin(save, id, kind);
              rebuild();
            },
            toggleWishlist: (id: string): void => {
              toggleWishlist(save, id);
              rebuild();
            },
            toggleLoadout: (id: string): void => {
              toggleLoadout(save, id);
              rebuild();
            },
            setTrial: (id: string): void => {
              setTrialSupply(save, id);
              rebuild();
            },
          },
          width,
          height,
          surface,
        ),
      );
    } else if (current.kind === 'tutorial') {
      ui.setTree(
        tutorialTree(
          current.page,
          {
            close: (): void => {
              // Any exit marks the deck seen — the same rule the DOM overlay applies.
              save.settings.tutorialSeen = true;
              storeSave(save);
              current = { kind: 'menu' };
              rebuild();
            },
            goto: (page: number): void => {
              if (current.kind !== 'tutorial') return;
              current = { kind: 'tutorial', page };
              rebuild();
            },
          },
          width,
          height,
          surface,
        ),
      );
    } else if (current.kind === 'cloud') {
      ui.setTree(
        cloudBoardTree(
          { nickname: cloud.nickname, tabs: cloudTabs },
          { tab: current.tab, views: current.views, loaded: current.loaded },
          cloudActions,
          width,
          height,
          surface,
        ),
      );
    }
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
    shop: (): void => {
      current = { kind: 'shop', tab: 'protocols' };
      rebuild();
    },
    tutorial: (): void => {
      current = { kind: 'tutorial', page: 0 };
      rebuild();
    },
    codex: (): void => {
      current = { kind: 'codex', tab: 'upgrades' };
      rebuild();
    },
    settings: (): void => {
      current = { kind: 'settings' };
      rebuild();
    },
    cloud: (): void => {
      current = { kind: 'cloud', tab: 'all-time', views: {}, loaded: {} };
      rebuild();
      loadCurrentTab();
      // The tab list itself is async on the channel; refresh the tabs row when it lands.
      void cloud.knownBoards().then((tabs) => {
        cloudTabs = tabs;
        if (current.kind === 'cloud') rebuild();
      });
    },
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
      startRunFor(current.mode, starter, current.difficulty);
    },
  };
  const draftActions = {
    pick: (id: string): void => {
      if (!world || current.kind !== 'draft') return;
      world.session.choose(id);
      leaveDraftIfDone();
    },
    reroll: (): void => {
      if (!world || current.kind !== 'draft') return;
      world.session.reroll();
      rebuild(); // the roll changed; crystals may have moved
    },
    skip: (): void => {
      if (!world || current.kind !== 'draft') return;
      world.session.skip();
      leaveDraftIfDone();
    },
  };
  /** A settled draft hands control back to the live world; a re-rolled one stays on the screen. */
  const leaveDraftIfDone = (): void => {
    if (world && world.session.phase !== 'draft') {
      current = { kind: 'run' };
      hudSig = ''; // the draft screen replaced the HUD texture; force the overlay repaint
      ui.markDirty();
    } else rebuild();
  };
  const resultsActions = {
    /** The results screen's retry replays the very choices of the run just settled. */
    retry: (): void => {
      if (!lastRun) return;
      startRunFor(lastRun.mode, lastRun.starter, lastRun.difficulty);
    },
    menu: (): void => {
      current = { kind: 'menu' };
      rebuild();
    },
  };
  const settingsActions = {
    back: (): void => {
      current = { kind: 'menu' };
      rebuild();
    },
    update: (patch: Partial<Settings>): void => {
      Object.assign(save.settings, patch);
      storeSave(save);
      if (patch.music !== undefined || patch.sfx !== undefined) {
        audio.setVolumes(save.settings.music, save.settings.sfx);
      }
      rebuild();
    },
    setLanguage: (lang: Lang): void => {
      save.settings.language = lang;
      setLang(lang); // the module state the rebuild's t() reads
      storeSave(save);
      rebuild();
    },
  };
  let cloudTabs: readonly BoardInfo[] = FANOUT_BOARDS;
  const cloudActions = {
    back: (): void => {
      current = { kind: 'menu' };
      rebuild();
    },
    setTab: (id: string): void => {
      if (current.kind !== 'cloud') return;
      current = { ...current, tab: id };
      rebuild();
      loadCurrentTab();
    },
  };
  /** Reads the current tab through the channel, then repaints the screen with the rows. */
  const loadCurrentTab = (): void => {
    if (current.kind !== 'cloud') return;
    const tab = current.tab;
    if (current.loaded[tab]) return;
    current.loaded[tab] = true;
    void cloud.board(tab, 50).then((view) => {
      if (current.kind !== 'cloud' || current.tab !== tab) return;
      current.views[tab] = view
        ? view.entries.map((entry) => ({
            rank: entry.rank,
            nickname: entry.nickname,
            score: entry.score,
            streak: entry.streak,
          }))
        : null;
      rebuild();
    });
  };

  /** The shell's half of the WorldBinding conversation: drafts yield, the finish settles. */
  const worldCallbacks = (scoring: boolean) => ({
    onDraft: (): void => {
      current = { kind: 'draft' };
      rebuild();
    },
    onEnding: (won: boolean): void => {
      // The beat before settlement runs on real time: the shell may be showing any screen
      // (a draft the run ended from included), and the frame loop does not advance there.
      setTimeout(() => {
        const finished = world;
        if (!finished) return;
        // Records, 星尘, the stored entry and its rank — the shared game rule (`game/finish.ts`).
        const result = settleFinishedRun(save, finished.session, won, scoring, lastRun?.starter.id ?? null);
        finished.dispose();
        world = null;
        resultsModel = {
          won,
          record: result.record,
          fresh: result.fresh,
          rank: result.rank,
          payout: result.payout,
          uploadLine: null,
          uploadOk: false,
        };
        current = { kind: 'results' };
        ui.markDirty();
        rebuild();
        if (result.record) {
          // The mirror goes out while the results screen is up; its one line updates on settle.
          void cloud.finishRun(result.record).then((outcome) => {
            if (resultsModel && current.kind === 'results') {
              resultsModel.uploadLine = outcome.message;
              resultsModel.uploadOk = outcome.ok;
              rebuild();
            }
          });
        }
      }, 1100);
    },
  });

  /** Starts a scoring run: the world takes the screen canvas over, menus yield. */
  const startRunFor = (mode: RunMode, starter: Starter, difficulty: DifficultyId): void => {
    if (world) {
      world.dispose();
      world = null;
    }
    lastRun = { mode, starter, difficulty };
    resultsModel = null;
    // The DOM startRun's opening bookkeeping (app.ts): the trial supply rides along as a
    // one-run gift — de-duplicated by the session — and is spent the moment a scoring run
    // opens; the run count feeds the loadout's slot gates, so it must move too.
    const econ = save.economy;
    const supplies = econ.trialSupply ? [...econ.loadout, econ.trialSupply] : econ.loadout;
    // The default screen is set before the binding is built: an opening draft (head-start
    // trial, protocol intro picks) fires its event inside the constructor, and that must win
    // over the run screen. Its own rebuild lands while `world` is still null, so one more
    // runs below once the assignment is real.
    current = { kind: 'run' };
    world = new WorldBinding(
      screen,
      save,
      mode,
      starter,
      difficulty,
      width,
      height,
      dpr,
      worldCallbacks(true),
      { supplies },
      audio,
    );
    econ.trialSupply = null;
    save.records.runs++;
    storeSave(save);
    if ((current as ShellScreen).kind === 'draft') rebuild();
    // The previous screen's tree stays installed but is not composited during a run.
    ui.markDirty();
  };

  rebuild();
  // Debug/automation handle, same spirit as the DOM build's `__shatterverse`.
  const makeWorld = (bot: boolean, level: number): void => {
    if (world) {
      world.dispose();
      world = null;
    }
    // A demo-style random build, so the debug run can actually clear sectors and reach drafts.
    const rng = new RNG(randomSeed());
    const grants: Record<string, number> = {};
    for (const def of rng.shuffle([...UPGRADES]).slice(0, rng.int(9, 13))) grants[def.id] = rng.int(1, 2);
    const starter: Starter = { id: 'debug', name: '', en: '', desc: '', color: 0, grants, crystals: 0 };
    // The debug run's results screen gets a working retry too: replay the same shape of run.
    lastRun = { mode: 'endless', starter, difficulty: save.settings.difficulty };
    world = new WorldBinding(
      screen,
      save,
      'endless',
      starter,
      save.settings.difficulty,
      width,
      height,
      dpr,
      worldCallbacks((level ?? 1) <= 1),
      { bot, level },
      audio,
    );
    current = { kind: 'run' };
    ui.markDirty();
  };
  (globalThis as { __shell?: unknown }).__shell = {
    ui,
    save,
    screen: () => current,
    rebuild,
    world: () => world,
    debugStart: makeWorld,
    audioStatus: () => audio.status,
    audio,
  };

  // Run-screen gesture state: a short still tap fires overdrive, a second tap pauses, a drag
  // steers the paddle. Everything else goes to the widget tree of the current screen.
  let tapDownX = 0;
  let tapDownY = 0;
  let tapDownAt = 0;
  let tapDragged = false;
  let lastTapAt = 0;
  let paused = false;
  /** The HUD overlay's content hash; '' forces the next repaint+upload. */
  let hudSig = '';
  let lastDamage = 0;
  let dps = 0;

  const resumeRun = (): void => {
    paused = false;
    current = { kind: 'run' };
    hudSig = '';
    ui.markDirty();
  };
  const pauseRun = (): void => {
    if (current.kind !== 'run' || !world) return;
    paused = true;
    world.releasePointer();
    current = { kind: 'pause' };
    rebuild();
  };
  const pauseActions: PauseActions = {
    resume: resumeRun,
    abandon: (): void => {
      paused = false;
      // Walking away forfeits the run: no settlement, no submit — the DOM's 放弃本局 rule.
      world?.dispose();
      world = null;
      current = { kind: 'menu' };
      rebuild();
    },
  };

  wx.onTouchStart((event) => {
    const touch = event.touches[0];
    if (!touch) return;
    // The user gesture that unlocks audio: any first touch, on any screen.
    audio.unlock();
    if (current.kind === 'run' && !paused) {
      // The pause button is the only tap target; everything else steers the paddle.
      const rect = pauseButtonRect(width);
      if (touch.clientX >= rect.x && touch.clientX <= rect.x + rect.w && touch.clientY <= rect.h + 10) {
        tapDragged = true; // a press on the button is never an overdrive tap
        pauseRun();
        return;
      }
      tapDownX = touch.clientX;
      tapDownY = touch.clientY;
      tapDownAt = Date.now();
      tapDragged = false;
      world?.pointer(touch.clientX);
      return;
    }
    if (current.kind === 'pause') {
      // The pause card is widget-driven.
      ui.pointerDown(touch.clientX, touch.clientY);
      return;
    }
    ui.pointerDown(touch.clientX, touch.clientY);
  });
  wx.onTouchMove((event) => {
    const touch = event.touches[0];
    if (!touch) return;
    if (current.kind === 'run' && !paused) {
      if (Math.hypot(touch.clientX - tapDownX, touch.clientY - tapDownY) > 6) tapDragged = true;
      world?.pointer(touch.clientX);
      return;
    }
    if (current.kind === 'pause') {
      ui.pointerMove(touch.clientX, touch.clientY);
      return;
    }
    ui.pointerMove(touch.clientX, touch.clientY);
  });
  wx.onTouchEnd((event) => {
    const touch = event.changedTouches[0];
    if (!touch) return;
    if (current.kind === 'run' && !paused) {
      world?.releasePointer();
      // A still, quick tap is the overdrive trigger (the touch replacement for the DOM's click
      // on the od prompt); a second tap inside the double-tap window pauses the run.
      if (!tapDragged && Date.now() - tapDownAt < 300) {
        if (Date.now() - lastTapAt < 320) {
          lastTapAt = 0;
          pauseRun();
        } else {
          lastTapAt = Date.now();
          world?.session.world.tryOverdrive();
        }
      }
      return;
    }
    if (current.kind === 'pause') {
      ui.pointerUp(touch.clientX, touch.clientY);
      return;
    }
    ui.pointerUp(touch.clientX, touch.clientY);
  });

  const bg = DEFAULT_THEME.colors.bg;
  wrap.gl.clearColor(((bg >> 16) & 255) / 255, ((bg >> 8) & 255) / 255, (bg & 255) / 255, 1);

  function frame(now: number): void {
    const dt = Math.min(0.05, Math.max(0, (now - lastTime) / 1000));
    lastTime = now;
    if (current.kind === 'run' && world) {
      // The run renders itself, then the HUD overlay composites on top — its texture uploads
      // only when a displayed value changed (score ticks on hits, ~10 Hz, not per frame).
      world.frame(dt, now / 1000);
      const session = world.session;
      const dealt = Math.max(0, session.world.totalDamage - lastDamage);
      lastDamage = session.world.totalDamage;
      dps += (dealt / Math.max(dt, 1e-4) - dps) * (1 - Math.exp(-dt / 0.5));
      const sig = hudSignature(session, dps);
      if (sig !== hudSig) {
        hudSig = sig;
        drawHud(hudCtx, width, height, session, dps, DEFAULT_THEME.font);
        layer.upload();
      }
      wrap.bind(null);
      wrap.gl.viewport(0, 0, wrap.gl.drawingBufferWidth, wrap.gl.drawingBufferHeight);
      layer.draw();
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

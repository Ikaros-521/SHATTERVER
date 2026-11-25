import { clamp } from './core/math';
import { hashString, randomSeed, RNG } from './core/rng';
import { addRunRecord, loadSave, runRank, storeSave, type RunRecord, type SaveData, type Settings } from './core/storage';
import { AudioDirector } from './audio/director';
import { ARENA_W } from './game/config';
import { difficultyOf, type DifficultyId } from './game/difficulty';
import { UPGRADE_MAP } from './game/upgrades/defs';
import { CHAPTERS, COMBO_TIERS, REACTIONS } from './game/levels/definitions';
import type { RunMode } from './game/run';
import { Session } from './game/session';
import { STARTERS, type Starter } from './game/starters';
import type { UpgradeDef } from './game/upgrades/types';
import { RARITY_INFO, upgradeColor } from './game/upgrades/present';
import type { World } from './game/world';
import { Fx, particleCapacity, type FxSettings } from './render/fx';
import { computeLayout, type Layout, type QualityLevel } from './render/layout';
import { Renderer, type Palette } from './render/renderer';
import { drawScene, type SceneInfo } from './render/scene';
import { composeScorecard, saveScorecardPng, type BuildIcon, type ScorecardData } from './ui/scorecard';
import { UI, type UiActions } from './ui/ui';

/** Upgrades that make the title-screen demo spectacular. The attract mode draws its build from these. */
const DEMO_POOL = [
  'multiball',
  'split',
  'explosive',
  'fire',
  'shock',
  'frost',
  'void',
  'laser',
  'orbital',
  'homing',
  'mirror',
  'shatter',
  'solar',
  'meltdown',
  'chainreaction',
  'pierce',
  'crit',
  'timestop',
  'recursion',
];
const DEMO_LEVELS = [3, 4, 6, 7, 8, 9, 11, 12, 13, 14];

/**
 * The application: everything that connects the simulation to the real world.
 *
 * It owns one session at a time — the bot-driven attract mode behind the title screen, or the
 * player's run — and routes input, time, rendering, audio and UI between them. All game rules
 * live in `game/`; all drawing in `render/`; this class is only the wiring.
 */
export class App implements UiActions {
  readonly save: SaveData;
  readonly audio = new AudioDirector();
  readonly fx: Fx;
  readonly ui: UI;
  private readonly renderer: Renderer;

  private session: Session;
  private inRun = false;
  private paused = false;
  private worldWires: (() => void)[] = [];
  private sessionWires: (() => void)[] = [];
  private layout: Layout;
  private readonly info: SceneInfo = { danger: 0, energy: 0 };

  private lastTime = 0;
  private fps = 60;
  private dps = 0;
  private lastDamage = 0;
  /** Demo only: seconds until the bot picks a card, or restarts the attract loop. Negative when idle. */
  private demoTimer = -1;
  /** Seconds until the results screen appears, letting the death slow-motion play out. */
  private resultsTimer = -1;
  private lastRun: { mode: RunMode; starter: Starter; difficulty: DifficultyId } | null = null;
  private autopilot = false;
  private autoPauseOnBlur = true;
  private frozen = false;
  /** False for runs opened at a deeper level through the debug hook: they must not touch records. */
  private scoring = true;
  /** Which records the just-finished run set, shown on the results screen and the share card. */
  private lastFresh: string[] = [];
  /**
   * The quality actually in effect. Starts at the saved preference, but the auto-stepper may
   * drop it for the session on devices that cannot keep up (phones); the saved value is untouched.
   */
  private quality: QualityLevel;
  /** Consecutive over-budget frames; sustained struggle steps the quality down a notch. */
  private slowFrames = 0;

  /** Handle for automated inspection and for setting up specific builds while tuning. Exposed on `window`. */
  readonly debug = {
    /** Uncaught errors and rejections, collected by `main.ts`. Should stay empty. */
    errors: [] as unknown[],
    advance: (seconds: number): void => this.advance(seconds),
    grant: (id: string, levels = 1): boolean => this.session.grant(id, levels),
    state: (): Record<string, unknown> => this.snapshot(),
    /** Starts a run, optionally at a deeper level so a build can be watched against a full wall. */
    start: (
      mode: RunMode = 'campaign',
      starter = 'blank',
      level = 1,
      build?: Record<string, number>,
    ): void => {
      const pick = this.starterById(starter);
      if (!pick) return;
      // A build passed here is in place before the first level opens, so ball count and the like are right from the start.
      const withBuild = build ? { ...pick, grants: { ...pick.grants, ...build } } : pick;
      this.startRun(mode, withBuild, undefined, Math.max(1, Math.floor(level)));
    },
    toMenu: (): void => this.quitToMenu(),
    /** Level of the final audio mix right now, or null before audio has been unlocked by a gesture. */
    audio: (): { status: string; peak: number; rms: number } | null => {
      const level = this.audio.probe();
      return level
        ? { status: this.audio.status, peak: +level.peak.toFixed(3), rms: +level.rms.toFixed(4) }
        : null;
    },
    /** Halts simulation and effects while still drawing, so an exact frame can be inspected. */
    freeze: (on: boolean): void => {
      this.frozen = on;
    },
    /** Pausing when the window loses focus is on by default; off for unattended test runs. */
    autoPause: (enabled: boolean): void => {
      this.autoPauseOnBlur = enabled;
    },
    /** Lets the built-in bot steer the paddle in the current run. For hands-free demos and tests. */
    autopilot: (on: boolean): void => {
      this.autopilot = on;
      this.session.world.bot = on;
    },
    /** Drains the shield of a scoring run so the results flow can be exercised without playing it out. */
    lose: (): { hits: number; hp: number; state: string } => {
      const world = this.session.world;
      let hits = 0;
      for (let guard = 0; world.state === 'playing' && guard < 100; guard++) {
        const before = world.hp;
        world.damagePlayer(1);
        if (world.hp !== before) hits++;
        if (world.state === 'playing') this.advance(1.05); // wait out the invulnerability window
      }
      return { hits, hp: world.hp, state: world.state };
    },
    /**
     * Composes the share card from the current run without downloading it. Returns its metrics
     * and data URL so automation can inspect the picture; heavy use is only meant for tests.
     */
    scorecard: async (): Promise<{ width: number; height: number; bytes: number; url: string } | null> => {
      this.render(performance.now() / 1000);
      const url = await composeScorecard(this.scorecardData(), this.renderer.snapshot());
      return url ? { width: 1080, height: 1440, bytes: url.length, url } : null;
    },
  };

  constructor(canvas: HTMLCanvasElement) {
    this.save = loadSave();
    this.quality = this.save.settings.quality;
    this.renderer = new Renderer(canvas, { surfaces: 16384, lights: 46000, glyphs: 4096 });
    this.fx = new Fx(particleCapacity(this.quality), this.fxSettings());
    this.audio.setVolumes(this.save.settings.music, this.save.settings.sfx);
    this.ui = new UI(this, this.audio, this.save);
    this.layout = computeLayout(
      window.innerWidth,
      window.innerHeight,
      this.save.settings.quality,
      window.devicePixelRatio || 1,
    );
    this.session = this.createDemo();
    this.adopt(this.session, true);
    this.bindInput();
  }

  start(): void {
    this.ui.showMenu();
    this.lastTime = performance.now();
    requestAnimationFrame(this.frame);
  }

  // ───────────────────────────── session lifecycle ─────────────────────────────

  private fxSettings(): FxSettings {
    const s = this.save.settings;
    return { shake: s.shake, flashes: s.flashes, quality: this.quality };
  }

  private starterById(id: string): Starter | null {
    return STARTERS.find((starter) => starter.id === id) ?? null;
  }

  /** A bot-driven run with a flashy random build, started a few sectors in so the screen is full from the first second. */
  private createDemo(): Session {
    const rng = new RNG(randomSeed());
    const grants: Record<string, number> = {};
    for (const id of rng.shuffle([...DEMO_POOL]).slice(0, rng.int(9, 13))) grants[id] = rng.int(1, 2);
    const starter: Starter = { id: 'demo', name: '', en: '', desc: '', color: 0, grants, crystals: 0 };
    return new Session('endless', randomSeed(), { bot: true, starter, level: rng.pick(DEMO_LEVELS) });
  }

  private adopt(session: Session, demo: boolean): void {
    this.dropSessionWires();
    this.session = session;
    this.inRun = !demo;
    this.paused = false;
    this.resultsTimer = -1;
    this.demoTimer = -1;
    this.ui.resetHud();
    this.listen(session, demo);
  }

  private listen(session: Session, demo: boolean): void {
    this.wireWorld(session.world, demo);
    this.sessionWires.push(
      session.events.on('level', () => this.onLevel(session, demo)),
      session.events.on('draft', (info) => {
        if (!demo) this.noteOffered(info.options);
        if (demo) {
          this.demoTimer = 0.6;
          return;
        }
        this.ui.showDraft(info, session);
        this.audio.setMusicDuck(0.55, 0.4);
      }),
      session.events.on('pick', ({ def }) => {
        if (demo) return;
        this.noteOffered([def]);
        this.audio.ui('pick', RARITY_INFO[def.rarity].rank);
      }),
      session.events.on('phase', ({ phase }) => {
        if (!this.inRun) return;
        if (phase === 'over' || phase === 'won') this.resultsTimer = 1.1;
      }),
    );
  }

  private onLevel(session: Session, demo: boolean): void {
    this.wireWorld(session.world, demo);
    if (demo) return;
    this.audio.setMusicDuck(1, 0.4);
    this.ui.showPlay();
    this.ui.announceLevel(session);
  }

  /** Connects one world to effects and sound, and (for real runs) to the HUD call-outs. */
  private wireWorld(world: World, demo: boolean): void {
    this.dropWorldWires();
    this.fx.clear();
    this.worldWires.push(this.fx.attach(world), this.audio.attach(world));
    if (this.autopilot) world.bot = true;
    if (!demo) this.worldWires.push(this.wireCallouts(world));
    this.lastDamage = world.totalDamage;
    this.dps = 0;
  }

  /** Announcements that are about the interface rather than the world: banners and toasts. */
  private wireCallouts(world: World): () => void {
    const whenPlaying = (fn: () => void): void => {
      if (this.inRun && !this.paused) fn();
    };
    const off = [
      world.events.on('comboTier', ({ tier }) =>
        whenPlaying(() => {
          const info = COMBO_TIERS[tier];
          if (info)
            this.ui.banner({
              title: info.name,
              sub: info.cn,
              color: info.color,
              small: true,
              duration: 1.1,
              key: 'tier',
            });
        }),
      ),
      world.events.on('paddle', ({ perfect }) =>
        whenPlaying(() => {
          if (perfect)
            this.ui.banner({
              title: 'PERFECT',
              sub: '完美接球',
              color: 0x7dffe0,
              small: true,
              duration: 0.75,
              key: 'perfect',
            });
        }),
      ),
      world.events.on('reaction', ({ id, first }) =>
        whenPlaying(() => {
          const info = REACTIONS.find((r) => r.id === id);
          if (first && info)
            this.ui.toast(`元素反应 · ${info.name}`, `${info.recipe}：${info.desc}`, info.color);
        }),
      ),
      world.events.on('boss', ({ phase }) =>
        whenPlaying(() => {
          const boss = world.boss;
          if (phase === 'die')
            this.ui.banner({ title: 'BOSS DOWN', sub: '首领击破', color: 0xffd24a, duration: 2 });
          else if (phase === 'enrage')
            this.ui.banner({
              title: 'ENRAGED',
              sub: 'BOSS 狂暴',
              color: 0xff3d5a,
              small: true,
              duration: 1.3,
              key: 'boss',
            });
          else if (boss)
            this.ui.banner({
              title: `PHASE ${boss.phase}`,
              sub: `阶段 ${boss.phase}`,
              color: 0xff2fb0,
              small: true,
              duration: 1.1,
              key: 'boss',
            });
        }),
      ),
      world.events.on('overdrive', (phase) =>
        whenPlaying(() => {
          if (phase === 'start')
            this.ui.banner({
              title: 'OVERDRIVE',
              sub: '超载',
              color: 0x9ff3ff,
              small: true,
              duration: 1,
              key: 'od',
            });
        }),
      ),
      world.events.on('timeStop', (phase) =>
        whenPlaying(() => {
          if (phase === 'start')
            this.ui.banner({
              title: 'TIME STOP',
              sub: '时停',
              color: 0xcfe6ff,
              small: true,
              duration: 1.1,
              key: 'ts',
            });
        }),
      ),
      world.events.on('clear', () =>
        whenPlaying(() => this.ui.banner({ title: 'SECTOR CLEAR', sub: '关卡清除', duration: 1.5 })),
      ),
    ];
    return () => {
      for (const fn of off) fn();
    };
  }

  private dropWorldWires(): void {
    for (const fn of this.worldWires) fn();
    this.worldWires = [];
  }

  private dropSessionWires(): void {
    for (const fn of this.sessionWires) fn();
    this.sessionWires = [];
    this.dropWorldWires();
  }

  // ───────────────────────────── run control (called by the UI) ─────────────────────────────

  startRun(mode: RunMode, starter: Starter, difficulty: DifficultyId = 'standard', level = 1): void {
    this.audio.unlock();
    this.lastRun = { mode, starter, difficulty };
    this.scoring = level <= 1;
    const session = new Session(mode, this.resolveSeed(), { starter, level, difficulty: difficultyOf(difficulty) });
    this.ui.clearCallouts();
    this.adopt(session, false);
    if (this.scoring) {
      this.save.records.runs++;
      storeSave(this.save);
    }
    session.start();
  }

  /** A fixed seed makes every run with the same choices identical: levels and drafts are both derived from it. */
  private resolveSeed(): number {
    const text = this.save.settings.seed.trim();
    if (!text) return randomSeed();
    return /^\d{1,10}$/.test(text) ? Number(text) >>> 0 : hashString(text);
  }

  resume(): void {
    if (!this.paused) return;
    this.audio.unlock();
    this.paused = false;
    this.ui.showPlay();
    this.audio.setMusicDuck(1, 0.3);
  }

  pause(): void {
    if (!this.canPause()) return;
    this.paused = true;
    this.session.world.input.x = null;
    this.ui.showPause(this.session);
    this.audio.setMusicDuck(0.3, 0.2);
  }

  quitToMenu(): void {
    this.ui.clearCallouts();
    this.lastRun = null;
    this.adopt(this.createDemo(), true);
    this.ui.showMenu();
    this.audio.setMusicDuck(1, 0.5);
  }

  retry(): void {
    if (this.lastRun) this.startRun(this.lastRun.mode, this.lastRun.starter, this.lastRun.difficulty);
    else this.quitToMenu();
  }

  choose(id: string): void {
    // The session emits the next 'level' event, which is what returns the UI to play.
    this.session.choose(id);
  }

  reroll(): void {
    this.audio.ui(this.session.reroll() ? 'uiClick' : 'deny');
  }

  skip(): void {
    this.session.skip();
  }

  overdrive(): void {
    this.audio.unlock();
    this.session.world.tryOverdrive();
  }

  updateSettings(patch: Partial<Settings>): void {
    Object.assign(this.save.settings, patch);
    if (patch.quality) this.quality = patch.quality;
    storeSave(this.save);
    this.audio.setVolumes(this.save.settings.music, this.save.settings.sfx);
    this.fx.applySettings(this.fxSettings());
  }

  private canPause(): boolean {
    return this.inRun && !this.paused && this.session.phase === 'playing';
  }

  private isPlaying(): boolean {
    return this.inRun && !this.paused && this.session.phase === 'playing';
  }

  private noteOffered(defs: UpgradeDef[]): void {
    const known = this.save.records.discovered;
    let changed = false;
    for (const def of defs) {
      if (!known.includes(def.id)) {
        known.push(def.id);
        changed = true;
      }
    }
    if (changed) storeSave(this.save);
  }

  private finishRun(won: boolean): void {
    const run = this.session.run;
    const records = this.save.records;
    const fresh: string[] = [];
    if (!this.scoring) {
      this.lastFresh = [];
      this.audio.setMusicDuck(0.5, 0.8);
      this.ui.showResults(this.session, won, fresh, null);
      return;
    }
    // A loss on level N "reached" N; a win cleared the last level.
    const reached = won ? run.level : run.levelsCleared + 1;
    const best = run.mode === 'campaign' ? 'bestCampaign' : 'bestEndless';
    if (reached > records[best]) {
      records[best] = reached;
      fresh.push('level');
    }
    const score = Math.round(run.score);
    if (score > records.bestScore) {
      records.bestScore = score;
      fresh.push('score');
    }
    if (won) records.wins++;
    records.bricks += run.kills;
    // Local leaderboard: every scoring run lands in the history, and its rank is what the
    // results screen and share card quote.
    const world = this.session.world;
    const record: RunRecord = {
      mode: run.mode,
      difficulty: run.difficulty,
      score,
      level: reached,
      code: run.mode === 'campaign' ? world.level.code : String(run.level),
      name: world.level.name,
      combo: run.maxCombo,
      damage: Math.round(run.totalDamage),
      kills: run.kills,
      time: run.time,
      won,
      date: Date.now(),
      seed: run.seed,
      build: { ...run.upgrades },
    };
    addRunRecord(records, record);
    storeSave(this.save);
    this.lastFresh = fresh;
    this.audio.setMusicDuck(0.5, 0.8);
    const sameMode = records.history.filter((entry) => entry.mode === run.mode);
    this.ui.showResults(this.session, won, fresh, { rank: runRank(sameMode, score), total: sameMode.length });
  }

  // ───────────────────────────── score card ─────────────────────────────

  /** The finished run as the share card wants it. */
  private scorecardData(): ScorecardData {
    const run = this.session.run;
    const world = this.session.world;
    const won = this.session.phase === 'won';
    const chapter = CHAPTERS[world.level.chapter] ?? CHAPTERS[0];
    const history = this.save.records.history.filter((entry) => entry.mode === run.mode);
    const build: BuildIcon[] = Object.entries(run.upgrades)
      .map(([id, level]) => ({ def: UPGRADE_MAP[id], level }))
      .filter((entry): entry is { def: UpgradeDef; level: number } => entry.def !== undefined && entry.level > 0)
      .sort(
        (a, b) =>
          RARITY_INFO[b.def.rarity].rank - RARITY_INFO[a.def.rarity].rank || a.def.id.localeCompare(b.def.id),
      )
      .map(({ def, level }) => ({
        id: def.id,
        level,
        color: upgradeColor(def.tags, def.rarity),
        rarityColor: RARITY_INFO[def.rarity].color,
      }));
    const score = Math.round(run.score);
    return {
      won,
      mode: run.mode,
      code: run.mode === 'campaign' ? world.level.code : String(run.level),
      name: world.level.name,
      score,
      newRecord: this.lastFresh.includes('score'),
      rank: runRank(history, score),
      total: history.length,
      level: won ? run.levelsCleared : run.levelsCleared + 1,
      combo: run.maxCombo,
      damage: Math.round(run.totalDamage),
      kills: run.kills,
      time: run.time,
      date: Date.now(),
      seed: run.seed,
      accent: chapter.accent,
      build,
    };
  }

  /**
   * Renders the score card over the last game frame and downloads it as a PNG.
   * The frame has to be captured in the same task that renders it, hence the explicit render first.
   */
  async downloadScorecard(): Promise<boolean> {
    const phase = this.session.phase;
    if (!this.inRun || (phase !== 'over' && phase !== 'won')) return false;
    this.render(performance.now() / 1000);
    return saveScorecardPng(this.scorecardData(), this.renderer.snapshot());
  }

  // ───────────────────────────── input ─────────────────────────────

  private bindInput(): void {
    window.addEventListener('pointermove', (event) => {
      if (!this.isPlaying()) return;
      // Map the pointer through the settled arena rect, not the shaken view: the paddle must track the hand exactly.
      const x = (event.clientX - this.layout.ax) / (this.layout.aw / ARENA_W);
      this.session.world.input.x = clamp(x, 0, ARENA_W);
    });
    window.addEventListener('pointerdown', (event) => {
      this.audio.unlock();
      // A click fires overdrive: there is nothing else a click could mean mid-game. Touch is excluded,
      // because on a touch screen a tap is how the paddle is positioned; the prompt button covers that case.
      if (this.isPlaying() && event.pointerType === 'mouse' && (event.button === 0 || event.button === 2)) {
        this.session.world.tryOverdrive();
      }
    });
    window.addEventListener('contextmenu', (event) => event.preventDefault());
    window.addEventListener('keydown', (event) => this.onKeyDown(event));
    window.addEventListener('keyup', (event) => this.onKeyUp(event));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.pause();
    });
    window.addEventListener('blur', () => {
      // The mouse is the controller: the instant the window loses focus the paddle would stop
      // responding, so the game stops too rather than letting bricks sink unattended.
      if (this.autoPauseOnBlur) this.pause();
    });
  }

  private onKeyDown(event: KeyboardEvent): void {
    this.audio.unlock();
    const world = this.session.world;
    const key = event.code;
    const draft = this.inRun && this.session.phase === 'draft';

    if (key === 'Space') {
      event.preventDefault();
      if (this.isPlaying()) world.tryOverdrive();
      else if (this.paused && this.ui.screen === 'pause') this.resume();
      return;
    }
    if (key === 'Escape' || key === 'KeyP') {
      if (this.canPause()) {
        event.preventDefault();
        this.pause();
      } else if (this.paused && this.ui.screen === 'pause') {
        event.preventDefault();
        this.resume();
      }
      return;
    }
    if (draft) {
      // Number keys pick, R rerolls, S skips: the draft is fully playable from the keyboard.
      if (key === 'Digit1' || key === 'Digit2' || key === 'Digit3') {
        const option = this.session.draft[Number(key.slice(-1)) - 1];
        if (option) this.choose(option.id);
      } else if (key === 'KeyR') this.reroll();
      else if (key === 'KeyS') this.skip();
      return;
    }
    if (!this.isPlaying()) return;
    if (key === 'ArrowLeft' || key === 'KeyA') {
      event.preventDefault();
      world.input.left = true;
      world.input.x = null;
    } else if (key === 'ArrowRight' || key === 'KeyD') {
      event.preventDefault();
      world.input.right = true;
      world.input.x = null;
    }
  }

  private onKeyUp(event: KeyboardEvent): void {
    const input = this.session.world.input;
    if (event.code === 'ArrowLeft' || event.code === 'KeyA') input.left = false;
    if (event.code === 'ArrowRight' || event.code === 'KeyD') input.right = false;
  }

  // ───────────────────────────── main loop ─────────────────────────────

  private frame = (now: number): void => {
    const rawMs = now - this.lastTime;
    const dt = Math.min(0.05, Math.max(0, rawMs / 1000));
    this.lastTime = now;
    if (dt > 0) this.fps += (1 / dt - this.fps) * 0.05;

    // Phones are the weakest hardware this runs on: hand the real frame duration to the audio
    // director (a struggling device gets a thinner mix) and step the quality down if it persists.
    this.audio.hintLoad(Math.min(rawMs, 100));
    this.tickQuality(rawMs);

    this.layout = computeLayout(
      window.innerWidth,
      window.innerHeight,
      this.quality,
      window.devicePixelRatio || 1,
    );
    this.ui.applyLayout(this.layout);

    if (!this.paused && !this.frozen) {
      const world = this.session.world;
      const timeScale = this.fx.update(dt, world);
      this.session.update(dt * timeScale);
      this.tick(dt);
      // Damage per second as a short exponential average: it should jump on a burst and settle quickly.
      const dealt = Math.max(0, world.totalDamage - this.lastDamage);
      this.lastDamage = world.totalDamage;
      this.dps += (dealt / Math.max(dt, 1e-4) - this.dps) * (1 - Math.exp(-dt / 0.5));
    }

    if (this.inRun && (this.ui.inPlay || this.paused)) this.ui.frame(this.session, this.dps, now);

    const resting =
      !this.inRun ||
      this.paused ||
      this.session.phase === 'draft' ||
      this.resultsTimer >= 0 ||
      this.ui.screen === 'over';
    this.audio.update(resting ? (this.inRun ? 'quiet' : 'menu') : 'play', this.session.world, !this.inRun);

    this.render(now / 1000);
    requestAnimationFrame(this.frame);
  };

  /**
   * The auto-stepper: on a device that cannot hold the frame budget, drop the quality a notch
   * (render resolution and FX load both follow it) until it can. Session-only — the saved
   * preference is never rewritten, and the player is told what happened.
   */
  private tickQuality(rawMs: number): void {
    if (rawMs > 34) this.slowFrames++;
    else this.slowFrames = Math.max(0, this.slowFrames - 2);
    if (this.slowFrames < 240 || this.quality === 'low') return;
    this.slowFrames = 0;
    this.quality = this.quality === 'high' ? 'medium' : 'low';
    this.fx.applySettings(this.fxSettings());
    this.ui.toast(
      '画质已自动降低',
      `切换到「${this.quality === 'medium' ? '中' : '低'}」以保持流畅，可在设置里改回`,
      0xffd24a,
    );
  }

  /** Timers that are about flow rather than simulation. */
  private tick(dt: number): void {    if (!this.inRun) {
      if (this.session.phase !== 'playing') {
        if (this.demoTimer < 0) this.demoTimer = 2.2;
        else if ((this.demoTimer -= dt) <= 0) this.adopt(this.createDemo(), true);
      } else if (this.demoTimer >= 0 && (this.demoTimer -= dt) <= 0) {
        this.demoTimer = -1;
        this.session.autoPick();
      }
      return;
    }
    if (this.resultsTimer > 0 && (this.resultsTimer -= dt) <= 0) {
      this.resultsTimer = -1;
      this.finishRun(this.session.phase === 'won');
    }
  }

  private render(time: number): void {
    const world = this.session.world;
    const chapter = CHAPTERS[world.level.chapter] ?? CHAPTERS[0];
    const view = this.fx.camera.view(this.layout);
    this.fx.resolveView(view);
    const palette: Palette = { a: chapter.bg[0], b: chapter.bg[1], c: chapter.bg[2], accent: chapter.accent };
    this.renderer.pen.reset();
    drawScene(this.renderer.pen, world, this.fx, chapter, time, this.info);
    this.renderer.render({ layout: this.layout, time, palette, view, post: this.fx.post, info: this.info });
  }

  // ───────────────────────────── debug hooks ─────────────────────────────

  /**
   * Steps the simulation without waiting for real time, then draws one frame.
   *
   * For automated checks and for jumping to an interesting state while tuning: requestAnimationFrame
   * is throttled in background tabs, so tests drive the game through here instead.
   */
  private advance(seconds: number): void {
    const step = 1 / 60;
    for (let left = Math.min(seconds, 120); left > 1e-6; left -= step) {
      if (this.paused || this.frozen) break;
      const world = this.session.world;
      const timeScale = this.fx.update(step, world);
      this.session.update(step * timeScale);
      this.tick(step);
    }
    this.render(performance.now() / 1000);
  }

  private snapshot(): Record<string, unknown> {
    const world = this.session.world;
    return {
      mode: this.inRun ? 'run' : 'demo',
      paused: this.paused,
      screen: this.ui.screen,
      difficulty: this.session.run.difficulty,
      fps: Math.round(this.fps),
      quality: this.quality,
      level: world.level.code,
      levelIndex: this.session.run.level,
      state: world.state,
      sessionPhase: this.session.phase,
      time: +world.time.toFixed(2),
      hp: world.hp,
      bricks: world.bricks.length,
      brickTotal: world.brickTotal,
      killed: world.killed,
      balls: world.balls.length,
      combo: world.combo,
      paddleX: Math.round(world.paddle.x),
      energy: +world.energy.toFixed(1),
      overdrive: world.odActive,
      timeStop: +world.timeStop.toFixed(2),
      boss: world.boss
        ? {
            name: world.boss.def.name,
            hp: Math.round(world.boss.hp),
            max: Math.round(world.boss.maxHp),
            phase: world.boss.phase,
          }
        : null,
      crystals: this.session.run.crystals,
      score: Math.round(this.session.run.score),
      dps: Math.round(this.dps),
      build: this.session.run.upgrades,
      draft: this.session.draft.map((def) => def.id),
      particles: this.fx.particles.alive,
      draw: { ...this.renderer.stats },
      hdr: this.renderer.gl.hdr,
      audio: this.audio.status,
    };
  }
}

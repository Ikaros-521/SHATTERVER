import { FrameTimes } from './core/frametimes';
import { applyDom, setLang, t } from './core/i18n';
import { clamp } from './core/math';
import { hashString, randomSeed, RNG } from './core/rng';
import {
  addRunRecord,
  loadSave,
  runRank,
  storeSave,
  type RunRecord,
  type SaveData,
  type Settings,
} from './core/storage';
import { AudioDirector } from './audio/director';
import { ARENA_W } from './game/config';
import { difficultyOf, type DifficultyId } from './game/difficulty';
import { BUFF_MAP, isBuffId } from './game/buffs/defs';
import { buffColor } from './game/buffs/present';
import { UPGRADE_MAP } from './game/upgrades/defs';
import { CHAPTERS, COMBO_TIERS, REACTIONS } from './game/levels/definitions';
import type { Run, RunMode } from './game/run';
import { Session } from './game/session';
import { STARTERS, type Starter } from './game/starters';
import {
  PROTOCOL_MAP,
  SUPPLY_MAP,
  isSupplyId,
  slotLimit,
  supplyCost,
} from './game/economy/catalog';
import {
  FIRST_GIFT,
  FIRST_USE_REWARD,
  applyDailyHalving,
  dayKey,
  runCoins,
} from './game/economy/coins';
import { SWIFT_SECONDS, settleMilestones } from './game/economy/milestones';
import { advanceDaily, doubleFirstRun, rollDaily } from './game/economy/dailies';
import {
  buffName,
  buffShort,
  comboTierLabel,
  reactionDesc,
  reactionName,
  reactionRecipe,
} from './i18n/content';
import type { UpgradeDef } from './game/upgrades/types';
import { RARITY_INFO, upgradeColor } from './game/upgrades/present';
import type { World } from './game/world';
import { Fx, particleCapacity, type FxSettings } from './render/fx';
import { isLighter, QualityGovernor, tierLabel, tierOf, type Tier } from './render/governor';
import { computeLayout, type Layout } from './render/layout';
import { Renderer, type Palette } from './render/renderer';
import { drawScene, type BallSkinOverride, type SceneInfo } from './render/scene';
import {
  applyBgSkin,
  canBuySkin,
  canEquipSkin,
  isBallSkinId,
  isBgSkinId,
  SKIN_MAP,
  type BgSkinDef,
  type SkinKind,
} from './render/skins';
import { CheddaBoards } from './net/cheddaboards';
import { Cloud } from './net/cloud';
import { CLOUD_CONFIG, cloudEnabled } from './net/config';
import { loadIdentity, storeIdentity } from './net/identity';
import type { Leaderboard } from './net/leaderboard';
import { isToyEnvironment, loadToySdk } from './net/toy';
import { ToyChannel } from './net/toychannel';
import { composeScorecard, saveScorecardPng, type BuildIcon, type ScorecardData } from './ui/scorecard';
import { UI, type EconomyPayout, type PerfInfo, type UiActions } from './ui/ui';

/** Minimum spacing between redraws of a screen where nothing moves (paused, drafting, over). */
const IDLE_FRAME_MS = 66;

/** Delay before the first background retry of a failed score submit; doubles each round, capped. */
const SUBMIT_RETRY_FIRST_MS = 45_000;
const SUBMIT_RETRY_MAX_MS = 15 * 60_000;
/** Failed submits kept for the background retry. Older ones drop; the local history keeps them. */
const SUBMIT_RETRY_QUEUE_MAX = 3;
/** A double-click on the reroll button must not spend crystals twice; the R key shares the cadence. */
const REROLL_DEBOUNCE_MS = 300;

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
  // The newer, louder cards, so capsules and their resonance are part of the show.
  'thunderhead',
  'prism',
  'plague',
  'wildfire',
  'afterglow',
  'twinresonance',
  'resonator',
  'adrenaline',
];
const DEMO_LEVELS = [3, 4, 6, 7, 8, 9, 11, 12, 13, 14];

/**
 * Builds the cloud service from the stored identity. The save callback is the only place the
 * identity is written, so a rename and the persisted copy can never disagree.
 *
 * A Toy build (`__TOY__`) never constructs this: the platform package must not talk to any
 * third-party service, and dead-code elimination removes the Chedda client from the bundle.
 */
function createCloud(): Cloud {
  const identity = loadIdentity();
  return new Cloud({
    client: new CheddaBoards({ gameId: CLOUD_CONFIG.gameId, apiKey: CLOUD_CONFIG.apiKey }),
    playerId: identity.playerId,
    nickname: identity.nickname,
    pending: identity.pending,
    scored: identity.scored,
    save: (nickname, pending, scored) => {
      identity.nickname = nickname;
      identity.pending = pending;
      identity.scored = scored;
      storeIdentity(identity);
    },
  });
}

/**
 * Builds the B站 Toy channel when the game runs as a Bilibili Toy (see `isToyEnvironment`). The
 * platform is the identity provider there (the player's B站 nickname, Chinese included), so the
 * Chedda identity flow does not apply.
 *
 * The channel deliberately gets no Chedda client: the「全球榜」mirror tab is a read of an external
 * leaderboard, which the platform package must not advertise or call. The tab disappears with it.
 */
function createToyChannel(): ToyChannel {
  // The SDK has to load and shake hands with the Toy shell before its first call. Start that now,
  // as a static SDK tag in `index.html` would, rather than at the click that opens the board or
  // the submit that ends a run.
  void loadToySdk();
  return new ToyChannel();
}

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
  /**
   * The cloud leaderboard mirror, or null when the feature is off. The backing service is picked
   * once, by environment: a Bilibili Toy package talks to the Toy boards, everything else talks to
   * CheddaBoards — see `net/leaderboard.ts`.
   */
  readonly cloud: Leaderboard | null;
  private readonly renderer: Renderer;
  /** The WebGL canvas, kept for the context-loss listeners bound in `bindInput`. */
  private readonly canvas: HTMLCanvasElement;

  private session: Session;
  private inRun = false;
  private paused = false;
  private worldWires: (() => void)[] = [];
  private sessionWires: (() => void)[] = [];
  /** Assigned by `refreshLayout`, which the constructor calls before anything reads it. */
  private layout!: Layout;
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
   * The run whose cloud upload is still in flight. Outcomes are matched to their own run by
   * reference (every run builds a fresh `RunRecord`), so browsing other screens cannot lose a
   * settled upload and a late answer cannot land on the next run's results.
   */
  private lastCloudRecord: RunRecord | null = null;
  /**
   * Finished runs whose cloud submit failed (offline, rate limit, dead service). They are retried
   * in the background — the local history already keeps the score, this only closes the gap to
   * the board — and bounded so a long offline stretch cannot pile work up.
   */
  private readonly pendingSubmits: RunRecord[] = [];
  /** Timer for the next background retry round; null while none is scheduled. */
  private submitRetryTimer: ReturnType<typeof setTimeout> | null = null;
  /** Delay before the next retry round. Grows per failed round; rate limits answer to patience. */
  private submitRetryDelayMs = 0;
  /** True while a retry round is on the wire, so a fresh submit's flush cannot re-enter it. */
  private flushingSubmits = false;
  /** When the last reroll was accepted; a second click inside the window is ignored. */
  private lastRerollAt = -REROLL_DEBOUNCE_MS;
  /** The render step in effect: the player's choice, or lower while this device cannot keep up. */
  private readonly governor: QualityGovernor;
  /** Recent frame durations. Feeds the governor and the performance readout. */
  private readonly frameTimes = new FrameTimes();
  /** When the last frame was drawn. Idle screens are redrawn at a low rate (see `frame`). */
  private lastRender = 0;

  /** Handle for automated inspection and for setting up specific builds while tuning. Exposed on `window`. */
  readonly debug = {
    /** Uncaught errors and rejections, collected by `main.ts`. Should stay empty. */
    errors: [] as unknown[],
    advance: (seconds: number): void => this.advance(seconds),
    grant: (id: string, levels = 1): boolean => this.session.grant(id, levels),
    /** Grants a temporary buff in the level being played, as if its capsule had been collected. */
    buff: (id: string): boolean => isBuffId(id) && this.session.world.activateBuff(id),
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
    /**
     * GPU time of each render pass in ms (median over `frames` redraws of the current view),
     * plus `total`. Every pass is read back and waited on, so the pipeline stalls: for diagnosis
     * on real hardware, never during normal play.
     */
    profile: (frames = 12): Record<string, number> | null => this.profileGpu(frames),
    /** Frame-rate figures over the last few seconds, and the render step currently in effect. */
    perf: (): PerfInfo => this.perf(),
    /** Cloud identity and nickname state, or null when this build has no cloud credentials. */
    cloud: (): Record<string, unknown> | null =>
      this.cloud
        ? {
            kind: this.cloud.kind,
            playerId: this.cloud.playerId,
            nickname: this.cloud.nickname,
            pending: this.cloud.nicknamePending,
          }
        : null,
    /** The 星尘 wallet, purchases, loadout and milestone progress. For tests and tuning. */
    economy: (): Record<string, unknown> => ({ ...this.save.economy }),
  };

  constructor(canvas: HTMLCanvasElement) {
    this.save = loadSave();
    // A save from before the shop existed settles its milestones on first launch: progress
    // already sitting on the records pays out once, and never again (earned ids are remembered).
    const retro = settleMilestones(this.save.records, this.save.economy);
    if (retro.reward > 0) {
      this.save.economy.stardust += retro.reward;
      this.save.economy.lifetime += retro.reward;
      storeSave(this.save);
    }
    this.canvas = canvas;
    const toy = isToyEnvironment();
    // `__TOY__` is a build-time constant for the platform package: it forces the Toy channel and
    // lets the bundler drop the Chedda client (no third-party service in that package).
    this.cloud = __TOY__ ? createToyChannel() : toy || cloudEnabled() ? (toy ? createToyChannel() : createCloud()) : null;
    // Start where the player asked — unless this device has already proven that is too much.
    const wanted = tierOf(this.save.settings.quality);
    const learned = this.save.device;
    const start = learned && isLighter(learned, wanted) ? learned : wanted;
    this.governor = new QualityGovernor(wanted, start);
    this.renderer = new Renderer(canvas, { surfaces: 16384, lights: 46000, glyphs: 4096 });
    this.fx = new Fx(particleCapacity(this.governor.current.quality), this.fxSettings());
    this.audio.setVolumes(this.save.settings.music, this.save.settings.sfx);
    this.ui = new UI(this, this.audio, this.save);
    this.refreshLayout();
    this.session = this.createDemo();
    this.adopt(this.session, true);
    this.bindInput();
  }

  start(): void {
    // The saved language drives both the module state and the static markup before the first screen.
    setLang(this.save.settings.language);
    applyDom();
    this.ui.showMenu();
    this.primeToyIdentity();
    this.lastTime = performance.now();
    requestAnimationFrame(this.frame);
  }

  /**
   * Resolves the player's identity as early as possible on the B站 Toy channel, so the
   * leaderboard screen already knows who is playing when it opens. The platform's
   * `getUserProfile` needs a user gesture for its first-use consent dialog, and boot has none —
   * so the first attempt fires while the SDK handshake may still answer on its own, and the next
   * two gestures (any click) retry it. Missing every window costs nothing: the leaderboard
   * screen fetches on open, inside its own click, exactly as before.
   */
  private primeToyIdentity(): void {
    const cloud = this.cloud;
    if (!cloud || cloud.kind !== 'toy' || !cloud.loadNickname) return;
    // Bound: the method is stored and called later, and a bare `cloud.loadNickname` would run
    // with `this` undefined and throw on its first line.
    const loadNickname = cloud.loadNickname.bind(cloud);
    let gestures = 0;
    const retry = (): void => {
      if (cloud.nickname || gestures >= 2) {
        document.removeEventListener('pointerdown', retry);
        return;
      }
      gestures += 1;
      void loadNickname();
    };
    void loadNickname(); // Boot attempt: the SDK handshake may already have an answer.
    document.addEventListener('pointerdown', retry);
  }

  // ───────────────────────────── session lifecycle ─────────────────────────────

  private fxSettings(): FxSettings {
    const s = this.save.settings;
    return { shake: s.shake, flashes: s.flashes, quality: this.governor.current.quality };
  }

  private starterById(id: string): Starter | null {
    return STARTERS.find((starter) => starter.id === id) ?? PROTOCOL_MAP[id] ?? null;
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
              sub: comboTierLabel(tier),
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
              sub: t('callouts.perfectSub'),
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
            this.ui.toast(
              t('callouts.reactionToast', { name: reactionName(info) }),
              t('callouts.reactionDetail', { recipe: reactionRecipe(info), desc: reactionDesc(info) }),
              info.color,
            );
        }),
      ),
      world.events.on('boss', ({ phase }) =>
        whenPlaying(() => {
          const boss = world.boss;
          if (phase === 'die')
            this.ui.banner({
              title: 'BOSS DOWN',
              sub: t('callouts.bossDownSub'),
              color: 0xffd24a,
              duration: 2,
            });
          else if (phase === 'enrage')
            this.ui.banner({
              title: 'ENRAGED',
              sub: t('callouts.enragedSub'),
              color: 0xff3d5a,
              small: true,
              duration: 1.3,
              key: 'boss',
            });
          else if (boss)
            this.ui.banner({
              title: `PHASE ${boss.phase}`,
              sub: t('callouts.phaseSub', { n: boss.phase }),
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
              sub: t('callouts.overdriveSub'),
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
              sub: t('callouts.timeStopSub'),
              color: 0xcfe6ff,
              small: true,
              duration: 1.1,
              key: 'ts',
            });
        }),
      ),
      // A capsule collected: the buff's codename over its localised name and how long it is for.
      world.events.on('buff', ({ id, duration, twin }) =>
        whenPlaying(() => {
          // Time stop already calls itself out; a second banner would only shout over the first.
          if (id === 'timestop') return;
          const def = BUFF_MAP[id];
          const name = buffName(def);
          const sub =
            duration > 0
              ? t(twin ? 'callouts.buffTwinSub' : 'callouts.buffSub', { name, n: Math.round(duration) })
              : `${name} · ${buffShort(def)}`;
          this.ui.banner({
            title: def.code,
            sub,
            color: buffColor(id),
            small: true,
            duration: 1.5,
          });
        }),
      ),
      world.events.on('dodge', () =>
        whenPlaying(() =>
          this.ui.banner({
            title: 'DODGE',
            sub: t('callouts.dodgeSub'),
            color: 0xffffff,
            small: true,
            duration: 0.9,
            key: 'dodge',
          }),
        ),
      ),
      world.events.on('secondWind', () =>
        whenPlaying(() =>
          this.ui.banner({
            title: 'SECOND WIND',
            sub: t('shop.secondWindSub'),
            color: 0x7dffe0,
            small: true,
            duration: 1.4,
            key: 'secondwind',
          }),
        ),
      ),
      world.events.on('clear', () =>
        whenPlaying(() =>
          this.ui.banner({ title: 'SECTOR CLEAR', sub: t('callouts.sectorClearSub'), duration: 1.5 }),
        ),
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
    const econ = this.save.economy;
    // The trial supply rides along as a one-run gift: it takes no loadout slot, and the session
    // de-duplicates supplies, so a repeat entry is harmless.
    const supplies = econ.trialSupply ? [...econ.loadout, econ.trialSupply] : econ.loadout;
    const session = new Session(mode, this.resolveSeed(), {
      starter,
      level,
      difficulty: difficultyOf(difficulty),
      supplies,
    });
    this.ui.clearCallouts();
    this.adopt(session, false);
    if (this.scoring) {
      // A real run spends the trial the moment it opens, whatever happens later in the run;
      // deeper debug runs (level > 1) neither spend nor touch the save's run count.
      econ.trialSupply = null;
      this.save.records.runs++;
      storeSave(this.save);
      // Opens the server-side window for this run. Fire-and-forget: the first frame must not wait.
      this.cloud?.beginRun();
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
    this.cloud?.abandonRun();
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
    // A double-click lands as two clicks a moment apart; only the first may spend crystals.
    // The R key shares the cadence, which reads as deliberate in play.
    const now = performance.now();
    if (now - this.lastRerollAt < REROLL_DEBOUNCE_MS) return;
    this.lastRerollAt = now;
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
    if (patch.quality) {
      // A choice made by hand outranks everything the governor has learned about this device.
      this.governor.choose(tierOf(patch.quality));
      this.save.device = null;
    }
    if (patch.language) {
      // The static markup sweep plus a re-render of whatever is on screen; the HUD self-heals.
      setLang(patch.language);
      this.ui.applyLanguage();
    }
    storeSave(this.save);
    this.audio.setVolumes(this.save.settings.music, this.save.settings.sfx);
    this.fx.applySettings(this.fxSettings());
  }

  // ───────────────────────────── 星尘商店 (called by the UI) ─────────────────────────────

  buyProtocol(id: string): boolean {
    const def = PROTOCOL_MAP[id];
    const econ = this.save.economy;
    if (!def || econ.protocols.includes(id) || econ.stardust < def.price) return false;
    econ.stardust -= def.price;
    econ.protocols.push(id);
    if (econ.wishlist === id) econ.wishlist = null;
    storeSave(this.save);
    return true;
  }

  buySupply(id: string): boolean {
    if (!isSupplyId(id)) return false;
    const def = SUPPLY_MAP[id];
    const econ = this.save.economy;
    if (econ.supplies.includes(id) || econ.stardust < def.price) return false;
    econ.stardust -= def.price;
    econ.supplies.push(id);
    if (econ.wishlist === id) econ.wishlist = null;
    // Owning it ends the trial: a taste of something you now have would be dead weight.
    if (econ.trialSupply === id) econ.trialSupply = null;
    storeSave(this.save);
    return true;
  }

  /** Spends 星尘 on a cosmetic skin. The verdict itself is a pure function (see `render/skins`). */
  buySkin(id: string): boolean {
    const econ = this.save.economy;
    if (!canBuySkin(econ.stardust, econ.skins, id)) return false;
    econ.stardust -= SKIN_MAP[id]!.price;
    econ.skins.push(id);
    if (econ.wishlist === id) econ.wishlist = null;
    storeSave(this.save);
    return true;
  }

  /** Equips an owned skin of the kind; null clears back to the stock look. */
  equipSkin(id: string | null, kind: SkinKind): boolean {
    const econ = this.save.economy;
    if (!canEquipSkin(econ.skins, id, kind)) return false;
    if (kind === 'ball') econ.skinBall = id;
    else econ.skinBg = id;
    storeSave(this.save);
    return true;
  }

  toggleWishlist(id: string): void {
    const econ = this.save.economy;
    if (!PROTOCOL_MAP[id] && !isSupplyId(id)) return;
    econ.wishlist = econ.wishlist === id ? null : id;
    storeSave(this.save);
  }

  /** Points the one-run free trial at an unowned supply; the same id again clears it. */
  setTrialSupply(id: string): void {
    const econ = this.save.economy;
    // A trial is a taste of something not owned yet: unknown or owned ids are refused.
    if (!isSupplyId(id) || econ.supplies.includes(id)) return;
    econ.trialSupply = econ.trialSupply === id ? null : id;
    storeSave(this.save);
  }

  toggleLoadout(id: string): boolean {
    if (!isSupplyId(id)) return false;
    const econ = this.save.economy;
    if (!econ.supplies.includes(id)) return false;
    const index = econ.loadout.indexOf(id);
    if (index >= 0) econ.loadout.splice(index, 1);
    else {
      // Slot gates read the record, so carrying more is always earned by playing, never bought.
      const clears = Object.values(econ.winsByDifficulty).some((n) => (n ?? 0) > 0) ? 1 : 0;
      if (supplyCost(econ.loadout) + SUPPLY_MAP[id].slots > slotLimit(this.save.records.runs, clears)) {
        return false;
      }
      econ.loadout.push(id);
    }
    storeSave(this.save);
    return true;
  }

  perf(): PerfInfo {
    return {
      fps: +this.frameTimes.fps.toFixed(1),
      lowFps: +this.frameTimes.lowFps.toFixed(1),
      jank: +this.frameTimes.jank.toFixed(3),
      samples: this.frameTimes.count,
      tier: { ...this.governor.current },
      adjusted: this.governor.adjusted,
      gaveUp: this.governor.gaveUp,
    };
  }

  /** See the debug hook of the same name: per-pass GPU timings; stalls the pipeline while it runs. */
  profileGpu(frames = 12): Record<string, number> | null {
    const samples = new Map<string, number[]>();
    let last = 0;
    this.renderer.profileHook = (label) => {
      if (label === 'start') {
        last = performance.now();
        return;
      }
      this.renderer.gl.sync();
      const now = performance.now();
      const list = samples.get(label) ?? [];
      list.push(now - last);
      samples.set(label, list);
      last = now;
    };
    this.refreshLayout();
    try {
      for (let i = 0; i < Math.max(1, Math.min(frames, 120)); i++) this.render(performance.now() / 1000);
    } finally {
      this.renderer.profileHook = null;
    }
    const out: Record<string, number> = { total: 0 };
    for (const [label, list] of samples) {
      list.sort((a, b) => a - b);
      out[label] = +(list[Math.floor(list.length / 2)] ?? 0).toFixed(3);
      out.total = +(out.total + out[label]).toFixed(3);
    }
    return out;
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
      this.ui.showResults(this.session, won, fresh, null, null);
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
    // The run's 星尘 settles here, after the records absorbed this run: a milestone this run
    // just earned has to pay on this very results screen.
    const payout = this.settleEconomy(run, won);
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
    this.ui.showResults(
      this.session,
      won,
      fresh,
      { rank: runRank(sameMode, score), total: sameMode.length },
      payout,
    );
    this.lastCloudRecord = record;
    void this.submitRun(record);
  }

  /**
   * Settles the finished run's 星尘 payout: the run share through the daily soft cap, then the
   * one-time rewards — the first-run gift, first uses of upgrade kinds, newly reached milestones
   * and the day's missions. The day's first scoring run doubles its share before the cap; mission
   * rewards bypass the cap like every other one-time reward. Run aggregates fold in before the
   * milestones settle, so a difficulty first-cleared on this very run pays on this very run. The
   * balance and the lifetime total move together at the end. Debug runs and fixed-seed runs pay
   * nothing.
   */
  private settleEconomy(run: Run, won: boolean): EconomyPayout | null {
    if (!this.scoring) return null;
    const econ = this.save.economy;
    // A fixed seed replays the same good run forever: it earns no stardust (the weekly seeded
    // challenge, when it comes, will carry its own exemption).
    if (this.save.settings.seed.trim()) return null;
    const score = Math.round(run.score);
    const campaignWon = won && run.mode === 'campaign';
    const earned = runCoins(run.time, score, campaignWon);
    const date = dayKey();
    if (econ.dailyDate !== date) {
      econ.dailyDate = date;
      econ.dailyRunCoins = 0;
    }
    // The daily loop re-arms on the same day key as the soft cap: a date change re-draws the
    // missions, zeroes their progress and re-arms the first-run double.
    rollDaily(econ, date);
    // The day's first scoring run has its run share doubled, before the cap — the doubled value
    // is what counts against the room. One-time rewards below never pass through this.
    const share = doubleFirstRun(econ, earned.total);
    const runPaid = applyDailyHalving(share, econ.dailyRunCoins);
    econ.dailyRunCoins += runPaid;

    econ.bestCombo = Math.max(econ.bestCombo, run.maxCombo);
    if (campaignWon) {
      const tier = run.difficulty;
      econ.winsByDifficulty[tier] = (econ.winsByDifficulty[tier] ?? 0) + 1;
      const starterId = this.lastRun?.starter.id;
      if (starterId) econ.winsByStarter[starterId] = (econ.winsByStarter[starterId] ?? 0) + 1;
    }
    econ.counters.perfects += run.perfects;
    econ.counters.capsules += run.capsules;
    econ.counters.overdrives += run.overdrives;
    econ.counters.reactions += run.reactionTriggers;
    econ.counters.bosses += run.bosses;
    for (const level of run.history) {
      if (level.damageTaken <= 0) econ.counters.flawless++;
      if (level.time > 0 && level.time < SWIFT_SECONDS) econ.counters.swift++;
    }
    let firstUse = 0;
    for (const [id, level] of Object.entries(run.upgrades)) {
      if (level > 0 && !econ.firstUsed[id]) {
        econ.firstUsed[id] = true;
        firstUse += FIRST_USE_REWARD;
      }
    }
    let gift = 0;
    if (!econ.firstGift) {
      econ.firstGift = true;
      gift = FIRST_GIFT;
    }
    const settled = settleMilestones(this.save.records, econ);
    // Daily missions fold after the counters and settle like milestones: no claim step, and the
    // reward bypasses the soft cap — one-time by nature, capped by the daily reset itself.
    const daily = advanceDaily(econ, run, won);
    const total = runPaid + gift + firstUse + settled.reward + daily.missionReward;
    econ.stardust += total;
    econ.lifetime += total;
    return {
      earned: share,
      runPaid,
      halved: runPaid < share,
      gift,
      firstUse,
      milestones: settled.reward,
      milestoneCount: settled.earned.length,
      missions: daily.missionReward,
      total,
    };
  }

  /**
   * Mirrors a finished run onto the cloud board. Runs after the results screen is already up and
   * only ever edits one line of it: a slow or failed upload must not delay the player's feedback.
   * The settled outcome belongs to its own run, not to whatever screen is up when it arrives:
   * writing the (hidden) status line of the results screen while the player browses 战绩/榜单 or
   * the menu is harmless and shows when they return, while a different `lastCloudRecord` means a
   * newer run owns the line and the stale answer is dropped instead of landing on its results.
   */
  private async submitRun(record: RunRecord): Promise<void> {
    if (!this.cloud) return;
    const outcome = await this.cloud.finishRun(record);
    this.cloud.invalidate();
    if (outcome.ok) {
      if (this.lastCloudRecord === record) this.ui.cloudStatus(outcome.message, 'ok');
      // The network just proved itself: anything queued by earlier failures can go out now too.
      void this.flushPendingSubmits();
      return;
    }
    this.queuePendingSubmit(record);
    if (this.lastCloudRecord === record) this.ui.cloudStatus(outcome.message, 'warn');
  }

  /** The retry surface the UI uses: opening the leaderboard screen is a good moment to retry. */
  flushCloudSubmits(): void {
    void this.flushPendingSubmits();
  }

  /** Remembers a failed submit for the background retry, newest last and bounded. */
  private queuePendingSubmit(record: RunRecord): void {
    const index = this.pendingSubmits.indexOf(record);
    if (index >= 0) this.pendingSubmits.splice(index, 1);
    this.pendingSubmits.push(record);
    while (this.pendingSubmits.length > SUBMIT_RETRY_QUEUE_MAX) this.pendingSubmits.shift();
    this.scheduleSubmitRetry();
  }

  /** Arms the background retry timer if it is not already armed, at the current backoff delay. */
  private scheduleSubmitRetry(): void {
    if (this.submitRetryTimer !== null) return;
    if (this.submitRetryDelayMs === 0) this.submitRetryDelayMs = SUBMIT_RETRY_FIRST_MS;
    this.submitRetryTimer = setTimeout(() => {
      this.submitRetryTimer = null;
      void this.flushPendingSubmits();
    }, this.submitRetryDelayMs);
    this.submitRetryDelayMs = Math.min(this.submitRetryDelayMs * 2, SUBMIT_RETRY_MAX_MS);
  }

  /**
   * Tries every queued submit once, in order. A round stops at the first failure and re-arms the
   * timer with the grown delay; the record that failed stays in front. Runs from a fresh submit's
   * success, the leaderboard screen opening and the browser's `online` event — a submit retried
   * without a play-session token is still accepted while time validation is off, same as any
   * late submit today. The results line is only written back for the run that owns it.
   */
  private async flushPendingSubmits(): Promise<void> {
    if (!this.cloud || this.flushingSubmits || this.pendingSubmits.length === 0) return;
    if (this.submitRetryTimer !== null) {
      clearTimeout(this.submitRetryTimer);
      this.submitRetryTimer = null;
    }
    this.flushingSubmits = true;
    try {
      while (this.pendingSubmits.length > 0) {
        const record = this.pendingSubmits[0]!;
        const outcome = await this.cloud.finishRun(record);
        this.cloud.invalidate();
        if (!outcome.ok) {
          this.scheduleSubmitRetry();
          return;
        }
        this.pendingSubmits.shift();
        if (this.lastCloudRecord === record) this.ui.cloudStatus(outcome.message, 'ok');
      }
      // The backlog cleared: the next failure starts the backoff over.
      this.submitRetryDelayMs = 0;
    } finally {
      this.flushingSubmits = false;
    }
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
      .filter(
        (entry): entry is { def: UpgradeDef; level: number } => entry.def !== undefined && entry.level > 0,
      )
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
    // The browser says the network came back: queued score submits go out without waiting for
    // the backoff timer or the next leaderboard open.
    window.addEventListener('online', () => void this.flushPendingSubmits());
    window.addEventListener('pointermove', (event) => {
      if (!this.isPlaying()) return;
      // A finger that taps the overdrive prompt must not teleport the paddle. Touch pointers keep
      // targeting the element they landed on, so this also covers a tap that slides off the pill.
      // The mouse keeps steering everywhere: its cursor is a hair-thin pointer, not a thumb.
      if (
        event.pointerType !== 'mouse' &&
        event.target instanceof Element &&
        event.target.closest('#od-hint')
      ) {
        return;
      }
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
    // A lost WebGL context blanks the canvas while the simulation keeps running unseen. Stop the
    // run and say so; `preventDefault` declines the context's own fast-restore path. Rebuilding
    // every GL resource on `webglcontextrestored` is out of scope, so restore only clears the
    // flag — play stays paused and the toast's advice (reload the page) is the way back.
    this.canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      this.renderer.lost = true;
      if (this.canPause()) this.pause();
      this.ui.toast(t('callouts.contextLostTitle'), t('callouts.contextLostBody'), 0xffd24a, 'gfx');
    });
    this.canvas.addEventListener('webglcontextrestored', () => {
      this.renderer.lost = false;
    });
  }

  private onKeyDown(event: KeyboardEvent): void {
    this.audio.unlock();
    const world = this.session.world;
    const key = event.code;
    const draft = this.inRun && this.session.phase === 'draft';

    if (key === 'Space') {
      // Typing in a text field (the 固定种子 box) must keep its spaces: ignore the global
      // hotkeys while the event targets a text-entry element.
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
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
    try {
      this.refreshLayout();

      // Nothing moves while a run is paused, drafting or over (the title-screen demo keeps playing):
      // those screens are redrawn at a low rate, so a phone is not heating up behind a dialog and
      // has thermal headroom left for the play that follows.
      const idle = this.inRun && (this.paused || this.session.phase === 'draft' || this.ui.screen === 'over');
      if (!idle && dt > 0) this.fps += (1 / dt - this.fps) * 0.05;

      const resting =
        !this.inRun ||
        this.paused ||
        this.session.phase === 'draft' ||
        this.resultsTimer >= 0 ||
        this.ui.screen === 'over';
      // Every frame, including skipped ones: this keeps the score in step and the sequencer fed.
      this.audio.update(resting ? (this.inRun ? 'quiet' : 'menu') : 'play', this.session.world, !this.inRun);

      if (idle && now - this.lastRender < IDLE_FRAME_MS) return;
      this.lastRender = now;
      // Only frames that did the full work say anything about what this device can sustain.
      if (!idle) this.tickQuality(rawMs);

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

      this.render(now / 1000);
    } catch (error) {
      // One throwing frame must never kill the loop (a resize during a lost context used to do
      // exactly that): record the error and stop a live run, like a context loss does, and let
      // the `finally` below keep the frames coming.
      this.debug.errors.push(error);
      if (this.canPause()) this.pause();
    } finally {
      requestAnimationFrame(this.frame);
    }
  };

  /** Works out where the arena sits at the current window size and render step, and tells CSS. */
  private refreshLayout(): void {
    const tier = this.governor.current;
    this.layout = computeLayout(
      window.innerWidth,
      window.innerHeight,
      tier.quality,
      window.devicePixelRatio || 1,
      tier.scale,
    );
    this.ui.applyLayout(this.layout);
  }

  /** Feeds one fully worked frame to the statistics and the governor, and applies a step if due. */
  private tickQuality(rawMs: number): void {
    this.frameTimes.push(rawMs);
    const event = this.governor.frame(rawMs);
    if (!event) return;
    if (event.stepped || event.gaveUp) this.fx.applySettings(this.fxSettings());
    if (event.relieved) {
      // The step measurably helped, so it is what this device can sustain: start here next time
      // instead of stumbling through the same seconds of stutter again.
      this.rememberStep(event.tier);
      this.ui.toast(
        t('callouts.qualityAdjustedTitle'),
        t('callouts.qualityAdjustedBody', { tier: tierLabel(event.tier) }),
        0xffd24a,
        'quality',
      );
    }
    if (event.gaveUp) {
      this.rememberStep(event.tier);
      this.ui.toast(t('callouts.qualityGaveUpTitle'), t('callouts.qualityGaveUpBody'), 0x9ff3ff, 'quality');
    }
  }

  /** Remembers a step for this device while it is below the player's choice; forgets it otherwise. */
  private rememberStep(tier: Tier): void {
    this.save.device = isLighter(tier, tierOf(this.save.settings.quality)) ? { ...tier } : null;
    storeSave(this.save);
  }

  /** Timers that are about flow rather than simulation. */
  private tick(dt: number): void {
    if (!this.inRun) {
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

  /** The equipped ball skin as a draw-time override, or null for the free stock look 「原色」. */
  private ballSkin(): BallSkinOverride | null {
    const id = this.save.economy.skinBall;
    const def = isBallSkinId(id) && this.save.economy.skins.includes(id) ? SKIN_MAP[id] : null;
    return def && def.kind === 'ball'
      ? { glow: def.colors.glow, trail: def.colors.trail, core: def.colors.core }
      : null;
  }

  /** The equipped backdrop theme, or null for the chapters' own palettes. */
  private bgSkin(): BgSkinDef | null {
    const id = this.save.economy.skinBg;
    const def = isBgSkinId(id) && this.save.economy.skins.includes(id) ? SKIN_MAP[id] : null;
    return def && def.kind === 'bg' ? def : null;
  }

  private render(time: number): void {
    const world = this.session.world;
    const chapter = CHAPTERS[world.level.chapter] ?? CHAPTERS[0];
    const view = this.fx.camera.view(this.layout);
    this.fx.resolveView(view);
    // A backdrop theme runs the chapter palette through its fixed transform; no theme, no change.
    const theme = this.bgSkin();
    const skinned = theme ? applyBgSkin(chapter.bg, chapter.accent, theme) : null;
    const palette: Palette = skinned
      ? { a: skinned.bg[0], b: skinned.bg[1], c: skinned.bg[2], accent: skinned.accent }
      : { a: chapter.bg[0], b: chapter.bg[1], c: chapter.bg[2], accent: chapter.accent };
    this.renderer.pen.reset();
    drawScene(this.renderer.pen, world, this.fx, chapter, time, this.info, this.ballSkin());
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
    // The frame loop normally refreshes the layout; do it here too, so stepping works — and
    // frames come out framed correctly — in a tab whose animation frames are throttled or paused.
    this.refreshLayout();
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
      fps: Math.round(this.frameTimes.count >= 30 ? this.frameTimes.fps : this.fps),
      quality: this.governor.current.quality,
      renderScale: this.governor.current.scale,
      qualityAdjusted: this.governor.adjusted,
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
      /** Temporary buffs in force, as `[id, seconds left]`. */
      buffs: world.buffs.map((buff) => [buff.id, +buff.t.toFixed(1)]),
      /** Capsules on their way to the paddle. */
      capsules: world.pickups.filter((pickup) => pickup.kind === 'buff').map((pickup) => pickup.buff),
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

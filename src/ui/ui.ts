import type { AudioDirector } from '../audio/director';
import { applyDom, isLang, t } from '../core/i18n';
import { formatNumber, formatScore, formatTime, mixHex } from '../core/math';
import type { SaveData, Settings } from '../core/storage';
import { APP_VERSION } from '../core/version';
import {
  bossName,
  bossTitle,
  buffDesc,
  buffName,
  difficultyDetail,
  difficultyName,
  levelName,
  mutatorDesc,
  mutatorName,
  rarityName,
  reactionDesc,
  reactionName,
  reactionRecipe,
  starterDesc,
  starterName,
  upgradeDescribe,
  upgradeFlavor,
  upgradeName,
  upgradeNameById,
} from '../i18n/content';
import { BUFFS } from '../game/buffs/defs';
import { buffColor } from '../game/buffs/present';
import { difficultyOf, DIFFICULTIES, type DifficultyId } from '../game/difficulty';
import { CAMPAIGN_LENGTH } from '../game/levels/generator';
import { CHAPTERS, REACTIONS } from '../game/levels/definitions';
import type { RunMode } from '../game/run';
import type { Session, SessionEvents } from '../game/session';
import { STARTERS, type Starter } from '../game/starters';
import {
  PROTOCOLS,
  PROTOCOL_MAP,
  SLOT_GATES,
  SUPPLIES,
  SUPPLY_MAP,
  isSupplyId,
  slotLimit,
  supplyCost,
} from '../game/economy/catalog';
import { MILESTONES } from '../game/economy/milestones';
import { DAILY_MISSION_REWARD, dailyMissionsFor } from '../game/economy/dailies';
import { dayKey } from '../game/economy/coins';
import { UPGRADES, UPGRADE_MAP } from '../game/upgrades/defs';
import { RARITY_INFO, RARITY_ORDER, TAG_INFO, upgradeColor } from '../game/upgrades/present';
import type { UpgradeDef } from '../game/upgrades/types';
import type { Leaderboard } from '../net/leaderboard';
import { tierLabel, type Tier } from '../render/governor';
import type { Layout } from '../render/layout';
import { applyBgSkin, SKINS, defaultBallSkin, type SkinKind } from '../render/skins';
import { Changelog, changelogUnseen } from './changelog';
import { CloudPanel } from './cloud';
import { byId, el, hexCss, keep, scoreEl, setText } from './dom';
import { HUD, tagChips, type HudHost } from './hud';
import { NicknamePrompt, shouldAskNickname } from './nickname';
import { sigil } from './sigil';
import { shouldAutoShow, Tutorial } from './tutorial';

/** Everything the UI can ask the app to do. The UI never touches a session or the renderer directly. */
export interface UiActions {
  startRun(mode: RunMode, starter: Starter, difficulty: DifficultyId): void;
  resume(): void;
  quitToMenu(): void;
  retry(): void;
  choose(id: string): void;
  reroll(): void;
  skip(): void;
  /** Fires overdrive if the meter is full. */
  overdrive(): void;
  updateSettings(patch: Partial<Settings>): void;
  /** Spends 星尘 on an opening protocol. False when unknown, owned, or unaffordable. */
  buyProtocol(id: string): boolean;
  /** Spends 星尘 on a supply. False when unknown, owned, or unaffordable. */
  buySupply(id: string): boolean;
  /** Spends 星尘 on a cosmetic skin. False when unknown, owned, or unaffordable. */
  buySkin(id: string): boolean;
  /** Equips an owned skin of the kind; null clears back to the stock look. False when not owned. */
  equipSkin(id: string | null, kind: SkinKind): boolean;
  /** Points the menu/results nudge at a catalog item, or clears the nudge when it is the same one. */
  toggleWishlist(id: string): void;
  /** Toggles a supply in the carried loadout. False when unowned or the earned slots are full. */
  toggleLoadout(id: string): boolean;
  /** Points the one-run free trial at an unowned supply; the same id again clears it. */
  setTrialSupply?(id: string): void;
  /** Composes and downloads the run's score-card PNG. Resolves false when it could not be made. */
  downloadScorecard(): Promise<boolean>;
  /** Frame-rate figures for the performance readout in settings. */
  perf(): PerfInfo;
  /** GPU time of each render pass in ms. Stalls rendering for a moment while it measures. */
  profileGpu(frames?: number): Record<string, number> | null;
  /**
   * The cloud leaderboard, or null when the feature is off. Either channel — CheddaBoards, or the
   * B站 Toy boards when the page runs as a Bilibili Toy.
   */
  readonly cloud: Leaderboard | null;
  /** Retries queued score submits in the background; the leaderboard screen opening is a good moment. */
  flushCloudSubmits?(): void;
}

/** Frame-rate figures behind the performance readout. */
export interface PerfInfo {
  /** Frames per second over the last few seconds of play. */
  fps: number;
  /** Mean rate of the slowest five percent of frames: how bad the stutters get. */
  lowFps: number;
  /** Share of frames that were late, 0..1. */
  jank: number;
  /** Frames the figures rest on. 0 right after load. */
  samples: number;
  tier: Tier;
  /** True while the render step is below the player's choice. */
  adjusted: boolean;
  /** True once lowering the quality failed to raise the frame rate. */
  gaveUp: boolean;
}

export type ScreenId =
  'menu' | 'starter' | 'draft' | 'pause' | 'over' | 'codex' | 'settings' | 'history' | 'cloud' | 'shop';

const SCREENS: ScreenId[] = [
  'menu',
  'starter',
  'draft',
  'pause',
  'over',
  'codex',
  'settings',
  'history',
  'cloud',
  'shop',
];

/** One run's 星尘 payout, quoted on the results screen. */
export interface EconomyPayout {
  /** The raw run share, before the daily soft cap. Doubled on the day's first scoring run. */
  earned: number;
  /** The run share actually paid. */
  runPaid: number;
  /** True when the daily cap halved part of the run share. */
  halved: boolean;
  gift: number;
  firstUse: number;
  milestones: number;
  /** How many milestones settled with this run (they may be zero even when the reward is not). */
  milestoneCount: number;
  /** Daily missions this run completed; their reward bypasses the daily cap. */
  missions: number;
  total: number;
}

export interface BannerOptions {
  title: string;
  sub?: string;
  note?: string;
  color?: number;
  /** Seconds the banner stays on screen. */
  duration?: number;
  /** Short, punchy call-outs (combo tiers, "PERFECT"). May queue; large banners replace each other. */
  small?: boolean;
  /** Call-outs with the same key replace each other, so a repeated "PERFECT" restarts instead of stacking. */
  key?: string;
}

const DEFAULT_ACCENT = 0x27e0ff;

/**
 * Owns every DOM surface: the in-game HUD and the seven full screens.
 *
 * Screens are rebuilt from data when they are shown; nothing in the DOM is otherwise kept in
 * sync by hand. Sound cues for UI interaction are issued here too, so every click sounds the same.
 */
export class UI implements HudHost {
  readonly hud: HUD;
  private current: ScreenId | null = null;
  private returnTo: ScreenId = 'menu';
  private starterMode: RunMode = 'campaign';
  /** Difficulty preselected on the starter screen; remembered across sessions via settings. */
  private difficulty: DifficultyId;
  private codexTab = 'upgrades';
  private historyTab: 'campaign' | 'endless' = 'campaign';
  private shopTab: 'protocols' | 'supplies' | 'skins' | 'progress' = 'protocols';
  private accent = DEFAULT_ACCENT;
  /** Levels of the run currently on screen, for tooltips. */
  private levels: Record<string, number> = {};
  /** Last shown draft, so a language switch can re-render it in place. */
  private lastDraft: { info: SessionEvents['draft']; session: Session } | null = null;
  /** Last shown results, same purpose; `showResults` is sound-free so it can simply re-run. */
  private lastResults: Parameters<UI['showResults']> | null = null;

  private readonly tooltip = byId('tooltip');
  private readonly bannerHost = byId('banner');
  private readonly toastHost = byId('toasts');
  /** Arena rectangle already handed to CSS, so unchanged values are not rewritten every frame. */
  private readonly arenaVars: Record<string, string> = {};
  /** Refreshes the performance readout while the settings screen is up. */
  private perfTicker = 0;
  /** The cloud leaderboard screen, built only when this build can reach the service. */
  private readonly cloudPanel: CloudPanel | null;
  /** The first-run tutorial overlay. A plain menu tool, so it never joins `ScreenId`. */
  private readonly tutorial: Tutorial;
  /** The release notes, overlaid the same way: on their own after an update, or from the menu's version link. */
  private readonly changelog: Changelog;
  /** The entry nickname prompt, built with the cloud screen: same channel, same identity. */
  private readonly nicknamePrompt: NicknamePrompt | null;

  constructor(
    private readonly actions: UiActions,
    private readonly audio: AudioDirector,
    private readonly save: SaveData,
  ) {
    this.difficulty = save.settings.difficulty;
    this.hud = new HUD(this);
    this.cloudPanel = actions.cloud ? new CloudPanel(actions.cloud, audio) : null;
    this.nicknamePrompt = actions.cloud ? new NicknamePrompt(audio, actions.cloud) : null;
    // Any exit from the deck — finish, skip, Esc — marks it seen once, via the usual settings
    // route. Whatever nickname ask is waiting steps in right behind it, while the menu is still
    // the screen in view.
    this.tutorial = new Tutorial(audio, () => {
      this.actions.updateSettings({ tutorialSeen: true });
      this.maybeAskNickname();
    });
    // Same route for the notes: dismissed by the button or by Esc is "seen" either way.
    this.changelog = new Changelog(audio, () => this.actions.updateSettings({ changelogSeen: APP_VERSION }));
    // The version link is the one place the version shows on screen, and static markup cannot know it.
    setText(byId('menu-version-tag'), `v${APP_VERSION}`);
    // Phones and tablets do without the effects their compositor cannot afford (see the
    // `[data-pointer]` rules in the stylesheet). Re-marked if the primary input ever changes.
    const pointer = window.matchMedia('(pointer: coarse)');
    const markPointer = (): void => {
      document.documentElement.dataset.pointer = pointer.matches ? 'coarse' : 'fine';
    };
    markPointer();
    pointer.addEventListener('change', markPointer);
    this.bind();
  }

  // ───────────────────────────── wiring ─────────────────────────────

  private bind(): void {
    const on = (action: string, fn: () => void): void => {
      document.querySelectorAll<HTMLElement>(`[data-action="${action}"]`).forEach((node) => {
        node.addEventListener('click', (event) => {
          event.stopPropagation();
          this.audio.ui('uiClick');
          fn();
        });
      });
    };
    on('campaign', () => this.showStarter('campaign'));
    on('endless', () => this.showStarter('endless'));
    on('shop', () => this.showShop());
    on('codex', () => this.showCodex());
    on('history', () => this.showHistory());
    on('cloud', () => this.showCloud());
    on('tutorial', () => this.tutorial.openTutorial());
    on('changelog', () => this.changelog.open());
    on('settings', () => this.showSettings());
    on('back', () => this.back());
    on('resume', () => this.actions.resume());
    on('quit', () => this.actions.quitToMenu());
    on('retry', () => this.actions.retry());
    on('reroll', () => this.actions.reroll());
    on('skip', () => this.actions.skip());
    on('shot', () => void this.takeScorecard());
    // The on-screen prompt is a button too, so touch players have a way to fire overdrive.
    byId('od-hint').addEventListener('click', () => this.actions.overdrive());
    // Touch players have no Esc/P, so the pause button piggybacks on the keyboard path: it
    // re-fires the synthetic Escape keydown the app's window listener already routes, which
    // gives toggle semantics (pause while playing, resume while paused) with zero new wiring.
    on('pause', () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true }));
    });

    byId('codex-tabs').addEventListener('click', (event) => {
      const tab = (event.target as HTMLElement).closest<HTMLButtonElement>('.tab');
      if (!tab?.dataset.tab) return;
      this.audio.ui('uiClick');
      this.codexTab = tab.dataset.tab;
      this.renderCodex();
    });

    byId('history-tabs').addEventListener('click', (event) => {
      const tab = (event.target as HTMLElement).closest<HTMLButtonElement>('.tab');
      if (!tab?.dataset.tab) return;
      this.audio.ui('uiClick');
      this.historyTab = tab.dataset.tab === 'endless' ? 'endless' : 'campaign';
      this.renderHistory();
    });

    byId('shop-tabs').addEventListener('click', (event) => {
      const tab = (event.target as HTMLElement).closest<HTMLButtonElement>('.tab');
      if (!tab?.dataset.tab) return;
      this.audio.ui('uiClick');
      this.shopTab =
        tab.dataset.tab === 'supplies'
          ? 'supplies'
          : tab.dataset.tab === 'skins'
            ? 'skins'
            : tab.dataset.tab === 'progress'
              ? 'progress'
              : 'protocols';
      this.renderShop();
    });

    const patch = (change: Partial<Settings>): void => this.actions.updateSettings(change);
    // Capture the elements: `event.currentTarget` is only reliably typed inside the dispatch.
    const language = byId<HTMLSelectElement>('set-language');
    const music = byId<HTMLInputElement>('set-music');
    const sfx = byId<HTMLInputElement>('set-sfx');
    const shake = byId<HTMLInputElement>('set-shake');
    const flash = byId<HTMLInputElement>('set-flash');
    const quality = byId<HTMLSelectElement>('set-quality');
    const seed = byId<HTMLInputElement>('set-seed');
    language.addEventListener('change', () => {
      const value = language.value;
      if (isLang(value)) patch({ language: value });
    });
    music.addEventListener('input', () => patch({ music: Number(music.value) }));
    sfx.addEventListener('input', () => patch({ sfx: Number(sfx.value) }));
    shake.addEventListener('change', () => patch({ shake: shake.checked }));
    flash.addEventListener('change', () => patch({ flashes: flash.checked }));
    quality.addEventListener('change', () => {
      const value = quality.value;
      if (value === 'low' || value === 'medium' || value === 'high') patch({ quality: value });
      // The note about automatic adjustments follows the choice at once, not on the next tick.
      this.renderPerf();
    });
    seed.addEventListener('change', () => patch({ seed: seed.value.trim() }));
    byId('btn-perf').addEventListener('click', () => this.runProfile());

    // One delegated listener gives every button the same hover tick.
    document.addEventListener('pointerover', (event) => {
      if (event.pointerType !== 'mouse') return;
      const button = (event.target as HTMLElement).closest?.('button');
      if (button && !button.contains(event.relatedTarget as Node | null) && !button.disabled)
        this.audio.ui('uiHover');
    });
  }

  private show(id: ScreenId | null): void {
    this.current = id;
    for (const name of SCREENS) byId(`screen-${name}`).hidden = name !== id;
    document.body.dataset.screen = id ?? 'play';
    // The HUD stays up behind the pause menu so the build is still readable.
    this.hud.setVisible(id === null || id === 'pause');
    // The version link is the menu's alone. It sits outside the screens so that it can pin to the
    // corner of the window instead of scrolling away with a menu taller than that.
    byId('menu-version').hidden = id !== 'menu';
    if (id !== null) this.hideTooltip();
    // The performance figures follow the game live while the settings screen is up.
    window.clearInterval(this.perfTicker);
    this.perfTicker = 0;
    if (id === 'settings') {
      this.renderPerf();
      this.perfTicker = window.setInterval(() => this.renderPerf(), 500);
    }
  }

  get screen(): ScreenId | null {
    return this.current;
  }

  /** True while a run is on screen and no modal is blocking it. */
  get inPlay(): boolean {
    return this.current === null;
  }

  private back(): void {
    if (this.current === 'starter') this.showMenu();
    else if (
      this.current === 'codex' ||
      this.current === 'settings' ||
      this.current === 'history' ||
      this.current === 'cloud' ||
      this.current === 'shop'
    ) {
      if (this.returnTo === 'pause' || this.returnTo === 'over') this.show(this.returnTo);
      else this.showMenu();
    }
  }

  // ───────────────────────────── layout & theme ─────────────────────────────

  /** Passes the arena rectangle to CSS and collapses side panels when there is no room. */
  applyLayout(layout: Layout): void {
    // This runs every frame, so a variable is only written when its value actually changes.
    const vars: Record<string, string> = {
      '--ax': `${layout.ax.toFixed(1)}px`,
      '--ay': `${layout.ay.toFixed(1)}px`,
      '--aw': `${layout.aw.toFixed(1)}px`,
      '--ah': `${layout.ah.toFixed(1)}px`,
      '--band-top': `${layout.hudTop.toFixed(0)}px`,
      '--band-bottom': `${layout.hudBottom.toFixed(0)}px`,
    };
    const style = document.documentElement.style;
    for (const [name, value] of Object.entries(vars)) {
      if (this.arenaVars[name] === value) continue;
      this.arenaVars[name] = value;
      style.setProperty(name, value);
    }
    // Portrait HUD bands live in CSS via these vars; the panels stay mounted there instead of
    // being hidden, so their portrait styling must be ready whenever the bands exist.
    const portrait = layout.hudTop > 0;
    // The buff strip needs the stats column's margin to show its full chips; otherwise it folds.
    this.hud.setRoom(
      portrait || layout.ax >= 300,
      portrait || layout.ax >= 220,
      !portrait && layout.ax >= 220,
    );
  }

  setAccent(color: number): void {
    this.accent = color;
    const style = document.documentElement.style;
    style.setProperty('--accent', hexCss(color));
    style.setProperty('--accent-rgb', `${(color >> 16) & 255} ${(color >> 8) & 255} ${color & 255}`);
  }

  // ───────────────────────────── per-frame ─────────────────────────────

  /** Refreshes the HUD. Call once per frame while a run's world is visible. */
  frame(session: Session, dps: number, now: number): void {
    this.levels = session.run.upgrades;
    this.hud.update(session, dps, now);
  }

  resetHud(): void {
    this.hud.reset();
  }

  // ───────────────────────────── screens ─────────────────────────────

  showMenu(): void {
    const records = this.save.records;
    const parts: string[] = [];
    if (records.bestCampaign > 0) {
      const bestEntry = records.history.find(
        (entry) => entry.mode === 'campaign' && entry.level === records.bestCampaign,
      );
      const boss = Math.floor(
        bestEntry && !bestEntry.won ? (records.bestCampaign - 1) / 5 : records.bestCampaign / 5,
      );
      parts.push(
        t('menu.recordCampaignDepth', { n: records.bestCampaign }) +
          (records.bestCampaign >= CAMPAIGN_LENGTH ? '' : t('menu.recordBossNote', { n: boss })),
      );
    }
    if (records.bestEndless > 0) parts.push(t('menu.recordEndlessDepth', { n: records.bestEndless }));
    if (records.bestScore > 0) parts.push(t('menu.recordBestScore', { n: formatScore(records.bestScore) }));
    if (records.wins > 0) parts.push(t('menu.recordWins', { n: records.wins }));
    if (records.runs > 0) parts.push(t('menu.recordRuns', { n: records.runs }));
    byId('menu-records').textContent = parts.length > 0 ? parts.join(' · ') : t('menu.recordsEmpty');
    // A build without credentials simply has no cloud section: no dead menu entry.
    byId('menu-cloud').hidden = this.cloudPanel === null;
    this.syncMenuMeta();
    // First launch of a fresh save opens the deck on top of the menu; veterans keep their menu.
    // After an update the release notes come first, and a deck that is due waits behind them: the
    // notes dismiss into it, as long as the menu is still what is on screen. The nickname ask
    // comes last of the three, so an unnamed player meets it on a menu with nothing else queued.
    // Nothing is queued only when both overlays are settled — and the ask opens after
    // `show('menu')`, since before it `current` is not yet 'menu' on the boot path.
    const notesDue = changelogUnseen(this.save.settings);
    const tutorialDue = shouldAutoShow(this.save.settings, this.save.records);
    if (notesDue) {
      this.changelog.open(() => {
        if (tutorialDue && this.current === 'menu') this.tutorial.openTutorial();
        else this.maybeAskNickname();
      });
    } else if (tutorialDue) {
      this.tutorial.openTutorial();
    }
    this.setAccent(DEFAULT_ACCENT);
    this.show('menu');
    if (!notesDue && !tutorialDue) this.maybeAskNickname();
  }

  /**
   * Opens the nickname ask when it is due: a Chedda channel to record scores on, no name chosen,
   * the menu on screen and nothing else stacked on top of it. Called on every path that lands on
   * the menu — direct, or behind the release notes and the tutorial — and from the tutorial's own
   * exit, so a first-run player meets the ask on a menu with nothing else queued.
   */
  private maybeAskNickname(): void {
    if (this.current !== 'menu') return;
    if (this.nicknamePrompt?.showing) return;
    if (!shouldAskNickname(this.actions.cloud)) return;
    this.nicknamePrompt?.open();
  }

  showPlay(): void {
    this.show(null);
  }

  showStarter(mode: RunMode): void {
    this.starterMode = mode;
    byId('starter-eyebrow').textContent =
      mode === 'campaign' ? t('starter.campaignEyebrow') : t('starter.endlessEyebrow');
    this.renderDifficulty();
    const grid = byId('starter-grid');
    // The four free protocols first, then whatever the shop has unlocked, in price order.
    const unlocked = [...STARTERS, ...PROTOCOLS.filter((p) => this.save.economy.protocols.includes(p.id))];
    grid.replaceChildren(
      ...unlocked.map((starter, i) => {
        const card = this.starterCard(starter, i);
        card.style.animationDelay = `${i * 80}ms`;
        return card;
      }),
    );
    this.renderLoadout();
    this.show('starter');
  }

  /** The tier selector row plus the chosen tier's modifier list underneath it. */
  private renderDifficulty(): void {
    const row = byId('diff-row');
    row.replaceChildren(
      ...DIFFICULTIES.map((tier) => {
        const selected = tier.id === this.difficulty;
        const button = el(
          'button',
          {
            class: `diff-btn${selected ? ' on' : ''}`,
            type: 'button',
            style: `--c:#${tier.color.toString(16).padStart(6, '0')}`,
            'aria-pressed': String(selected),
          },
          el('b', { text: difficultyName(tier) }),
          el('span', { text: `${tier.en} · ×${tier.scoreMult}` }),
        );
        button.addEventListener('click', () => {
          if (this.difficulty === tier.id) return;
          this.difficulty = tier.id;
          this.actions.updateSettings({ difficulty: tier.id });
          this.audio.ui('uiClick');
          this.renderDifficulty();
        });
        return button;
      }),
    );
    setText(byId('diff-detail'), difficultyDetail(this.difficulty).join(' · '));
  }

  showDraft(info: SessionEvents['draft'], session: Session): void {
    this.lastDraft = { info, session };
    this.renderDraft(info, session);
    this.show('draft');
    this.audio.ui('draft');
  }

  /** Rebuilds the draft screen's body; `showDraft` adds the screen switch and the sound cue. */
  private renderDraft(info: SessionEvents['draft'], session: Session): void {
    const cards = byId('draft-cards');
    cards.replaceChildren();
    info.options.forEach((def, i) => {
      const level = session.run.upgrades[def.id] ?? 0;
      const card = this.upgradeCard(def, level, () => this.actions.choose(def.id));
      card.style.animationDelay = `${i * 90}ms`;
      cards.append(card);
    });
    setText(
      byId('draft-eyebrow'),
      // The opening draft names its source: the free head start, or the protocol's own self-picks.
      info.intro
        ? session.introRarities
          ? t('shop.wildcardEyebrow')
          : t('shop.headstartEyebrow')
        : t('draft.eyebrow', { code: session.world.level.code }),
    );
    setText(byId('draft-crystals'), formatNumber(session.run.crystals));
    setText(byId('reroll-cost'), `◆ ${info.rerollCost}`);
    // An opening pick is forfeited when skipped, not traded — promising crystals here would lie.
    setText(byId('skip-reward'), info.intro ? '' : `+◆ ${info.skipReward}`);
    byId<HTMLButtonElement>('btn-reroll').disabled = session.run.crystals < info.rerollCost;
  }

  showPause(session: Session): void {
    setText(byId('pause-seed'), String(session.run.seed));
    this.show('pause');
  }

  /** Rank the finished run landed at in the local leaderboard, or null for unscored runs. */
  showResults(
    session: Session,
    won: boolean,
    newRecords: string[],
    rank: { rank: number; total: number } | null,
    payout: EconomyPayout | null = null,
  ): void {
    this.lastResults = [session, won, newRecords, rank, payout];
    const run = session.run;
    const level = session.world.level;
    const tier = difficultyOf(run.difficulty);
    const tierSuffix = tier.id !== 'standard' ? t('over.diffSuffix', { name: difficultyName(tier) }) : '';
    const localizedLevel = levelName(level.chapter, level.name);
    // The upload line belongs to this run; the app fills it in when the submit settles.
    byId('over-cloud').hidden = true;
    setText(byId('over-eyebrow'), won ? 'CAMPAIGN COMPLETE' : 'RUN TERMINATED');
    setText(byId('over-title'), won ? t('over.titleWon') : t('over.titleLost'));
    setText(
      byId('over-sub'),
      won
        ? `${t('over.subWon')}${tierSuffix ? `（${difficultyName(tier)}）` : ''}`
        : `${tierSuffix}${run.mode === 'campaign' ? t('over.campaignMode') : t('over.endlessMode')} · ${t('over.stopAt', { code: run.mode === 'campaign' ? `${level.code} ` : '', name: localizedLevel })}`,
    );

    const scoreNote = newRecords.includes('score')
      ? t('over.newRecord')
      : rank && rank.total > 1
        ? t('over.rankNote', { rank: rank.rank, total: rank.total })
        : undefined;
    const tiles: [string, string, string?][] = [
      [t('over.tileScore'), formatScore(run.score), scoreNote],
      [
        t('over.tileLevel'),
        run.mode === 'campaign' ? level.code : t('over.endlessLevel', { n: run.level }),
        newRecords.includes('level') ? t('over.newRecord') : undefined,
      ],
      [t('over.tileDamage'), formatNumber(run.totalDamage)],
      [t('over.tileCombo'), String(run.maxCombo)],
      [t('over.tileBricks'), formatNumber(run.kills)],
      [t('over.tileTime'), formatTime(run.time)],
    ];
    byId('over-stats').replaceChildren(
      ...tiles.map(([label, value, note], i) =>
        el(
          'div',
          { class: 'tile' },
          el('div', { class: 'tile-label', text: label }),
          el('div', { class: `tile-value${i === 0 ? ' accent' : ''}`, text: value }),
          note ? el('div', { class: 'tile-note', text: note }) : null,
        ),
      ),
    );

    // The 星尘 payout: one gold line, its parts joined after it, the wishlist nudge last.
    const dust = byId('over-stardust');
    if (payout && payout.total > 0) {
      const parts: string[] = [t('shop.earnedRun', { n: payout.runPaid })];
      if (payout.gift > 0) parts.push(t('shop.earnedGift', { n: payout.gift }));
      if (payout.firstUse > 0) parts.push(t('shop.earnedFirstUse', { n: payout.firstUse }));
      if (payout.milestones > 0) parts.push(t('shop.earnedMilestone', { n: payout.milestones }));
      if (payout.missions > 0) parts.push(t('shop.earnedDaily', { n: payout.missions }));
      const wish = this.wishlistLine();
      dust.hidden = false;
      dust.replaceChildren(
        el('span', { class: 'dust-total', text: t('shop.earnedLine', { n: payout.total }) }),
        el('span', { class: 'dust-parts', text: parts.join(' · ') }),
        ...(payout.halved ? [el('span', { class: 'dust-halved', text: t('shop.earnedHalved') })] : []),
        ...(wish ? [el('span', { class: 'dust-wish', text: wish })] : []),
      );
    } else {
      dust.hidden = true;
    }

    const owned = this.hud.ownedUpgrades(run.upgrades);
    byId('over-build').replaceChildren(...owned.map(({ def, level: lv }) => this.hud.tile(def, lv, true)));
    document.querySelector('.results-build')?.toggleAttribute('hidden', owned.length === 0);

    // One bar per level cleared: height is time taken, colour shifts to red as damage taken rises.
    const longest = Math.max(1, ...run.history.map((record) => record.time));
    byId('over-timeline').replaceChildren(
      ...run.history.map((record, i) => {
        const color = mixHex(DEFAULT_ACCENT, 0xff3d5a, Math.min(1, record.damageTaken / 3));
        const bar = el('div', {
          class: `tl-bar${record.level % 5 === 0 ? ' boss' : ''}`,
          style: `height:${Math.max(10, (record.time / longest) * 100).toFixed(1)}%;--c:${hexCss(color)}`,
          title: t('over.timelineTip', {
            level: record.level,
            name: record.name,
            time: record.time.toFixed(1),
            n: record.damageTaken,
          }),
        });
        bar.style.animationDelay = `${Math.min(i, 20) * 35}ms`;
        return bar;
      }),
    );
    this.show('over');
  }

  showCodex(): void {
    if (this.current === 'menu') this.returnTo = 'menu';
    this.renderCodex();
    this.show('codex');
  }

  /** The local leaderboard. Opened from the menu or straight from a finished run. */
  showHistory(): void {
    this.returnTo = this.current === 'over' ? 'over' : 'menu';
    this.renderHistory();
    this.show('history');
  }

  /** The cloud leaderboard. Hidden entirely when this build has no credentials. */
  showCloud(): void {
    if (!this.cloudPanel) return;
    this.returnTo = this.current === 'over' ? 'over' : 'menu';
    // The player is about to look at the board: any submit that failed earlier gets its retry now.
    this.actions.flushCloudSubmits?.();
    this.cloudPanel.open();
    this.show('cloud');
  }

  /**
   * Writes the upload result onto the results screen. Called when the submit settles, which can be
   * a second or two after the screen appears — hence a separate entry point rather than a field of
   * `showResults`.
   */
  cloudStatus(text: string, tone: 'ok' | 'warn' = 'ok'): void {
    const line = byId('over-cloud');
    line.hidden = false;
    line.dataset.tone = tone;
    setText(line, text);
  }

  // ───────────────────────────── 星尘商店 ─────────────────────────────

  showShop(): void {
    if (this.current === 'menu') this.returnTo = 'menu';
    this.renderShop();
    this.show('shop');
  }

  /** Re-draws the shop in place when it is on screen; the wallet mirror calls this after adopting cloud state. */
  refreshShopIfOpen(): void {
    if (this.current === 'shop') this.renderShop();
  }

  private renderShop(): void {
    document.querySelectorAll<HTMLButtonElement>('#shop-tabs .tab').forEach((tab) => {
      tab.setAttribute('aria-selected', String(tab.dataset.tab === this.shopTab));
    });
    const econ = this.save.economy;
    setText(byId('shop-balance'), t('shop.stardustLine', { n: formatNumber(econ.stardust) }));
    const body = byId('shop-body');
    body.replaceChildren();
    body.scrollTop = 0;
    if (this.shopTab === 'protocols') body.append(...this.protocolCards());
    else if (this.shopTab === 'supplies') body.append(...this.supplyCards());
    else if (this.shopTab === 'skins') body.append(...this.skinCards());
    else body.append(...this.progressRows());
  }

  private protocolCards(): HTMLElement[] {
    const econ = this.save.economy;
    return PROTOCOLS.map((protocol) =>
      this.shopItem({
        id: protocol.id,
        color: protocol.color,
        glyph: `starter:${protocol.id}`,
        name: starterName(protocol),
        en: protocol.en,
        desc: starterDesc(protocol),
        price: protocol.price,
        owned: econ.protocols.includes(protocol.id),
        ownedLabel: t('shop.owned'),
        onBuy: () => this.actions.buyProtocol(protocol.id),
      }),
    );
  }

  private supplyCards(): HTMLElement[] {
    const econ = this.save.economy;
    const clears = this.campaignClears();
    const limit = slotLimit(this.save.records.runs, clears);
    const used = supplyCost(econ.loadout);
    const header = el(
      'div',
      { class: 'shop-slots' },
      el('span', { text: t('shop.slots', { used, limit }) }),
      ...SLOT_GATES.map((gate) => {
        const value = gate.kind === 'runs' ? this.save.records.runs : clears;
        return el('span', {
          class: `shop-gate${value >= gate.count ? ' met' : ''}`,
          text: gate.kind === 'runs' ? t('shop.gateRuns', { n: gate.count }) : t('shop.gateClear'),
        });
      }),
    );
    const cards = SUPPLIES.map((supply) => {
      const owned = econ.supplies.includes(supply.id);
      const carried = econ.loadout.includes(supply.id);
      return this.shopItem({
        id: supply.id,
        color: 0xffd24a,
        glyph: `supply:${supply.id}`,
        name: t(`shop.supply.${supply.id}.name`),
        en: supply.en,
        desc: t(`shop.supply.${supply.id}.desc`),
        price: supply.price,
        owned,
        ownedLabel: carried ? t('shop.carried') : t('shop.owned'),
        onBuy: () => this.actions.buySupply(supply.id),
        onCarry: owned
          ? () => {
              if (!this.actions.toggleLoadout(supply.id)) {
                this.audio.ui('deny');
                return false;
              }
              this.audio.ui('uiClick');
              return true;
            }
          : undefined,
        carried,
        // An unowned supply can be tried free for one run; the mark rides on the trialed card.
        onTrial: owned ? undefined : () => this.actions.setTrialSupply?.(supply.id),
        trialed: econ.trialSupply === supply.id,
      });
    });
    return [header, ...cards];
  }

  /** The cosmetic shelf: the free stock ball look, four ball skins, one backdrop theme. */
  private skinCards(): HTMLElement[] {
    const econ = this.save.economy;
    const classicEquipped = econ.skinBall === null;
    const classic = this.shopItem({
      id: defaultBallSkin,
      color: 0xe6faff,
      glyph: `skin:${defaultBallSkin}`,
      name: t('shop.skin.classic.name'),
      en: 'CLASSIC',
      desc: t('shop.skin.classic.desc'),
      price: 0,
      owned: true,
      ownedLabel: t('shop.owned'),
      onBuy: () => false,
      wishable: false,
      onEquip: () => this.actions.equipSkin(null, 'ball'),
      equipped: classicEquipped,
      equipLabel: classicEquipped ? t('shop.equipped') : t('shop.equip'),
    });
    const cards = SKINS.map((skin) => {
      const owned = econ.skins.includes(skin.id);
      // Ball skins wear their glow; the backdrop theme previews itself on the first chapter.
      const color =
        skin.kind === 'ball'
          ? skin.colors.glow
          : applyBgSkin(CHAPTERS[0]!.bg, CHAPTERS[0]!.accent, skin).accent;
      const equippedBall = skin.kind === 'ball' && econ.skinBall === skin.id;
      const equippedBg = skin.kind === 'bg' && econ.skinBg === skin.id;
      const equipped = equippedBall || equippedBg;
      return this.shopItem({
        id: skin.id,
        color,
        glyph: `skin:${skin.id}`,
        name: t(`shop.skin.${skin.id}.name`),
        en: skin.en,
        desc: t(`shop.skin.${skin.id}.desc`),
        price: skin.price,
        owned,
        ownedLabel: t('shop.owned'),
        onBuy: () => this.actions.buySkin(skin.id),
        wishable: false,
        onEquip: owned
          ? () =>
              skin.kind === 'ball'
                ? this.actions.equipSkin(skin.id, 'ball')
                : this.actions.equipSkin(equipped ? null : skin.id, 'bg')
          : undefined,
        equipped,
        equipLabel: !owned
          ? t('shop.equip')
          : skin.kind === 'bg'
            ? t(equipped ? 'shop.unequip' : 'shop.equip')
            : t(equipped ? 'shop.equipped' : 'shop.equip'),
      });
    });
    return [classic, ...cards];
  }

  private progressRows(): HTMLElement[] {
    const econ = this.save.economy;
    const head = el(
      'div',
      { class: 'shop-progress-head' },
      el('span', {
        text: t('shop.progressLine', { n: econ.milestones.length, total: MILESTONES.length }),
      }),
      el('span', { class: 'shop-progress-note', text: t('shop.progressNote') }),
    );
    const rows = MILESTONES.map((milestone) => {
      const done = econ.milestones.includes(milestone.id);
      const [name, desc] = t(`shop.ms.${milestone.id}`).split('｜');
      return el(
        'div',
        { class: `shop-ms${done ? ' done' : ''}` },
        el('span', { class: 'shop-ms-mark', text: done ? '✓' : '' }),
        el(
          'div',
          { class: 'shop-ms-body' },
          el('h4', { text: name ?? milestone.id }),
          el('p', { text: desc ?? '' }),
        ),
        el('span', { class: 'shop-ms-reward', text: t('shop.stardustLine', { n: milestone.reward }) }),
      );
    });
    return [...this.dailyRows(), head, ...rows];
  }

  /**
   * Today's missions, at the top of the progress tab. The state is only written when a run
   * settles, so a shop opened before the first run of the day shows the fresh draw with zeroed
   * progress instead of yesterday's leftovers — the draw is deterministic, so this always agrees
   * with what `settleEconomy` will roll.
   */
  private dailyRows(): HTMLElement[] {
    const econ = this.save.economy;
    const today = dayKey();
    const live = econ.daily.date === today;
    const title = el(
      'div',
      { class: 'shop-daily-head' },
      el('span', { text: t('shop.dailyTitle') }),
      el('span', { class: 'shop-progress-note', text: t('shop.dailyNote') }),
    );
    const rows = dailyMissionsFor(today).map((mission) => {
      const state = live ? econ.daily.missions.find((m) => m.id === mission.id) : undefined;
      const progress = Math.min(state?.progress ?? 0, mission.target);
      const done = state?.done ?? false;
      return el(
        'div',
        { class: `shop-daily${done ? ' done' : ''}` },
        el('span', { class: 'shop-daily-mark', text: done ? '✓' : '' }),
        el(
          'div',
          { class: 'shop-daily-body' },
          el('h4', { text: t(`shop.daily.${mission.id}`, { n: `${progress}/${mission.target}` }) }),
          el(
            'div',
            { class: 'shop-daily-bar' },
            el('span', { style: `width:${Math.min(100, (progress / mission.target) * 100).toFixed(1)}%` }),
          ),
        ),
        el('span', { class: 'shop-daily-reward', text: t('shop.stardustLine', { n: DAILY_MISSION_REWARD }) }),
      );
    });
    return [title, ...rows];
  }

  /** One catalog row: glyph, copy, and a buy button — or the owned mark, a carry or an equip toggle. */
  private shopItem(opts: {
    id: string;
    color: number;
    glyph: string;
    name: string;
    en: string;
    desc: string;
    price: number;
    owned: boolean;
    ownedLabel: string;
    onBuy: () => boolean;
    onCarry?: () => boolean;
    carried?: boolean;
    onTrial?: () => void;
    trialed?: boolean;
    /** False hides the wishlist button (skins have their own shelf, no nudge). */
    wishable?: boolean;
    /** Renders the equip toggle; the closure returns false for "not owned". */
    onEquip?: () => boolean;
    equipped?: boolean;
    equipLabel?: string;
  }): HTMLElement {
    const econ = this.save.economy;
    const affordable = econ.stardust >= opts.price;
    const wished = econ.wishlist === opts.id;
    const card = el(
      'article',
      { class: `shop-item${opts.owned ? ' owned' : ''}`, style: `--c:${hexCss(opts.color)}` },
      el(
        'div',
        { class: 'shop-glyph' },
        el('img', { src: sigil(opts.glyph, opts.color), alt: '', draggable: 'false' }),
      ),
      el(
        'div',
        { class: 'shop-body' },
        el('h3', { class: 'shop-name', text: opts.name }),
        el('div', { class: 'shop-code', text: opts.en }),
        el('p', { class: 'shop-desc', text: opts.desc }),
      ),
      el(
        'div',
        { class: 'shop-side' },
        opts.owned
          ? el('span', { class: 'shop-owned', text: opts.ownedLabel })
          : el(
              'button',
              {
                class: `btn shop-buy${affordable ? '' : ' locked'}`,
                type: 'button',
                disabled: !affordable,
              },
              el('span', { text: t('shop.buy') }),
              el('span', { class: 'cost', text: t('shop.stardustLine', { n: formatNumber(opts.price) }) }),
            ),
        opts.owned || opts.wishable === false
          ? null
          : el(
              'button',
              { class: `shop-wish${wished ? ' on' : ''}`, type: 'button' },
              el('span', { text: t(wished ? 'shop.wished' : 'shop.wish') }),
            ),
        opts.onTrial
          ? el(
              'button',
              { class: `shop-trial${opts.trialed ? ' on' : ''}`, type: 'button' },
              el('span', { text: t(opts.trialed ? 'shop.supply.trialOn' : 'shop.supply.trial') }),
            )
          : null,
        opts.onCarry
          ? el(
              'button',
              {
                class: `shop-carry${opts.carried ? ' on' : ''}`,
                type: 'button',
              },
              el('span', { text: t(opts.carried ? 'shop.carried' : 'shop.carry') }),
            )
          : null,
        opts.onEquip
          ? el(
              'button',
              { class: `shop-equip${opts.equipped ? ' on' : ''}`, type: 'button' },
              el('span', { text: opts.equipLabel ?? t('shop.equip') }),
            )
          : null,
      ),
    );
    const buy = card.querySelector<HTMLButtonElement>('.shop-buy');
    buy?.addEventListener('click', () => {
      if (opts.onBuy()) this.audio.ui('pick');
      else this.audio.ui('deny');
      this.renderShop();
    });
    const wish = card.querySelector<HTMLButtonElement>('.shop-wish');
    wish?.addEventListener('click', () => {
      this.actions.toggleWishlist(opts.id);
      this.audio.ui('uiClick');
      this.renderShop();
    });
    const trial = card.querySelector<HTMLButtonElement>('.shop-trial');
    trial?.addEventListener('click', () => {
      opts.onTrial?.();
      this.audio.ui('uiClick');
      this.renderShop();
    });
    const carry = card.querySelector<HTMLButtonElement>('.shop-carry');
    carry?.addEventListener('click', () => {
      opts.onCarry?.();
      this.renderShop();
    });
    const equip = card.querySelector<HTMLButtonElement>('.shop-equip');
    equip?.addEventListener('click', () => {
      if (opts.onEquip && !opts.onEquip()) this.audio.ui('deny');
      else this.audio.ui('uiClick');
      this.renderShop();
    });
    return card;
  }

  /** The carried-supplies row on the starter screen: owned supplies toggle into the loadout. */
  private renderLoadout(): void {
    const row = byId('loadout-row');
    const econ = this.save.economy;
    const owned = SUPPLIES.filter((supply) => econ.supplies.includes(supply.id));
    // The trial chip needs the row even when nothing is owned: it is a gift, not a toggle.
    const trial = econ.trialSupply && isSupplyId(econ.trialSupply) ? SUPPLY_MAP[econ.trialSupply] : null;
    row.hidden = owned.length === 0 && !trial;
    if (row.hidden) return;
    const used = supplyCost(econ.loadout);
    const limit = slotLimit(this.save.records.runs, this.campaignClears());
    const chips = owned.map((supply) => {
      const carried = econ.loadout.includes(supply.id);
      const chip = el(
        'button',
        {
          class: `loadout-chip${carried ? ' on' : ''}`,
          type: 'button',
          title: t(`shop.supply.${supply.id}.desc`),
        },
        el('span', { text: t(`shop.supply.${supply.id}.name`) }),
      );
      chip.addEventListener('click', () => {
        if (!this.actions.toggleLoadout(supply.id)) this.audio.ui('deny');
        else this.audio.ui('uiClick');
        this.renderLoadout();
      });
      return chip;
    });
    row.replaceChildren(
      el('span', { class: 'loadout-title', text: t('shop.loadoutTitle') }),
      ...chips,
      // The one-run trial rides along without taking a slot, so it is marked but not clickable.
      ...(trial
        ? [
            el(
              'span',
              {
                class: 'loadout-chip trial on',
                title: `${t('shop.supply.trialOn')} · ${t(`shop.supply.${trial.id}.desc`)}`,
              },
              el('span', { text: t(`shop.supply.${trial.id}.name`) }),
              el('span', { class: 'chip-trial', text: t('shop.supply.trial') }),
            ),
          ]
        : []),
      el('span', {
        class: 'loadout-slots',
        text: t('shop.slots', { used, limit }),
      }),
    );
  }

  /** Menu extras that follow the wallet: the 星尘 line, the wishlist nudge and the shop badge. */
  private syncMenuMeta(): void {
    const econ = this.save.economy;
    const started = econ.lifetime > 0 || econ.stardust > 0 || this.save.records.runs > 0;
    setText(byId('menu-stardust'), started ? t('shop.stardustLine', { n: formatNumber(econ.stardust) }) : '');
    const wishLine = byId('menu-wish');
    const wish = this.wishlistLine();
    wishLine.hidden = wish === null;
    if (wish) setText(wishLine, wish);
    // The badge marks something new to spend on: the unpaid first gift, or any affordable item.
    const affordable =
      PROTOCOLS.some((p) => !econ.protocols.includes(p.id) && econ.stardust >= p.price) ||
      SUPPLIES.some((s) => !econ.supplies.includes(s.id) && econ.stardust >= s.price) ||
      SKINS.some((s) => !econ.skins.includes(s.id) && econ.stardust >= s.price);
    const badge = byId('shop-badge');
    badge.hidden = !(affordable || !econ.firstGift);
    if (!badge.hidden) setText(badge, econ.firstGift ? t('shop.menuBadge') : t('shop.giftBadge'));
  }

  /** The wishlist nudge for the menu and the results screen, or null when there is nothing to nudge. */
  private wishlistLine(): string | null {
    const econ = this.save.economy;
    const wish = econ.wishlist;
    if (!wish) return null;
    const protocol = PROTOCOL_MAP[wish];
    const price = protocol?.price ?? (isSupplyId(wish) ? SUPPLY_MAP[wish].price : 0);
    if (!price || econ.protocols.includes(wish) || econ.supplies.includes(wish)) return null;
    // Affordable already: the shop badge carries the nudge; a 还差 0 counter is only noise.
    if (econ.stardust >= price) return null;
    const name = protocol ? starterName(protocol) : t(`shop.supply.${wish}.name`);
    return t('shop.wishLine', { name, n: Math.max(0, price - econ.stardust) });
  }

  /** Campaign clears ever recorded, as far as the economy's counters know. */
  private campaignClears(): number {
    return Object.values(this.save.economy.winsByDifficulty).some((n) => (n ?? 0) > 0) ? 1 : 0;
  }

  private renderHistory(): void {
    const records = this.save.records;
    document.querySelectorAll<HTMLButtonElement>('#history-tabs .tab').forEach((tab) => {
      tab.setAttribute('aria-selected', String(tab.dataset.tab === this.historyTab));
    });
    setText(
      byId('history-summary'),
      t('history.summary', {
        runs: records.runs,
        wins: records.wins,
        bricks: formatNumber(records.bricks),
      }),
    );
    const body = byId('history-body');
    body.replaceChildren();
    body.scrollTop = 0;

    const newest = records.history.reduce((max, entry) => Math.max(max, entry.date), 0);
    const entries = records.history
      .filter((entry) => entry.mode === this.historyTab)
      .sort((a, b) => b.score - a.score || b.date - a.date);
    if (entries.length === 0) {
      body.append(
        el('div', {
          class: 'history-empty',
          text: this.historyTab === 'campaign' ? t('history.emptyCampaign') : t('history.emptyEndless'),
        }),
      );
      return;
    }
    entries.forEach((entry, i) => {
      const rank = i + 1;
      const where =
        entry.mode === 'campaign'
          ? t(entry.won ? 'history.whereWon' : 'history.whereLost', {
              code: entry.code,
              name: entry.name,
            }).trim()
          : t('history.whereEndless', { level: entry.level });
      const icons = this.miniBuild(entry.build);
      const row = el(
        'div',
        { class: `rank-row${rank <= 3 ? ` top${rank}` : ''}${entry.date === newest ? ' fresh' : ''}` },
        el('div', { class: 'rank-badge', text: String(rank).padStart(2, '0') }),
        el(
          'div',
          { class: 'rank-main' },
          el(
            'div',
            { class: 'rank-scoreline' },
            scoreEl(formatScore(entry.score)),
            entry.difficulty !== 'standard'
              ? el('span', {
                  class: 'rank-chip diff',
                  style: `--c:#${difficultyOf(entry.difficulty).color.toString(16).padStart(6, '0')}`,
                  text: difficultyName(difficultyOf(entry.difficulty)),
                })
              : null,
            entry.won ? el('span', { class: 'rank-chip win', text: 'WIN' }) : null,
            entry.date === newest
              ? el('span', { class: 'rank-chip new', text: t('history.chipLatest') })
              : null,
            icons.length > 0 ? el('span', { class: 'rank-build' }, ...icons) : null,
          ),
          el('div', {
            class: 'rank-meta',
            text: t('history.metaRow', {
              where,
              combo: formatNumber(entry.combo),
              damage: formatNumber(entry.damage),
              time: formatTime(entry.time),
              date: this.dateLabel(entry.date),
            }),
          }),
        ),
      );
      row.style.animationDelay = `${Math.min(i, 12) * 40}ms`;
      body.append(row);
    });
  }

  /** Small inline icons of a stored run's build, strongest first. */
  private miniBuild(build: Record<string, number>): HTMLElement[] {
    const entries = Object.entries(build)
      .map(([id, level]) => ({ def: UPGRADE_MAP[id], level }))
      .filter(
        (entry): entry is { def: UpgradeDef; level: number } => entry.def !== undefined && entry.level > 0,
      )
      .sort((a, b) => RARITY_INFO[b.def.rarity].rank - RARITY_INFO[a.def.rarity].rank);
    const icons: HTMLElement[] = entries.slice(0, 8).map(({ def, level }) =>
      el('img', {
        src: sigil(def.id, upgradeColor(def.tags, def.rarity)),
        alt: upgradeName(def),
        title: `${upgradeName(def)} Lv${level}`,
      }),
    );
    if (entries.length > 8)
      icons.push(el('span', { class: 'rank-build-more', text: `+${entries.length - 8}` }));
    return icons;
  }

  private dateLabel(date: number): string {
    const d = new Date(date);
    const pad = (value: number): string => String(value).padStart(2, '0');
    return `${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  /** Composes the share card, then flashes the button so the click is acknowledged. */
  private async takeScorecard(): Promise<void> {
    const button = byId<HTMLButtonElement>('btn-shot');
    const label = button.querySelector<HTMLElement>('.shot-text') ?? button;
    const original = t('over.saveShot');
    button.disabled = true;
    const ok = await this.actions.downloadScorecard().catch(() => false);
    button.disabled = false;
    label.textContent = ok ? t('over.shotSaved') : t('over.shotFailed');
    if (ok) this.audio.ui('pick', 2);
    window.setTimeout(() => {
      label.textContent = original;
    }, 1800);
  }

  showSettings(): void {
    this.returnTo = this.current === 'pause' ? 'pause' : 'menu';
    this.syncSettingsControls();
    this.show('settings');
  }

  /** Fills the seven controls from the save. Language-neutral values: a switch only re-fills these. */
  private syncSettingsControls(): void {
    const s = this.save.settings;
    byId<HTMLSelectElement>('set-language').value = s.language;
    byId<HTMLInputElement>('set-music').value = String(s.music);
    byId<HTMLInputElement>('set-sfx').value = String(s.sfx);
    byId<HTMLInputElement>('set-shake').checked = s.shake;
    byId<HTMLInputElement>('set-flash').checked = s.flashes;
    byId<HTMLSelectElement>('set-quality').value = s.quality;
    byId<HTMLInputElement>('set-seed').value = s.seed;
  }

  /** Performance readout in settings: frame-rate figures plus the render step actually in effect. */
  private renderPerf(): void {
    const info = this.actions.perf();
    setText(
      byId('perf-line'),
      info.samples < 30
        ? t('settings.perfCollecting')
        : t('settings.perfLine', {
            fps: Math.round(info.fps),
            low: Math.round(info.lowFps),
            jank: Math.round(info.jank * 100),
          }),
    );
    const note = byId('quality-note');
    note.hidden = !info.adjusted && !info.gaveUp;
    if (info.adjusted) {
      setText(note, t('settings.perfAdjusted', { tier: tierLabel(info.tier) }));
    } else if (info.gaveUp) {
      setText(note, t('settings.perfGaveUp'));
    }
  }

  /** Measures where the GPU time of one frame goes, for tuning on real hardware. */
  private runProfile(): void {
    const button = byId<HTMLButtonElement>('btn-perf');
    button.disabled = true;
    const passes = this.actions.profileGpu(24);
    button.disabled = false;
    const out = byId('perf-gpu');
    out.hidden = false;
    if (!passes || !(passes.total > 0)) {
      setText(out, t('settings.perfFail'));
      return;
    }
    const names: [string, string][] = [
      ['composite', t('settings.gpuComposite')],
      ['backdrop', t('settings.gpuBackdrop')],
      ['lights', t('settings.gpuLights')],
      ['surfaces', t('settings.gpuSurfaces')],
      ['bloom', t('settings.gpuBloom')],
      ['nebula', t('settings.gpuNebula')],
      ['text', t('settings.gpuText')],
    ];
    const parts = names
      .filter(([key]) => (passes[key] ?? 0) > 0)
      .map(([key, label]) => `${label} ${Math.round(((passes[key] ?? 0) / passes.total) * 100)}%`);
    setText(out, t('settings.gpuLine', { ms: passes.total.toFixed(1), parts: parts.join(' · ') }));
  }

  // ───────────────────────────── call-outs ─────────────────────────────

  banner(options: BannerOptions): void {
    const duration = options.duration ?? 1.9;
    // Big announcements replace each other; call-outs queue, up to two, and never repeat side by side.
    if (!options.small) this.bannerHost.replaceChildren();
    else if (options.key) {
      this.bannerHost.querySelectorAll(`[data-key="${options.key}"]`).forEach((node) => node.remove());
    }
    while (this.bannerHost.children.length >= 2) this.bannerHost.firstElementChild?.remove();
    const node = el(
      'div',
      {
        class: `banner-item${options.small ? ' small' : ''}`,
        'data-key': options.key,
        style: `--c:${hexCss(options.color ?? this.accent)};animation-duration:${duration}s`,
      },
      el('div', { class: 'banner-title', text: options.title }),
      options.sub ? el('div', { class: 'banner-sub', text: options.sub }) : null,
      options.note ? el('div', { class: 'banner-note', text: options.note }) : null,
    );
    this.bannerHost.append(node);
    window.setTimeout(() => node.remove(), duration * 1000 + 120);
  }

  /** `key`: a new toast with the same key replaces the old one, so an update never stacks on top. */
  toast(title: string, sub = '', color = this.accent, key?: string): void {
    if (key) this.toastHost.querySelectorAll(`[data-key="${key}"]`).forEach((node) => node.remove());
    while (this.toastHost.children.length >= 4) this.toastHost.firstElementChild?.remove();
    const node = el(
      'div',
      { class: 'toast', style: `--c:${hexCss(color)}`, 'data-key': key },
      el('div', { class: 'toast-title', text: title }),
      sub ? el('div', { class: 'toast-sub', text: sub }) : null,
    );
    this.toastHost.append(node);
    window.setTimeout(() => node.remove(), 3900);
  }

  clearCallouts(): void {
    this.bannerHost.replaceChildren();
    this.toastHost.replaceChildren();
  }

  // ───────────────────────────── tooltip ─────────────────────────────

  showTooltip(def: UpgradeDef, anchor: HTMLElement): void {
    const rarity = RARITY_INFO[def.rarity];
    const color = upgradeColor(def.tags, def.rarity);
    const level = this.levels[def.id] ?? 0;
    this.tooltip.replaceChildren(
      ...keep(
        el(
          'div',
          { class: 'tt-head' },
          el('span', { class: 'tt-rarity', text: rarityName(def.rarity) }),
          el('span', {
            class: 'tt-level',
            text: level > 0 ? `Lv ${level} / ${def.maxLevel}` : t('codex.notOwned'),
          }),
        ),
        el('div', { class: 'tt-name' }, upgradeName(def), el('span', { text: def.code })),
        el('div', { class: 'tt-flavor', text: upgradeFlavor(def) }),
        el('p', { class: 'desc', html: upgradeDescribe(def, level > 0 ? level : 1) }),
        level > 0 && level < def.maxLevel
          ? el('p', {
              class: 'desc next',
              html: t('codex.nextLevel', { desc: upgradeDescribe(def, level + 1) }),
            })
          : null,
        el('div', { class: 'chips' }, ...tagChips(def)),
      ),
    );
    this.tooltip.style.setProperty('--rarity', hexCss(rarity.color));
    this.tooltip.style.setProperty('--c', hexCss(color));
    this.tooltip.hidden = false;

    // Open towards the arena, and never off-screen.
    const rect = anchor.getBoundingClientRect();
    const box = this.tooltip.getBoundingClientRect();
    const towardRight = rect.left < window.innerWidth / 2;
    let left = towardRight ? rect.right + 14 : rect.left - box.width - 14;
    left = Math.max(8, Math.min(left, window.innerWidth - box.width - 8));
    const top = Math.max(8, Math.min(rect.top - 8, window.innerHeight - box.height - 8));
    this.tooltip.style.left = `${left}px`;
    this.tooltip.style.top = `${top}px`;
  }

  hideTooltip(): void {
    this.tooltip.hidden = true;
  }

  // ───────────────────────────── card builders ─────────────────────────────

  /** Tilt a card towards the pointer and drag its highlight along. */
  private tilt(card: HTMLElement): void {
    card.addEventListener('pointermove', (event) => {
      if (event.pointerType !== 'mouse') return;
      const rect = card.getBoundingClientRect();
      const px = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
      const py = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
      card.style.setProperty('--ry', `${((px - 0.5) * 16).toFixed(2)}deg`);
      card.style.setProperty('--rx', `${((0.5 - py) * 14).toFixed(2)}deg`);
      card.style.setProperty('--ty', '-8px');
      card.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`);
      card.style.setProperty('--my', `${(py * 100).toFixed(1)}%`);
    });
    card.addEventListener('pointerleave', () => {
      for (const name of ['--rx', '--ry', '--ty']) card.style.removeProperty(name);
    });
  }

  private upgradeCard(def: UpgradeDef, level: number, onPick: () => void): HTMLElement {
    const rarity = RARITY_INFO[def.rarity];
    const color = upgradeColor(def.tags, def.rarity);
    const next = level + 1;
    const levelText =
      level === 0
        ? t('draft.newUpgrade')
        : next >= def.maxLevel
          ? `Lv ${level} → ${next} · ${t('draft.maxed')}`
          : `Lv ${level} → ${next}`;
    const card = el(
      'button',
      {
        class: `card rarity-${def.rarity}`,
        type: 'button',
        style: `--rarity:${hexCss(rarity.color)};--c:${hexCss(color)}`,
        'aria-label': `${upgradeName(def)}，${rarityName(def.rarity)}`,
        onClick: onPick,
      },
      el(
        'span',
        { class: 'card-rarity' },
        el('span', { text: rarityName(def.rarity) }),
        el('span', { class: 'card-rarity-en', text: rarity.en }),
      ),
      el('div', { class: 'card-art' }, el('img', { src: sigil(def.id, color), alt: '', draggable: 'false' })),
      el('h3', { class: 'card-name', text: upgradeName(def) }),
      el('div', { class: 'card-code', text: def.code }),
      el('p', { class: 'card-flavor', text: upgradeFlavor(def) }),
      el('div', { class: 'card-rule' }),
      el('p', { class: 'card-desc', html: upgradeDescribe(def, next) }),
      el('div', { class: `card-level${level === 0 ? ' new' : ''}`, text: levelText }),
      el('div', { class: 'card-tags' }, ...tagChips(def)),
    );
    this.tilt(card);
    return card;
  }

  private starterCard(starter: Starter, index: number): HTMLElement {
    const grants = Object.entries(starter.grants)
      .map(([id, level]) => (UPGRADE_MAP[id] ? `${upgradeNameById(id)} Lv${level}` : null))
      .filter((text): text is string => text !== null);
    const card = el(
      'button',
      {
        class: 'card card-starter',
        type: 'button',
        style: `--rarity:${hexCss(starter.color)};--c:${hexCss(starter.color)}`,
        'aria-label': starterName(starter),
        onClick: () => this.actions.startRun(this.starterMode, starter, this.difficulty),
      },
      el('span', { class: 'card-rarity' }, el('span', { text: `PROTOCOL 0${index + 1}` })),
      el(
        'div',
        { class: 'card-art' },
        el('img', { src: sigil(`starter:${starter.id}`, starter.color), alt: '', draggable: 'false' }),
      ),
      el('h3', { class: 'card-name', text: starterName(starter) }),
      el('div', { class: 'card-code', text: starter.en }),
      el('p', { class: 'card-flavor', text: starterDesc(starter) }),
      el('div', {
        class: 'card-level',
        text: grants.length > 0 ? grants.join(' · ') : t('starter.crystals', { n: starter.crystals }),
      }),
    );
    this.tilt(card);
    return card;
  }

  // ───────────────────────────── codex ─────────────────────────────

  private renderCodex(): void {
    document.querySelectorAll<HTMLButtonElement>('#codex-tabs .tab').forEach((tab) => {
      tab.setAttribute('aria-selected', String(tab.dataset.tab === this.codexTab));
    });
    const body = byId('codex-body');
    body.replaceChildren();
    body.scrollTop = 0;
    const discovered = new Set(this.save.records.discovered);

    if (this.codexTab === 'upgrades') {
      setText(
        byId('codex-progress'),
        t('codex.progressUpgrades', { n: discovered.size, total: UPGRADES.length }),
      );
      for (const rarity of [...RARITY_ORDER].reverse()) {
        const defs = UPGRADES.filter((def) => def.rarity === rarity);
        const info = RARITY_INFO[rarity];
        body.append(
          el(
            'section',
            { class: 'codex-group', style: `--rarity:${hexCss(info.color)}` },
            el('h3', { text: `${info.en} · ${rarityName(rarity)} × ${defs.length}` }),
            ...defs.map((def) => {
              const color = upgradeColor(def.tags, def.rarity);
              const requires = def.requires
                ? Object.entries(def.requires)
                    .map(([id, min]) => `${upgradeNameById(id)} Lv${min}`)
                    .join('、')
                : '';
              return el(
                'article',
                { class: 'codex-row', style: `--rarity:${hexCss(info.color)};--c:${hexCss(color)}` },
                el('img', { src: sigil(def.id, color), alt: '', draggable: 'false' }),
                el(
                  'div',
                  {},
                  el(
                    'header',
                    {},
                    el('h4', { text: upgradeName(def) }),
                    el('span', { class: 'code', text: def.code }),
                    el('span', {
                      class: 'lv',
                      text: def.maxLevel > 1 ? t('codex.maxLevel', { n: def.maxLevel }) : t('codex.unique'),
                    }),
                    discovered.has(def.id)
                      ? null
                      : el('span', { class: 'lv', text: t('codex.undiscovered') }),
                  ),
                  el('p', { class: 'desc', html: upgradeDescribe(def, 1) }),
                  def.maxLevel > 1
                    ? el('p', {
                        class: 'desc next',
                        html: t('codex.maxedDesc', { desc: upgradeDescribe(def, def.maxLevel) }),
                      })
                    : null,
                  requires ? el('p', { class: 'req', text: t('codex.requires', { list: requires }) }) : null,
                  el('div', { class: 'chips' }, ...tagChips(def)),
                ),
              );
            }),
          ),
        );
      }
      return;
    }

    if (this.codexTab === 'reactions') {
      setText(byId('codex-progress'), t('codex.progressReactions'));
      body.append(
        el(
          'section',
          { class: 'codex-group' },
          ...REACTIONS.map((reaction) =>
            el(
              'article',
              {
                class: 'codex-row reaction',
                style: `--rarity:${hexCss(reaction.color)};--c:${hexCss(reaction.color)}`,
              },
              el('img', {
                src: sigil(`reaction:${reaction.id}`, reaction.color),
                alt: '',
                draggable: 'false',
              }),
              el(
                'div',
                {},
                el(
                  'header',
                  {},
                  el('h4', { text: reactionName(reaction) }),
                  el('span', { class: 'code', text: reaction.en }),
                ),
                el('p', { class: 'recipe', text: reactionRecipe(reaction) }),
                el('p', { class: 'desc', text: reactionDesc(reaction) }),
              ),
            ),
          ),
        ),
      );
      return;
    }

    if (this.codexTab === 'buffs') {
      setText(byId('codex-progress'), t('codex.progressBuffs'));
      // Buffs belong to the resonance school, so the group takes its colour.
      const group = TAG_INFO.resonance.color;
      body.append(
        el(
          'section',
          { class: 'codex-group', style: `--rarity:${hexCss(group)}` },
          el('h3', { text: `POWER-UPS · ${t('codex.tabBuffs')} × ${BUFFS.length}` }),
          ...BUFFS.map((def) => {
            const color = buffColor(def.id);
            return el(
              'article',
              { class: 'codex-row', style: `--rarity:${hexCss(color)};--c:${hexCss(color)}` },
              el('img', { src: sigil(`buff:${def.id}`, def.color), alt: '', draggable: 'false' }),
              el(
                'div',
                {},
                el(
                  'header',
                  {},
                  el('h4', { text: buffName(def) }),
                  el('span', { class: 'code', text: def.code }),
                  el('span', {
                    class: 'lv',
                    text:
                      def.duration > 0 ? t('codex.buffTimed', { n: def.duration }) : t('codex.buffInstant'),
                  }),
                ),
                el('p', { class: 'desc', text: buffDesc(def) }),
              ),
            );
          }),
        ),
      );
      return;
    }

    setText(byId('codex-progress'), t('codex.progressRules'));
    body.append(
      el(
        'div',
        { class: 'rules' },
        el('h3', { text: t('codex.ruleTarget') }),
        el('p', { html: t('codex.ruleTargetBody') }),
        el('h3', { text: t('codex.ruleCatch') }),
        el('p', { html: t('codex.ruleCatchBody') }),
        el('h3', { text: t('codex.ruleBullets') }),
        el('p', { html: t('codex.ruleBulletsBody') }),
        el('h3', { text: t('codex.ruleOverdrive') }),
        el('p', { html: t('codex.ruleOverdriveBody') }),
        el('h3', { text: t('codex.ruleBuild') }),
        el('p', { html: t('codex.ruleBuildBody', { n: UPGRADES.length }) }),
        el('h3', { text: t('codex.ruleBuffs') }),
        el('p', { html: t('codex.ruleBuffsBody') }),
        el('h3', { text: t('codex.ruleCrystals') }),
        el('p', { html: t('codex.ruleCrystalsBody') }),
      ),
    );
  }

  /** First banner of a level: sector, name, and its mutator if it has one. */
  announceLevel(session: Session): void {
    const plan = session.world.level;
    this.setAccent((CHAPTERS[plan.chapter] ?? CHAPTERS[0]).accent);
    if (session.run.level === 1 && session.run.levelsCleared === 0) {
      const tier = difficultyOf(session.run.difficulty);
      if (tier.id !== 'standard') {
        this.toast(
          t('callouts.difficultyToast', { name: difficultyName(tier), en: tier.en }),
          difficultyDetail(session.run.difficulty).join(' · '),
          tier.color,
        );
      }
      this.toast(t('callouts.firstToastTitle'), t('callouts.firstToastBody'), 0x7dffe0);
    }
    if (plan.boss) {
      this.banner({
        title: plan.boss.en,
        sub: bossName(plan.boss),
        note: bossTitle(plan.boss),
        color: 0xff2fb0,
        duration: 2.6,
      });
    } else {
      this.banner({
        title: `SECTOR ${plan.code}`,
        sub: levelName(plan.chapter, plan.name),
        note: plan.modifier
          ? t('callouts.bannerMutator', {
              name: mutatorName(plan.modifier),
              desc: mutatorDesc(plan.modifier),
            })
          : undefined,
        duration: plan.modifier ? 2.8 : 1.7,
      });
    }
  }

  // ───────────────────────────── language ─────────────────────────────

  /**
   * Applies a language switch to everything currently on screen: the static markup sweep, then a
   * re-render of whichever screen is up. Data-driven screens re-render from cached args; the
   * in-game HUD picks the new language up on its next frame by itself.
   */
  applyLanguage(): void {
    applyDom();
    this.tutorial.applyLanguage();
    this.changelog.applyLanguage();
    this.nicknamePrompt?.applyLanguage();
    switch (this.current) {
      case 'menu':
        this.showMenu();
        break;
      case 'starter':
        this.showStarter(this.starterMode);
        break;
      case 'draft':
        if (this.lastDraft) this.renderDraft(this.lastDraft.info, this.lastDraft.session);
        break;
      case 'over':
        if (this.lastResults) this.showResults(...this.lastResults);
        break;
      case 'codex':
        this.renderCodex();
        break;
      case 'history':
        this.renderHistory();
        break;
      case 'cloud':
        this.cloudPanel?.applyLanguage();
        break;
      case 'shop':
        this.renderShop();
        break;
      case 'settings':
        this.syncSettingsControls();
        break;
      default:
        break; // In play or on the static pause screen: swept markup + the next HUD frame suffice.
    }
  }
}

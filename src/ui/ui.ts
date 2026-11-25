import type { AudioDirector } from '../audio/director';
import { formatNumber, formatScore, formatTime, mixHex } from '../core/math';
import type { SaveData, Settings } from '../core/storage';
import { difficultyOf, DIFFICULTIES, type DifficultyId } from '../game/difficulty';
import { CAMPAIGN_LENGTH } from '../game/levels/generator';
import { CHAPTERS, REACTIONS } from '../game/levels/definitions';
import type { RunMode } from '../game/run';
import type { Session, SessionEvents } from '../game/session';
import { STARTERS, type Starter } from '../game/starters';
import { UPGRADES, UPGRADE_MAP } from '../game/upgrades/defs';
import { RARITY_INFO, RARITY_ORDER, upgradeColor } from '../game/upgrades/present';
import type { UpgradeDef } from '../game/upgrades/types';
import type { Leaderboard } from '../net/leaderboard';
import { tierLabel, type Tier } from '../render/governor';
import type { Layout } from '../render/layout';
import { CloudPanel } from './cloud';
import { byId, el, hexCss, keep, scoreEl, setText } from './dom';
import { HUD, tagChips, type HudHost } from './hud';
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
  'menu' | 'starter' | 'draft' | 'pause' | 'over' | 'codex' | 'settings' | 'history' | 'cloud';

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
];

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
  private accent = DEFAULT_ACCENT;
  /** Levels of the run currently on screen, for tooltips. */
  private levels: Record<string, number> = {};

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

  constructor(
    private readonly actions: UiActions,
    private readonly audio: AudioDirector,
    private readonly save: SaveData,
  ) {
    this.difficulty = save.settings.difficulty;
    this.hud = new HUD(this);
    this.cloudPanel = actions.cloud ? new CloudPanel(actions.cloud, audio) : null;
    // Any exit from the deck — finish, skip, Esc — marks it seen once, via the usual settings route.
    this.tutorial = new Tutorial(audio, () => this.actions.updateSettings({ tutorialSeen: true }));
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
    on('codex', () => this.showCodex());
    on('history', () => this.showHistory());
    on('cloud', () => this.showCloud());
    on('tutorial', () => this.tutorial.openTutorial());
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

    const patch = (change: Partial<Settings>): void => this.actions.updateSettings(change);
    // Capture the elements: `event.currentTarget` is only reliably typed inside the dispatch.
    const music = byId<HTMLInputElement>('set-music');
    const sfx = byId<HTMLInputElement>('set-sfx');
    const shake = byId<HTMLInputElement>('set-shake');
    const flash = byId<HTMLInputElement>('set-flash');
    const quality = byId<HTMLSelectElement>('set-quality');
    const seed = byId<HTMLInputElement>('set-seed');
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
      this.current === 'cloud'
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
    this.hud.setRoom(portrait || layout.ax >= 300, portrait || layout.ax >= 220);
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
      const boss = Math.floor(records.bestCampaign / 5);
      parts.push(
        `闯关最深 ${records.bestCampaign}${records.bestCampaign >= CAMPAIGN_LENGTH ? '' : `（击败 BOSS ×${boss}）`}`,
      );
    }
    if (records.bestEndless > 0) parts.push(`无尽最深 第 ${records.bestEndless} 关`);
    if (records.bestScore > 0) parts.push(`最高分 ${formatScore(records.bestScore)}`);
    if (records.wins > 0) parts.push(`通关 ${records.wins} 次`);
    if (records.runs > 0) parts.push(`已打 ${records.runs} 局`);
    byId('menu-records').textContent =
      parts.length > 0 ? parts.join(' · ') : '还没有记录。第一局，从这里开始。';
    // A build without credentials simply has no cloud section: no dead menu entry.
    byId('menu-cloud').hidden = this.cloudPanel === null;
    // First launch of a fresh save opens the deck on top of the menu; veterans keep their menu.
    if (shouldAutoShow(this.save.settings, this.save.records)) this.tutorial.openTutorial();
    this.setAccent(DEFAULT_ACCENT);
    this.show('menu');
  }

  showPlay(): void {
    this.show(null);
  }

  showStarter(mode: RunMode): void {
    this.starterMode = mode;
    byId('starter-eyebrow').textContent =
      mode === 'campaign' ? 'CAMPAIGN · 15 SECTORS · 3 BOSSES' : 'ENDLESS · 没有终点';
    this.renderDifficulty();
    const grid = byId('starter-grid');
    grid.replaceChildren(
      ...STARTERS.map((starter, i) => {
        const card = this.starterCard(starter, i);
        card.style.animationDelay = `${i * 80}ms`;
        return card;
      }),
    );
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
          el('b', { text: tier.name }),
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
    setText(byId('diff-detail'), difficultyOf(this.difficulty).detail.join(' · '));
  }

  showDraft(info: SessionEvents['draft'], session: Session): void {
    const cards = byId('draft-cards');
    cards.replaceChildren();
    info.options.forEach((def, i) => {
      const level = session.run.upgrades[def.id] ?? 0;
      const card = this.upgradeCard(def, level, () => this.actions.choose(def.id));
      card.style.animationDelay = `${i * 90}ms`;
      cards.append(card);
    });
    setText(byId('draft-eyebrow'), `SECTOR ${session.world.level.code} CLEAR`);
    setText(byId('draft-crystals'), formatNumber(session.run.crystals));
    setText(byId('reroll-cost'), `◆ ${info.rerollCost}`);
    setText(byId('skip-reward'), `+◆ ${info.skipReward}`);
    byId<HTMLButtonElement>('btn-reroll').disabled = session.run.crystals < info.rerollCost;
    this.show('draft');
    this.audio.ui('draft');
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
  ): void {
    const run = session.run;
    const level = session.world.level;
    const tier = difficultyOf(run.difficulty);
    const tierLabel = tier.id !== 'standard' ? `${tier.name}难度 · ` : '';
    // The upload line belongs to this run; the app fills it in when the submit settles.
    byId('over-cloud').hidden = true;
    setText(byId('over-eyebrow'), won ? 'CAMPAIGN COMPLETE' : 'RUN TERMINATED');
    setText(byId('over-title'), won ? '深渊已被碾碎' : '护盾击穿');
    setText(
      byId('over-sub'),
      won
        ? `三个 BOSS，十五个扇区，一套离谱到没边的构筑。${tierLabel ? `（${tier.name}）` : ''}`
        : `${tierLabel}${run.mode === 'campaign' ? '闯关模式' : '无尽模式'} · 止步 ${run.mode === 'campaign' ? `${level.code} ` : ''}${level.name}`,
    );

    const scoreNote = newRecords.includes('score')
      ? '新纪录'
      : rank && rank.total > 1
        ? `历史第 ${rank.rank} 名 · 共 ${rank.total} 局`
        : undefined;
    const tiles: [string, string, string?][] = [
      ['最终得分', formatScore(run.score), scoreNote],
      [
        '抵达关卡',
        run.mode === 'campaign' ? level.code : `第 ${run.level} 关`,
        newRecords.includes('level') ? '新纪录' : undefined,
      ],
      ['总伤害', formatNumber(run.totalDamage)],
      ['最高连击', String(run.maxCombo)],
      ['击碎砖块', formatNumber(run.kills)],
      ['存活时间', formatTime(run.time)],
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
          title: `${record.level} ${record.name} · ${record.time.toFixed(1)} 秒 · 受创 ${record.damageTaken}`,
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

  private renderHistory(): void {
    const records = this.save.records;
    document.querySelectorAll<HTMLButtonElement>('#history-tabs .tab').forEach((tab) => {
      tab.setAttribute('aria-selected', String(tab.dataset.tab === this.historyTab));
    });
    setText(
      byId('history-summary'),
      `本地共 ${records.runs} 局 · 通关 ${records.wins} 次 · 累计击碎 ${formatNumber(records.bricks)} 块砖`,
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
          text:
            this.historyTab === 'campaign'
              ? '还没有闯关记录。第一局，从主菜单开始。'
              : '还没有无尽模式记录。',
        }),
      );
      return;
    }
    entries.forEach((entry, i) => {
      const rank = i + 1;
      const where =
        entry.mode === 'campaign'
          ? `${entry.won ? '通关' : '止步'} ${entry.code} ${entry.name}`.trim()
          : `第 ${entry.level} 关`;
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
                  text: difficultyOf(entry.difficulty).name,
                })
              : null,
            entry.won ? el('span', { class: 'rank-chip win', text: 'WIN' }) : null,
            entry.date === newest ? el('span', { class: 'rank-chip new', text: '最新' }) : null,
            icons.length > 0 ? el('span', { class: 'rank-build' }, ...icons) : null,
          ),
          el('div', {
            class: 'rank-meta',
            text: `${where} · 连击 ${formatNumber(entry.combo)} · 伤害 ${formatNumber(entry.damage)} · ${formatTime(entry.time)} · ${this.dateLabel(entry.date)}`,
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
        alt: def.name,
        title: `${def.name} Lv${level}`,
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
    const original = label.textContent ?? '保存战绩截图';
    button.disabled = true;
    const ok = await this.actions.downloadScorecard().catch(() => false);
    button.disabled = false;
    label.textContent = ok ? '已保存 ✓' : '生成失败';
    if (ok) this.audio.ui('pick', 2);
    window.setTimeout(() => {
      label.textContent = original;
    }, 1800);
  }

  showSettings(): void {
    this.returnTo = this.current === 'pause' ? 'pause' : 'menu';
    const s = this.save.settings;
    byId<HTMLInputElement>('set-music').value = String(s.music);
    byId<HTMLInputElement>('set-sfx').value = String(s.sfx);
    byId<HTMLInputElement>('set-shake').checked = s.shake;
    byId<HTMLInputElement>('set-flash').checked = s.flashes;
    byId<HTMLSelectElement>('set-quality').value = s.quality;
    byId<HTMLInputElement>('set-seed').value = s.seed;
    this.show('settings');
  }

  /** Performance readout in settings: frame-rate figures plus the render step actually in effect. */
  private renderPerf(): void {
    const info = this.actions.perf();
    setText(
      byId('perf-line'),
      info.samples < 30
        ? '正在采集…'
        : `平均 ${Math.round(info.fps)} fps · 低帧 ${Math.round(info.lowFps)} fps · 卡顿 ${Math.round(info.jank * 100)}%`,
    );
    const note = byId('quality-note');
    note.hidden = !info.adjusted && !info.gaveUp;
    if (info.adjusted) {
      setText(
        note,
        `实际生效：${tierLabel(info.tier)}。本机帧率不足时游戏会自动降档并记住；手动选择画质后，会按你的选择重新尝试。`,
      );
    } else if (info.gaveUp) {
      setText(note, '检测到帧率偏低，但降低画质并不能改善——多半是系统省电模式限制了帧率，与画质无关。');
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
      setText(out, '未能测得渲染耗时。');
      return;
    }
    const names: [string, string][] = [
      ['composite', '合成'],
      ['backdrop', '背景'],
      ['lights', '光效'],
      ['surfaces', '砖与球'],
      ['bloom', '泛光'],
      ['nebula', '星云'],
      ['text', '数字'],
    ];
    const parts = names
      .filter(([key]) => (passes[key] ?? 0) > 0)
      .map(([key, label]) => `${label} ${Math.round(((passes[key] ?? 0) / passes.total) * 100)}%`);
    setText(
      out,
      `GPU 每帧约 ${passes.total.toFixed(1)} ms — ${parts.join(' · ')}（每个通道含约 0.1ms 测量开销）`,
    );
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
          el('span', { class: 'tt-rarity', text: rarity.name }),
          el('span', { class: 'tt-level', text: level > 0 ? `Lv ${level} / ${def.maxLevel}` : '尚未获得' }),
        ),
        el('div', { class: 'tt-name' }, def.name, el('span', { text: def.code })),
        el('div', { class: 'tt-flavor', text: def.flavor }),
        el('p', { class: 'desc', html: level > 0 ? def.describe(level) : def.describe(1) }),
        level > 0 && level < def.maxLevel
          ? el('p', { class: 'desc next', html: `下一级：${def.describe(level + 1)}` })
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
        ? 'NEW · 新强化'
        : next >= def.maxLevel
          ? `Lv ${level} → ${next} · 满级`
          : `Lv ${level} → ${next}`;
    const card = el(
      'button',
      {
        class: `card rarity-${def.rarity}`,
        type: 'button',
        style: `--rarity:${hexCss(rarity.color)};--c:${hexCss(color)}`,
        'aria-label': `${def.name}，${rarity.name}`,
        onClick: onPick,
      },
      el(
        'span',
        { class: 'card-rarity' },
        el('span', { text: rarity.name }),
        el('span', { class: 'card-rarity-en', text: rarity.en }),
      ),
      el('div', { class: 'card-art' }, el('img', { src: sigil(def.id, color), alt: '', draggable: 'false' })),
      el('h3', { class: 'card-name', text: def.name }),
      el('div', { class: 'card-code', text: def.code }),
      el('p', { class: 'card-flavor', text: def.flavor }),
      el('div', { class: 'card-rule' }),
      el('p', { class: 'card-desc', html: def.describe(next) }),
      el('div', { class: `card-level${level === 0 ? ' new' : ''}`, text: levelText }),
      el('div', { class: 'card-tags' }, ...tagChips(def)),
    );
    this.tilt(card);
    return card;
  }

  private starterCard(starter: Starter, index: number): HTMLElement {
    const grants = Object.entries(starter.grants)
      .map(([id, level]) => (UPGRADE_MAP[id] ? `${UPGRADE_MAP[id].name} Lv${level}` : null))
      .filter((text): text is string => text !== null);
    const card = el(
      'button',
      {
        class: 'card card-starter',
        type: 'button',
        style: `--rarity:${hexCss(starter.color)};--c:${hexCss(starter.color)}`,
        'aria-label': starter.name,
        onClick: () => this.actions.startRun(this.starterMode, starter, this.difficulty),
      },
      el('span', { class: 'card-rarity' }, el('span', { text: `PROTOCOL 0${index + 1}` })),
      el(
        'div',
        { class: 'card-art' },
        el('img', { src: sigil(`starter:${starter.id}`, starter.color), alt: '', draggable: 'false' }),
      ),
      el('h3', { class: 'card-name', text: starter.name }),
      el('div', { class: 'card-code', text: starter.en }),
      el('p', { class: 'card-flavor', text: starter.desc }),
      el('div', {
        class: 'card-level',
        text: grants.length > 0 ? grants.join(' · ') : `+${starter.crystals} 碎晶`,
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
        `已遇到 ${discovered.size} / ${UPGRADES.length} 种强化。同体系的强化更容易一起出现。`,
      );
      for (const rarity of [...RARITY_ORDER].reverse()) {
        const defs = UPGRADES.filter((def) => def.rarity === rarity);
        const info = RARITY_INFO[rarity];
        body.append(
          el(
            'section',
            { class: 'codex-group', style: `--rarity:${hexCss(info.color)}` },
            el('h3', { text: `${info.en} · ${info.name} × ${defs.length}` }),
            ...defs.map((def) => {
              const color = upgradeColor(def.tags, def.rarity);
              const requires = def.requires
                ? Object.entries(def.requires)
                    .map(([id, min]) => `${UPGRADE_MAP[id]?.name ?? id} Lv${min}`)
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
                    el('h4', { text: def.name }),
                    el('span', { class: 'code', text: def.code }),
                    el('span', { class: 'lv', text: def.maxLevel > 1 ? `最高 Lv ${def.maxLevel}` : '唯一' }),
                    discovered.has(def.id) ? null : el('span', { class: 'lv', text: '未遇到' }),
                  ),
                  el('p', { class: 'desc', html: def.describe(1) }),
                  def.maxLevel > 1
                    ? el('p', { class: 'desc next', html: `满级：${def.describe(def.maxLevel)}` })
                    : null,
                  requires ? el('p', { class: 'req', text: `需要 ${requires}` }) : null,
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
      setText(byId('codex-progress'), '同时拥有两种元素时自动解锁。反应按固定节奏触发，不会每一下都炸。');
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
                  el('h4', { text: reaction.name }),
                  el('span', { class: 'code', text: reaction.en }),
                ),
                el('p', { class: 'recipe', text: reaction.recipe }),
                el('p', { class: 'desc', text: reaction.desc }),
              ),
            ),
          ),
        ),
      );
      return;
    }

    setText(byId('codex-progress'), '三十秒上手，一辈子变强。');
    body.append(
      el(
        'div',
        { class: 'rules' },
        el('h3', { text: '目标' }),
        el('p', {
          html: '清空每一关的砖块。砖墙会不断下沉，<b>沉过红色警戒线</b>的砖块会击碎一点护盾；护盾归零，本局结束。',
        }),
        el('h3', { text: '接球与瞄准' }),
        el('p', {
          html: '球落到底部<b>不会丢失</b>，稍后从挡板重新发射。用挡板的不同位置接球可以控制回弹角度：边缘打出大角度，中心垂直弹回。正中接球是<b>完美接球</b>，大量充能。',
        }),
        el('h3', { text: '弹幕' }),
        el('p', {
          html: '炮台与 BOSS 会发射弹幕。<b>用挡板拦截</b>即可，漏到底部才会损失护盾。球和激光也能摧毁弹幕。',
        }),
        el('h3', { text: '超载' }),
        el('p', { html: '击中与接球会为挡板充能。充满后按 <b>空格</b> 或点击，获得数秒的伤害与速度爆发。' }),
        el('h3', { text: '构筑' }),
        el('p', {
          html: '每通过一关三选一，共 39 种强化、5 个稀有度。同体系的强化更容易一起出现；传说与神话以对应体系的强化为前提。集齐两种元素会自动解锁<b>元素反应</b>。',
        }),
        el('h3', { text: '碎晶' }),
        el('p', { html: '击碎砖块掉落碎晶，可用于<b>刷新</b>三选一，或<b>跳过</b>换取更多碎晶。' }),
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
        this.toast(`${tier.name}难度 · ${tier.en}`, tier.detail.join(' · '), tier.color);
      }
      this.toast(
        '移动鼠标控制挡板',
        '球落到底部不会丢失。用挡板边缘接球可以打出大角度，正中接球大量充能。',
        0x7dffe0,
      );
    }
    if (plan.boss) {
      this.banner({
        title: plan.boss.en,
        sub: plan.boss.name,
        note: plan.boss.title,
        color: 0xff2fb0,
        duration: 2.6,
      });
    } else {
      this.banner({
        title: `SECTOR ${plan.code}`,
        sub: plan.name,
        note: plan.modifier ? `变异 · ${plan.modifier.name} — ${plan.modifier.desc}` : undefined,
        duration: plan.modifier ? 2.8 : 1.7,
      });
    }
  }
}

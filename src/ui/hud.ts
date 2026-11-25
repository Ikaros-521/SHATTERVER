import { formatNumber, formatScore } from '../core/math';
import { COMBO_TIME } from '../game/config';
import { COMBO_TIERS, REACTIONS } from '../game/levels/definitions';
import type { Session } from '../game/session';
import { UPGRADE_MAP } from '../game/upgrades/defs';
import { RARITY_INFO, TAG_INFO, upgradeColor } from '../game/upgrades/present';
import type { UpgradeDef } from '../game/upgrades/types';
import { byId, el, hexCss, keep, pop, setText, setWidth } from './dom';
import { sigil } from './sigil';

/** What the HUD needs from its host: showing and hiding the upgrade tooltip. */
export interface HudHost {
  showTooltip(def: UpgradeDef, anchor: HTMLElement): void;
  hideTooltip(): void;
}

interface Owned {
  def: UpgradeDef;
  level: number;
}

/**
 * The in-game overlay: lives, level progress (or boss health), crystals, score, the build panel,
 * the combo readout and a stats column.
 *
 * It writes straight into fixed DOM nodes and only touches the ones whose values changed, so a
 * frame with three hundred hits costs no more DOM work than an empty one.
 */
export class HUD {
  private readonly root = byId('hud');
  private readonly lives = byId('hud-lives');
  private readonly levelCode = byId('hud-level-code');
  private readonly levelName = byId('hud-level-name');
  private readonly progressTrack = byId('hud-progress-track');
  private readonly progress = byId('hud-progress');
  private readonly crystals = byId('hud-crystals');
  private readonly score = byId('hud-score');
  private readonly buildIcons = byId('build-icons');
  private readonly buildEmpty = byId('build-empty');
  private readonly reactions = byId('build-reactions');
  private readonly comboValue = byId('combo-value');
  private readonly comboTier = byId('combo-tier');
  private readonly comboFill = byId('combo-fill');
  private readonly comboBlock = byId('combo');
  private readonly statsList = byId('stats-list');
  private readonly odHint = byId('od-hint');
  private readonly statsPanel = byId('panel-stats');
  private readonly buildPanel = byId('panel-build');

  private readonly text = new Map<HTMLElement, string>();
  private buildSignature = '';
  private reactionSignature = '';
  private comboSignature = '';
  private lastComboPop = 0;
  private maxLivesDrawn = -1;
  private owned = new Set<string>();

  constructor(private readonly host: HudHost) {}

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
    if (!visible) this.host.hideTooltip();
  }

  /** Relayout hook: panels collapse when there is no room beside the arena. */
  setRoom(buildVisible: boolean, statsVisible: boolean): void {
    this.buildPanel.hidden = !buildVisible;
    this.statsPanel.hidden = !statsVisible;
  }

  private put(node: HTMLElement, value: string): void {
    if (this.text.get(node) === value) return;
    this.text.set(node, value);
    node.textContent = value;
  }

  /** Refreshes everything from the session. Call once per frame while a run is on screen. */
  update(session: Session, dps: number, now: number): void {
    const world = session.world;
    const run = session.run;

    // ── lives ──
    if (this.maxLivesDrawn !== run.maxHp) {
      this.maxLivesDrawn = run.maxHp;
      this.lives.replaceChildren(...Array.from({ length: run.maxHp }, () => el('i', { class: 'pip' })));
    }
    const pips = this.lives.children;
    for (let i = 0; i < pips.length; i++) pips[i]?.classList.toggle('on', i < world.hp);
    this.lives.classList.toggle('critical', world.hp <= 1);

    // ── level progress, or boss health in the same slot ──
    const boss = world.boss && !world.boss.dead ? world.boss : null;
    this.progressTrack.classList.toggle('is-boss', boss !== null);
    if (boss) {
      this.put(this.levelCode, boss.def.en);
      this.put(this.levelName, boss.def.name);
      this.progressTrack.dataset.phase = boss.enraged
        ? '狂暴 ENRAGED'
        : `阶段 ${boss.phase} · PHASE ${boss.phase}`;
      setWidth(this.progress, boss.hp / boss.maxHp);
    } else {
      this.put(this.levelCode, world.level.code);
      this.put(this.levelName, world.level.name);
      this.progressTrack.dataset.phase = '';
      setWidth(this.progress, 1 - world.brickCount() / Math.max(1, world.brickTotal));
    }

    this.put(this.crystals, formatNumber(run.crystals));
    this.put(this.score, formatScore(run.score));

    // ── build panel ──
    const signature = Object.entries(run.upgrades)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, level]) => `${id}${level}`)
      .join('|');
    if (signature !== this.buildSignature) {
      this.buildSignature = signature;
      this.rebuildBuild(run.upgrades);
    }
    if (run.reactions.join('|') !== this.reactionSignature) {
      this.reactionSignature = run.reactions.join('|');
      this.reactions.replaceChildren(
        ...keep(
          ...run.reactions.map((id) => {
            const info = REACTIONS.find((r) => r.id === id);
            return info ? el('span', { class: 'chip', style: `--c:${hexCss(info.color)}` }, info.name) : null;
          }),
        ),
      );
      this.reactions.hidden = run.reactions.length === 0;
    }

    // ── combo ──
    const tier = world.comboTier >= 0 ? COMBO_TIERS[world.comboTier] : null;
    const comboSignature = `${world.comboTier}|${world.odActive}`;
    if (comboSignature !== this.comboSignature) {
      this.comboSignature = comboSignature;
      this.comboBlock.style.setProperty('--tier', tier ? hexCss(tier.color) : 'transparent');
      this.put(this.comboTier, tier ? `${tier.name} · ${tier.cn}` : '');
    }
    this.put(this.comboValue, String(world.combo));
    setWidth(this.comboFill, world.combo > 0 ? world.comboTimer / COMBO_TIME : 0);
    this.comboBlock.classList.toggle('hot', world.comboTier >= 3);
    // Scale-punch on change, rate-limited: at hundreds of hits a second the number would only vibrate.
    if (world.combo > 0 && now - this.lastComboPop > 90) {
      this.lastComboPop = now;
      pop(this.comboValue, world.comboTier >= 4 ? 1.22 : 1.12, 130);
    }

    // ── stats ──
    const s = run.stats;
    const rows: [string, string][] = [
      ['DPS', formatNumber(dps)],
      ['总伤害', formatNumber(run.totalDamage + world.totalDamage)],
      ['球体', String(world.balls.filter((ball) => ball.alive && !ball.child).length)],
      [
        '连击加成',
        s.comboDamagePer10 > 0
          ? `+${Math.round(Math.floor(world.combo / 10) * s.comboDamagePer10 * 100)}%`
          : '—',
      ],
      ['暴击率', `${Math.round(Math.min(1, s.critChance) * 100)}%`],
    ];
    if (this.statsList.childElementCount !== rows.length) {
      this.statsList.replaceChildren(...rows.map(() => el('div', { class: 'stat' }, el('dt'), el('dd'))));
    }
    rows.forEach(([label, value], i) => {
      const row = this.statsList.children[i];
      const dt = row?.querySelector('dt');
      const dd = row?.querySelector('dd');
      if (dt) setText(dt, label);
      if (dd) setText(dd, value);
    });

    // ── overdrive prompt ──
    const ready = world.energy >= 100 && !world.odActive && world.state === 'playing';
    if (this.odHint.hidden === ready) this.odHint.hidden = !ready;
  }

  reset(): void {
    this.buildSignature = '';
    this.reactionSignature = '';
    this.comboSignature = '';
    this.text.clear();
    this.owned = new Set();
    this.maxLivesDrawn = -1;
    this.odHint.hidden = true;
  }

  /** An icon tile for one owned upgrade. Shared by the HUD build panel and the results screen. */
  tile(def: UpgradeDef, level: number, interactive: boolean): HTMLElement {
    const color = upgradeColor(def.tags, def.rarity);
    const node = el(interactive ? 'button' : 'div', {
      class: 'sigil-tile',
      type: interactive ? 'button' : undefined,
      'data-id': def.id,
      style: `--c:${hexCss(color)};--rarity:${hexCss(RARITY_INFO[def.rarity].color)}`,
      'aria-label': `${def.name} Lv${level}`,
    });
    if (level >= def.maxLevel) node.classList.add('maxed');
    node.append(
      el('img', { src: sigil(def.id, color), alt: '', draggable: 'false' }),
      el('b', { class: 'lv' }, String(level)),
    );
    if (interactive) {
      node.addEventListener('pointerenter', () => this.host.showTooltip(def, node));
      node.addEventListener('pointerleave', () => this.host.hideTooltip());
      node.addEventListener('focus', () => this.host.showTooltip(def, node));
      node.addEventListener('blur', () => this.host.hideTooltip());
    }
    return node;
  }

  /** Upgrades the run owns, strongest first. Used by the results screen. */
  ownedUpgrades(levels: Record<string, number>): Owned[] {
    const owned: Owned[] = [];
    for (const [id, level] of Object.entries(levels)) {
      const def = UPGRADE_MAP[id];
      if (def && level > 0) owned.push({ def, level });
    }
    return owned.sort(
      (a, b) =>
        RARITY_INFO[b.def.rarity].rank - RARITY_INFO[a.def.rarity].rank || a.def.id.localeCompare(b.def.id),
    );
  }

  private rebuildBuild(levels: Record<string, number>): void {
    const previous = this.owned;
    const owned = this.ownedUpgrades(levels);
    const tiles = owned.map(({ def, level }) => {
      const tile = this.tile(def, level, true);
      // A just-acquired upgrade flashes so the eye finds it.
      if (!previous.has(def.id)) tile.classList.add('fresh');
      return tile;
    });
    this.buildIcons.replaceChildren(...tiles);
    this.buildEmpty.hidden = tiles.length > 0;
    this.owned = new Set(owned.map((entry) => entry.def.id));
  }
}

/** Tag chips for an upgrade, used by cards and tooltips. */
export function tagChips(def: UpgradeDef): HTMLElement[] {
  return def.tags.map((tag) => {
    const info = TAG_INFO[tag];
    return el('span', { class: 'chip', style: `--c:${hexCss(info.color)}` }, info.name);
  });
}

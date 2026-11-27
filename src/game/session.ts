import { Emitter } from '../core/emitter';
import { hashCombine, RNG } from '../core/rng';
import {
  MAX_HP_BASE,
  SECTOR_CLEAR_CRYSTALS_BASE,
  SECTOR_CLEAR_CRYSTALS_PER_LEVEL,
  SECTOR_CLEAR_SHIELD,
} from './config';
import { isSupplyId, PRECHARGE_ENERGY, SUPPLY_CRYSTALS, type ShopProtocol } from './economy/catalog';
import { difficultyOf, type Difficulty } from './difficulty';
import { buildLevel, CAMPAIGN_LENGTH, isBossLevel, sectorStart, type LevelPlan } from './levels/generator';
import { createRun, type Run, type RunMode } from './run';
import type { Starter } from './starters';
import { dependentsOf, meetsRequires, rollDraft } from './upgrades/draft';
import { UPGRADE_MAP } from './upgrades/defs';
import { computeStats } from './upgrades/stats';
import type { UpgradeDef } from './upgrades/types';
import { World } from './world';

export type SessionPhase = 'playing' | 'draft' | 'over' | 'won';

/**
 * What clearing a wave sector paid, and how far into spending it the player is. Rides along on
 * every draft the sector's clear granted.
 */
export interface SectorReward {
  crystals: number;
  /** Shield actually restored; 0 when the shield was already full. */
  shield: number;
  /** Drafts the clear granted: one per wave. */
  picks: number;
  /** 1-based index of the draft it was handed out with, among those picks. */
  pick: number;
}

export interface SessionEvents {
  phase: { phase: SessionPhase; previous: SessionPhase };
  /** A wave opened: the run's first, or the next wave of a sector — with no draft in between. */
  level: { plan: LevelPlan; first: boolean };
  /** The last wave of a wave sector fell. Its drafts follow, one per wave, through `draft`. */
  sectorClear: { plan: LevelPlan; crystals: number; shield: number; picks: number };
  /**
   * `intro` marks the opening draft (head start or a protocol's self-picks) before sector one;
   * `reward` marks the drafts a wave sector's clear granted.
   */
  draft: {
    options: UpgradeDef[];
    rerollCost: number;
    skipReward: number;
    intro: boolean;
    reward: SectorReward | null;
  };
  pick: { def: UpgradeDef; level: number };
  /** An owned upgrade left the build; `level` is what it was. */
  discard: { def: UpgradeDef; level: number };
  skip: Record<string, never>;
}

export interface SessionOptions {
  /** The paddle plays itself. Used by the title-screen demo and the headless balance tests. */
  bot?: boolean;
  starter?: Starter;
  /** First level to open. Defaults to 1; the attract-mode demo starts deeper in. */
  level?: number;
  /** Difficulty tier for the whole run. Defaults to standard. */
  difficulty?: Difficulty;
  /** Owned supplies carried into this run (ids from `economy/catalog`). Unknown ids are dropped. */
  supplies?: readonly string[];
}

/**
 * One run: the loop of level → draft → level … that sits between the worlds and the UI.
 *
 * Like the world, a session touches no DOM. `update` drives the current level and reports
 * transitions through events; the UI reacts by showing the draft, the game-over screen, and so on.
 *
 * Carried supplies (see `economy/catalog`) apply here: crystal cache and spare shield touch the
 * run at construction, free reroll and pre-charge and second wind ride along into each level,
 * and the head start (or a protocol's own self-picks, see `ShopProtocol.introPicks`) holds the
 * run in an opening draft until every pick is spent.
 *
 * Past the campaign the endless mode's ordinary levels come two to a sector (`wavesInLevel`):
 * the next wave opens as soon as one falls, with nothing in between, and the sector settles once,
 * at its end. Each wave is still the level it always was — same toughness, same place on the
 * boss roster — and still earns the draft it always did; it is just dealt at the sector's end,
 * both waves' drafts back to back, behind a sector-clear bonus.
 */
export class Session {
  readonly events = new Emitter<SessionEvents>();
  readonly run: Run;
  readonly bot: boolean;
  readonly difficulty: Difficulty;
  world: World;
  phase: SessionPhase = 'playing';
  draft: UpgradeDef[] = [];
  rerolls = 0;
  private readonly rng: RNG;
  private readonly supplies: ReadonlySet<string>;
  /** Opening picks left before sector one opens; the head-start supply and protocols add to it. */
  introPicks = 0;
  /** Rarity band of the opening picks, when the protocol that granted them narrows the pool. */
  readonly introRarities?: UpgradeDef['rarity'][];
  /** Opening picks already spent; past the first one, follow-up drafts skip what is owned. */
  private introTaken = 0;
  /** Drafts still owed from the wave sector just cleared, the one on screen included. */
  private rewardPicks = 0;
  private reward: SectorReward | null = null;

  constructor(mode: RunMode, seed: number, options: SessionOptions = {}) {
    this.bot = options.bot ?? false;
    this.difficulty = options.difficulty ?? difficultyOf('standard');
    this.rng = new RNG(hashCombine(seed, 0xd1a7));
    this.run = createRun(mode, seed);
    this.run.difficulty = this.difficulty.id;
    if (options.level) this.run.level = Math.max(1, Math.floor(options.level));
    this.supplies = new Set((options.supplies ?? []).filter(isSupplyId));
    const starter = options.starter;
    if (starter) {
      Object.assign(this.run.upgrades, starter.grants);
      this.run.crystals = starter.crystals;
    }
    if (this.supplies.has('cache')) this.run.crystals += SUPPLY_CRYSTALS;
    if (this.supplies.has('spare')) this.run.bonusHp = 1;
    if (this.supplies.has('headstart')) this.introPicks++;
    // A protocol may grant its own opening self-picks (wildcard); their rarity band rides along.
    const protocol = starter as Partial<ShopProtocol> | undefined;
    if (protocol?.introPicks) {
      this.introPicks += protocol.introPicks;
      this.introRarities = protocol.introRarities ? [...protocol.introRarities] : undefined;
    }
    this.refreshStats();
    this.world = this.openLevel();
  }

  /** Announces the first level — or, with opening picks left, the pre-sector draft. */
  start(): void {
    if (this.introPicks > 0) {
      this.setPhase('draft');
      this.rollNewDraft();
      return;
    }
    this.events.emit('level', { plan: this.world.level, first: true });
  }

  /**
   * Adds upgrades to the build outside the draft. Not used by normal play — it is how the
   * attract-mode demo, automated tests and debug tooling set up specific builds.
   */
  grant(id: string, levels = 1): boolean {
    if (!UPGRADE_MAP[id] || levels <= 0) return false;
    this.run.upgrades[id] = Math.min(UPGRADE_MAP[id].maxLevel, (this.run.upgrades[id] ?? 0) + levels);
    this.refreshStats();
    return true;
  }

  update(dt: number): void {
    if (this.phase !== 'playing') return;
    this.world.update(dt);
    this.run.time += dt;
    if (this.world.state === 'cleared') this.finishLevel();
    else if (this.world.state === 'dead') this.endRun(false);
  }

  get rerollCost(): number {
    const base = 15 + this.draftLevel() * 6 + this.rerolls * 12;
    // 「保底刷新」: the first reroll of every draft is on the house; the second pays full price.
    return this.supplies.has('reroll') && this.rerolls === 0 ? 0 : base;
  }

  get skipReward(): number {
    return Math.round(20 * this.run.stats.crystalMult);
  }

  /** The wave sector bonus whose drafts are on the table — which of them, included; null on every other draft. */
  get sectorReward(): SectorReward | null {
    const earned = this.introPicks > 0 ? null : this.reward;
    return earned ? { ...earned, pick: earned.picks - this.rewardPicks + 1 } : null;
  }

  choose(id: string): boolean {
    if (this.phase !== 'draft') return false;
    const def = this.draft.find((option) => option.id === id);
    if (!def) return false;
    const level = (this.run.upgrades[id] ?? 0) + 1;
    this.run.upgrades[id] = level;
    this.refreshStats();
    this.events.emit('pick', { def, level });
    if (this.introPicks > 0) return this.spendIntroPick();
    return this.spendRewardPick();
  }

  reroll(): boolean {
    if (this.phase !== 'draft') return false;
    const cost = this.rerollCost;
    if (this.run.crystals < cost) return false;
    this.run.crystals -= cost;
    this.rerolls++;
    this.rollNewDraft();
    return true;
  }

  /**
   * Trade the pick for crystals — or, on an opening draft, forfeit that one pick: a skipped
   * pick is spent without a card, and whatever picks remain still stand.
   */
  skip(): boolean {
    if (this.phase !== 'draft') return false;
    this.events.emit('skip', {});
    if (this.introPicks > 0) return this.spendIntroPick();
    this.run.crystals += this.skipReward;
    return this.spendRewardPick();
  }

  /**
   * Removes an owned upgrade from the build, every level of it at once, for the rest of the run.
   * Draft time only: the next level is built from whatever the build is by then, so nothing has
   * to change under a world in play.
   *
   * An upgrade that another owned one requires stays put until that one is gone — dropping the
   * base would leave the payoff sitting in the build doing nothing. Cards on the table that needed
   * what went leave with it, since they could no longer be taken.
   */
  discard(id: string): boolean {
    if (this.phase !== 'draft') return false;
    const def = UPGRADE_MAP[id];
    const level = this.run.upgrades[id] ?? 0;
    if (!def || level <= 0 || dependentsOf(id, this.run.upgrades).length > 0) return false;
    delete this.run.upgrades[id];
    this.draft = this.draft.filter((option) => meetsRequires(option, this.run.upgrades));
    this.refreshStats();
    this.events.emit('discard', { def, level });
    return true;
  }

  /** Takes the rarest option. Used by the attract-mode demo. */
  autoPick(): void {
    const order = ['mythic', 'legendary', 'epic', 'rare', 'common'];
    const best = [...this.draft].sort((a, b) => order.indexOf(a.rarity) - order.indexOf(b.rarity))[0];
    if (best) this.choose(best.id);
  }

  /** Re-derives the stat block after the build or the level count changed. */
  private refreshStats(): void {
    const run = this.run;
    run.stats = computeStats(run.upgrades, run.levelsCleared);
    const maxHp = MAX_HP_BASE + run.stats.maxHpBonus + run.bonusHp;
    if (maxHp > run.maxHp) run.hp += maxHp - run.maxHp;
    run.maxHp = maxHp;
    run.hp = Math.min(run.hp, maxHp);
  }

  private openLevel(): World {
    const run = this.run;
    // Levels get their own stream so build choices never change the layout of a given seed.
    const rng = new RNG(hashCombine(run.seed, run.level, 0x1e5e1));
    const plan = buildLevel(run.level, rng, this.difficulty);
    // A sector is one place: its second wave keeps the name the first opened with.
    if (plan.wave > 1) plan.name = this.sectorOpening(plan).name;
    return new World(run, plan, rng.fork(), {
      bot: this.bot,
      difficulty: this.difficulty,
      startEnergy: this.supplies.has('precharge') ? PRECHARGE_ENERGY : 0,
      secondWind: this.supplies.has('secondwind'),
    });
  }

  /** The plan of the sector's first wave — the level a wave sector takes its name from. */
  private sectorOpening(later: LevelPlan): LevelPlan {
    const first = sectorStart(later.index);
    return buildLevel(first, new RNG(hashCombine(this.run.seed, first, 0x1e5e1)), this.difficulty);
  }

  /**
   * Spends one opening pick: while picks remain, another draft goes up (past the first pick it
   * skips everything already owned); at zero, sector one opens for real.
   */
  private spendIntroPick(): boolean {
    this.introTaken++;
    this.introPicks--;
    if (this.introPicks > 0) {
      this.rollNewDraft();
      return true;
    }
    return this.beginLevel();
  }

  /** Closes the opening draft and opens sector one for real. */
  private beginLevel(): boolean {
    this.introPicks = 0;
    this.introTaken = 0;
    // The pick may have changed the build; rebuild so ball count and the like start right.
    this.world = this.openLevel();
    this.setPhase('playing');
    this.events.emit('level', { plan: this.world.level, first: true });
    return true;
  }

  /** Folds the level in progress into the run totals. Called exactly once per level, when it ends. */
  private collect(): void {
    const run = this.run;
    const world = this.world;
    run.kills += world.killed;
    run.totalDamage += world.totalDamage;
    run.maxCombo = Math.max(run.maxCombo, world.maxCombo);
    run.damageTaken += world.damageTaken;
    run.hp = world.hp;
    run.perfects += world.perfects;
    run.capsules += world.capsules;
    run.overdrives += world.overdrives;
    run.reactionTriggers += world.reactions;
    run.bosses += world.bosses;
  }

  /**
   * A wave fell, and with it its level: counted, folded into the run, written to its history.
   *
   * A wave sector's first wave hands straight on to the second — no draft, no pause, which is
   * what makes it a wave — and only the sector's last wave ends the level proper, with the
   * drafts both waves earned and the sector's bonus on top. Everything a level did on its own
   * it still does here, in the same order; the drafts are merely held until the sector is done.
   */
  private finishLevel(): void {
    const run = this.run;
    const world = this.world;
    const plan = world.level;
    run.levelsCleared++;
    this.collect();
    run.history.push({
      level: run.level,
      name: plan.name,
      time: world.time,
      killed: world.killed,
      maxCombo: world.maxCombo,
      damageTaken: world.damageTaken,
    });

    if (plan.wave < plan.waves) {
      // The level count moved, so the build's per-level growth moves with it — as it would
      // behind a draft, minus the draft.
      this.refreshStats();
      run.level++;
      this.world = this.openLevel();
      // No phase change: to the interface it is the same run of play, a new wall.
      this.events.emit('level', { plan: this.world.level, first: false });
      return;
    }

    if (run.mode === 'campaign' && run.level >= CAMPAIGN_LENGTH) {
      this.endRun(true);
      return;
    }
    // Beating a boss restores one life: a breather between chapters.
    if (isBossLevel(run.level)) run.hp = Math.min(run.maxHp, run.hp + 1);

    this.rerolls = 0;
    this.refreshStats();
    this.reward = this.grantSectorReward(plan);
    this.setPhase('draft');
    this.rollNewDraft();
  }

  /**
   * Books a wave sector's clear bonus and arms its drafts — one per wave, exactly the drafts the
   * waves would each have been dealt had they settled on their own, handed out together now.
   * Returns null on single-wave sectors, which pay the way they always did.
   */
  private grantSectorReward(plan: LevelPlan): SectorReward | null {
    if (plan.waves <= 1) return null;
    const run = this.run;
    const crystals = Math.round(
      plan.waves *
        (SECTOR_CLEAR_CRYSTALS_BASE + SECTOR_CLEAR_CRYSTALS_PER_LEVEL * plan.index) *
        run.stats.crystalMult,
    );
    const shield = Math.max(0, Math.min(SECTOR_CLEAR_SHIELD, run.maxHp - run.hp));
    run.crystals += crystals;
    run.hp += shield;
    const reward: SectorReward = { crystals, shield, picks: plan.waves, pick: 1 };
    this.rewardPicks = plan.waves;
    this.events.emit('sectorClear', { plan, crystals, shield, picks: plan.waves });
    return reward;
  }

  /**
   * Spends one of the sector's drafts. While picks remain another goes up — each starts its
   * rerolls afresh, as the draft of a level of its own would; at zero the next sector opens.
   */
  private spendRewardPick(): boolean {
    this.rewardPicks = Math.max(0, this.rewardPicks - 1);
    if (this.rewardPicks > 0) {
      this.rerolls = 0;
      this.rollNewDraft();
      return true;
    }
    // Spent in full: nothing of this sector's reward carries into the next one's drafts.
    this.reward = null;
    return this.advance();
  }

  /**
   * The depth a draft is dealt at. A wave sector's drafts are dealt together, but each stands
   * for the wave that earned it: the first is dealt at the depth of the sector's first wave,
   * which is what keeps the cards — and what a reroll costs — as if that wave had drafted itself.
   */
  private draftLevel(): number {
    return this.rewardPicks > 1 ? this.run.level - (this.rewardPicks - 1) : this.run.level;
  }

  private rollNewDraft(): void {
    // Opening drafts run on the protocol's rarity band, if it set one, and a wider hand: the
    // free head start keeps its three cards, a banded draft shows four to choose from. Past the
    // first spent pick, what is already owned no longer comes back.
    const intro = this.introPicks > 0;
    this.draft = rollDraft({
      levels: this.run.upgrades,
      level: this.draftLevel(),
      rng: this.rng,
      ...(intro
        ? { count: this.introRarities ? 4 : 3, rarities: this.introRarities }
        : {}),
      ...(intro && this.introTaken > 0 ? { exclude: Object.keys(this.run.upgrades) } : {}),
    });
    // A copy per draft, its counter filled in: an event is a snapshot, and whoever held on to
    // the last one must not see it change under them.
    const earned = intro ? null : this.reward;
    const reward = earned ? { ...earned, pick: earned.picks - this.rewardPicks + 1 } : null;
    this.events.emit('draft', {
      options: this.draft,
      rerollCost: this.rerollCost,
      skipReward: this.skipReward,
      intro,
      reward,
    });
  }

  private advance(): boolean {
    this.run.level++;
    this.world = this.openLevel();
    this.setPhase('playing');
    this.events.emit('level', { plan: this.world.level, first: false });
    return true;
  }

  private endRun(won: boolean): void {
    // A loss ends mid-level, so that level's numbers are folded in here; a win already did it in `finishLevel`.
    if (!won) {
      this.collect();
      this.run.hp = 0;
    }
    // Whatever the run was still holding ends with it: a finished run has no buffs to carry over.
    this.world.clearBuffs();
    this.setPhase(won ? 'won' : 'over');
  }

  private setPhase(phase: SessionPhase): void {
    const previous = this.phase;
    this.phase = phase;
    this.events.emit('phase', { phase, previous });
  }
}

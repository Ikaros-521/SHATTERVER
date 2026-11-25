import { Emitter } from '../core/emitter';
import { hashCombine, RNG } from '../core/rng';
import { MAX_HP_BASE } from './config';
import { buildLevel, CAMPAIGN_LENGTH, isBossLevel, type LevelPlan } from './levels/generator';
import { createRun, type Run, type RunMode } from './run';
import type { Starter } from './starters';
import { rollDraft } from './upgrades/draft';
import { UPGRADE_MAP } from './upgrades/defs';
import { computeStats } from './upgrades/stats';
import type { UpgradeDef } from './upgrades/types';
import { World } from './world';

export type SessionPhase = 'playing' | 'draft' | 'over' | 'won';

export interface SessionEvents {
  phase: { phase: SessionPhase; previous: SessionPhase };
  level: { plan: LevelPlan; first: boolean };
  draft: { options: UpgradeDef[]; rerollCost: number; skipReward: number };
  pick: { def: UpgradeDef; level: number };
  skip: Record<string, never>;
}

export interface SessionOptions {
  /** The paddle plays itself. Used by the title-screen demo and the headless balance tests. */
  bot?: boolean;
  starter?: Starter;
  /** First level to open. Defaults to 1; the attract-mode demo starts deeper in. */
  level?: number;
}

/**
 * One run: the loop of level → draft → level … that sits between the worlds and the UI.
 *
 * Like the world, a session touches no DOM. `update` drives the current level and reports
 * transitions through events; the UI reacts by showing the draft, the game-over screen, and so on.
 */
export class Session {
  readonly events = new Emitter<SessionEvents>();
  readonly run: Run;
  readonly bot: boolean;
  world: World;
  phase: SessionPhase = 'playing';
  draft: UpgradeDef[] = [];
  rerolls = 0;
  private readonly rng: RNG;

  constructor(mode: RunMode, seed: number, options: SessionOptions = {}) {
    this.bot = options.bot ?? false;
    this.rng = new RNG(hashCombine(seed, 0xd1a7));
    this.run = createRun(mode, seed);
    if (options.level) this.run.level = Math.max(1, Math.floor(options.level));
    const starter = options.starter;
    if (starter) {
      Object.assign(this.run.upgrades, starter.grants);
      this.run.crystals = starter.crystals;
    }
    this.refreshStats();
    this.world = this.openLevel();
  }

  /** Announces the first level. Call after subscribing to `events`. */
  start(): void {
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
    return 15 + this.run.level * 6 + this.rerolls * 12;
  }

  get skipReward(): number {
    return Math.round(20 * this.run.stats.crystalMult);
  }

  choose(id: string): boolean {
    if (this.phase !== 'draft') return false;
    const def = this.draft.find((option) => option.id === id);
    if (!def) return false;
    const level = (this.run.upgrades[id] ?? 0) + 1;
    this.run.upgrades[id] = level;
    this.refreshStats();
    this.events.emit('pick', { def, level });
    return this.advance();
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

  /** Trade the pick for crystals. */
  skip(): boolean {
    if (this.phase !== 'draft') return false;
    this.run.crystals += this.skipReward;
    this.events.emit('skip', {});
    return this.advance();
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
    const maxHp = MAX_HP_BASE + run.stats.maxHpBonus;
    if (maxHp > run.maxHp) run.hp += maxHp - run.maxHp;
    run.maxHp = maxHp;
    run.hp = Math.min(run.hp, maxHp);
  }

  private openLevel(): World {
    const run = this.run;
    // Levels get their own stream so build choices never change the layout of a given seed.
    const rng = new RNG(hashCombine(run.seed, run.level, 0x1e5e1));
    const plan = buildLevel(run.level, rng);
    return new World(run, plan, rng.fork(), { bot: this.bot });
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
  }

  private finishLevel(): void {
    const run = this.run;
    const world = this.world;
    run.levelsCleared++;
    this.collect();
    run.history.push({
      level: run.level,
      name: world.level.name,
      time: world.time,
      killed: world.killed,
      maxCombo: world.maxCombo,
      damageTaken: world.damageTaken,
    });

    if (run.mode === 'campaign' && run.level >= CAMPAIGN_LENGTH) {
      this.endRun(true);
      return;
    }
    // Beating a boss restores one life: a breather between chapters.
    if (isBossLevel(run.level)) run.hp = Math.min(run.maxHp, run.hp + 1);

    this.rerolls = 0;
    this.refreshStats();
    this.setPhase('draft');
    this.rollNewDraft();
  }

  private rollNewDraft(): void {
    this.draft = rollDraft({ levels: this.run.upgrades, level: this.run.level, rng: this.rng });
    this.events.emit('draft', {
      options: this.draft,
      rerollCost: this.rerollCost,
      skipReward: this.skipReward,
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
    this.setPhase(won ? 'won' : 'over');
  }

  private setPhase(phase: SessionPhase): void {
    const previous = this.phase;
    this.phase = phase;
    this.events.emit('phase', { phase, previous });
  }
}

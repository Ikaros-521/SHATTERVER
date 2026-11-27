import { clamp, damp, lerp } from '../core/math';
import { Emitter } from '../core/emitter';
import type { RNG } from '../core/rng';
import {
  AEGIS_Y,
  AFTERGLOW_DAMAGE,
  AFTERGLOW_RADIUS,
  ARENA_H,
  ARENA_W,
  BALL_DRY_NUDGE,
  BALL_RADIUS,
  BALL_SPEED,
  BUFF_FIRST_MAX,
  BUFF_FIRST_MIN,
  BUFF_INTERVAL_MAX,
  BUFF_INTERVAL_MIN,
  CAPSULE_FALL_SPEED,
  CATCH_ENERGY,
  COMBO_TIME,
  CRITICAL_MASS_BONUS,
  CRITICAL_MASS_CAP,
  CRITICAL_MASS_KILLS,
  DANGER_BAND,
  DANGER_Y,
  HURT_REPAIR,
  MAX_BALLS,
  MAX_BALL_RADIUS,
  MAX_BULLETS,
  MAX_CLONES,
  MAX_DEATHS_PER_FLUSH,
  MAX_PADDLE_HALF,
  OVERDRIVE_DURATION,
  OVERDRIVE_FILL_SECONDS,
  PADDLE_BOUNCE_SPREAD,
  PADDLE_H,
  PADDLE_W,
  PADDLE_Y,
  PERFECT_ENERGY,
  PERFECT_WINDOW,
  PERPETUUM_GAIN,
  PRESSURE_COVER,
  PRESSURE_OFFENCE,
  PRESSURE_TIMESTOP,
  SPLIT_ANGLE,
  SPLIT_CLONE_MULT,
  SPLIT_CLONE_RADIUS,
  THUNDER_DAMAGE,
  THUNDER_INTERVAL,
  WALL,
} from './config';
import { botTarget } from './bot';
import { SECOND_WIND_HP } from './economy/catalog';
import { difficultyOf, type Difficulty } from './difficulty';
import { isGuided } from './guidance';
import { stepBall } from './physics';
import {
  applyDamage,
  ballPower,
  basePower,
  explode,
  fireLasers,
  fireOrbital,
  HOLE_TICK,
  hitShard,
  LASER_INTERVAL,
  ORBITAL_INTERVAL,
  POOL_TICK,
  processDeath,
  SOLAR_PERIOD,
  strikeLightning,
  tickStatuses,
  type DamageCtx,
  type DamageSource,
  type ExplosionKind,
} from './combat';
import {
  characterAttack,
  characterDefeated,
  startCharacterBoss,
  characterDiscsOf,
  characterPhase,
  hitCharacterPart,
  stepCharacterBoss,
  type CharacterBoss,
} from './characterBoss';
import type { BossDisc } from './hiyou';
import type { BossPartId } from '../render/boss/types';
import { BUFFS, BUFF_MAP, COVER, OFFENCE, type ActiveBuff, type BuffDef, type BuffId } from './buffs/defs';
import { withBuffs } from './buffs/live';
import {
  allocId,
  BOSS_HP,
  BRICK_HP,
  makeBall,
  makeBrick,
  MIN_FREE_BALLS,
  type Ball,
  type Brick,
  type BrickType,
  type Bullet,
  type FirePool,
  type Hole,
  type Pickup,
  type PickupKind,
  type Shard,
} from './entities';
import { CHAPTERS, COMBO_TIERS, type BossDef, type ReactionId, type SummonKind } from './levels/definitions';
import { CAMPAIGN_LENGTH, type LevelPlan } from './levels/generator';
import type { Run } from './run';
import type { BuildStats } from './upgrades/stats';

export type LevelState = 'intro' | 'playing' | 'clearing' | 'dying' | 'cleared' | 'dead';

export interface Paddle {
  x: number;
  y: number;
  halfW: number;
  /** Screen-space velocity, in world units per second. Imparted on bounced balls. */
  vx: number;
  targetX: number;
  flash: number;
  squash: number;
}

export interface PaddleInput {
  /** Desired paddle centre in world units (mouse / touch), or null to use the keyboard flags. */
  x: number | null;
  left: boolean;
  right: boolean;
}

export interface BossState {
  def: BossDef;
  /** Sway offset from the home position. */
  x: number;
  y: number;
  t: number;
  phase: number;
  hp: number;
  maxHp: number;
  /** Boss bricks still alive. */
  parts: number;
  speed: number;
  summonCd: number;
  shootCd: number;
  enraged: boolean;
  dead: boolean;
}

/**
 * Intent emitted by the simulation. Rendering, audio and the HUD all subscribe to this;
 * the world itself has no idea how it looks or sounds.
 */
export interface WorldEvents {
  hit: {
    x: number;
    y: number;
    dmg: number;
    crit: boolean;
    execute: boolean;
    source: DamageSource;
    brick: Brick;
    /** The colour to draw the impact in, when it is not the brick's own (a character boss's part). */
    color?: number;
  };
  kill: { brick: Brick; big: boolean };
  /** A brick sank past the danger line. */
  breach: { brick: Brick };
  bounce: { x: number; y: number; nx: number; ny: number };
  pierce: { x: number; y: number; nx: number; ny: number; brick: Brick };
  paddle: { x: number; off: number; perfect: boolean };
  miss: { x: number; child: boolean };
  /** An eraser brick or a difficulty purge consumed this ball for the rest of the level. */
  ballVoided: { x: number; y: number };
  hurt: { amount: number };
  pickup: { x: number; y: number; kind: PickupKind; value: number };
  explode: { x: number; y: number; radius: number; color: number; kind: ExplosionKind };
  bolt: { x0: number; y0: number; x1: number; y1: number; color: number };
  laser: { x0: number; y0: number; x1: number; y1: number };
  beam: { x: number; color: number; width: number };
  hole: { hole: Hole; phase: 'spawn' | 'end' };
  freeze: { x: number; y: number };
  echo: { x: number; y: number };
  split: { x: number; y: number };
  reaction: { id: ReactionId; x: number; y: number; first: boolean };
  comboTier: { tier: number; combo: number };
  comboLost: { combo: number };
  overdrive: 'ready' | 'start' | 'end';
  timeStop: 'start' | 'end';
  boss: { phase: 'phase' | 'enrage' | 'die' };
  /** A part of a character boss changed how it looks, or fell off. */
  characterPart: {
    id: string;
    state: 'intact' | 'damaged_1' | 'damaged_2' | 'destroyed';
    x: number;
    y: number;
  };
  /** A character boss crossed into a new phase, or has spoken. */
  character: { kind: 'phase' | 'line'; phase: number; moment: string | null; x: number; y: number };
  summon: { count: number };
  shoot: { x: number; y: number };
  bulletPop: { x: number; y: number; blocked: boolean };
  /** A bullet got past the paddle and hit the floor. */
  bulletPass: { x: number; y: number };
  launch: { count: number };
  clear: { time: number; killed: number };
  dead: Record<string, never>;
  // --- temporary buffs ---
  /** A capsule broke on the paddle and its buff is now in force. `duration` is 0 for an instant one. */
  buff: { id: BuffId; x: number; y: number; duration: number; twin: boolean };
  buffEnd: { id: BuffId };
  /** A brick dropped a capsule; it is falling towards the paddle. */
  capsule: { x: number; y: number; id: BuffId };
  /** A capsule nobody caught fell past the floor. */
  capsuleLost: { x: number };
  /** The Aegis line under the paddle swallowed a bullet. */
  aegis: { x: number };
  /** A hit that would have cost shield was dodged outright. */
  dodge: { x: number };
  /** 「续战核心」caught the run's first lethal hit: shield restored, the run goes on. */
  secondWind: Record<string, never>;
  /** The automatic thunder strike came down on a brick. */
  strike: { x: number; y: number };
  /** A ball bounced off the floor instead of being lost. */
  floorBounce: { x: number };
}

export function comboTierOf(combo: number): number {
  let tier = -1;
  for (let i = 0; i < COMBO_TIERS.length; i++) {
    if (combo < (COMBO_TIERS[i]?.at ?? Infinity)) break;
    tier = i;
  }
  return tier;
}

/**
 * One level of play: bricks, balls, hazards, the paddle and every rule that binds them.
 *
 * The world is plain data + logic with no rendering or DOM access, so it runs identically
 * in the browser and in a headless test.
 */
export class World {
  readonly events = new Emitter<WorldEvents>();
  readonly stats: BuildStats;
  /** Temporary buffs in force, in the order their capsules were collected. Empty for most of a level. */
  buffs: ActiveBuff[] = [];
  /** When true the paddle drives itself (attract-mode demo, headless tests, autopilot debugging). */
  bot: boolean;

  state: LevelState = 'intro';
  /** Seconds of active play (excludes the launch countdown). */
  time = 0;
  fieldOffset = 0;
  /** Recent hits per second, smoothed. Drives overdrive charging so the meter fills in roughly constant time. */
  hps = 6;

  bricks: Brick[] = [];
  balls: Ball[] = [];
  pickups: Pickup[] = [];
  bullets: Bullet[] = [];
  holes: Hole[] = [];
  pools: FirePool[] = [];
  shards: Shard[] = [];
  singularity: { t: number; tick: number } | null = null;
  boss: BossState | null = null;
  /** The character boss of this level, when it has one. Null on every lattice level. */
  character: CharacterBoss | null = null;
  /** The run's difficulty tier: paddle width, ball speed, fire rate, ball purges all scale from it. */
  readonly diff: Difficulty;
  /** Countdown to the next surplus-ball purge. Idle when the tier disables purges. */
  private purgeT = 0;

  paddle: Paddle = {
    x: ARENA_W / 2,
    y: PADDLE_Y,
    halfW: PADDLE_W / 2,
    vx: 0,
    targetX: ARENA_W / 2,
    flash: 0,
    squash: 0,
  };
  input: PaddleInput = { x: null, left: false, right: false };

  combo = 0;
  comboTimer = 0;
  comboTier = -1;
  maxCombo = 0;
  hp: number;
  readonly maxHp: number;
  damageTaken = 0;

  /** Overdrive meter, 0..100. */
  energy = 0;
  odActive = false;
  odT = 0;
  /** Seconds of time stop remaining. */
  timeStop = 0;

  totalDamage = 0;
  killed = 0;
  /** Bricks this level started with, plus everything summoned since. Denominator of the level progress bar. */
  brickTotal = 0;
  /** Run-wide play counters, folded into the run when the level ends. Milestone food. */
  perfects = 0;
  capsules = 0;
  overdrives = 0;
  reactions = 0;
  bosses = 0;
  /** Whether this level has anything that fires at the paddle. A shield against nothing is not offered. */
  readonly hasGunners: boolean;

  private introT = 1.0;
  private clearT = 0;
  private deathT = 0;
  private invuln = 0;
  private timeStopCd = 0;
  private laserCd = 1;
  private orbitalCd = 2.5;
  private hitAcc = 0;
  private hpsT = 0;
  /** 「续战核心」 carried: the run's first lethal hit restores shield instead of ending it. */
  private readonly secondWind: boolean;
  private deathQueue: { brick: Brick; ctx: DamageCtx }[] = [];
  private flushing = false;
  private scheduler: { t: number; fn: () => void }[] = [];

  /** `stats` with the active buffs folded in; what the simulation reads. Points at `stats` itself while none run. */
  private liveStats: BuildStats;
  /** Own stream, so capsules never disturb the rolls the brick field already makes. */
  private readonly buffRng: RNG;
  /** Level time at which the next capsule is due. */
  private buffAt: number;
  private lastBuff: BuffId | null = null;
  /** A split capsule was collected while no real ball was in flight; fork the first one that launches. */
  private pendingSplit = false;
  private thunderCd = THUNDER_INTERVAL;
  /** Bricks shattered when Overdrive began, and how far Critical Mass has stretched it. */
  private odKills = 0;
  private odBonus = 0;

  constructor(
    readonly run: Run,
    readonly level: LevelPlan,
    readonly rng: RNG,
    opts: {
      bot?: boolean;
      difficulty?: Difficulty;
      startEnergy?: number;
      secondWind?: boolean;
      /** A character boss stands on this level. The level plan will name her in time. */
      character?: boolean;
    } = {},
  ) {
    this.stats = run.stats;
    this.liveStats = run.stats;
    this.buffRng = rng.fork();
    this.buffAt = this.buffRng.range(BUFF_FIRST_MIN, BUFF_FIRST_MAX);
    this.hasGunners = level.boss !== null || level.cells.some((cell) => cell.type === 'turret');
    this.diff = opts.difficulty ?? difficultyOf('standard');
    this.bot = opts.bot ?? false;
    this.energy = opts.startEnergy ?? 0;
    this.secondWind = opts.secondWind ?? false;
    this.maxHp = run.maxHp;
    this.hp = Math.min(run.hp, run.maxHp);
    if (this.stats.timeStopInterval > 0) this.timeStopCd = Math.max(5, this.stats.timeStopInterval - 8);
    if (this.stats.singularity) this.singularity = { t: 0, tick: 0 };
    this.paddle.halfW = (PADDLE_W / 2) * this.stats.paddleWidth * this.diff.paddleMult;
    if (this.diff.purgePeriod > 0) this.purgeT = this.diff.purgePeriod * 0.6;
    // A character boss rules the campaign's last sector: there she takes the lattice boss's
    // place — same slot, same slot number, a very different fight. The plan still carries the
    // lattice def (its name and code stay), and the world below spawns her instead of its bricks.
    // `opts.character` is the build's hand raised: only a build that can show her offers her.
    this.character =
      opts.character && this.level.boss !== null && this.level.index === CAMPAIGN_LENGTH
        ? startCharacterBoss()
        : null;
    this.buildBricks();
    this.spawnBalls();
    this.dockBalls();
  }

  /** The build as it plays right now: `stats` plus whatever temporary buffs modify. Read this, never `stats`, for anything a capsule can change. */
  get live(): BuildStats {
    return this.liveStats;
  }

  get score(): number {
    return this.run.score;
  }

  // ───────────────────────────── setup ─────────────────────────────

  private buildBricks(): void {
    const { hpUnit, modifier, bossScale } = this.level;
    // Where she stands, the lattice boss's body is not built: its cells all carry boss roles, and
    // those are her fight now. Nothing else is skipped.
    const cells = this.character ? this.level.cells.filter((cell) => !cell.role) : this.level.cells;
    for (const cell of cells) {
      const part = cell.role ? BOSS_HP[cell.role] * bossScale : BRICK_HP[cell.type];
      const hp = Math.max(1, Math.round(hpUnit * part));
      const brick = makeBrick({
        col: cell.col,
        row: cell.row,
        type: cell.type,
        hp,
        color: cell.color,
        seed: this.rng.next(),
        bossRole: cell.role,
      });
      if (modifier?.id === 'stealth' && this.rng.chance(0.4)) brick.cloaked = true;
      this.bricks.push(brick);
    }
    this.brickTotal = this.bricks.length;
    // Where she stands there is no lattice boss state: its sway loop, summons and shots all hang
    // off it, and her fight runs instead.
    const boss = this.character ? null : this.level.boss;
    if (boss) {
      const maxHp = this.bricks.reduce((sum, brick) => sum + brick.hp, 0);
      this.boss = {
        def: boss,
        x: 0,
        y: 0,
        t: 0,
        phase: 1,
        hp: maxHp,
        maxHp,
        parts: this.bricks.length,
        speed: 1,
        summonCd: boss.summonInterval * 0.6,
        shootCd: 2,
        enraged: false,
        dead: false,
      };
    }
  }

  private spawnBalls(): void {
    const s = this.live;
    const radius = BALL_RADIUS * s.ballRadius;
    const add = (ghost: boolean, dock: number): void => {
      const ball = makeBall({
        x: this.paddle.x,
        y: this.paddle.y - PADDLE_H / 2 - radius,
        angle: -Math.PI / 2,
        speed: BALL_SPEED,
        radius,
        mult: ghost ? s.ghostRatio : 1,
        ghost,
        dock,
      });
      ball.guided = s.guidedCharges;
      ball.docked = true;
      this.balls.push(ball);
    };
    let dock = 0;
    for (let i = 0; i < s.ballCount; i++) {
      add(false, dock++);
      if (s.ghostRatio > 0) add(true, dock++);
    }
  }

  /**
   * Parked balls ride on the paddle until launch, in rows of nine centred on it. A lone ball sits
   * dead centre: where the player sees it is exactly where the launch comes from.
   */
  private dockBalls(): void {
    const paddle = this.paddle;
    const parked = this.balls.filter((ball) => ball.docked);
    const pitch = Math.min(16, (paddle.halfW * 2) / 10);
    for (const ball of parked) {
      const row = Math.floor(ball.dock / 9);
      const inRow = Math.min(parked.length, (row + 1) * 9) - row * 9;
      ball.x = paddle.x + ((ball.dock % 9) - (inRow - 1) / 2) * pitch;
      ball.y = paddle.y - PADDLE_H / 2 - ball.radius - row * 20;
      ball.vx = 0;
      ball.vy = 0;
    }
  }

  /** Current ball speed: base × upgrades × buffs × overdrive × level modifier. */
  ballSpeed(): number {
    return (
      BALL_SPEED *
      this.live.ballSpeed *
      (this.odActive ? 1.22 : 1) *
      this.level.speedMult *
      this.diff.ballSpeedMult
    );
  }

  /**
   * Fires every parked ball. Without guidance a ball goes straight up, perpendicular to the
   * paddle: aiming is the player's, by parking the paddle under the brick they want hit. Guidance
   * is the one thing that chooses a direction of its own, and a guided launch keeps its scatter —
   * a volley fans out, because balls leaving side by side on one heading would all lock the same
   * brick. `respawn` follows the same rule for a single ball.
   */
  private launchAll(): void {
    const docked = this.balls.filter((ball) => ball.alive && ball.docked);
    const steered = docked.filter((ball) => isGuided(ball, this.live.homing));
    docked.forEach((ball) => {
      // Guided balls take their place in the fan by their rank among themselves, so it stays even.
      const rank = steered.indexOf(ball);
      const spread =
        rank < 0
          ? 0
          : steered.length === 1
            ? this.rng.range(-0.25, 0.25)
            : ((rank / (steered.length - 1)) * 2 - 1) * 0.95;
      const angle = -Math.PI / 2 + spread;
      ball.speed = this.ballSpeed();
      ball.vx = Math.cos(angle) * ball.speed;
      ball.vy = Math.sin(angle) * ball.speed;
      ball.docked = false;
    });
    this.state = 'playing';
    this.events.emit('launch', { count: docked.length });
  }

  // ───────────────────────────── main update ─────────────────────────────

  update(dt: number): void {
    if (this.state === 'cleared' || this.state === 'dead') return;
    this.decayVisuals(dt);
    this.updatePaddle(dt);

    if (this.state === 'intro') {
      this.introT -= dt;
      this.dockBalls();
      if (this.introT <= 0) this.launchAll();
      return;
    }

    this.time += dt;
    if (this.combo > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.breakCombo();
    }
    if (this.invuln > 0) this.invuln -= dt;
    if (this.odActive) {
      this.odT -= dt;
      if (this.odT <= 0) this.endOverdrive();
      else this.tickCriticalMass();
    }
    this.tickBuffs(dt);
    this.updateHps(dt);
    this.updateTimeStop(dt);
    this.tickPurge(dt);

    const dying = this.state === 'dying';
    if (!dying) {
      // Time stop freezes everything the enemy does; everything the player owns keeps running.
      if (this.timeStop <= 0) this.updateEnemies(dt);
      this.updateZones(dt);
      this.updateAbilities(dt);
      this.updateBalls(dt);
      if (this.pendingSplit) this.splitBalls();
      this.updateShards(dt);
    }
    tickStatuses(this, dt);
    this.updatePickups(dt);
    this.runScheduler();
    this.sweepDead();

    if (this.state === 'clearing') {
      this.clearT -= dt;
      if (this.clearT <= 0) this.state = 'cleared';
    } else if (dying) {
      this.deathT -= dt;
      if (this.deathT <= 0) {
        this.state = 'dead';
        this.events.emit('dead', {});
      }
    } else if (this.state === 'playing') {
      this.checkClear();
    }
  }

  /** `tryOverdrive` is the player's one active decision: spend a full meter on a burst window. */
  tryOverdrive(): boolean {
    if (this.odActive || this.energy < 100 || this.state !== 'playing') return false;
    this.odActive = true;
    this.odT = OVERDRIVE_DURATION * this.stats.odDurationMult;
    this.odKills = this.killed;
    this.odBonus = 0;
    this.energy = 0;
    this.overdrives++;
    this.events.emit('overdrive', 'start');
    return true;
  }

  /** How long the current Overdrive window was stretched to — Critical Mass extensions included. */
  get odMax(): number {
    return OVERDRIVE_DURATION * this.stats.odDurationMult + this.odBonus;
  }

  private endOverdrive(): void {
    this.odActive = false;
    this.odT = 0;
    this.events.emit('overdrive', 'end');
    // Afterglow: the spent charge leaves as one shockwave through every brick on the field. Only
    // when the window ran its course — a level ending or a run ending has nothing left to sweep.
    if (this.live.afterglow && this.state === 'playing') {
      explode(
        this,
        this.paddle.x,
        this.paddle.y,
        AFTERGLOW_RADIUS,
        basePower(this) * AFTERGLOW_DAMAGE,
        0x9ff3ff,
        'nova',
      );
    }
  }

  /** Critical Mass: every few bricks shattered while Overdrive runs keep it running a little longer. */
  private tickCriticalMass(): void {
    if (!this.live.criticalMass || this.odBonus >= CRITICAL_MASS_CAP) return;
    if (this.killed - this.odKills < CRITICAL_MASS_KILLS) return;
    this.odKills += CRITICAL_MASS_KILLS;
    this.odBonus = Math.min(CRITICAL_MASS_CAP, this.odBonus + CRITICAL_MASS_BONUS);
    this.odT += CRITICAL_MASS_BONUS;
  }

  private decayVisuals(dt: number): void {
    for (const brick of this.bricks) {
      if (brick.dead) continue;
      if (brick.flash > 0) brick.flash = Math.max(0, brick.flash - dt * 7);
      if (brick.scale !== 1) brick.scale = damp(brick.scale, 1, 18, dt);
      if (brick.kx !== 0) brick.kx = damp(brick.kx, 0, 14, dt);
      if (brick.ky !== 0) brick.ky = damp(brick.ky, 0, 14, dt);
    }
    this.paddle.flash = Math.max(0, this.paddle.flash - dt * 4);
    this.paddle.squash = damp(this.paddle.squash, 0, 14, dt);
    for (const ball of this.balls) if (ball.squash > 0) ball.squash = Math.max(0, ball.squash - dt * 9);
  }

  private updatePaddle(dt: number): void {
    const paddle = this.paddle;
    // Eased: a capsule stretching the paddle should read as the paddle growing, not being swapped.
    const want = Math.min(MAX_PADDLE_HALF, (PADDLE_W / 2) * this.live.paddleWidth * this.diff.paddleMult);
    paddle.halfW = Math.abs(paddle.halfW - want) < 0.01 ? want : damp(paddle.halfW, want, 18, dt);
    const min = WALL + paddle.halfW;
    const max = ARENA_W - WALL - paddle.halfW;

    let target = paddle.targetX;
    if (this.bot) target = botTarget(this);
    else if (this.input.x !== null) target = this.input.x;
    else if (this.input.left !== this.input.right)
      target = paddle.x + (this.input.right ? 1 : -1) * 1500 * dt;
    target = clamp(target, min, max);

    paddle.targetX = target;
    const before = paddle.x;
    paddle.x = damp(paddle.x, target, 34, dt);
    paddle.vx = dt > 0 ? (paddle.x - before) / dt : 0;

    // The bot presses the button the moment it lights up, like any eager player would.
    if (this.bot && !this.odActive && this.energy >= 100) this.tryOverdrive();
  }

  // ───────────────────────────── combo & meter ─────────────────────────────

  addCombo(): void {
    this.combo++;
    this.hitAcc++;
    this.comboTimer = COMBO_TIME;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    const tier = comboTierOf(this.combo);
    if (tier > this.comboTier) {
      this.comboTier = tier;
      this.events.emit('comboTier', { tier, combo: this.combo });
    }
    this.gainEnergy(100 / (OVERDRIVE_FILL_SECONDS * Math.max(6, this.hps)));
  }

  private breakCombo(): void {
    if (this.combo >= 10) this.events.emit('comboLost', { combo: this.combo });
    this.combo = 0;
    this.comboTier = -1;
    this.comboTimer = 0;
  }

  /** Adds (or, with a negative amount, drains) overdrive energy. Gains scale with the build; drains never do. */
  private gainEnergy(amount: number): void {
    if (this.odActive) return;
    if (amount > 0) {
      const s = this.live;
      amount *= 1 + s.odGain;
      if (s.buffPerpetuum && this.buffs.length > 0) amount *= PERPETUUM_GAIN;
    }
    const before = this.energy;
    // The meter is clamped at both ends: gains cap at full, a missed ball after Overdrive must not
    // push it below empty.
    const next = this.energy + amount;
    this.energy = next < 0 ? 0 : Math.min(100, next);
    if (before < 100 && this.energy >= 100) this.events.emit('overdrive', 'ready');
  }

  private updateHps(dt: number): void {
    this.hpsT += dt;
    if (this.hpsT < 0.5) return;
    this.hps = lerp(this.hps, this.hitAcc / this.hpsT, 0.35);
    this.hitAcc = 0;
    this.hpsT = 0;
  }

  // ───────────────────────────── enemies ─────────────────────────────

  private updateEnemies(dt: number): void {
    const modifier = this.level.modifier?.id;
    // The field accelerates once the level has outstayed its welcome — a soft enrage.
    const pressure = 1 + clamp((this.time - this.level.parTime) / 25, 0, 2.5);
    // A Slow Field build takes the same fraction off everything that moves towards the paddle.
    const descent = 1 - this.live.slowField;
    if (!this.boss) this.fieldOffset += this.level.descent * pressure * descent * dt;

    this.updateBoss(dt);
    this.updateCharacter(dt);

    for (const brick of this.bricks) {
      if (brick.dead) continue;
      if (!brick.boss) {
        brick.baseY += brick.vy * descent * dt;
        brick.y = brick.baseY + this.fieldOffset;
        if (brick.y + brick.h / 2 >= DANGER_Y) {
          this.breach(brick);
          continue;
        }
        if (
          modifier === 'regen' &&
          brick.hp < brick.maxHp &&
          brick.burnT <= 0 &&
          brick.poisonT <= 0 &&
          brick.frostT <= 0
        ) {
          brick.hp = Math.min(brick.maxHp, brick.hp + brick.maxHp * 0.025 * dt);
        }
      } else if (brick.y + brick.h / 2 >= DANGER_Y) {
        this.breach(brick);
        continue;
      }
      if (brick.type === 'turret' && !brick.boss && this.state === 'playing') {
        brick.shootCd -= dt;
        if (brick.shootCd <= 0) {
          brick.shootCd = 3.8 / this.diff.bulletMult;
          this.shoot(brick.x, brick.y + brick.h / 2);
        }
      }
    }
    this.updateBullets(dt);
  }

  private breach(brick: Brick): void {
    brick.dead = true;
    this.events.emit('breach', { brick });
    this.damagePlayer(1);
  }

  damagePlayer(amount: number): void {
    if (this.invuln > 0 || this.state !== 'playing') return;
    // A dodge costs nothing — not the shield, not the combo, not the meter — but does claim the
    // grace window, so a row of bricks sinking together is one roll rather than one each.
    if (this.live.evade > 0 && this.rng.chance(this.live.evade)) {
      this.invuln = 0.9;
      this.events.emit('dodge', { x: this.paddle.x });
      return;
    }
    this.hp -= amount;
    this.damageTaken += amount;
    this.invuln = 0.9;
    this.breakCombo();
    this.energy = Math.max(0, this.energy - 25);
    this.events.emit('hurt', { amount });
    if (this.hp <= 0) {
      // 「续战核心」: the run's first breach restores shield instead of ending it. The hit still
      // costs what a hit costs — combo, meter, the grace window — it just does not end the run.
      if (this.secondWind && !this.run.secondWindUsed) {
        this.run.secondWindUsed = true;
        this.hp = SECOND_WIND_HP;
        this.events.emit('secondWind', {});
      } else {
        this.hp = 0;
        this.state = 'dying';
        this.deathT = 1.5;
        if (this.odActive) this.endOverdrive();
      }
    }
  }

  private shoot(x: number, y: number): void {
    if (this.bullets.length >= MAX_BULLETS) return;
    const aim = Math.atan2(this.paddle.y - y, this.paddle.x - x) + this.rng.range(-0.22, 0.22);
    const speed = Math.min(430, 230 + this.level.index * 6) * (1 - this.live.slowField);
    this.bullets.push({
      id: allocId(),
      x,
      y,
      vx: Math.cos(aim) * speed,
      vy: Math.sin(aim) * speed,
      r: 7,
      dead: false,
    });
    this.events.emit('shoot', { x, y });
  }

  private updateBullets(dt: number): void {
    const paddle = this.paddle;
    for (const bullet of this.bullets) {
      if (bullet.dead) continue;
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      // Her heavy orb counts down its fuse and bursts into a fan of scatter shots.
      if (bullet.splitT !== undefined) {
        bullet.splitT -= dt;
        if (bullet.splitT <= 0) {
          bullet.dead = true;
          this.scatterFrom(bullet, bullet.splitN ?? 8);
          continue;
        }
      }
      // Side walls bounce bullets like balls: an aimed shot that misses wide stays in the field
      // instead of vanishing behind a wall and still claiming a hit from off-screen.
      if (bullet.x < WALL + bullet.r) {
        bullet.x = WALL + bullet.r;
        bullet.vx = Math.abs(bullet.vx);
        this.events.emit('bounce', { x: bullet.x - bullet.r, y: bullet.y, nx: 1, ny: 0 });
      } else if (bullet.x > ARENA_W - WALL - bullet.r) {
        bullet.x = ARENA_W - WALL - bullet.r;
        bullet.vx = -Math.abs(bullet.vx);
        this.events.emit('bounce', { x: bullet.x + bullet.r, y: bullet.y, nx: -1, ny: 0 });
      }
      // A bullet only hurts when it gets past the paddle: blocking it is the same skill as catching.
      // The block box is a little generous — being clipped by a near-miss never feels fair.
      if (bullet.y > ARENA_H + 12) {
        bullet.dead = true;
        this.events.emit('bulletPass', { x: bullet.x, y: ARENA_H });
        this.damagePlayer(1);
        continue;
      }
      if (
        bullet.vy > 0 &&
        bullet.y + bullet.r > paddle.y - PADDLE_H / 2 &&
        bullet.y - bullet.r < paddle.y + PADDLE_H &&
        Math.abs(bullet.x - paddle.x) < paddle.halfW + bullet.r + 8
      ) {
        bullet.dead = true;
        this.gainEnergy(1.5);
        paddle.flash = Math.max(paddle.flash, 0.6);
        this.events.emit('bulletPop', { x: bullet.x, y: bullet.y, blocked: true });
      }
      // Aegis: while it stands, a line just under the paddle takes whatever slips past it.
      if (!bullet.dead && this.live.aegis && bullet.vy > 0 && bullet.y + bullet.r >= AEGIS_Y) {
        bullet.dead = true;
        this.gainEnergy(1.5);
        this.events.emit('bulletPop', { x: bullet.x, y: AEGIS_Y, blocked: true });
        this.events.emit('aegis', { x: bullet.x });
      }
    }
  }

  // ───────────────────────────── boss ─────────────────────────────

  private updateBoss(dt: number): void {
    const boss = this.boss;
    if (!boss || boss.dead) return;
    const def = boss.def;
    boss.t += dt * boss.speed;
    boss.x = Math.sin(boss.t * def.sway) * def.ampX;
    boss.y = (1 - Math.cos(boss.t * def.bob)) * 0.5 * def.ampY;
    if (boss.enraged) this.fieldOffset += 16 * (1 - this.live.slowField) * dt;

    let hp = 0;
    let parts = 0;
    for (const brick of this.bricks) {
      if (brick.dead || !brick.boss) continue;
      brick.x = brick.baseX + boss.x;
      brick.y = brick.baseY + boss.y + this.fieldOffset;
      hp += Math.max(0, brick.hp);
      parts++;
    }
    boss.hp = hp;
    boss.parts = parts;

    const ratio = hp / boss.maxHp;
    const phase = ratio < 0.33 ? 3 : ratio < 0.66 ? 2 : 1;
    if (phase > boss.phase) {
      boss.phase = phase;
      boss.speed *= 1.2;
      this.events.emit('boss', { phase: 'phase' });
      this.summon(def.summon);
    }
    if (!boss.enraged && this.time > def.enrage) {
      boss.enraged = true;
      this.events.emit('boss', { phase: 'enrage' });
    }
    if (this.state === 'playing') {
      boss.summonCd -= dt * boss.speed;
      if (boss.summonCd <= 0) {
        boss.summonCd = def.summonInterval;
        this.summon(def.summon);
      }
      // The boss fires on one shared clock, from a random turret: a readable rhythm the player
      // can block between catches. Independent turrets would make catching and blocking mutually exclusive.
      boss.shootCd -= dt * boss.speed;
      if (boss.shootCd <= 0) {
        boss.shootCd = def.shootInterval / this.diff.bulletMult;
        this.bossShoot();
      }
    }
  }

  /**
   * Her discs this moment: what the ball sweep reads and the renderer draws. Empty without her.
   * The buffer is reused, so read it before placing anything else over it.
   */
  private discBuffer: BossDisc[] = [];
  characterDiscs(): BossDisc[] {
    if (!this.character) return [];
    this.discBuffer = characterDiscsOf(this.character);
    return this.discBuffer;
  }

  /** One blow lands on a part of her: it scores, it flinches, and the fight knows. */
  onCharacterPartHit(ball: Ball, key: number, nx: number, ny: number, cx: number, cy: number): void {
    const boss = this.character;
    if (!boss) return;
    const s = this.live;
    const power = ballPower(this, ball);
    const crit = this.rng.chance(s.critChance);
    // The sweep keys her parts by negative number; the part they name is looked up here. Where
    // every part sits is taken first: one this blow tears off is gone from the list after.
    const before = this.characterDiscs();
    const disc = before.find((each) => each.key === key);
    if (!disc) return;
    const id = disc.id;
    const look = boss.state.look[id as keyof typeof boss.state.look];
    const was = look.state;
    const dealt = hitCharacterPart(boss, id, power * (crit ? s.critMult : 1), nx, ny);
    if (!(dealt > 0)) return;

    ball.dryT = 0;
    if (ball.guided > 0) ball.guided--;
    ball.lock = 0;
    if (s.momentumPerHit > 0) ball.momentum = Math.min(s.momentumMax, ball.momentum + s.momentumPerHit);

    // Her armour is worth what a brick's is: score counts the damage dealt, as the lattice's does.
    this.totalDamage += dealt;
    this.run.score += dealt * (1 + this.combo * 0.01) * (1 + this.level.index * 0.25) * this.diff.scoreMult;
    this.addCombo();
    this.events.emit('hit', {
      x: cx,
      y: cy,
      dmg: dealt,
      crit,
      execute: false,
      source: 'ball',
      // No brick: the part is hers, and the impact draws in her energy colour.
      brick: null as never,
      color: 0xff5fd8,
    });

    const { changed, fell } = characterPhase(boss);
    // Where a part sat as it was torn off, so the feedback lands on it where it sways.
    const sat = (part: string): BossDisc | undefined => before.find((each) => each.id === part);
    if (look.state !== was) {
      const where = sat(id);
      this.events.emit('characterPart', {
        id,
        state: look.state,
        x: where?.x ?? cx,
        y: where?.y ?? cy,
      });
      if (look.state === 'destroyed' && id !== 'Core') {
        boss.state.face = 'hurt';
        boss.state.line = 'partDown';
        boss.quietFor = 0;
      }
    }
    if (fell) {
      const where = sat(fell);
      this.events.emit('characterPart', {
        id: fell,
        state: 'destroyed',
        x: where?.x ?? cx,
        y: where?.y ?? cy,
      });
    }
    if (changed) {
      this.events.emit('character', {
        kind: 'phase',
        phase: boss.state.phase,
        moment: boss.pendingLine ?? null,
        x: boss.state.x,
        y: boss.state.y,
      });
      boss.state.face = boss.state.phase >= 4 ? 'awakened' : 'angry';
    }
    if (characterDefeated(boss) && !boss.state.defeated) {
      boss.state.defeated = true;
      boss.state.face = 'defeated';
      boss.state.line = 'defeated';
      this.events.emit('character', {
        kind: 'line',
        phase: boss.state.phase,
        moment: 'defeated',
        x: boss.state.x,
        y: boss.state.y,
      });
    }
  }

  /** Steps her state machine: sway, hits fading, phases, her lines — and her attacks. */
  private updateCharacter(dt: number): void {
    if (!this.character || this.state !== 'playing') return;
    stepCharacterBoss(this.character, dt);
    const line = this.character.state.line;
    if (line)
      this.events.emit('character', {
        kind: 'line',
        phase: this.character.state.phase,
        moment: line,
        x: this.character.state.x,
        y: this.character.state.y,
      });
    // A part the fight has broken changes her face for a while; her phase's face claims it back.
    if (this.character.state.face === 'hurt' && this.character.quietFor > 1.6) {
      this.character.state.face = this.character.state.phase >= 3 ? 'angry' : 'idle';
    }
    // Her attacks fire from where her parts actually are this frame: the wings volley from their
    // discs, the core's heavy orb grows from hers and bursts into scatter shots on a fuse. A part
    // that is torn off fires nothing.
    this.character.attackCd -= dt;
    if (this.character.attackCd > 0) return;
    const discs = this.characterDiscs();
    const discOf = (id: BossPartId): BossDisc | undefined => discs.find((disc) => disc.id === id);
    const attack = characterAttack(this.character);
    if (attack.kind === 'wings') {
      for (const id of ['LeftWing', 'RightWing'] as BossPartId[]) {
        const wing = discOf(id);
        if (!wing) continue;
        this.shoot(wing.x, wing.y + wing.radius * 0.4);
        this.shoot(wing.x, wing.y + wing.radius * 0.4);
      }
    } else {
      const core = discOf('Core');
      if (!core) return;
      const aim = Math.atan2(this.paddle.y - core.y, this.paddle.x - core.x);
      const speed = 190 + this.level.index * 3;
      this.bullets.push({
        id: allocId(),
        x: core.x,
        y: core.y,
        vx: Math.cos(aim) * speed,
        vy: Math.sin(aim) * speed,
        r: 16,
        dead: false,
        big: true,
        // The fuse runs out while the orb is still over the open field, short of the paddle line.
        splitT: 1.15,
        splitN: attack.scatter,
      });
      this.events.emit('shoot', { x: core.x, y: core.y });
    }
  }

  /** The scatter shots a burst produces: a fan across the lower half, from where the orb burst. */
  private scatterFrom(bullet: Bullet, count: number): void {
    const speed = 240 + this.level.index * 3;
    for (let i = 0; i < count; i++) {
      if (this.bullets.length >= MAX_BULLETS) return;
      const angle = Math.PI * (0.12 + (0.76 * i) / (count - 1));
      this.bullets.push({
        id: allocId(),
        x: bullet.x,
        y: bullet.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: 7,
        dead: false,
      });
    }
    this.events.emit('shoot', { x: bullet.x, y: bullet.y });
  }

  private bossShoot(): void {
    const turrets = this.bricks.filter((brick) => !brick.dead && brick.bossRole === 'turret');
    const source = turrets.length > 0 ? this.rng.pick(turrets) : null;
    const x = source?.x ?? ARENA_W / 2 + (this.boss?.x ?? 0);
    const y = (source?.y ?? 120) + 14;
    this.shoot(x, y);
  }

  private summon(kind: SummonKind): void {
    const boss = this.boss;
    if (!boss || this.bricks.length > 150) return;
    const top = boss.def.rows.length + 2;
    const layout: Record<SummonKind, [number, number][]> = {
      wings: [
        [0, top],
        [1, top],
        [10, top],
        [11, top],
        [0, top + 1],
        [1, top + 1],
        [10, top + 1],
        [11, top + 1],
      ],
      row: [
        [3, top],
        [4, top],
        [5, top],
        [6, top],
        [7, top],
        [8, top],
      ],
      cross: [
        [5, top],
        [6, top],
        [1, top + 1],
        [10, top + 1],
        [5, top + 2],
        [6, top + 2],
      ],
    };
    const palette = CHAPTERS[this.level.chapter]?.bricks ?? [0x27e0ff];
    let count = 0;
    for (const [col, row] of layout[kind]) {
      if (this.bricks.some((b) => !b.dead && b.col === col && b.row === row)) continue;
      const type: BrickType = this.rng.chance(0.2) ? 'gold' : 'normal';
      const brick = makeBrick({
        col,
        row,
        type,
        hp: Math.max(1, Math.round(this.level.hpUnit * BRICK_HP[type])),
        color: type === 'gold' ? 0xffc93c : (palette[row % palette.length] ?? 0x27e0ff),
        seed: this.rng.next(),
      });
      brick.vy = 9 + this.level.index * 0.6;
      this.bricks.push(brick);
      this.brickTotal++;
      count++;
    }
    if (count > 0) this.events.emit('summon', { count });
  }

  /** The last boss brick fell. Everything it summoned goes up in a cascade. */
  private bossDefeated(): void {
    const boss = this.boss;
    if (!boss || boss.dead) return;
    boss.dead = true;
    this.bosses++;
    this.events.emit('boss', { phase: 'die' });
    let i = 0;
    for (const brick of this.bricks) {
      if (brick.dead || brick.boss) continue;
      const target = brick;
      this.after(0.1 + i * 0.05, () => {
        if (!target.dead) explode(this, target.x, target.y, 100, target.maxHp * 50, target.color, 'summon');
      });
      i++;
    }
  }

  // ───────────────────────────── player-owned systems ─────────────────────────────

  private updateTimeStop(dt: number): void {
    const s = this.live;
    // The time-stop capsule holds the world still for exactly as long as the buff runs, on a clock
    // of its own. The upgrade's cycle — countdown or cooldown — resumes once the buff is gone.
    if (this.hasBuff('timestop')) {
      if (this.timeStop <= 0) this.events.emit('timeStop', 'start');
      this.timeStop = Math.max(this.timeStop, 0.06);
      return;
    }
    if (this.timeStop > 0) {
      this.timeStop -= dt;
      if (this.timeStop <= 0) {
        this.timeStop = 0;
        this.timeStopCd = s.timeStopInterval;
        this.events.emit('timeStop', 'end');
      }
    } else if (s.timeStopInterval > 0 && this.state === 'playing') {
      this.timeStopCd -= dt;
      if (this.timeStopCd <= 0) {
        this.timeStop = s.timeStopDuration;
        this.events.emit('timeStop', 'start');
      }
    }
  }

  private updateAbilities(dt: number): void {
    const s = this.live;
    if (s.laserLevel > 0) {
      this.laserCd -= dt;
      if (this.laserCd <= 0) {
        this.laserCd = LASER_INTERVAL / (this.odActive ? 2 : 1);
        fireLasers(this);
      }
    }
    if (s.orbitalCount > 0) {
      this.orbitalCd -= dt;
      if (this.orbitalCd <= 0) {
        this.orbitalCd = ORBITAL_INTERVAL;
        fireOrbital(this);
      }
    }
    if (s.thunder > 0) {
      this.thunderCd -= dt;
      if (this.thunderCd <= 0) {
        this.thunderCd = THUNDER_INTERVAL;
        this.callThunder(s.thunder);
      }
    }
  }

  /** Thunderhead: lightning finds the brick closest to the danger line, so it always earns its keep. */
  private callThunder(ranks: number): void {
    let target: Brick | null = null;
    for (const brick of this.bricks) {
      if (!brick.dead && (!target || brick.y > target.y)) target = brick;
    }
    if (!target) return;
    const power = basePower(this);
    this.events.emit('strike', { x: target.x, y: target.y });
    strikeLightning(this, target, power * THUNDER_DAMAGE * ranks, power);
  }

  /** Damages every brick whose centre lies within `radius` of a point. */
  areaDamage(
    x: number,
    y: number,
    radius: number,
    amount: number,
    power: number,
    source: DamageSource = 'area',
  ): void {
    const r2 = radius * radius;
    for (const brick of this.bricks) {
      if (brick.dead) continue;
      const dx = brick.x - x;
      const dy = brick.y - y;
      if (dx * dx + dy * dy <= r2) {
        applyDamage(this, brick, amount, {
          x: brick.x,
          y: brick.y,
          power,
          source,
          ball: null,
          crit: false,
          explosion: false,
        });
      }
    }
  }

  singularityPos(): { x: number; y: number } {
    const t = this.singularity?.t ?? 0;
    return { x: ARENA_W / 2 + Math.sin(t * 0.83) * 290, y: 430 + Math.sin(t * 1.31 + 1.3) * 270 };
  }

  private updateZones(dt: number): void {
    const s = this.live;

    for (const hole of this.holes) {
      if (hole.dead) continue;
      hole.life -= dt;
      hole.tick += dt;
      if (hole.tick >= HOLE_TICK) {
        hole.tick -= HOLE_TICK;
        this.areaDamage(hole.x, hole.y, hole.r, hole.power * 1.1 * HOLE_TICK, hole.power);
      }
      if (hole.life <= 0) {
        hole.dead = true;
        this.events.emit('hole', { hole, phase: 'end' });
        explode(this, hole.x, hole.y, hole.r * 1.8, hole.power * 2.2 * s.holeDamageMult, 0xb06bff, 'hole');
        continue;
      }
      // Bend ball trajectories around the hole: pure attraction plus constant speed reads as an orbit.
      for (const ball of this.balls) {
        if (!ball.alive || ball.docked) continue;
        const dx = hole.x - ball.x;
        const dy = hole.y - ball.y;
        const d2 = dx * dx + dy * dy;
        const reach = hole.r * 3.4;
        if (d2 >= reach * reach || d2 < 1) continue;
        const pull = (2400 * dt) / Math.sqrt(d2);
        ball.vx += dx * pull;
        ball.vy += dy * pull;
        const len = Math.hypot(ball.vx, ball.vy) || 1;
        ball.vx *= ball.speed / len;
        ball.vy *= ball.speed / len;
      }
    }

    for (const pool of this.pools) {
      if (pool.dead) continue;
      pool.life -= dt;
      pool.tick += dt;
      if (pool.tick >= POOL_TICK) {
        pool.tick -= POOL_TICK;
        this.areaDamage(pool.x, pool.y, pool.r, pool.power * 0.7 * POOL_TICK, pool.power);
      }
      if (pool.life <= 0) pool.dead = true;
    }

    const singularity = this.singularity;
    if (singularity) {
      singularity.t += dt;
      singularity.tick += dt;
      if (singularity.tick >= 0.1) {
        singularity.tick -= 0.1;
        const power = basePower(this);
        const pos = this.singularityPos();
        this.areaDamage(pos.x, pos.y, 84, power * 1.2 * s.singularityDamageMult * 0.1, power);
      }
    }
  }

  // ───────────────────────────── balls ─────────────────────────────

  private updateBalls(dt: number): void {
    const s = this.live;
    const speed =
      BALL_SPEED * s.ballSpeed * (this.odActive ? 1.22 : 1) * this.level.speedMult * this.diff.ballSpeedMult;
    const radius = Math.min(MAX_BALL_RADIUS, BALL_RADIUS * s.ballRadius);
    const solar = s.solarDps > 0;

    for (const ball of this.balls) {
      if (!ball.alive) {
        if (!ball.child && !ball.voided) {
          ball.respawnT -= dt;
          if (ball.respawnT <= 0) this.respawn(ball);
        }
        continue;
      }
      if (ball.docked) continue;
      if (ball.ttl !== Infinity) {
        ball.ttl -= dt;
        if (ball.ttl <= 0) {
          ball.alive = false;
          continue;
        }
      }
      if (ball.emp > 0) ball.emp -= dt;
      ball.speed = speed;
      // Size eases towards its target, so a capsule swelling the ball never teleports it out of a brick.
      ball.radius = Math.abs(ball.radius - radius) < 0.01 ? radius : damp(ball.radius, radius, 16, dt);
      // Speed is authoritative. Upgrades, overdrive and level modifiers all change it, so the
      // velocity vector is rescaled to match — a faster ball really is faster from that frame on.
      const len = Math.hypot(ball.vx, ball.vy);
      if (len > 1e-6 && Math.abs(len - speed) > 1e-4 * speed) {
        ball.vx *= speed / len;
        ball.vy *= speed / len;
      }
      ball.dryT += dt;

      const px = ball.x;
      const py = ball.y;
      stepBall(this, ball, dt);

      // Watchdog: a ball that cannot move is teleported back to the paddle rather than stalling the level.
      if (Math.abs(ball.x - px) + Math.abs(ball.y - py) < 1.5) {
        ball.stallT += dt;
        if (ball.stallT > 0.6) {
          if (ball.child) ball.alive = false;
          else this.loseBall(ball);
          continue;
        }
      } else {
        ball.stallT = 0;
      }

      // Balls shred bullets they fly through, so good coverage is also defence.
      for (const bullet of this.bullets) {
        if (bullet.dead) continue;
        const dx = bullet.x - ball.x;
        const dy = bullet.y - ball.y;
        const rr = bullet.r + ball.radius;
        if (dx * dx + dy * dy < rr * rr) {
          bullet.dead = true;
          this.events.emit('bulletPop', { x: bullet.x, y: bullet.y, blocked: false });
        }
      }

      if (solar) {
        ball.solarT -= dt;
        if (ball.solarT <= 0) {
          ball.solarT = SOLAR_PERIOD;
          const power = ballPower(this, ball);
          this.areaDamage(ball.x, ball.y, s.solarRadius, power * s.solarDps * SOLAR_PERIOD, power);
        }
      }
    }
  }

  paddleBounce(ball: Ball): void {
    const paddle = this.paddle;
    const s = this.live;
    // The offset decides the return angle: edge hits fly wide, centre hits go straight up.
    const landed = clamp((ball.x - paddle.x) / paddle.halfW, -1, 1);
    let off = landed;
    // Anti-stall: a ball that has been flying dry goes back with a visible angle, towards the nearest brick.
    if (ball.dryT > BALL_DRY_NUDGE) off = Math.max(Math.abs(off), 0.24) * this.sideWithBricks(ball.x);
    const angle = -Math.PI / 2 + off * PADDLE_BOUNCE_SPREAD;
    ball.vx = Math.cos(angle) * ball.speed + paddle.vx * 0.15;
    ball.vy = Math.sin(angle) * ball.speed;
    const len = Math.hypot(ball.vx, ball.vy) || 1;
    ball.vx *= ball.speed / len;
    ball.vy *= ball.speed / len;
    ball.y = paddle.y - PADDLE_H / 2 - ball.radius - 0.5;
    ball.momentum = 0;
    ball.squash = 1;
    // A fresh trip up: banked damage, floor bounces and guidance all start over.
    ball.floor = 0;
    ball.guided = s.guidedCharges;
    ball.lock = 0;
    if (s.empowerBonus > 0) ball.emp = s.empowerDuration;

    paddle.flash = 1;
    paddle.squash = 1;
    // Judged on where the ball landed, before the anti-stall nudge bent its return angle.
    const perfect = Math.abs(landed) < PERFECT_WINDOW + s.perfectWindow;
    this.gainEnergy(perfect ? PERFECT_ENERGY * (1 + s.perfectEnergy) : CATCH_ENERGY);
    if (perfect) this.perfects++;
    this.events.emit('paddle', { x: ball.x, off, perfect });
  }

  /** +1 / −1: which horizontal side of `x` the nearest alive brick lies on. Falls back to a coin flip. */
  private sideWithBricks(x: number): number {
    let best = Infinity;
    let side = 0;
    for (const brick of this.bricks) {
      if (brick.dead) continue;
      const dx = brick.x - x;
      if (Math.abs(dx) < best) {
        best = Math.abs(dx);
        side = Math.sign(dx);
      }
    }
    return side || this.rng.sign();
  }

  loseBall(ball: Ball): void {
    ball.alive = false;
    ball.docked = false;
    if (ball.child) {
      this.events.emit('miss', { x: ball.x, child: true });
      return;
    }
    ball.respawnT = this.rng.range(0.7, 1.1);
    ball.ignore.clear();
    // A miss costs tempo and meter, never progress: nothing in this game punishes the player for going fast.
    this.comboTimer = Math.min(this.comboTimer, 0.9);
    this.gainEnergy(-3);
    this.events.emit('miss', { x: ball.x, child: false });
  }

  /** How many real balls the player has on the field (children and mirror ghosts don't count). */
  freeBallCount(): number {
    return this.balls.filter((ball) => ball.alive && !ball.child && !ball.ghost).length;
  }

  /** Eaten by an eraser brick or a difficulty purge: gone for the rest of this level, no respawn. */
  voidBall(ball: Ball): void {
    if (!ball.alive || ball.voided || ball.child || ball.ghost) return;
    ball.voided = true;
    ball.alive = false;
    ball.docked = false;
    ball.ignore.clear();
    this.events.emit('ballVoided', { x: ball.x, y: ball.y });
  }

  /** The abyss tier's slow drain on multiball stacks: one surplus ball per period. */
  private tickPurge(dt: number): void {
    if (this.diff.purgePeriod <= 0 || this.state !== 'playing') return;
    this.purgeT -= dt;
    if (this.purgeT > 0) return;
    this.purgeT = this.diff.purgePeriod;
    const flying = this.balls.filter((ball) => ball.alive && !ball.docked && !ball.child && !ball.ghost);
    if (flying.length <= MIN_FREE_BALLS) return;
    this.voidBall(this.rng.pick(flying));
  }

  private respawn(ball: Ball): void {
    ball.alive = true;
    ball.docked = false;
    ball.x = this.paddle.x;
    ball.y = this.paddle.y - PADDLE_H / 2 - ball.radius;
    ball.momentum = 0;
    ball.emp = 0;
    ball.stallT = 0;
    ball.floor = 0;
    // A relaunch leaves the way a new ball does (`launchAll`), so the anti-stall clock starts over:
    // a ball that was already dry when it fell must not set off drifting towards a brick.
    ball.dryT = 0;
    ball.guided = this.live.guidedCharges;
    ball.lock = 0;
    ball.ignore.clear();
    const angle = -Math.PI / 2 + (isGuided(ball, this.live.homing) ? this.rng.range(-0.6, 0.6) : 0);
    ball.speed = this.ballSpeed();
    ball.vx = Math.cos(angle) * ball.speed;
    ball.vy = Math.sin(angle) * ball.speed;
  }

  private updateShards(dt: number): void {
    for (const shard of this.shards) {
      if (shard.dead) continue;
      shard.life -= dt;
      if (shard.life <= 0) {
        shard.dead = true;
        continue;
      }
      shard.x += shard.vx * dt;
      shard.y += shard.vy * dt;
      if (shard.x < WALL || shard.x > ARENA_W - WALL) {
        shard.vx = -shard.vx;
        shard.x = clamp(shard.x, WALL, ARENA_W - WALL);
      }
      for (const brick of this.bricks) {
        if (brick.dead) continue;
        if (
          Math.abs(shard.x - brick.x) <= brick.w / 2 + 3 &&
          Math.abs(shard.y - brick.y) <= brick.h / 2 + 3
        ) {
          shard.dead = true;
          hitShard(this, brick, shard.x, shard.y, shard.power);
          break;
        }
      }
    }
  }

  // ───────────────────────────── loot ─────────────────────────────

  dropLoot(brick: Brick): void {
    const s = this.live;
    const mult = s.crystalMult * (this.level.modifier?.id === 'gold' ? 2 : 1);
    // 「碎晶雨」: every brick pays, including the kinds that normally drop nothing.
    const rain = s.crystalChance >= 1;
    const spawn = (kind: PickupKind, value: number): void => {
      if (this.pickups.length >= 240) return;
      this.pickups.push({
        id: allocId(),
        kind,
        value,
        buff: null,
        x: brick.x,
        y: brick.y,
        vx: this.rng.range(-160, 160),
        vy: this.rng.range(-420, -180),
        spd: 200,
        t: 0,
        dead: false,
      });
    };
    const crystal = (lo: number, hi: number): void =>
      spawn('crystal', Math.max(1, Math.round(this.rng.range(lo, hi) * mult)));
    const heart = (): void => {
      if (this.hp < this.maxHp) spawn('heart', 1);
    };

    if (brick.boss) {
      if (rain || this.rng.chance(0.7)) crystal(2, 4);
      if (brick.bossRole === 'core') heart();
    } else {
      switch (brick.type) {
        case 'gold':
          crystal(3, 5);
          break;
        case 'elite':
          crystal(8, 12);
          if (this.rng.chance(0.35)) heart();
          break;
        case 'explosive':
          if (rain) crystal(1, 2);
          break;
        default:
          if (rain || this.rng.chance(Math.min(0.5, s.crystalChance + 0.08 * s.luck))) crystal(1, 2);
      }
    }
    this.dropCapsule(brick);
  }

  /**
   * Capsules run on a clock rather than a per-brick roll, so they arrive at a steady pace
   * whatever the build does to the kill rate: when one is due, the next brick to shatter carries it.
   */
  private dropCapsule(brick: Brick): void {
    if (this.state !== 'playing' || this.time < this.buffAt) return;
    const def = this.rollBuff();
    // Nothing worth giving, or nowhere to put it: the next brick tries again.
    if (!def || this.pickups.length >= 240) return;
    this.lastBuff = def.id;
    this.pickups.push({
      id: allocId(),
      kind: 'buff',
      value: 0,
      buff: def.id,
      x: brick.x,
      y: brick.y,
      vx: this.buffRng.range(-40, 40),
      vy: this.buffRng.range(-460, -260),
      spd: 170,
      t: 0,
      dead: false,
    });
    this.events.emit('capsule', { x: brick.x, y: brick.y, id: def.id });
    this.buffAt =
      this.time + this.buffRng.range(BUFF_INTERVAL_MIN, BUFF_INTERVAL_MAX) / (1 + this.stats.buffRate);
  }

  private updatePickups(dt: number): void {
    const paddle = this.paddle;
    for (const pickup of this.pickups) {
      if (pickup.dead) continue;
      pickup.t += dt;
      if (pickup.t < 0.55) {
        // A short ballistic pop, so the drop reads as a physical object…
        pickup.vy += 1500 * dt;
        pickup.x += pickup.vx * dt;
        pickup.y += pickup.vy * dt;
      } else if (pickup.kind === 'buff') {
        // …but a capsule is a catch, not a gift: it falls straight down from where it dropped,
        // and only a magnetic field pulls it aside. One that reaches the floor is gone.
        const magnet = this.live.magnetRadius;
        const inField =
          magnet > 0 &&
          pickup.y < paddle.y &&
          paddle.y - pickup.y < magnet + 180 &&
          Math.abs(paddle.x - pickup.x) < magnet * 1.6;
        if (inField) {
          const dx = paddle.x - pickup.x;
          const dy = paddle.y - 10 - pickup.y;
          const dist = Math.hypot(dx, dy) || 1;
          pickup.spd = Math.min(1700, pickup.spd + 3800 * dt);
          pickup.x += (dx / dist) * pickup.spd * dt;
          pickup.y += (dy / dist) * pickup.spd * dt;
        } else {
          pickup.vy = Math.min(pickup.vy + 1500 * dt, CAPSULE_FALL_SPEED);
          pickup.x += pickup.vx * dt;
          pickup.y += pickup.vy * dt;
          const left = WALL + 8;
          const right = ARENA_W - WALL - 8;
          if (pickup.x <= left || pickup.x >= right) {
            pickup.x = clamp(pickup.x, left, right);
            pickup.vx = -pickup.vx * 0.5;
          }
          if (pickup.y > ARENA_H + 16) {
            pickup.dead = true;
            this.events.emit('capsuleLost', { x: pickup.x });
            continue;
          }
        }
      } else {
        // …then crystals and hearts home in on the paddle. Currency is never lost.
        const dx = paddle.x - pickup.x;
        const dy = paddle.y - 10 - pickup.y;
        const dist = Math.hypot(dx, dy) || 1;
        pickup.spd = Math.min(1700, pickup.spd + 3800 * dt);
        pickup.x += (dx / dist) * pickup.spd * dt;
        pickup.y += (dy / dist) * pickup.spd * dt;
      }
      if (Math.abs(pickup.x - paddle.x) < paddle.halfW + 14 && Math.abs(pickup.y - paddle.y) < 26) {
        pickup.dead = true;
        if (pickup.kind === 'crystal') {
          this.run.crystals += pickup.value;
        } else if (pickup.kind === 'buff') {
          this.capsules++;
          if (pickup.buff) this.activateBuff(pickup.buff);
        } else if (this.hp < this.maxHp) {
          this.hp++;
        }
        this.events.emit('pickup', { x: pickup.x, y: pickup.y, kind: pickup.kind, value: pickup.value });
      }
    }
  }

  // ───────────────────────────── temporary buffs ─────────────────────────────

  hasBuff(id: BuffId): boolean {
    return this.buffs.some((buff) => buff.id === id);
  }

  /**
   * Ends every temporary buff on the spot — silently, without the take-back cues, because the run
   * itself is what is ending. A finished run holds no buffs, so no later screen (the results, the
   * HUD frozen behind them, the next run) can still quote the ones it died holding.
   */
  clearBuffs(): void {
    if (this.buffs.length === 0) return;
    // Split twins go when their buff does; give them the same half second to fade as expiry would.
    if (this.buffs.some((buff) => buff.id === 'split'))
      for (const ball of this.balls) if (ball.clone) ball.ttl = Math.min(ball.ttl, 0.5);
    this.buffs = [];
    this.refreshLive();
  }

  /**
   * Grants a buff now. `scale` shortens it — Twin Resonance echoes run at half length.
   * Returns false when there is nothing to grant: an unknown id, or a level that is already over.
   */
  activateBuff(id: BuffId, scale = 1): boolean {
    const def = BUFF_MAP[id];
    if (!def || this.state !== 'playing') return false;
    const s = this.stats;
    let duration = 0;
    if (def.duration > 0) {
      duration = def.duration * s.buffDurationMult * scale;
      const running = this.buffs.find((buff) => buff.id === id);
      if (running) {
        // A second capsule tops the clock up; it never shortens the time already bought.
        running.t = Math.max(running.t, duration);
        running.max = Math.max(running.max, running.t);
      } else {
        this.buffs.push({ id, t: duration, max: duration });
      }
      if (id === 'split') this.pendingSplit = true;
      this.refreshLive();
    } else if (id === 'overcharge') {
      this.gainEnergy(100);
    } else if (id === 'repair' && this.hp < this.maxHp) {
      this.hp++;
    }
    this.events.emit('buff', { id, x: this.paddle.x, y: this.paddle.y, duration, twin: scale < 1 });
    // Twin Resonance: every full-length buff comes back, a beat later, as a different shorter one.
    if (s.buffTwin && scale === 1) {
      const echo = this.rollBuff(id);
      if (echo) this.after(0.18, () => this.activateBuff(echo.id, 0.5));
    }
    return true;
  }

  /** Which buff the next capsule carries: weighted by what the field needs, and never one that would be wasted right here. */
  private rollBuff(exclude?: BuffId): BuffDef | null {
    const pressure = this.pressure();
    const weightOf = (def: BuffDef): number => (def.id === exclude ? 0 : this.buffWeight(def, pressure));
    // Never the same capsule twice running — as long as anything else would do.
    let others = 0;
    for (const def of BUFFS) if (def.id !== this.lastBuff) others += weightOf(def);
    return this.buffRng.weighted(BUFFS, (def) =>
      others > 0 && def.id === this.lastBuff ? 0 : weightOf(def),
    );
  }

  /** 0..1: how far the wall has sunk into the band above the danger line. An enraged boss counts as fully pressed. */
  private pressure(): number {
    if (this.boss) return this.boss.enraged ? 1 : 0.2;
    let lowest = -Infinity;
    for (const brick of this.bricks) {
      if (!brick.dead && brick.y + brick.h / 2 > lowest) lowest = brick.y + brick.h / 2;
    }
    return clamp(1 - (DANGER_Y - lowest) / DANGER_BAND, 0, 1);
  }

  private buffWeight(def: BuffDef, pressure: number): number {
    let weight = def.weight;
    // A buff already running is mostly a top-up.
    if (this.hasBuff(def.id)) weight *= 0.25;
    switch (def.id) {
      case 'overcharge':
        if (this.odActive || this.energy >= 100) weight = 0;
        break;
      case 'repair':
        if (this.hp >= this.maxHp) weight = 0;
        break;
      case 'timestop':
        if (this.timeStop > 0) weight = 0;
        break;
      case 'aegis':
        if (!this.hasGunners) weight = 0;
        break;
      case 'split': {
        // Twins need somewhere to go: fade out as the ball list fills.
        const room = Math.max(0, Math.min(MAX_CLONES, MAX_BALLS - this.balls.length));
        weight *= room / MAX_CLONES;
        break;
      }
      default:
    }
    // The field has its say. A wall closing on the line is offered the means to tear it down — and
    // time itself — rather than a wider paddle; a low shield sees repair come round sooner.
    if (OFFENCE.has(def.id)) weight *= 1 + PRESSURE_OFFENCE * pressure;
    else if (def.id === 'timestop') weight *= 1 + PRESSURE_TIMESTOP * pressure;
    else if (COVER.has(def.id)) weight *= 1 - PRESSURE_COVER * pressure;
    else if (def.id === 'repair') weight *= 1 + (HURT_REPAIR * (this.maxHp - this.hp)) / this.maxHp;
    return weight;
  }

  /** Counts every buff down. Under Perpetuum, Overdrive holds the clocks still. */
  private tickBuffs(dt: number): void {
    if (this.buffs.length === 0) return;
    if (this.stats.buffPerpetuum && this.odActive) return;
    let expired = false;
    for (const buff of this.buffs) {
      buff.t -= dt;
      if (buff.t > 0) continue;
      expired = true;
      // Split twins do not pop out of existence: they get half a second to fade.
      if (buff.id === 'split')
        for (const ball of this.balls) if (ball.clone) ball.ttl = Math.min(ball.ttl, 0.5);
      this.events.emit('buffEnd', { id: buff.id });
    }
    if (!expired) return;
    this.buffs = this.buffs.filter((buff) => buff.t > 0);
    this.refreshLive();
  }

  /** Re-derives `live` after the set of running buffs changed. */
  private refreshLive(): void {
    this.liveStats = this.buffs.length > 0 ? withBuffs(this.stats, this.buffs) : this.stats;
  }

  /**
   * 「球体分裂」: every real ball in flight forks into two twins. A capsule collected while every
   * ball is waiting to relaunch stays pending until the first one launches.
   */
  private splitBalls(): void {
    const buff = this.buffs.find((entry) => entry.id === 'split');
    if (!buff) {
      this.pendingSplit = false;
      return;
    }
    const parents = this.balls.filter((ball) => ball.alive && !ball.docked && !ball.child && !ball.ghost);
    if (parents.length === 0) return;
    this.pendingSplit = false;

    // Twins from an earlier capsule ride along: they now leave with this one.
    let twins = 0;
    for (const ball of this.balls) {
      if (!ball.clone) continue;
      ball.ttl = buff.t;
      twins++;
    }
    for (const parent of parents) {
      for (const side of [-1, 1]) {
        if (this.balls.length >= MAX_BALLS || twins >= MAX_CLONES) return;
        const angle = Math.atan2(parent.vy, parent.vx) + side * SPLIT_ANGLE;
        const twin = makeBall({
          x: parent.x,
          y: parent.y,
          angle,
          speed: parent.speed,
          radius: parent.radius * SPLIT_CLONE_RADIUS,
          mult: SPLIT_CLONE_MULT,
          child: true,
          clone: true,
          ttl: buff.t,
        });
        twin.guided = this.live.guidedCharges;
        this.balls.push(twin);
        twins++;
        this.events.emit('split', { x: parent.x, y: parent.y });
      }
    }
  }

  // ───────────────────────────── damage plumbing ─────────────────────────────

  discoverReaction(id: ReactionId): boolean {
    if (this.run.reactions.includes(id)) return false;
    this.run.reactions.push(id);
    return true;
  }

  /** Run `fn` after `delay` seconds of level time. Used for echoes and cascading effects. */
  after(delay: number, fn: () => void): void {
    this.scheduler.push({ t: this.time + delay, fn });
  }

  /**
   * Marks a brick dead and runs its death procs. Deaths are processed through a queue, so a chain
   * of explosions that each kill more bricks is a loop rather than a recursive stack overflow.
   */
  killBrick(brick: Brick, ctx: DamageCtx): void {
    if (brick.dead) return;
    brick.dead = true;
    this.deathQueue.push({ brick, ctx });
    if (!this.flushing) this.flushDeaths();
  }

  private flushDeaths(): void {
    this.flushing = true;
    let budget = MAX_DEATHS_PER_FLUSH;
    while (this.deathQueue.length > 0 && budget-- > 0) {
      const item = this.deathQueue.shift();
      if (!item) break;
      processDeath(this, item.brick, item.ctx);
    }
    this.deathQueue.length = 0;
    this.flushing = false;
  }

  private runScheduler(): void {
    const list = this.scheduler;
    const count = list.length;
    if (count === 0) return;
    let write = 0;
    for (let i = 0; i < count; i++) {
      const item = list[i];
      if (!item) continue;
      if (item.t > this.time) {
        list[write++] = item;
      } else {
        item.fn();
      }
    }
    // Anything scheduled while the loop ran sits past the original length; keep it for a later frame.
    for (let i = count; i < list.length; i++) list[write++] = list[i] as (typeof list)[number];
    list.length = write;
  }

  private sweepDead(): void {
    let write = 0;
    for (const brick of this.bricks) {
      if (!brick.dead) this.bricks[write++] = brick;
    }
    this.bricks.length = write;

    // Lost regular balls stay in the list while they wait to re-launch; only expired children are dropped.
    if (this.balls.some((ball) => !ball.alive && ball.child)) {
      this.balls = this.balls.filter((ball) => ball.alive || !ball.child);
    }
    compact(this.pickups);
    compact(this.bullets);
    compact(this.holes);
    compact(this.pools);
    compact(this.shards);
  }

  private checkClear(): void {
    if (this.boss && !this.boss.dead && !this.bricks.some((b) => b.boss)) this.bossDefeated();
    if (this.boss && !this.boss.dead) return;
    if (this.character && !this.character.state.defeated) return;
    if (this.brickCount() > 0) return;
    this.state = 'clearing';
    this.clearT = 1.25;
    if (this.odActive) this.endOverdrive();
    this.events.emit('clear', { time: this.time, killed: this.killed });
  }

  /** Bricks that still have to be dealt with before the level ends. */
  brickCount(): number {
    let alive = 0;
    for (const brick of this.bricks) if (!brick.dead) alive++;
    return alive;
  }
}

function compact<T extends { dead: boolean }>(items: T[]): void {
  let write = 0;
  for (const item of items) if (item && !item.dead) items[write++] = item;
  if (write !== items.length) items.length = write;
}

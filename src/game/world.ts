import { clamp, damp, lerp } from '../core/math';
import { Emitter } from '../core/emitter';
import type { RNG } from '../core/rng';
import {
  ARENA_H,
  ARENA_W,
  BALL_DRY_NUDGE,
  BALL_RADIUS,
  BALL_SPEED,
  COMBO_TIME,
  DANGER_Y,
  MAX_BULLETS,
  MAX_DEATHS_PER_FLUSH,
  OVERDRIVE_DURATION,
  OVERDRIVE_FILL_SECONDS,
  PADDLE_BOUNCE_SPREAD,
  PADDLE_H,
  PADDLE_W,
  PADDLE_Y,
  WALL,
} from './config';
import { botTarget } from './bot';
import { difficultyOf, type Difficulty } from './difficulty';
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
  tickStatuses,
  type DamageCtx,
  type DamageSource,
  type ExplosionKind,
} from './combat';
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
import type { LevelPlan } from './levels/generator';
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
  summon: { count: number };
  shoot: { x: number; y: number };
  bulletPop: { x: number; y: number; blocked: boolean };
  /** A bullet got past the paddle and hit the floor. */
  bulletPass: { x: number; y: number };
  launch: { count: number };
  clear: { time: number; killed: number };
  dead: Record<string, never>;
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

  private introT = 1.0;
  private clearT = 0;
  private deathT = 0;
  private invuln = 0;
  private timeStopCd = 0;
  private laserCd = 1;
  private orbitalCd = 2.5;
  private hitAcc = 0;
  private hpsT = 0;
  private deathQueue: { brick: Brick; ctx: DamageCtx }[] = [];
  private flushing = false;
  private scheduler: { t: number; fn: () => void }[] = [];

  constructor(
    readonly run: Run,
    readonly level: LevelPlan,
    readonly rng: RNG,
    opts: { bot?: boolean; difficulty?: Difficulty } = {},
  ) {
    this.stats = run.stats;
    this.diff = opts.difficulty ?? difficultyOf('standard');
    this.bot = opts.bot ?? false;
    this.maxHp = run.maxHp;
    this.hp = Math.min(run.hp, run.maxHp);
    if (this.stats.timeStopInterval > 0) this.timeStopCd = Math.max(5, this.stats.timeStopInterval - 8);
    if (this.stats.singularity) this.singularity = { t: 0, tick: 0 };
    this.paddle.halfW = (PADDLE_W / 2) * this.stats.paddleWidth * this.diff.paddleMult;
    if (this.diff.purgePeriod > 0) this.purgeT = this.diff.purgePeriod * 0.6;
    this.buildBricks();
    this.spawnBalls();
    this.dockBalls();
  }

  get score(): number {
    return this.run.score;
  }

  // ───────────────────────────── setup ─────────────────────────────

  private buildBricks(): void {
    const { cells, hpUnit, modifier, bossScale } = this.level;
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
    const boss = this.level.boss;
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
    const s = this.stats;
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
      ball.docked = true;
      this.balls.push(ball);
    };
    let dock = 0;
    for (let i = 0; i < s.ballCount; i++) {
      add(false, dock++);
      if (s.ghostRatio > 0) add(true, dock++);
    }
  }

  /** Parked balls ride on the paddle until launch. */
  private dockBalls(): void {
    const paddle = this.paddle;
    for (const ball of this.balls) {
      if (!ball.docked) continue;
      const slot = ball.dock % 9;
      ball.x = paddle.x + (slot - 4) * Math.min(16, (paddle.halfW * 2) / 10);
      ball.y = paddle.y - PADDLE_H / 2 - ball.radius - Math.floor(ball.dock / 9) * 20;
      ball.vx = 0;
      ball.vy = 0;
    }
  }

  /** Current ball speed: base × upgrades × overdrive × level modifier. */
  ballSpeed(): number {
    return (
      BALL_SPEED *
      this.stats.ballSpeed *
      (this.odActive ? 1.22 : 1) *
      this.level.speedMult *
      this.diff.ballSpeedMult
    );
  }

  private launchAll(): void {
    const docked = this.balls.filter((ball) => ball.alive && ball.docked);
    docked.forEach((ball, i) => {
      const spread =
        docked.length === 1 ? this.rng.range(-0.25, 0.25) : ((i / (docked.length - 1)) * 2 - 1) * 0.95;
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
    }
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
    this.energy = 0;
    this.events.emit('overdrive', 'start');
    return true;
  }

  private endOverdrive(): void {
    this.odActive = false;
    this.odT = 0;
    this.events.emit('overdrive', 'end');
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
    paddle.halfW = (PADDLE_W / 2) * this.stats.paddleWidth * this.diff.paddleMult;
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

  private gainEnergy(amount: number): void {
    if (this.odActive) return;
    const before = this.energy;
    this.energy = Math.min(100, this.energy + amount);
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
    if (!this.boss) this.fieldOffset += this.level.descent * pressure * dt;

    this.updateBoss(dt);

    for (const brick of this.bricks) {
      if (brick.dead) continue;
      if (!brick.boss) {
        brick.baseY += brick.vy * dt;
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
    this.hp -= amount;
    this.damageTaken += amount;
    this.invuln = 0.9;
    this.breakCombo();
    this.energy = Math.max(0, this.energy - 25);
    this.events.emit('hurt', { amount });
    if (this.hp <= 0) {
      this.hp = 0;
      this.state = 'dying';
      this.deathT = 1.5;
      if (this.odActive) this.endOverdrive();
    }
  }

  private shoot(x: number, y: number): void {
    if (this.bullets.length >= MAX_BULLETS) return;
    const aim = Math.atan2(this.paddle.y - y, this.paddle.x - x) + this.rng.range(-0.22, 0.22);
    const speed = Math.min(430, 230 + this.level.index * 6);
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
    if (boss.enraged) this.fieldOffset += 16 * dt;

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
    const s = this.stats;
    if (s.timeStopInterval <= 0) return;
    if (this.timeStop > 0) {
      this.timeStop -= dt;
      if (this.timeStop <= 0) {
        this.timeStop = 0;
        this.timeStopCd = s.timeStopInterval;
        this.events.emit('timeStop', 'end');
      }
    } else if (this.state === 'playing') {
      this.timeStopCd -= dt;
      if (this.timeStopCd <= 0) {
        this.timeStop = s.timeStopDuration;
        this.events.emit('timeStop', 'start');
      }
    }
  }

  private updateAbilities(dt: number): void {
    const s = this.stats;
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
    const s = this.stats;

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
    const s = this.stats;
    const speed =
      BALL_SPEED * s.ballSpeed * (this.odActive ? 1.22 : 1) * this.level.speedMult * this.diff.ballSpeedMult;
    const radius = BALL_RADIUS * s.ballRadius;
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
      ball.radius = radius;
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
    const s = this.stats;
    // The offset decides the return angle: edge hits fly wide, centre hits go straight up.
    let off = clamp((ball.x - paddle.x) / paddle.halfW, -1, 1);
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
    if (s.empowerBonus > 0) ball.emp = s.empowerDuration;

    paddle.flash = 1;
    paddle.squash = 1;
    const perfect = Math.abs(off) < 0.16;
    this.gainEnergy(perfect ? 7 : 2.5);
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
    const angle = -Math.PI / 2 + this.rng.range(-0.6, 0.6);
    ball.speed = this.ballSpeed();
    ball.vx = Math.cos(angle) * ball.speed;
    ball.vy = Math.sin(angle) * ball.speed;
    ball.momentum = 0;
    ball.emp = 0;
    ball.stallT = 0;
    ball.ignore.clear();
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
    const mult = this.stats.crystalMult * (this.level.modifier?.id === 'gold' ? 2 : 1);
    const spawn = (kind: PickupKind, value: number): void => {
      if (this.pickups.length >= 240) return;
      this.pickups.push({
        id: allocId(),
        kind,
        value,
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
      if (this.rng.chance(0.7)) crystal(2, 4);
      if (brick.bossRole === 'core') heart();
      return;
    }
    switch (brick.type) {
      case 'gold':
        crystal(3, 5);
        break;
      case 'elite':
        crystal(8, 12);
        if (this.rng.chance(0.35)) heart();
        break;
      case 'explosive':
        break;
      default:
        if (this.rng.chance(Math.min(0.5, 0.2 + 0.08 * this.stats.luck))) crystal(1, 2);
    }
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
      } else {
        // …then it homes in on the paddle. Loot is never lost.
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
        } else if (this.hp < this.maxHp) {
          this.hp++;
        }
        this.events.emit('pickup', { x: pickup.x, y: pickup.y, kind: pickup.kind, value: pickup.value });
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

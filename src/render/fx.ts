import { formatNumber, TAU, clamp, hexToRgb, lerp } from '../core/math';
import { ARENA_H, ARENA_W, DANGER_Y, PADDLE_H, PADDLE_Y } from '../game/config';
import type { Brick } from '../game/entities';
import { REACTIONS, type ReactionId } from '../game/levels/definitions';
import type { World, WorldEvents } from '../game/world';
import { Camera, type View } from './camera';
import type { QualityLevel } from './layout';
import {
  PK_LIGHT,
  PK_RING,
  PK_SHARD,
  PK_STREAK,
  ParticleSystem,
  type Particle,
  type SpawnOptions,
} from './particles';
import { createPost, type PostState } from './post';

export interface FxSettings {
  shake: boolean;
  flashes: boolean;
  quality: QualityLevel;
}

interface Beam {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  width: number;
  life: number;
  maxLife: number;
  color: number;
}

interface Bolt {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  life: number;
  color: number;
  seed: number;
}

/** A damage number. Numbers spawned in merge mode pool with their neighbours, so a screen of chain reactions reads as growing totals. */
export interface Popup {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  age: number;
  size: number;
  color: [number, number, number];
  text: string;
  value: number;
  crit: boolean;
}

/** A soft bloom of light that swells and fades. World space, additive. */
export interface Flare {
  x: number;
  y: number;
  r0: number;
  r1: number;
  life: number;
  maxLife: number;
  color: [number, number, number];
  intensity: number;
}

interface Shock {
  x: number;
  y: number;
  radius: number;
  speed: number;
  strength: number;
  life: number;
}

interface Trail {
  xs: Float32Array;
  ys: Float32Array;
  /** Index of the newest sample. */
  head: number;
  count: number;
  dist: number;
  seen: boolean;
}

const TRAIL_LENGTH = 14;
/** World units of travel between trail samples: close enough that the tail reads as a continuous streak. */
const TRAIL_SPACING = 5;
const MAX_POPUPS = 150;
const MAX_BEAMS = 28;
const MAX_BOLTS = 64;
const SHOCK_LIFE = 0.55;
/** Explosions per frame that get their own light, ring and shockwave before the rest fall back to sparks. */
const EXPLOSIONS_PER_FRAME = 3;
const BASE_ABERRATION = 0.7;

export function particleCapacity(quality: QualityLevel): number {
  return quality === 'low' ? 6000 : quality === 'medium' ? 14000 : 26000;
}

const rand = (lo: number, hi: number): number => lo + Math.random() * (hi - lo);

function swapRemove<T>(items: T[], index: number): void {
  items[index] = items[items.length - 1] as T;
  items.pop();
}

/**
 * The feel director.
 *
 * It subscribes to a world's events and turns each one into particles, camera work and
 * post-processing. Every "juice" number lives here, in one place, so the feel can be tuned
 * without touching rules.
 *
 * It also protects itself: when hundreds of things happen in one frame it folds damage numbers
 * into their neighbours and scales emission down, so a fully stacked build stays smooth instead
 * of melting the frame budget.
 */
export class Fx {
  particles: ParticleSystem;
  readonly camera = new Camera();
  readonly post: PostState;

  readonly beams: Beam[] = [];
  readonly bolts: Bolt[] = [];
  readonly popups: Popup[] = [];
  readonly flares: Flare[] = [];
  /** 0..1: how overloaded recent frames were. Drives adaptive emission. */
  load = 0;
  /** Palette accent of the current chapter, for feedback that has no colour of its own. */
  accent = 0x27e0ff;

  private settings: FxSettings;
  private readonly shocks: Shock[] = [];
  private readonly trails = new Map<number, Trail>();
  private readonly trailScratch = new Float32Array(TRAIL_LENGTH * 2);
  private readonly lens = { x: 0, y: 0, r: 0, strength: 0 };
  private world: World | null = null;
  private frameEvents = 0;
  /** Explosions still allowed full visuals this frame. */
  private explosionAllowance = EXPLOSIONS_PER_FRAME;
  private lastNova = -10;
  private time = 0;

  constructor(capacity: number, settings: FxSettings) {
    this.particles = new ParticleSystem(capacity);
    this.settings = settings;
    this.camera.shakeScale = settings.shake ? 1 : 0;
    this.post = createPost(settings.quality);
  }

  /** Current emission multiplier: 1 when calm, down to about 0.15 when the screen is saturated. */
  quality(): number {
    const pool = this.particles.alive / this.particles.capacity;
    const poolPressure = clamp((pool - 0.55) / 0.4, 0, 1);
    // `load` adapts over several frames; the event count thins the tail of a single huge frame immediately.
    const instant = clamp(1.2 - this.frameEvents / 50, 0.15, 1);
    return Math.max(0.12, (1 - 0.75 * this.load) * (1 - 0.6 * poolPressure) * instant);
  }

  applySettings(settings: FxSettings): void {
    this.settings = settings;
    this.camera.shakeScale = settings.shake ? 1 : 0;
    this.post.bloom = settings.quality === 'low' ? 0.8 : 1;
    // The pool's size is fixed at allocation, so a quality change swaps in a new one.
    const capacity = particleCapacity(settings.quality);
    if (capacity !== this.particles.capacity) this.particles = new ParticleSystem(capacity);
  }

  /** Wires a world's events to the effects. Returns a function that unwires them. */
  attach(world: World): () => void {
    this.world = world;
    this.trails.clear();
    const on = <K extends keyof WorldEvents>(type: K, fn: (event: WorldEvents[K]) => void): (() => void) =>
      world.events.on(type, fn);
    const off = [
      on('hit', (e) => this.onHit(e)),
      on('kill', (e) => this.onKill(e.brick, e.big)),
      on('explode', (e) => this.onExplode(e.x, e.y, e.radius, e.color, e.kind)),
      on('bounce', (e) => this.onBounce(e.x, e.y)),
      on('paddle', (e) => this.onPaddle(e.x, e.perfect)),
      on('miss', (e) => this.onMiss(e.x, e.child)),
      on('hurt', () => this.onHurt()),
      on('pickup', (e) => this.onPickup(e.x, e.y, e.kind)),
      on('bolt', (e) => this.onBolt(e.x0, e.y0, e.x1, e.y1, e.color)),
      on('laser', (e) => this.onLaser(e.x0, e.y0, e.x1, e.y1)),
      on('beam', (e) => this.onBeam(e.x, e.color)),
      on('hole', (e) => this.onHole(e.hole.x, e.hole.y, e.hole.r, e.phase)),
      on('freeze', (e) => this.sparks(e.x, e.y, 5, 0x9be8ff, 180, 0.35)),
      on('reaction', (e) => this.onReaction(e.id, e.x, e.y, e.first)),
      on('comboTier', () => this.onComboTier()),
      on('overdrive', (phase) => this.onOverdrive(phase)),
      on('timeStop', (phase) => this.onTimeStop(phase)),
      on('boss', (e) => this.onBoss(e.phase)),
      on('summon', () => this.camera.shake(0.12)),
      on('shoot', (e) => this.flare(e.x, e.y, 6, 26, 0xff4df0, 0.1, 2)),
      on('bulletPop', (e) => this.onBulletPop(e.x, e.y, e.blocked)),
      on('breach', (e) => this.onBreach(e.brick.x)),
      on('launch', () => this.onLaunch()),
      on('clear', () => this.onClear()),
      on('dead', () => this.onDead()),
      on('split', (e) => this.ring(e.x, e.y, 8, 46, 0x4dd8ff, 0.8)),
      on('echo', (e) => this.sparks(e.x, e.y, 3, 0xb06bff, 200, 0.3)),
    ];
    return () => {
      for (const fn of off) fn();
      if (this.world === world) this.world = null;
    };
  }

  // ───────────────────────────── particle recipes ─────────────────────────────

  private spawn(
    kind: number,
    x: number,
    y: number,
    vx: number,
    vy: number,
    life: number,
    color: number,
    o: SpawnOptions,
  ): Particle | null {
    const [r, g, b] = hexToRgb(color);
    return this.particles.spawn(kind, x, y, vx, vy, life, r, g, b, o);
  }

  /** Points of light thrown outwards. The bread and butter of impact feedback. */
  sparks(
    x: number,
    y: number,
    count: number,
    color: number,
    speed: number,
    life = 0.45,
    intensity = 2,
  ): void {
    for (let i = 0; i < count; i++) {
      const angle = rand(0, TAU);
      const v = speed * rand(0.35, 1);
      this.spawn(PK_STREAK, x, y, Math.cos(angle) * v, Math.sin(angle) * v, life * rand(0.6, 1.1), color, {
        size: rand(2.2, 4.2),
        sizeEnd: 0.4,
        drag: 3.6,
        intensity: intensity * 0.72,
      });
    }
  }

  /** Solid fragments of a destroyed brick: tumbling and falling. */
  private shards(brick: Brick): void {
    const count = Math.round(clamp(5 + (brick.w * brick.h) / 420, 5, 14) * this.quality());
    const [r, g, b] = hexToRgb(brick.color);
    for (let i = 0; i < count; i++) {
      const shade = rand(0.75, 1.15);
      this.particles.spawn(
        PK_SHARD,
        brick.x + rand(-brick.w / 2, brick.w / 2),
        brick.y + rand(-brick.h / 2, brick.h / 2),
        rand(-300, 300),
        rand(-380, -40),
        rand(0.6, 1.15),
        r * shade,
        g * shade,
        b * shade,
        { size: rand(6, 13), rot: rand(0, TAU), rotV: rand(-11, 11), grav: 980, drag: 0.6 },
      );
    }
  }

  /** A circle that expands from `r0` to `r1` and fades. */
  ring(x: number, y: number, r0: number, r1: number, color: number, alpha = 1, life = 0.32): void {
    this.spawn(PK_RING, x, y, 0, 0, life, color, { size: r0, sizeEnd: r1, alpha });
  }

  flare(x: number, y: number, r0: number, r1: number, color: number, life = 0.16, intensity = 1.6): void {
    const [r, g, b] = hexToRgb(color);
    if (this.flares.length >= 64) this.flares.shift();
    this.flares.push({ x, y, r0, r1, life, maxLife: life, color: [r, g, b], intensity });
  }

  // ───────────────────────────── screen-space effects ─────────────────────────────

  /** A refraction ring that travels outwards through the finished image. Coordinates are in world space. */
  shock(x: number, y: number, radius: number, strength: number): void {
    if (this.shocks.length >= 4) this.shocks.shift();
    this.shocks.push({ x, y, radius: 10, speed: radius * 2.6, strength, life: SHOCK_LIFE });
  }

  flashScreen(color: number, amount: number): void {
    if (!this.settings.flashes) amount *= 0.25;
    const flash = this.post.flash;
    const [r, g, b] = hexToRgb(color);
    flash[0] = r;
    flash[1] = g;
    flash[2] = b;
    flash[3] = Math.max(flash[3], amount);
  }

  /** Colour-washes the screen border: danger states and big hits. */
  flashEdge(color: number, amount: number): void {
    if (!this.settings.flashes) amount *= 0.25;
    const edge = this.post.edge;
    const [r, g, b] = hexToRgb(color);
    edge[0] = r;
    edge[1] = g;
    edge[2] = b;
    edge[3] = Math.max(edge[3], amount);
  }

  // ───────────────────────────── event → effect ─────────────────────────────

  private onHit(e: WorldEvents['hit']): void {
    this.frameEvents++;
    const brick = e.brick;

    if (e.source === 'dot') {
      if (Math.random() < 0.08) this.popup(e.x, e.y, e.dmg, brick.color, 15, false, true);
      return;
    }
    if (e.source === 'ball') {
      const crit = e.crit;
      const color = crit ? 0xffd24a : e.execute ? 0xd9a6ff : 0xffffff;
      if (crit || this.popups.length < 90 || Math.random() < 0.3) {
        this.popup(e.x, e.y, e.dmg, color, crit ? 40 : e.execute ? 32 : 26, crit, false);
      }
      this.sparks(
        e.x,
        e.y,
        crit ? 10 : 4,
        crit ? 0xffd24a : brick.color,
        crit ? 420 : 260,
        0.4,
        crit ? 3 : 2,
      );
      this.camera.shake(crit ? 0.03 : 0.012);
      return;
    }
    // Secondary and area damage share one number per neighbourhood.
    if (Math.random() < (e.source === 'secondary' ? 0.34 : 0.1) * this.quality()) {
      this.popup(e.x, e.y, e.dmg, brick.color, 17, false, true);
    }
    if (e.source === 'secondary') this.sparks(e.x, e.y, 2, brick.color, 180, 0.3, 1.6);
  }

  private onKill(brick: Brick, big: boolean): void {
    this.frameEvents++;
    const q = this.quality();
    this.shards(brick);
    this.sparks(brick.x, brick.y, Math.round((big ? 22 : 9) * q), brick.color, big ? 520 : 320, 0.5, 2.4);
    this.flare(
      brick.x,
      brick.y,
      34 + brick.tier * 2,
      14 + brick.tier,
      brick.color,
      big ? 0.24 : 0.13,
      big ? 2.2 : 1.5,
    );
    if (big) {
      this.ring(brick.x, brick.y, 14, 150, brick.color, 1, 0.36);
      this.shock(brick.x, brick.y, 190, 0.55);
      this.camera.punch(0.014);
    }
    this.camera.shake(big ? 0.24 : 0.04 + Math.min(brick.tier, 4) * 0.012);
    this.camera.stop(big ? 0.075 : brick.tier >= 2.2 ? 0.034 : 0.017);
  }

  private onExplode(
    x: number,
    y: number,
    radius: number,
    color: number,
    kind: WorldEvents['explode']['kind'],
  ): void {
    this.frameEvents += 3;
    const nova = kind === 'nova';
    const lingering = kind === 'ice' || kind === 'hole';
    const q = this.quality();
    // A supernova's reach covers the arena, which is the point; its light is capped so the screen is
    // lit by the blast rather than replaced by it.
    const reach = Math.min(radius, 560);

    this.sparks(x, y, Math.round((nova ? 44 : 18) * q), color, reach * 2.2, 0.55, 2.2);

    // The first few blasts in a frame get the full light show. A chain reaction that follows in the
    // same frame reads through its sparks alone: stacked flares would only white the screen out.
    if (this.explosionAllowance <= 0) {
      this.camera.shake(0.05);
      return;
    }
    this.explosionAllowance--;

    this.flare(x, y, reach * 0.3, reach * 0.95, color, nova ? 0.3 : 0.18, nova ? 1.35 : 1.1);
    this.ring(x, y, reach * 0.25, reach * 1.15, color, nova ? 0.8 : 1, lingering ? 0.5 : 0.34);
    this.ring(x, y, reach * 0.1, reach * 0.8, 0xffffff, 0.6, 0.22);
    this.sparks(x, y, Math.round((nova ? 14 : 6) * q), 0xffffff, reach * 1.8, 0.35, 2.4);
    this.shock(x, y, reach * 1.5, nova ? 0.7 : 0.4);

    this.camera.shake(clamp(reach / 520, 0.1, 0.42) * (nova ? 1.3 : 1));
    this.camera.punch(nova ? 0.03 : 0.01);
    this.camera.stop(nova ? 0.07 : 0.03);

    // Screen-wide flourishes are rate-limited: ten supernovas in one frame should feel like one huge one.
    if (nova && this.time - this.lastNova > 0.35) {
      this.lastNova = this.time;
      this.flashScreen(color, 0.2);
      this.post.zoomBlur = Math.max(this.post.zoomBlur, 0.32);
      this.post.aberration = Math.max(this.post.aberration, 3.5);
    }
  }

  private onBounce(x: number, y: number): void {
    this.frameEvents++;
    const q = this.quality();
    if (Math.random() < q) this.ring(x, y, 3, 15, this.accent, 0.55, 0.18);
    if (Math.random() < 0.5 * q) this.sparks(x, y, 2, this.accent, 150, 0.25, 1.5);
  }

  private onPaddle(x: number, perfect: boolean): void {
    this.frameEvents++;
    const y = PADDLE_Y - PADDLE_H / 2;
    const color = perfect ? 0x7dffe0 : this.accent;
    this.ring(x, y, 12, perfect ? 150 : 78, color, perfect ? 1 : 0.7, perfect ? 0.4 : 0.26);
    this.flare(x, y, 16, 70, color, 0.14, 1.6);
    this.sparks(x, y, Math.round((perfect ? 14 : 7) * this.quality()), color, 380, 0.4, 2.2);
    this.camera.shake(perfect ? 0.07 : 0.032);
    if (perfect) {
      this.camera.punch(0.012);
      this.camera.stop(0.04);
    }
  }

  private onMiss(x: number, child: boolean): void {
    this.frameEvents++;
    if (child) return;
    this.sparks(x, ARENA_H - 8, 5, 0xff3d5a, 220, 0.3, 1.4);
    this.flashEdge(0xff2a4a, 0.2);
  }

  private onHurt(): void {
    this.frameEvents += 4;
    this.flashScreen(0xff1f3d, 0.3);
    this.flashEdge(0xff1f3d, 1);
    this.camera.shake(0.8);
    this.camera.stop(0.11);
    this.post.zoomBlur = Math.max(this.post.zoomBlur, 0.55);
    this.post.aberration = Math.max(this.post.aberration, 8);
    this.post.glitch = Math.max(this.post.glitch, 0.5);
  }

  private onPickup(x: number, y: number, kind: 'crystal' | 'heart'): void {
    this.frameEvents++;
    const color = kind === 'heart' ? 0xff5c8a : 0xffd23c;
    for (let i = 0; i < 5; i++) {
      this.spawn(
        PK_LIGHT,
        x + rand(-8, 8),
        y + rand(-6, 6),
        rand(-60, 60),
        rand(-160, -60),
        rand(0.3, 0.5),
        color,
        {
          size: rand(3, 6),
          sizeEnd: 0.5,
          drag: 3,
          intensity: 2.2,
        },
      );
    }
  }

  private onBolt(x0: number, y0: number, x1: number, y1: number, color: number): void {
    this.frameEvents++;
    // A screen-wide overload storm fires dozens of chains per frame; draw a sample of them.
    const dense = this.frameEvents > 40;
    if (this.bolts.length < MAX_BOLTS && (!dense || Math.random() < 0.3)) {
      this.bolts.push({ x0, y0, x1, y1, life: 0.17, color, seed: Math.random() * 1000 });
    }
    if (!dense) this.sparks(x1, y1, 3, color, 240, 0.3, 2.4);
    this.camera.shake(dense ? 0.006 : 0.018);
  }

  private onLaser(x0: number, y0: number, x1: number, y1: number): void {
    this.frameEvents++;
    if (this.beams.length < MAX_BEAMS) {
      this.beams.push({ x0, y0, x1, y1, width: 5, life: 0.13, maxLife: 0.13, color: 0xffe14d });
    }
    this.flare(x1, y1, 14, 44, 0xffe14d, 0.1, 1.8);
  }

  private onBeam(x: number, color: number): void {
    this.frameEvents += 2;
    if (this.beams.length < MAX_BEAMS) {
      this.beams.push({ x0: x, y0: 0, x1: x, y1: ARENA_H, width: 38, life: 0.46, maxLife: 0.46, color });
    }
    this.shock(x, ARENA_H * 0.45, 300, 0.5);
    this.flashScreen(color, 0.12);
    this.camera.shake(0.17);
  }

  private onHole(x: number, y: number, r: number, phase: 'spawn' | 'end'): void {
    this.frameEvents += 2;
    if (phase !== 'spawn') return;
    this.ring(x, y, r * 0.3, r * 2.6, 0xb06bff, 1, 0.45);
    this.camera.punch(0.02);
  }

  private onReaction(id: ReactionId, x: number, y: number, first: boolean): void {
    this.frameEvents++;
    const color = REACTIONS.find((r) => r.id === id)?.color ?? 0xffffff;
    this.ring(x, y, 12, 110, color, 1, 0.4);
    if (first) {
      this.flashScreen(color, 0.2);
      this.camera.punch(0.035);
      this.camera.stop(0.06);
    }
  }

  private onComboTier(): void {
    this.frameEvents++;
    this.camera.punch(0.028);
    this.camera.shake(0.12);
    this.post.zoomBlur = Math.max(this.post.zoomBlur, 0.3);
    this.post.aberration = Math.max(this.post.aberration, 3.2);
  }

  private onOverdrive(phase: 'ready' | 'start' | 'end'): void {
    this.frameEvents++;
    const paddleX = this.world?.paddle.x ?? ARENA_W / 2;
    if (phase === 'ready') {
      this.ring(paddleX, PADDLE_Y, 16, 190, 0x9ff3ff, 0.9, 0.4);
      return;
    }
    if (phase === 'start') {
      this.shock(paddleX, PADDLE_Y, 620, 1.2);
      this.flashScreen(0x9ff3ff, 0.42);
      this.camera.punch(0.065);
      this.camera.shake(0.45);
      this.camera.stop(0.08);
      this.post.glitch = Math.max(this.post.glitch, 0.9);
      this.post.zoomBlur = Math.max(this.post.zoomBlur, 0.5);
      this.sparks(paddleX, PADDLE_Y, 60, 0x9ff3ff, 900, 0.7, 3);
    }
  }

  private onTimeStop(phase: 'start' | 'end'): void {
    this.frameEvents++;
    if (phase === 'start') {
      this.shock(ARENA_W / 2, ARENA_H * 0.45, 700, 1.3);
      this.flashScreen(0xcfe6ff, 0.5);
      this.camera.punch(0.05);
      this.camera.stop(0.1);
      this.post.glitch = Math.max(this.post.glitch, 0.7);
      this.post.zoomBlur = Math.max(this.post.zoomBlur, 0.6);
    } else {
      this.flashScreen(0xffffff, 0.16);
      this.camera.punch(0.025);
    }
  }

  private onBoss(phase: 'phase' | 'enrage' | 'die'): void {
    this.frameEvents += 3;
    if (phase === 'die') {
      this.camera.slowmo(0.1, 1.7);
      this.camera.shake(1);
      this.camera.punch(0.08);
      this.flashScreen(0xffffff, 0.6);
      this.post.glitch = 1;
      this.post.zoomBlur = 1;
      this.shock(ARENA_W / 2, 260, 900, 1.4);
      return;
    }
    const enraged = phase === 'enrage';
    this.flashScreen(enraged ? 0xff2a4a : 0xffffff, enraged ? 0.36 : 0.2);
    if (enraged) this.flashEdge(0xff2a4a, 0.9);
    this.camera.shake(enraged ? 0.6 : 0.5);
    this.camera.stop(0.085);
    this.shock(ARENA_W / 2, 260, 520, enraged ? 1.1 : 0.9);
  }

  private onBulletPop(x: number, y: number, blocked: boolean): void {
    this.frameEvents++;
    const color = blocked ? 0x7dffe0 : 0xff4df0;
    this.sparks(x, y, blocked ? 7 : 3, color, blocked ? 300 : 180, 0.3, 2.2);
    if (blocked) this.ring(x, y, 6, 40, color, 0.8, 0.2);
  }

  private onBreach(x: number): void {
    this.frameEvents += 2;
    this.sparks(x, DANGER_Y, 16, 0xff3d5a, 460, 0.5, 2.4);
    this.ring(x, DANGER_Y, 10, 120, 0xff3d5a, 1, 0.36);
  }

  private onLaunch(): void {
    this.frameEvents++;
    this.ring(this.world?.paddle.x ?? ARENA_W / 2, PADDLE_Y, 20, 130, this.accent, 0.8, 0.35);
  }

  private onClear(): void {
    this.camera.slowmo(0.16, 1);
    this.camera.punch(0.05);
    this.flashScreen(this.accent, 0.16);
    this.post.zoomBlur = Math.max(this.post.zoomBlur, 0.5);
  }

  private onDead(): void {
    this.camera.slowmo(0.07, 2);
    this.camera.shake(1);
    this.flashScreen(0xff1f3d, 0.5);
    this.post.zoomBlur = 1;
  }

  // ───────────────────────────── damage numbers ─────────────────────────────

  /**
   * Spawns a damage number, or adds to a nearby one.
   *
   * Direct ball hits get their own number — seeing each hit matter is the point — until the screen
   * is crowded, when neighbouring crits pool. Splash damage always merges, so an explosion reads
   * as one growing figure instead of forty small ones.
   */
  popup(
    x: number,
    y: number,
    value: number,
    color: number,
    size: number,
    crit: boolean,
    merge: boolean,
  ): void {
    // Splash always pools; once the screen is crowded, crits pool with neighbouring crits too.
    const crowded = this.popups.length > 48;
    if (merge || (crit && crowded)) {
      for (const p of this.popups) {
        if (p.crit !== crit || Math.abs(p.x - x) >= 46 || Math.abs(p.y - y) >= 34) continue;
        p.value += value;
        p.text = formatNumber(p.value) + (crit ? '!' : '');
        p.life = p.maxLife;
        p.size = Math.min(p.size + 1.5, crit ? 50 : 34);
        return;
      }
    }
    if (this.popups.length >= MAX_POPUPS) {
      return;
    }
    this.popups.push({
      x: x + rand(-8, 8),
      y: y + rand(-6, 2),
      vx: rand(-34, 34),
      vy: rand(-150, -95) - (crit ? 60 : 0),
      life: crit ? 0.85 : 0.6,
      maxLife: crit ? 0.85 : 0.6,
      age: 0,
      size,
      color: hexToRgb(color),
      text: formatNumber(value) + (crit ? '!' : ''),
      value,
      crit,
    });
  }

  // ───────────────────────────── frame update ─────────────────────────────

  /**
   * Advances every effect and returns the time scale the simulation should run at this frame.
   * `dt` is real time. Particles follow the world into slow motion, but only part way, so the
   * screen never looks frozen.
   */
  update(dt: number, world: World | null): number {
    this.time += dt;
    const timeScale = this.camera.update(dt);
    const fxDt = dt * lerp(1, timeScale, 0.8);

    this.particles.update(fxDt);

    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      if (!p) continue;
      p.age += fxDt;
      p.life -= fxDt;
      if (p.life <= 0) {
        swapRemove(this.popups, i);
        continue;
      }
      p.x += p.vx * fxDt;
      p.y += p.vy * fxDt;
      p.vx *= Math.exp(-3 * fxDt);
      p.vy *= Math.exp(-3.2 * fxDt);
    }

    for (let i = this.beams.length - 1; i >= 0; i--) {
      const beam = this.beams[i];
      if (beam && (beam.life -= fxDt) <= 0) swapRemove(this.beams, i);
    }
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const bolt = this.bolts[i];
      if (bolt && (bolt.life -= dt) <= 0) swapRemove(this.bolts, i);
    }
    for (let i = this.flares.length - 1; i >= 0; i--) {
      const flare = this.flares[i];
      if (flare && (flare.life -= fxDt) <= 0) swapRemove(this.flares, i);
    }
    for (let i = this.shocks.length - 1; i >= 0; i--) {
      const shock = this.shocks[i];
      if (!shock) continue;
      shock.life -= dt;
      shock.radius += shock.speed * dt;
      if (shock.life <= 0) swapRemove(this.shocks, i);
    }

    this.updateTrails(world);
    this.updatePost(dt, world);

    // Load jumps up on a burst and drains slowly: thin out for an instant, then get rich again.
    const events = this.frameEvents;
    this.frameEvents = 0;
    this.explosionAllowance = EXPLOSIONS_PER_FRAME;
    const target = clamp((events - 24) / 240, 0, 1);
    this.load += (target - this.load) * (target > this.load ? 0.3 : 0.035);
    return timeScale;
  }

  private updateTrails(world: World | null): void {
    if (!world || world.state === 'cleared' || world.state === 'dead') {
      this.trails.clear();
      return;
    }
    for (const trail of this.trails.values()) trail.seen = false;

    for (const ball of world.balls) {
      if (!ball.alive || ball.docked) continue;
      let trail = this.trails.get(ball.id);
      if (!trail) {
        trail = {
          xs: new Float32Array(TRAIL_LENGTH),
          ys: new Float32Array(TRAIL_LENGTH),
          head: 0,
          count: 0,
          dist: 0,
          seen: true,
        };
        this.trails.set(ball.id, trail);
      }
      trail.seen = true;
      // Sample by distance, so trails have the same shape at any frame rate.
      const dx = ball.x - (trail.xs[trail.head] ?? ball.x);
      const dy = ball.y - (trail.ys[trail.head] ?? ball.y);
      trail.dist += Math.hypot(dx, dy);
      if (trail.dist < TRAIL_SPACING && trail.count > 0) continue;
      trail.dist = 0;
      trail.head = (trail.head + 1) % TRAIL_LENGTH;
      trail.xs[trail.head] = ball.x;
      trail.ys[trail.head] = ball.y;
      trail.count = Math.min(TRAIL_LENGTH, trail.count + 1);
    }

    for (const [id, trail] of this.trails) {
      if (!trail.seen) this.trails.delete(id);
    }
  }

  /** Newest-first trail points of a ball, as [x, y] pairs. Returns how many pairs were written. */
  trailOf(id: number): Float32Array | null {
    const trail = this.trails.get(id);
    if (!trail || trail.count <= 0) return null;
    const out = this.trailScratch;
    for (let i = 0; i < trail.count; i++) {
      const index = (trail.head - i + TRAIL_LENGTH) % TRAIL_LENGTH;
      out[i * 2] = trail.xs[index] ?? 0;
      out[i * 2 + 1] = trail.ys[index] ?? 0;
    }
    return out.subarray(0, trail.count * 2);
  }

  private updatePost(dt: number, world: World | null): void {
    const post = this.post;
    const decay = (rate: number): number => Math.exp(-rate * dt);

    post.aberration = BASE_ABERRATION + (post.aberration - BASE_ABERRATION) * decay(6);
    post.zoomBlur *= decay(5.5);
    post.glitch *= decay(7);
    post.flash[3] *= decay(9);
    post.edge[3] *= decay(5);

    const inTimeStop = world !== null && world.timeStop > 0;
    const dying = world !== null && (world.state === 'dying' || world.state === 'dead');
    const desaturateTo = dying ? 1 : inTimeStop ? 0.82 : 0;
    post.desaturate += (desaturateTo - post.desaturate) * (1 - decay(dying ? 2.5 : 9));

    const pulse = 0.5 + 0.5 * Math.sin(this.time * 9);
    if (world && world.odActive) {
      post.edge[0] = 0.55;
      post.edge[1] = 0.96;
      post.edge[2] = 1;
      post.edge[3] = Math.max(post.edge[3], 0.32 + 0.2 * pulse);
      post.aberration = Math.max(post.aberration, 2.4);
    } else if (world && world.hp <= 1 && world.state === 'playing') {
      post.edge[0] = 1;
      post.edge[1] = 0.12;
      post.edge[2] = 0.22;
      post.edge[3] = Math.max(post.edge[3], 0.3 + 0.22 * pulse);
    }

    post.shockCount = Math.min(8, this.shocks.length);
    for (let i = 0; i < post.shockCount; i++) {
      const s = this.shocks[i];
      if (!s) continue;
      const k = s.life / SHOCK_LIFE;
      post.shock[i * 4] = s.x;
      post.shock[i * 4 + 1] = s.y;
      post.shock[i * 4 + 2] = s.radius;
      post.shock[i * 4 + 3] = s.strength * k * k;
    }

    // The lens sits on the newest black hole, or on the singularity when there is none.
    let strength = 0;
    if (world) {
      for (const hole of world.holes) {
        if (hole.dead) continue;
        const grow = 1 - hole.life / hole.maxLife;
        this.lens.x = hole.x;
        this.lens.y = hole.y;
        this.lens.r = hole.r * (1.6 + 0.5 * grow);
        strength = Math.max(strength, clamp(grow * 6, 0, 0.62));
      }
      if (strength === 0 && world.singularity && world.state === 'playing') {
        const pos = world.singularityPos();
        this.lens.x = pos.x;
        this.lens.y = pos.y;
        this.lens.r = 110;
        strength = 0.4;
      }
    }
    this.lens.strength = strength;
  }

  /**
   * Converts screen-space effects from world units to CSS pixels through the current (shaken,
   * zoomed) view, so they stay glued to what caused them. Call once per frame after `update`.
   */
  resolveView(view: View): void {
    const post = this.post;
    const toCss = (x: number, y: number): [number, number] => [
      x * view.scale + view.tx,
      y * view.scale + view.ty,
    ];
    const [lx, ly] = toCss(this.lens.x, this.lens.y);
    post.lens[0] = lx;
    post.lens[1] = ly;
    post.lens[2] = this.lens.r * view.scale;
    post.lens[3] = this.lens.strength;
    for (let i = 0; i < post.shockCount; i++) {
      const [sx, sy] = toCss(post.shock[i * 4] ?? 0, post.shock[i * 4 + 1] ?? 0);
      post.shock[i * 4] = sx;
      post.shock[i * 4 + 1] = sy;
      post.shock[i * 4 + 2] = (post.shock[i * 4 + 2] ?? 0) * view.scale;
    }
  }

  /** Clears everything transient. Used when switching worlds or leaving a run. */
  clear(): void {
    this.particles.clear();
    this.beams.length = 0;
    this.bolts.length = 0;
    this.popups.length = 0;
    this.flares.length = 0;
    this.shocks.length = 0;
    this.trails.clear();
    this.camera.reset();
    const post = this.post;
    post.aberration = BASE_ABERRATION;
    post.zoomBlur = 0;
    post.glitch = 0;
    post.desaturate = 0;
    post.flash[3] = 0;
    post.edge[3] = 0;
    post.shockCount = 0;
    this.lens.strength = 0;
    this.load = 0;
    this.frameEvents = 0;
  }
}

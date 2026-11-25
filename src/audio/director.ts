import { clamp } from '../core/math';
import type { World, WorldEvents } from '../game/world';
import { AudioEngine, type AudioStatus } from './engine';
import { Music } from './music';
import { comboPitch, playSfx, type Sfx } from './sfx';

export type Mix = 'menu' | 'play' | 'quiet';

/** Minimum seconds between two plays of the same sound. Keeps dense moments from turning into a wall of noise. */
const COOLDOWN: Partial<Record<Sfx, number>> = {
  hit: 0.03,
  crit: 0.06,
  break: 0.045,
  bigBreak: 0.12,
  bounce: 0.08,
  paddle: 0.07,
  pickup: 0.045,
  laser: 0.09,
  bolt: 0.07,
  explode: 0.11,
  freeze: 0.16,
  reaction: 0.2,
  shoot: 0.13,
  pop: 0.05,
  uiHover: 0.05,
};

/** Sounds that are dropped first when the mix gets crowded. */
const LOW_PRIORITY = new Set<Sfx>(['bounce', 'hit', 'shoot', 'pop', 'pickup', 'laser', 'bolt']);

/**
 * Turns world events into sound and keeps the score in step with the action.
 *
 * The director is deliberately frugal: per-sound cooldowns, a polyphony cap and probability
 * scaling under load mean that a screen with two hundred simultaneous hits stays crisp instead
 * of clipping into mush.
 */
export class AudioDirector {
  readonly engine = new AudioEngine();
  readonly music: Music;

  private readonly lastPlayed = new Map<Sfx, number>();
  private pickupChain = 0;
  private pickupChainAt = 0;
  private muted = false;

  constructor() {
    this.music = new Music(this.engine);
    // The sequencer must be fed even when requestAnimationFrame is throttled — notification banners
    // and app switches on phones starve rAF, and a starved sequencer is an audible stutter in the
    // BGM. A slow timer tops the schedule up; when rAF runs normally the extra ticks find the
    // horizon already full and do nothing. A hidden tab is left alone: its timers are throttled to
    // about once a second, which would turn the music into bursts.
    window.setInterval(() => {
      if (!document.hidden && this.engine.ready) this.music.update();
    }, 180);
  }

  /** Must be called from a user gesture. Idempotent. */
  unlock(): void {
    this.engine.unlock();
    if (this.engine.ready && !this.music.playing && !this.muted) this.music.start();
  }

  /** State of the underlying context, for diagnostics: 'absent', 'suspended' or 'running'. */
  get status(): AudioStatus {
    if (!this.engine.ready) return 'absent';
    return this.engine.state;
  }

  setVolumes(music: number, sfx: number): void {
    this.engine.setVolumes(music, sfx);
    if (music <= 0) this.music.stop();
    else if (this.engine.ready && !this.muted) this.music.start();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) this.music.stop();
    else if (this.engine.ready) this.music.start();
  }

  /** See `AudioEngine.probe`. */
  probe(): { peak: number; rms: number } | null {
    return this.engine.probe();
  }

  /** Eases the music towards `amount` of its normal level (1 = full): quieter under menus and the draft. */
  setMusicDuck(amount: number, seconds: number): void {
    this.engine.setMusicDuck(amount, seconds);
  }

  /**
   * How crowded the mix is, 0..1. Mirrors the FX layer's adaptive quality.
   *
   * Only the number of voices actually sounding counts. Frame rate deliberately does not: audio
   * runs on its own thread, so thinning sounds buys no smoothness — it only takes the feedback
   * away, exactly when a struggling device is dropping frames.
   */
  private pressure(): number {
    return clamp((this.engine.busy - 8) / 26, 0, 1);
  }

  /** Plays a sound unless it is on cooldown or the mix is too busy for it. */
  play(name: Sfx, pitch?: number, weight = 1): void {
    if (this.muted || !this.engine.ready) return;
    const now = this.engine.now;
    const cooldown = COOLDOWN[name] ?? 0.01;
    if (now - (this.lastPlayed.get(name) ?? -10) < cooldown) return;
    const pressure = this.pressure();
    if (pressure > 0.35 && LOW_PRIORITY.has(name) && Math.random() < pressure * 0.85 * (2 - weight)) return;
    if (this.engine.busy > 40 && weight < 0.9) return;
    this.lastPlayed.set(name, now);
    playSfx(this.engine, name, { pitch, weight, rarity: 0 });
  }

  /** UI feedback. Not rate-limited by game load. */
  ui(name: 'uiHover' | 'uiClick' | 'draft' | 'pick' | 'deny', rarity = 0): void {
    if (this.muted || !this.engine.ready) return;
    if (name === 'pick') playSfx(this.engine, 'pick', { rarity });
    else playSfx(this.engine, name);
  }

  /** Wires a world's events to sounds. Returns a function that unwires them. */
  attach(world: World): () => void {
    const on = <K extends keyof WorldEvents>(type: K, fn: (event: WorldEvents[K]) => void): (() => void) =>
      world.events.on(type, fn);
    const off = [
      on('hit', (e) => {
        if (e.source === 'dot' || e.source === 'area') return;
        if (e.source === 'ball') {
          this.play(e.crit ? 'crit' : 'hit', comboPitch(world.combo), e.crit ? 1 : 0.6);
        } else if (Math.random() < 0.35) {
          this.play('hit', comboPitch(world.combo) * 1.5, 0.3);
        }
      }),
      on('kill', (e) => this.play(e.big ? 'bigBreak' : 'break', undefined, e.big ? 1 : 0.5)),
      on('explode', (e) => this.play('explode', undefined, e.kind === 'nova' ? 1.2 : 0.8)),
      on('bounce', () => this.play('bounce', undefined, 0.25)),
      on('paddle', (e) => this.play(e.perfect ? 'perfect' : 'paddle', undefined, e.perfect ? 1 : 0.5)),
      on('miss', (e) => {
        if (!e.child) this.play('miss');
      }),
      on('ballVoided', () => this.play('void')),
      on('hurt', () => this.play('hurt', undefined, 1.2)),
      on('pickup', (e) => {
        if (e.kind !== 'crystal') return;
        // Crystals collected in a quick run climb a scale, like coins in a platformer.
        if (this.engine.now - this.pickupChainAt > 0.5) this.pickupChain = 0;
        this.pickupChainAt = this.engine.now;
        this.play('pickup', comboPitch(this.pickupChain++ * 3 + 30), 0.4);
      }),
      on('bolt', () => this.play('bolt', undefined, 0.4)),
      on('laser', () => this.play('laser', undefined, 0.35)),
      on('beam', () => this.play('tier', undefined, 0.8)),
      on('hole', (e) => {
        if (e.phase === 'spawn') this.play('hole', undefined, 1);
      }),
      on('freeze', () => this.play('freeze', undefined, 0.5)),
      on('reaction', (e) => this.play('reaction', undefined, e.first ? 1.2 : 0.35)),
      on('comboTier', () => this.play('tier', undefined, 1)),
      on('overdrive', (phase) => {
        if (phase === 'ready') this.play('odReady', undefined, 1.2);
        else if (phase === 'start') this.play('odStart', undefined, 1.3);
        else this.play('odEnd', undefined, 1);
      }),
      on('timeStop', (phase) => {
        this.play(phase === 'start' ? 'timeStop' : 'timeResume', undefined, 1.3);
        this.engine.setMusicCutoff(phase === 'start' ? 420 : 18000, phase === 'start' ? 0.35 : 0.5);
      }),
      on('boss', (e) => this.play(e.phase === 'die' ? 'bossDie' : 'boss', undefined, 1.3)),
      on('shoot', () => this.play('shoot', undefined, 0.2)),
      on('bulletPop', (e) => this.play('pop', e.blocked ? 1500 : 900, 0.5)),
      on('breach', () => this.play('breach', undefined, 1.2)),
      on('launch', () => this.play('launch', undefined, 0.8)),
      on('clear', () => this.play('clear', undefined, 1.3)),
      on('dead', () => this.play('dead', undefined, 1.3)),
    ];
    this.pickupChain = 0;
    return () => {
      for (const fn of off) fn();
    };
  }

  /**
   * Call every frame. Chooses the music's intensity from what is happening on screen.
   * `mix` picks the broad register; the combo and overdrive push it up from there.
   */
  update(mix: Mix, world: World | null, demo: boolean): void {
    let intensity = 0.25;
    let chapter = 0;
    if (mix === 'play' && world) {
      chapter = world.level.chapter;
      const heat = clamp(world.combo / 260, 0, 1);
      intensity = 0.34 + 0.6 * heat + (world.odActive ? 0.12 : 0);
      // The title-screen demo should sound alive, but not louder than the menu it sits under.
      if (demo) intensity = 0.5 + 0.3 * heat;
    } else if (mix === 'quiet') {
      intensity = 0.18;
    }
    this.music.chapter = chapter;
    // Ease rather than snap, so layers fade in with the action instead of clicking on.
    this.music.intensity += (intensity - this.music.intensity) * 0.04;
    this.music.update();
  }
}

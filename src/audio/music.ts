import { midiHz, type AudioEngine } from './engine';

/** A chord voicing as MIDI notes (octave 4) plus the bass root an octave or two down. */
interface Progression {
  bass: number[];
  chords: number[][];
}

// i – VI – III – VII in each chapter's key. The same emotional shape, transposed: home, lift, resolve, tension.
const PROGRESSIONS: Progression[] = [
  {
    bass: [45, 41, 48, 43],
    chords: [
      [57, 60, 64],
      [57, 60, 65],
      [55, 60, 64],
      [55, 59, 62],
    ],
  }, // A minor
  {
    bass: [38, 34, 41, 36],
    chords: [
      [57, 62, 65],
      [58, 62, 65],
      [57, 60, 65],
      [55, 60, 64],
    ],
  }, // D minor
  {
    bass: [40, 36, 43, 38],
    chords: [
      [55, 59, 64],
      [55, 60, 64],
      [55, 59, 62],
      [54, 57, 62],
    ],
  }, // E minor
];

const BPM = 118;
const STEP = 60 / BPM / 4;
const STEPS_PER_BAR = 16;
/** Arp contour in chord-tone indices: rises, peaks an octave up (index 3+), falls back. */
const ARP = [0, 1, 2, 3, 4, 3, 1, 2];

/**
 * Procedural synthwave.
 *
 * A 16-step sequencer schedules a few notes ahead of the clock every frame. Layers come in with
 * `intensity`: pad always, then kick and bass, then hats and snare, then the arpeggio, then open
 * hats. Nothing is looped from a file, so the track can follow the game continuously — it never
 * "repeats" audibly and it can change key between chapters.
 */
export class Music {
  /** 0..1. Drives which layers play and how bright the filters are. */
  intensity = 0.25;
  chapter = 0;
  private running = false;
  private step = 0;
  private nextTime = 0;
  private delayNode: AudioNode | null = null;

  constructor(private readonly engine: AudioEngine) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.step = 0;
    this.nextTime = this.engine.now + 0.1;
  }

  stop(): void {
    this.running = false;
  }

  get playing(): boolean {
    return this.running;
  }

  /** Call every frame. Schedules all steps that fall within the lookahead window. */
  update(): void {
    const engine = this.engine;
    if (!this.running || !engine.ready) return;
    if (this.delayNode === null) this.delayNode = engine.createDelay(STEP * 3, 0.34, 0.35);
    if (this.nextTime < engine.now - 0.2) this.nextTime = engine.now + 0.05; // tab was asleep; resync
    while (this.nextTime < engine.now + 0.14) {
      this.scheduleStep(this.step, this.nextTime - engine.now);
      this.step = (this.step + 1) % (STEPS_PER_BAR * 4);
      this.nextTime += STEP;
    }
  }

  private scheduleStep(step: number, delay: number): void {
    const engine = this.engine;
    const i = this.intensity;
    const bar = Math.floor(step / STEPS_PER_BAR) % 4;
    const s = step % STEPS_PER_BAR;
    const progression = PROGRESSIONS[this.chapter % PROGRESSIONS.length] ?? PROGRESSIONS[0];
    const chord = progression.chords[bar] ?? [57, 60, 64];
    const bass = progression.bass[bar] ?? 45;

    if (i < 0.04) return;

    // Pad: one chord per bar, soft and wide.
    if (s === 0) {
      const duration = STEP * STEPS_PER_BAR;
      for (const note of chord) {
        for (const cents of [-7, 7]) {
          engine.tone(
            {
              type: 'sawtooth',
              freq: midiHz(note),
              dur: duration * 0.96,
              gain: 0.028,
              attack: 0.3,
              detune: cents,
              delay,
              reverb: 0.35,
            },
            true,
          );
        }
      }
    }

    if (i >= 0.15) {
      // Kick, four on the floor.
      if (s % 4 === 0) {
        engine.tone({ type: 'sine', freq: 150, freqEnd: 44, dur: 0.2, gain: 0.5, delay }, true);
        engine.noise({ filter: 'highpass', freq: 3800, dur: 0.012, gain: 0.09, delay }, true);
      }
      // Bass: driving eighths, with the fifth on the last eighth of each half-bar.
      if (s % 2 === 0) {
        const note = s === 6 || s === 14 ? bass + 7 : bass;
        engine.tone(
          { type: 'sawtooth', freq: midiHz(note), dur: STEP * 1.7, gain: 0.16, delay, detune: -4 },
          true,
        );
        engine.tone({ type: 'square', freq: midiHz(note - 12), dur: STEP * 1.7, gain: 0.07, delay }, true);
      }
    }

    if (i >= 0.32) {
      // Snare on 2 and 4; closed hats on the off-beats.
      if (s === 4 || s === 12) {
        engine.noise(
          { filter: 'bandpass', freq: 1900, q: 0.7, dur: 0.13, gain: 0.2, delay, reverb: 0.18 },
          true,
        );
        engine.tone({ type: 'sine', freq: 196, freqEnd: 150, dur: 0.08, gain: 0.14, delay }, true);
      }
      if (s % 2 === 1 || i >= 0.8) {
        engine.noise(
          { filter: 'highpass', freq: 7600, dur: 0.03, gain: s % 4 === 2 ? 0.075 : 0.045, delay },
          true,
        );
      }
    }

    if (i >= 0.55) {
      // Arpeggio through the delay line. Index 3 and above are the upper octave.
      const index = ARP[s % ARP.length] ?? 0;
      const note = (chord[index % chord.length] ?? 60) + (index >= 3 ? 12 : 0);
      const echo = this.delayNode ?? undefined;
      engine.tone(
        { type: 'square', freq: midiHz(note), dur: STEP * 0.85, gain: 0.045, delay, echo, reverb: 0.25 },
        true,
      );
      engine.tone(
        { type: 'sawtooth', freq: midiHz(note), dur: STEP * 0.85, gain: 0.03, delay, detune: 9, echo },
        true,
      );
    }

    if (i >= 0.8 && (s === 2 || s === 10)) {
      engine.noise({ filter: 'highpass', freq: 6800, dur: 0.17, gain: 0.07, delay, reverb: 0.25 }, true);
    }
  }
}

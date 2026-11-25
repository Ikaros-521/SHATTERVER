import { midiHz, type AudioEngine } from './engine';

/**
 * Sound design. Every sound is a small recipe of oscillators and noise.
 *
 * Musical feedback is deliberate: hits are tuned to A-minor pentatonic and climb with the combo,
 * so a long combo literally plays an ascending melody, and every UI/pickup blip sits in key.
 */

export type Sfx =
  | 'hit'
  | 'crit'
  | 'break'
  | 'bigBreak'
  | 'bounce'
  | 'paddle'
  | 'perfect'
  | 'miss'
  | 'void'
  | 'hurt'
  | 'pickup'
  | 'laser'
  | 'bolt'
  | 'explode'
  | 'freeze'
  | 'hole'
  | 'reaction'
  | 'tier'
  | 'odReady'
  | 'odStart'
  | 'odEnd'
  | 'timeStop'
  | 'timeResume'
  | 'boss'
  | 'bossDie'
  | 'clear'
  | 'dead'
  | 'launch'
  | 'shoot'
  | 'pop'
  | 'breach'
  | 'uiHover'
  | 'uiClick'
  | 'draft'
  | 'pick'
  | 'deny';

const SCALE = [0, 3, 5, 7, 10];

/** Frequency for a hit at the given combo: the pentatonic scale, rising, wrapping after two octaves. */
export function comboPitch(combo: number): number {
  const step = Math.floor(combo / 3);
  const octave = Math.min(2, Math.floor(step / SCALE.length));
  return midiHz(69 + (SCALE[step % SCALE.length] ?? 0) + octave * 12);
}

const jitter = (freq: number, amount = 0.03): number => freq * (1 + (Math.random() * 2 - 1) * amount);

export interface SfxParams {
  /** Base frequency for pitched sounds. */
  pitch?: number;
  /** 0..1, importance. Quiet frames drop low-importance sounds first. */
  weight?: number;
  /** 0..4 rarity for the "pick" sound. */
  rarity?: number;
}

export function playSfx(engine: AudioEngine, name: Sfx, params: SfxParams = {}): void {
  if (!engine.ready) return;
  const pitch = params.pitch ?? 440;
  switch (name) {
    case 'hit': {
      const f = jitter(pitch);
      engine.tone({ type: 'triangle', freq: f, dur: 0.075, gain: 0.13 });
      engine.tone({ type: 'sine', freq: f * 2, dur: 0.05, gain: 0.05 });
      engine.noise({ filter: 'highpass', freq: 5200, dur: 0.018, gain: 0.06 });
      break;
    }
    case 'crit': {
      const f = jitter(pitch);
      engine.tone({ type: 'triangle', freq: f, dur: 0.16, gain: 0.2 });
      engine.tone({ type: 'sine', freq: f * 2.01, dur: 0.24, gain: 0.11, reverb: 0.35 });
      engine.tone({ type: 'sine', freq: f * 3.02, dur: 0.2, gain: 0.06, reverb: 0.35 });
      engine.noise({ filter: 'highpass', freq: 4000, dur: 0.05, gain: 0.12 });
      break;
    }
    case 'break':
    case 'bigBreak': {
      const big = name === 'bigBreak';
      engine.noise({
        filter: 'bandpass',
        freq: jitter(1100),
        freqEnd: 320,
        q: 0.7,
        dur: big ? 0.26 : 0.12,
        gain: big ? 0.34 : 0.24,
        reverb: big ? 0.3 : 0.08,
      });
      engine.tone({
        type: 'sine',
        freq: big ? 150 : 190,
        freqEnd: 55,
        dur: big ? 0.24 : 0.09,
        gain: big ? 0.45 : 0.26,
      });
      if (big) engine.tone({ type: 'sine', freq: 92, freqEnd: 34, dur: 0.42, gain: 0.5, reverb: 0.25 });
      break;
    }
    case 'bounce':
      engine.tone({ type: 'sine', freq: jitter(1900, 0.08), freqEnd: 1300, dur: 0.035, gain: 0.045 });
      break;
    case 'paddle':
      engine.tone({ type: 'sine', freq: 250, freqEnd: 540, dur: 0.1, gain: 0.2 });
      engine.noise({ filter: 'lowpass', freq: 1400, dur: 0.05, gain: 0.1 });
      break;
    case 'perfect':
      engine.tone({ type: 'triangle', freq: midiHz(76), dur: 0.34, gain: 0.14, reverb: 0.45 });
      engine.tone({ type: 'triangle', freq: midiHz(83), dur: 0.42, gain: 0.12, delay: 0.07, reverb: 0.45 });
      engine.tone({ type: 'sine', freq: midiHz(88), dur: 0.3, gain: 0.05, delay: 0.11, reverb: 0.5 });
      break;
    case 'miss':
      engine.tone({ type: 'triangle', freq: 170, freqEnd: 72, dur: 0.24, gain: 0.11 });
      break;
    case 'void':
      // A ball being unmade: a sharp inhale — pitch collapsing into a filtered hiss.
      engine.tone({ type: 'sine', freq: 660, freqEnd: 72, dur: 0.34, gain: 0.24 });
      engine.noise({ filter: 'lowpass', freq: 2200, freqEnd: 140, dur: 0.3, gain: 0.15 });
      break;
    case 'hurt':
      engine.tone({ type: 'sawtooth', freq: 140, freqEnd: 48, dur: 0.36, gain: 0.28 });
      engine.tone({ type: 'sine', freq: 64, freqEnd: 30, dur: 0.44, gain: 0.5 });
      engine.noise({ filter: 'lowpass', freq: 950, freqEnd: 180, dur: 0.32, gain: 0.36 });
      break;
    case 'pickup':
      engine.tone({ type: 'sine', freq: pitch, freqEnd: pitch * 1.34, dur: 0.075, gain: 0.085 });
      break;
    case 'laser':
      engine.tone({ type: 'sawtooth', freq: jitter(1250, 0.06), freqEnd: 390, dur: 0.13, gain: 0.07 });
      engine.noise({ filter: 'bandpass', freq: 3200, dur: 0.07, gain: 0.05 });
      break;
    case 'bolt':
      engine.noise({ filter: 'highpass', freq: 3400, dur: 0.08, gain: 0.15 });
      engine.tone({ type: 'square', freq: 1900, freqEnd: 820, dur: 0.07, gain: 0.05 });
      break;
    case 'explode':
      engine.noise({ filter: 'lowpass', freq: 760, freqEnd: 110, dur: 0.5, gain: 0.42, reverb: 0.3 });
      engine.tone({ type: 'sine', freq: 112, freqEnd: 31, dur: 0.46, gain: 0.55, reverb: 0.2 });
      break;
    case 'freeze':
      [3300, 4950, 6600].forEach((freq, i) => {
        engine.tone({
          type: 'sine',
          freq: jitter(freq, 0.02),
          dur: 0.26 + i * 0.05,
          gain: 0.05,
          delay: i * 0.02,
          reverb: 0.55,
        });
      });
      engine.noise({ filter: 'highpass', freq: 6200, dur: 0.13, gain: 0.05 });
      break;
    case 'hole':
      engine.tone({ type: 'sine', freq: 74, freqEnd: 37, dur: 0.85, gain: 0.36 });
      engine.noise({ filter: 'bandpass', freq: 220, freqEnd: 70, q: 1.2, dur: 0.85, gain: 0.18 });
      engine.noise({ filter: 'highpass', freq: 420, freqEnd: 4200, dur: 0.7, gain: 0.07, attack: 0.5 });
      break;
    case 'reaction': {
      const base = jitter(midiHz(81), 0.02);
      [1, 1.5, 2, 3].forEach((ratio, i) => {
        engine.tone({
          type: 'triangle',
          freq: base * ratio,
          dur: 0.2,
          gain: 0.085,
          delay: i * 0.035,
          reverb: 0.4,
        });
      });
      break;
    }
    case 'tier':
      engine.noise({ filter: 'bandpass', freq: 480, freqEnd: 5600, q: 1.4, dur: 0.3, gain: 0.2 });
      engine.tone({ type: 'sine', freq: 124, freqEnd: 50, dur: 0.26, gain: 0.4, delay: 0.16 });
      break;
    case 'odReady':
      engine.tone({ type: 'sine', freq: midiHz(81), dur: 0.24, gain: 0.13, reverb: 0.4 });
      engine.tone({ type: 'sine', freq: midiHz(88), dur: 0.36, gain: 0.13, delay: 0.09, reverb: 0.45 });
      break;
    case 'odStart':
      engine.noise({ filter: 'bandpass', freq: 280, freqEnd: 6400, q: 1.1, dur: 0.36, gain: 0.22 });
      engine.tone({ type: 'sine', freq: 96, freqEnd: 29, dur: 0.75, gain: 0.65, delay: 0.2, reverb: 0.25 });
      [220, 277, 330, 440].forEach((freq) => {
        engine.tone({
          type: 'sawtooth',
          freq,
          dur: 0.6,
          gain: 0.045,
          attack: 0.12,
          delay: 0.2,
          reverb: 0.35,
        });
      });
      break;
    case 'odEnd':
      engine.tone({ type: 'sawtooth', freq: 620, freqEnd: 150, dur: 0.34, gain: 0.1 });
      break;
    case 'timeStop':
      engine.tone({ type: 'square', freq: 230, dur: 0.045, gain: 0.16 });
      engine.tone({ type: 'sawtooth', freq: 230, freqEnd: 52, dur: 0.6, gain: 0.18, delay: 0.04 });
      engine.tone({ type: 'sine', freq: 2860, dur: 0.9, gain: 0.07, delay: 0.05, reverb: 0.7 });
      break;
    case 'timeResume':
      engine.tone({ type: 'sawtooth', freq: 52, freqEnd: 230, dur: 0.28, gain: 0.14 });
      engine.tone({ type: 'sine', freq: 2140, dur: 0.4, gain: 0.06, reverb: 0.5 });
      break;
    case 'boss':
      [0, 0.19, 0.38, 0.57].forEach((delay, i) => {
        engine.tone({
          type: 'sawtooth',
          freq: i % 2 === 0 ? 440 : 554,
          dur: 0.17,
          gain: 0.12,
          delay,
          reverb: 0.2,
        });
      });
      engine.tone({ type: 'sine', freq: 82, freqEnd: 41, dur: 0.7, gain: 0.4 });
      break;
    case 'bossDie':
      engine.noise({ filter: 'lowpass', freq: 1500, freqEnd: 70, dur: 1.6, gain: 0.5, reverb: 0.5 });
      engine.tone({ type: 'sine', freq: 88, freqEnd: 24, dur: 1.5, gain: 0.65, reverb: 0.3 });
      [0.25, 0.5, 0.8, 1.1].forEach((delay) => {
        engine.noise({
          filter: 'bandpass',
          freq: jitter(900),
          freqEnd: 200,
          dur: 0.3,
          gain: 0.2,
          delay,
          reverb: 0.4,
        });
      });
      break;
    case 'clear': {
      // A-major pentatonic flourish: four rising notes and a held fifth on top.
      [69, 73, 76, 81].forEach((note, i) => {
        engine.tone({
          type: 'triangle',
          freq: midiHz(note),
          dur: 0.42,
          gain: 0.15,
          delay: i * 0.085,
          reverb: 0.5,
        });
      });
      engine.tone({ type: 'triangle', freq: midiHz(88), dur: 0.9, gain: 0.1, delay: 0.34, reverb: 0.6 });
      break;
    }
    case 'dead':
      engine.tone({ type: 'sawtooth', freq: 220, freqEnd: 55, dur: 1.3, gain: 0.16, reverb: 0.4 });
      engine.noise({ filter: 'lowpass', freq: 3200, freqEnd: 90, dur: 1.3, gain: 0.26 });
      [57, 63, 64].forEach((note) => {
        engine.tone({
          type: 'triangle',
          freq: midiHz(note),
          dur: 1.5,
          gain: 0.07,
          attack: 0.05,
          delay: 0.15,
          reverb: 0.6,
        });
      });
      break;
    case 'launch':
      engine.noise({ filter: 'bandpass', freq: 420, freqEnd: 2600, q: 1.2, dur: 0.26, gain: 0.15 });
      break;
    case 'shoot':
      engine.tone({ type: 'sawtooth', freq: jitter(880, 0.08), freqEnd: 300, dur: 0.1, gain: 0.045 });
      break;
    case 'pop':
      engine.noise({ filter: 'highpass', freq: 2200, dur: 0.04, gain: 0.11 });
      engine.tone({ type: 'sine', freq: jitter(1250, 0.05), freqEnd: 1900, dur: 0.045, gain: 0.08 });
      break;
    case 'breach':
      engine.tone({ type: 'square', freq: 112, dur: 0.2, gain: 0.17 });
      engine.noise({ filter: 'lowpass', freq: 520, dur: 0.2, gain: 0.24 });
      break;
    case 'uiHover':
      engine.tone({ type: 'sine', freq: jitter(2400, 0.02), dur: 0.025, gain: 0.035 });
      break;
    case 'uiClick':
      engine.tone({ type: 'sine', freq: 1400, freqEnd: 1980, dur: 0.055, gain: 0.1 });
      break;
    case 'draft':
      engine.noise({ filter: 'bandpass', freq: 300, freqEnd: 3800, q: 1.1, dur: 0.4, gain: 0.16 });
      [72, 76, 79, 84].forEach((note, i) => {
        engine.tone({
          type: 'sine',
          freq: midiHz(note),
          dur: 0.3,
          gain: 0.06,
          delay: 0.2 + i * 0.05,
          reverb: 0.5,
        });
      });
      break;
    case 'pick':
      playPick(engine, params.rarity ?? 0);
      break;
    case 'deny':
      engine.tone({ type: 'square', freq: 108, dur: 0.09, gain: 0.09 });
      engine.tone({ type: 'square', freq: 98, dur: 0.12, gain: 0.09, delay: 0.1 });
      break;
  }
}

/** The draft pick stinger scales with rarity: a pop for commons, an event for legendaries. */
function playPick(engine: AudioEngine, rarity: number): void {
  engine.tone({ type: 'sine', freq: 180, freqEnd: 620, dur: 0.12, gain: 0.18 });
  const notes = [[69], [69, 76], [69, 73, 76], [64, 69, 73, 76, 81], [57, 64, 69, 73, 76, 81, 88]][
    Math.max(0, Math.min(4, rarity))
  ] ?? [69];
  notes.forEach((note, i) => {
    engine.tone({
      type: 'triangle',
      freq: midiHz(note),
      dur: 0.38 + rarity * 0.12,
      gain: 0.11,
      delay: 0.06 + i * 0.045,
      reverb: 0.45,
    });
  });
  if (rarity >= 3) {
    engine.tone({ type: 'sine', freq: 78, freqEnd: 30, dur: 0.7, gain: 0.55, delay: 0.05, reverb: 0.3 });
    engine.noise({ filter: 'bandpass', freq: 600, freqEnd: 7000, q: 1.2, dur: 0.5, gain: 0.2 });
  }
  if (rarity >= 4) {
    engine.tone({ type: 'sine', freq: 52, freqEnd: 24, dur: 1.2, gain: 0.5, delay: 0.1, reverb: 0.4 });
    engine.noise({ filter: 'highpass', freq: 5000, dur: 0.9, gain: 0.07, attack: 0.4, reverb: 0.6 });
  }
}

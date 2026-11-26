/**
 * Web Audio synthesis engine.
 *
 * No audio files anywhere: every sound in the game is oscillators and filtered noise, built at
 * runtime. The engine owns the buses (master → compressor → out, with an SFX bus, a filtered
 * music bus and a generated reverb) and exposes two primitives, `tone` and `noise`.
 */

export interface ToneOptions {
  type?: OscillatorType;
  freq: number;
  /** Glide to this frequency over the note (exponential). */
  freqEnd?: number;
  dur: number;
  gain?: number;
  attack?: number;
  /** Extra detune in cents. */
  detune?: number;
  /** Start this many seconds from now. */
  delay?: number;
  /** Output node; defaults to the SFX bus. */
  dest?: AudioNode;
  /** Also feed this voice into this node (the arpeggiator's delay line). */
  echo?: AudioNode;
  /** How much of this voice to send to the reverb, 0..1. */
  reverb?: number;
}

export interface NoiseOptions {
  dur: number;
  gain?: number;
  filter?: BiquadFilterType;
  freq?: number;
  /** Sweep the filter to this frequency. */
  freqEnd?: number;
  q?: number;
  attack?: number;
  delay?: number;
  dest?: AudioNode;
  reverb?: number;
}

/** State of the audio context; 'absent' before the first `unlock`. */
export type AudioStatus = 'absent' | 'suspended' | 'running' | 'closed' | 'interrupted';

/** Converts a MIDI note number to Hz. */
export const midiHz = (note: number): number => 440 * Math.pow(2, (note - 69) / 12);

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private musicFilter: BiquadFilterNode | null = null;
  private reverbInput: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private volumes = { music: 0.55, sfx: 0.8 };
  /** Current music duck, 1 = full. `setVolumes` re-applies it or any settings change un-ducks. */
  private duck = 1;
  /** Timestamps at which currently playing voices end; used to cap polyphony. */
  private voicesUntil: number[] = [];
  private analyser: AnalyserNode | null = null;
  private analyserData: Float32Array<ArrayBuffer> | null = null;
  private masterOut: AudioNode | null = null;

  /** True once the context exists and is running. Audio only starts after a user gesture. */
  get ready(): boolean {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  get now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  /** Raw context state; 'absent' before the first `unlock`. */
  get state(): AudioStatus {
    return this.ctx?.state ?? 'absent';
  }

  /** Number of voices that will still be sounding in 30ms. */
  get busy(): number {
    const t = this.now + 0.03;
    let count = 0;
    for (const until of this.voicesUntil) if (until > t) count++;
    return count;
  }

  setVolumes(music: number, sfx: number): void {
    this.volumes = { music, sfx };
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.sfxBus?.gain.setTargetAtTime(sfx, t, 0.03);
    this.musicBus?.gain.setTargetAtTime(music * 0.9 * this.duck, t, 0.05);
  }

  /** Creates and/or resumes the context. Must be called from a user gesture; safe to call repeatedly. */
  unlock(): void {
    try {
      if (!this.ctx) {
        const Ctor: typeof AudioContext | undefined =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        const ctx = new Ctor();
        this.ctx = ctx;
        this.buildGraph(ctx);
        this.watchdog(ctx);
      }
      // 'interrupted' (iOS: phone call, alarm banner) is a third state; resume covers it too.
      if (this.ctx.state !== 'running') void this.ctx.resume();
    } catch {
      // Audio is optional. If the browser refuses, the game simply plays silently.
      this.ctx = null;
    }
  }

  /**
   * Phones suspend or interrupt the context behind our back — a call, an alarm banner, the lock
   * screen — and iOS reports it as its own 'interrupted' state. Keep nudging the context back:
   * every state change schedules a retry (the first resume during an interruption fails, the one
   * after the interruption lifts succeeds), and returning to the page retries immediately.
   */
  private watchdog(ctx: AudioContext): void {
    ctx.addEventListener('statechange', () => {
      if (ctx.state === 'running') return;
      window.setTimeout(() => {
        if (this.ctx === ctx && ctx.state !== 'running') void ctx.resume().catch(() => undefined);
      }, 150);
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && ctx.state !== 'running') void ctx.resume().catch(() => undefined);
    });
  }

  private buildGraph(ctx: AudioContext): void {
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.knee.value = 18;
    compressor.ratio.value = 5;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.2;
    compressor.connect(ctx.destination);
    this.masterOut = compressor;

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = this.volumes.sfx;
    this.sfxBus.connect(compressor);

    // Music passes through a low-pass that the game sweeps for time stop and menu transitions.
    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 18000;
    this.musicFilter.Q.value = 0.4;
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.volumes.music * 0.9;
    this.musicBus.connect(this.musicFilter);
    this.musicFilter.connect(compressor);

    // Reverb from a generated impulse: decaying noise, slightly darker over time.
    const seconds = 2.2;
    const rate = ctx.sampleRate;
    const impulse = ctx.createBuffer(2, Math.floor(rate * seconds), rate);
    for (let channel = 0; channel < 2; channel++) {
      const data = impulse.getChannelData(channel);
      let last = 0;
      for (let i = 0; i < data.length; i++) {
        const t = i / data.length;
        last = last * 0.62 + (Math.random() * 2 - 1) * 0.38;
        data[i] = last * Math.pow(1 - t, 2.6) * (1 - t * 0.3);
      }
    }
    const convolver = ctx.createConvolver();
    convolver.buffer = impulse;
    this.reverbInput = ctx.createGain();
    this.reverbInput.gain.value = 1;
    this.reverbInput.connect(convolver);
    convolver.connect(compressor);

    const noise = ctx.createBuffer(1, rate * 2, rate);
    const samples = noise.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    this.noiseBuffer = noise;
  }

  /**
   * Peak and RMS of the final mix over the most recent ~45ms, for diagnostics: confirms that sound
   * is actually being produced and that the compressor keeps it from clipping. Null before unlock.
   */
  probe(): { peak: number; rms: number } | null {
    const ctx = this.ctx;
    if (!ctx || !this.masterOut) return null;
    if (!this.analyser) {
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.masterOut.connect(this.analyser);
      this.analyserData = new Float32Array(this.analyser.fftSize);
    }
    const data = this.analyserData as Float32Array<ArrayBuffer>;
    this.analyser.getFloatTimeDomainData(data);
    let peak = 0;
    let energy = 0;
    for (let i = 0; i < data.length; i++) {
      const v = data[i];
      peak = Math.max(peak, Math.abs(v));
      energy += v * v;
    }
    return { peak, rms: Math.sqrt(energy / data.length) };
  }

  /** Output node for a voice: its dry bus (music or SFX). */
  private output(dest: AudioNode | undefined, isMusic = false): AudioNode {
    return dest ?? (isMusic ? (this.musicBus as AudioNode) : (this.sfxBus as AudioNode));
  }

  /** Taps one voice into the reverb. The send dies with the voice: no leaks, no sums. */
  private tapReverb(source: AudioNode, amount: number): void {
    const send = this.ctx?.createGain();
    if (!send) return;
    send.gain.value = amount;
    source.connect(send);
    send.connect(this.reverbInput!);
  }

  private track(until: number): void {
    this.voicesUntil.push(until);
    if (this.voicesUntil.length > 128) this.voicesUntil = this.voicesUntil.filter((t) => t > this.now);
  }

  /** One oscillator with an attack/decay envelope. */
  tone(o: ToneOptions, isMusic = false): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t0 = ctx.currentTime + (o.delay ?? 0);
    const gain = ctx.createGain();
    const out = this.output(o.dest, isMusic);
    const peak = o.gain ?? 0.2;
    const attack = o.attack ?? 0.004;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(peak, t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + o.dur);
    gain.connect(out);
    if (o.echo) gain.connect(o.echo);
    // The send taps this voice's envelope, not the bus: it ends when the voice ends.
    if (o.reverb) this.tapReverb(gain, o.reverb);

    const osc = ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(Math.max(1, o.freq), t0);
    if (o.freqEnd !== undefined)
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.freqEnd), t0 + o.dur);
    osc.detune.value = o.detune ?? 0;
    osc.connect(gain);
    osc.start(t0);
    osc.stop(t0 + attack + o.dur + 0.02);
    this.track(t0 + attack + o.dur);
  }

  /** A burst of filtered white noise with an envelope. */
  noise(o: NoiseOptions, isMusic = false): void {
    const ctx = this.ctx;
    if (!ctx || !this.noiseBuffer || ctx.state !== 'running') return;
    const t0 = ctx.currentTime + (o.delay ?? 0);
    const gain = ctx.createGain();
    const out = this.output(o.dest, isMusic);
    const peak = o.gain ?? 0.2;
    const attack = o.attack ?? 0.002;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(peak, t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + o.dur);
    gain.connect(out);
    // The send taps this voice's envelope, not the bus: it ends when the voice ends.
    if (o.reverb) this.tapReverb(gain, o.reverb);

    const filter = ctx.createBiquadFilter();
    filter.type = o.filter ?? 'bandpass';
    filter.frequency.setValueAtTime(o.freq ?? 2000, t0);
    if (o.freqEnd !== undefined)
      filter.frequency.exponentialRampToValueAtTime(Math.max(20, o.freqEnd), t0 + o.dur);
    filter.Q.value = o.q ?? 0.8;
    filter.connect(gain);

    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = true;
    source.connect(filter);
    source.start(t0, Math.random() * 1.5);
    source.stop(t0 + attack + o.dur + 0.02);
    this.track(t0 + attack + o.dur);
  }

  /** Sweeps the music low-pass filter. Used to "plunge" the mix during time stop. */
  setMusicCutoff(hz: number, seconds: number): void {
    if (!this.ctx || !this.musicFilter) return;
    const f = this.musicFilter.frequency;
    f.cancelScheduledValues(this.ctx.currentTime);
    f.setTargetAtTime(hz, this.ctx.currentTime, seconds / 3);
  }

  /** Fades the whole music bus, e.g. down for the pause menu. */
  setMusicDuck(amount: number, seconds: number): void {
    this.duck = amount;
    if (!this.ctx || !this.musicBus) return;
    this.musicBus.gain.setTargetAtTime(
      this.volumes.music * 0.9 * this.duck,
      this.ctx.currentTime,
      seconds / 3,
    );
  }

  /** Creates a feedback delay for the arpeggiator. Returns its input node. */
  createDelay(time: number, feedback: number, wet: number): AudioNode | null {
    if (!this.ctx || !this.musicBus) return null;
    const delay = this.ctx.createDelay(1);
    delay.delayTime.value = time;
    const loop = this.ctx.createGain();
    loop.gain.value = feedback;
    const out = this.ctx.createGain();
    out.gain.value = wet;
    delay.connect(loop);
    loop.connect(delay);
    delay.connect(out);
    out.connect(this.musicBus);
    return delay;
  }
}

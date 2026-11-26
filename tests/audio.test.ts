import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioDirector } from '../src/audio/director';
import { AudioEngine } from '../src/audio/engine';
import { Emitter } from '../src/core/emitter';
import type { World, WorldEvents } from '../src/game/world';

/**
 * Node-environment audio tests. A minimal AudioContext stub records the graph's connect() edges,
 * so the assertions are about topology — who feeds whom, at what gain — not about sound.
 */

/** A Web Audio parameter: a settable value with inert scheduling. */
const param = () => ({
  value: 0,
  setValueAtTime: () => {},
  linearRampToValueAtTime: () => {},
  exponentialRampToValueAtTime: () => {},
  setTargetAtTime: () => {},
  cancelScheduledValues: () => {},
});
type FakeParam = ReturnType<typeof param>;

interface FakeNode {
  kind: string;
  connect: (to: FakeNode) => void;
  gain?: FakeParam;
  [key: string]: unknown;
}

/** One recorded connect() edge; `gain` snapshots the source's gain value at connect time. */
interface Edge {
  from: FakeNode;
  to: FakeNode;
  gain: number | undefined;
}

/** Every node is tagged with the factory that made it, so tests can find the pieces of the graph. */
class FakeAudioContext {
  currentTime = 0;
  state = 'running';
  sampleRate = 48000;
  readonly destination: FakeNode = { kind: 'destination', connect: () => {} };
  readonly edges: Edge[] = [];
  readonly nodes: FakeNode[] = [];
  resume = async () => {};
  addEventListener = () => {};

  private make(kind: string, extra: Record<string, unknown> = {}): FakeNode {
    const node: FakeNode = {
      kind,
      connect: (to: FakeNode) => this.edges.push({ from: node, to, gain: node.gain?.value }),
      ...extra,
    };
    this.nodes.push(node);
    return node;
  }

  createDynamicsCompressor(): FakeNode {
    return this.make('compressor', {
      threshold: param(),
      knee: param(),
      ratio: param(),
      attack: param(),
      release: param(),
    });
  }

  createGain(): FakeNode {
    return this.make('gain', { gain: param() });
  }

  createBiquadFilter(): FakeNode {
    return this.make('filter', { type: '', frequency: param(), Q: param() });
  }

  createConvolver(): FakeNode {
    return this.make('convolver');
  }

  createAnalyser(): FakeNode {
    return this.make('analyser', { fftSize: 2048, getFloatTimeDomainData: () => {} });
  }

  createOscillator(): FakeNode {
    return this.make('oscillator', {
      type: '',
      frequency: param(),
      detune: param(),
      start: () => {},
      stop: () => {},
    });
  }

  createBufferSource(): FakeNode {
    return this.make('bufferSource', { buffer: null, loop: false, start: () => {}, stop: () => {} });
  }

  createBuffer(_channels: number, length: number, _rate: number): { getChannelData: () => Float32Array } {
    return { getChannelData: () => new Float32Array(length) };
  }
}

/** The private engine fields the assertions need. */
interface Internals {
  ctx: FakeAudioContext;
  sfxBus: FakeNode;
  reverbInput: FakeNode;
  masterOut: FakeNode;
}

/** Stubs the globals the engine touches, unlocks a fresh engine and fails fast if the stub broke. */
function bootEngine(): { engine: AudioEngine; internals: Internals } {
  vi.stubGlobal('window', { AudioContext: FakeAudioContext, setTimeout });
  vi.stubGlobal('document', { addEventListener: () => {}, hidden: false });
  const engine = new AudioEngine();
  engine.unlock();
  // unlock() swallows every exception into a null context; a broken stub must fail loudly here.
  expect(engine.ready).toBe(true);
  return { engine, internals: engine as unknown as Internals };
}

describe('audio engine reverb sends', () => {
  afterEach(() => vi.unstubAllGlobals());

  const sendEdges = (internals: Internals): Edge[] =>
    internals.ctx.edges.filter((e) => e.to === internals.reverbInput);
  const busTargets = (internals: Internals): FakeNode[] =>
    internals.ctx.edges.filter((e) => e.from === internals.sfxBus).map((e) => e.to);

  it('taps the reverb at the voice gain, never at the bus', () => {
    const { engine, internals } = bootEngine();
    engine.probe(); // hangs the diagnostics analyser off the master compressor
    engine.tone({ freq: 440, dur: 0.1, gain: 0.2, reverb: 0.5 });

    // The bus's only outgoing edge is the dry one into the compressor: no reverb send from the bus.
    const targets = busTargets(internals);
    expect(targets).toHaveLength(1);
    expect(targets[0]).toBe(internals.masterOut);

    // Exactly one send edge into the reverb input, at the requested send level.
    const sends = sendEdges(internals);
    expect(sends).toHaveLength(1);
    expect(sends[0].gain).toBe(0.5);
    // The send is fed by this voice's own envelope gain — the node that also feeds the dry bus.
    const voiceEdges = internals.ctx.edges.filter((e) => e.to === sends[0].from);
    expect(voiceEdges).toHaveLength(1);
    expect(voiceEdges[0].from.kind).toBe('gain');
    expect(internals.ctx.edges.some((e) => e.from === voiceEdges[0].from && e.to === internals.sfxBus)).toBe(
      true,
    );
    // And the send lands on the node that feeds the convolver.
    const convolver = internals.ctx.nodes.find((n) => n.kind === 'convolver');
    expect(internals.ctx.edges.some((e) => e.from === internals.reverbInput && e.to === convolver)).toBe(
      true,
    );
  });

  it('adds one independent send per voice', () => {
    const { engine, internals } = bootEngine();
    engine.probe();
    engine.tone({ freq: 440, dur: 0.1, reverb: 0.5 });
    engine.tone({ freq: 660, dur: 0.1, reverb: 0.5 });

    // Two distinct sends, one per voice; the bus never gains a reverb edge to sum them on.
    const sends = sendEdges(internals);
    expect(sends).toHaveLength(2);
    expect(new Set(sends.map((e) => e.from)).size).toBe(2);
    expect(busTargets(internals).map((n) => n.kind)).toEqual(['compressor']);
  });

  it('adds no send when reverb is unset', () => {
    const { engine, internals } = bootEngine();
    engine.tone({ freq: 880, dur: 0.1 });
    engine.noise({ dur: 0.1 });
    expect(sendEdges(internals)).toHaveLength(0);

    // The noise path shares the helper: with reverb it sends once, from its own voice gain.
    engine.noise({ dur: 0.1, reverb: 0.25 });
    const sends = sendEdges(internals);
    expect(sends).toHaveLength(1);
    expect(sends[0].gain).toBe(0.25);
    expect(sends[0].from.kind).toBe('gain');
  });
});

describe('audio director time-stop cutoff', () => {
  afterEach(() => vi.unstubAllGlobals());

  /** A director whose sequencer interval is captured instead of looping. */
  function bootDirector(): { director: AudioDirector; cutoffs: Array<[number, number]> } {
    const ticks: Array<() => void> = [];
    vi.stubGlobal('window', {
      setInterval: (fn: () => void): number => {
        ticks.push(fn);
        return 0;
      },
    });
    vi.stubGlobal('document', { addEventListener: () => {}, hidden: false });
    const director = new AudioDirector();
    const cutoffs: Array<[number, number]> = [];
    vi.spyOn(director.engine, 'setMusicCutoff').mockImplementation((hz, seconds) => {
      cutoffs.push([hz, seconds]);
    });
    expect(ticks).toHaveLength(1); // the sequencer interval is captured, never fired
    return { director, cutoffs };
  }

  const fakeWorld = (): { events: Emitter<WorldEvents> } & World =>
    ({ events: new Emitter<WorldEvents>() }) as unknown as { events: Emitter<WorldEvents> } & World;

  it('restores the music filter when a new world attaches mid-time-stop', () => {
    const { director, cutoffs } = bootDirector();
    const first = fakeWorld();
    director.attach(first);
    first.events.emit('timeStop', 'start');
    expect(cutoffs).toEqual([[420, 0.35]]);

    // The level ends while time is still stopped, so the restoring 'end' never fires — but the
    // next world's attach must still undo the plunge.
    director.attach(fakeWorld());
    expect(cutoffs).toEqual([
      [420, 0.35],
      [18000, 0.1],
    ]);
  });

  it('leaves the filter alone when attaching without a plunged cutoff', () => {
    const { director, cutoffs } = bootDirector();
    director.attach(fakeWorld());
    expect(cutoffs).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { defaultEconomy, parseEconomyState, type EconomyState } from '../src/core/storage';
import { TOY_WALLET_KEY, ToyWalletMirror, mergeWallet } from '../src/net/toywallet';
import type { ToyLike } from '../src/net/toy';

/** A wallet with a lived-in history, for round-trips and merge decisions. */
function wallet(overrides: Partial<EconomyState> = {}): EconomyState {
  const state = defaultEconomy();
  state.stardust = 430;
  state.lifetime = 12_345;
  state.protocols = ['bulwark', 'venom'];
  state.supplies = ['spare', 'secondwind'];
  state.loadout = ['spare'];
  state.wishlist = 'chrono';
  state.milestones = ['perfect', 'win1', 'diff-abyss'];
  state.firstUsed = { fire: true, crit: true };
  state.firstGift = true;
  state.dailyDate = '2026-11-26';
  state.dailyRunCoins = 240;
  state.bestCombo = 412;
  state.winsByDifficulty = { hard: 2, abyss: 1 };
  state.winsByStarter = { blank: 1, element: 3 };
  state.counters = {
    perfects: 40,
    capsules: 12,
    overdrives: 9,
    reactions: 6,
    bosses: 4,
    flawless: 3,
    swift: 2,
  };
  return { ...state, ...overrides };
}

/** A fake SDK whose storage is a plain in-memory map, with call counters. */
function fakeSdk(opts: { supported?: boolean } = {}) {
  const calls = { isSupport: 0, get: 0, set: 0 };
  const store = new Map<string, unknown>();
  const sdk = {
    isSupport: async (ability: string) => {
      calls.isSupport++;
      return ability === 'getCloudStorage' && opts.supported !== false;
    },
    storage: {
      get: async (req: { keys: string[] }) => {
        calls.get++;
        const out: Record<string, unknown> = {};
        for (const key of req.keys) out[key] = store.get(key);
        return out;
      },
      set: async (req: { items: Record<string, unknown> }) => {
        calls.set++;
        for (const [key, value] of Object.entries(req.items)) store.set(key, value);
        return { ok: 1 };
      },
      remove: async (req: { keys: string[] }) => {
        for (const key of req.keys) store.delete(key);
      },
    },
  };
  return { sdk: sdk as unknown as ToyLike, calls, store };
}

describe('wallet serialization', () => {
  it('round-trips through the SDK JSON channel and the save parser', () => {
    const state = wallet();
    // The storage channel is JSON: what lands is what a postMessage round-trip leaves.
    const parsed = parseEconomyState(JSON.parse(JSON.stringify(state)));
    expect(parsed).not.toBeNull();
    expect(parsed!.stardust).toBe(430);
    expect(parsed!.lifetime).toBe(12_345);
    expect(parsed!.protocols).toEqual(['bulwark', 'venom']);
    expect(parsed!.milestones).toContain('diff-abyss');
    expect(parsed!.winsByDifficulty).toEqual({ hard: 2, abyss: 1 });
    expect(parsed!.counters.perfects).toBe(40);
  });

  it('a fully lived-in wallet stays far under the platform item budget', () => {
    const state = wallet();
    for (let i = 0; i < 128; i++) state.milestones.push(`m${i}`);
    for (let i = 0; i < 64; i++) state.protocols.push(`p${i}`);
    for (let i = 0; i < 64; i++) state.firstUsed[`u${i}`] = true;
    for (let i = 0; i < 64; i++) state.winsByStarter[`s${i}`] = i;
    expect(JSON.stringify(state).length).toBeLessThan(16_384);
  });
});

describe('merge policy', () => {
  it('adopts a cloud wallet only when it is further along the same lineage', () => {
    const local = wallet();
    expect(mergeWallet(local, null)).toBeNull();
    expect(mergeWallet(local, wallet({ lifetime: 10_000 }))).toBeNull(); // less
    expect(mergeWallet(local, wallet({ lifetime: 12_345 }))).toBeNull(); // equal
    const richer = wallet({ lifetime: 20_000, stardust: 900 });
    expect(mergeWallet(local, richer)).toBe(richer); // strictly more lifetime
  });
});

describe('ToyWalletMirror', () => {
  it('saves and loads through the SDK storage, under one key', async () => {
    const { sdk, store } = fakeSdk();
    const mirror = new ToyWalletMirror(() => Promise.resolve(sdk));
    expect(await mirror.save(wallet())).toBe(true);
    expect(store.has(TOY_WALLET_KEY)).toBe(true);
    const loaded = await mirror.load();
    expect(loaded).not.toBeNull();
    expect(loaded!.lifetime).toBe(12_345);
    expect(loaded!.supplies).toEqual(['spare', 'secondwind']);
  });

  it('reads a garbage or missing mirror as no wallet, never as corruption', async () => {
    const { sdk, store } = fakeSdk();
    const mirror = new ToyWalletMirror(() => Promise.resolve(sdk));
    // No key at all: just nothing.
    expect(await mirror.load()).toBeNull();
    // A non-object payload is dropped outright.
    store.set(TOY_WALLET_KEY, 'not json {');
    expect(await mirror.load()).toBeNull();
    // An object-shaped junk payload parses as a repaired but empty wallet; the merge policy is
    // what keeps it from ever being adopted (nothing is strictly greater than zero).
    store.set(TOY_WALLET_KEY, { nested: true });
    const junk = await mirror.load();
    expect(junk).not.toBeNull();
    expect(junk!.lifetime).toBe(0);
    expect(junk!.protocols).toEqual([]);
    expect(mergeWallet(wallet(), junk)).toBeNull();
  });

  it('answers false when the SDK or the storage call fails, without throwing', async () => {
    const failing = {
      isSupport: async () => true,
      storage: {
        get: async () => {
          throw new Error('host refused');
        },
        set: async () => {
          throw new Error('host refused');
        },
      },
    } as unknown as ToyLike;
    const mirror = new ToyWalletMirror(() => Promise.resolve(failing));
    expect(await mirror.load()).toBeNull();
    expect(await mirror.save(wallet())).toBe(false);
  });

  it('remembers a host without the storage ability and never asks again', async () => {
    const { sdk, calls } = fakeSdk({ supported: false });
    const mirror = new ToyWalletMirror(() => Promise.resolve(sdk));
    expect(await mirror.load()).toBeNull();
    expect(await mirror.save(wallet())).toBe(false);
    expect(calls.isSupport).toBe(1);
    await mirror.load(); // cached refusal: no further ability checks
    expect(calls.isSupport).toBe(1);
    expect(calls.get).toBe(0);
    expect(calls.set).toBe(0);
  });

  it('resolves to nothing when the SDK never arrives', async () => {
    const mirror = new ToyWalletMirror(() => Promise.resolve(null));
    expect(await mirror.load()).toBeNull();
    expect(await mirror.save(wallet())).toBe(false);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addRunRecord,
  defaultSave,
  HISTORY_CAP,
  loadSave,
  runRank,
  storeSave,
  type RunRecord,
} from '../src/core/storage';
import { APP_VERSION } from '../src/core/version';
import { changelogUnseen } from '../src/ui/changelog';

const KEY = 'shatterverse.save.v1';
const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, value),
  removeItem: (key: string) => void store.delete(key),
});

function record(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    mode: 'campaign',
    difficulty: 'standard',
    score: 1000,
    level: 3,
    code: '1-3',
    name: '测试扇区',
    combo: 20,
    damage: 500,
    kills: 30,
    time: 40,
    won: false,
    date: 1_700_000_000_000,
    seed: 7,
    build: { fire: 1 },
    ...overrides,
  };
}

beforeEach(() => store.clear());

describe('run history', () => {
  it('inserts newest first and ranks by score, tied scores sharing a rank', () => {
    const records = defaultSave().records;
    expect(addRunRecord(records, record({ score: 500, date: 3 }))).toBe(1);
    expect(addRunRecord(records, record({ score: 2000, date: 2 }))).toBe(1);
    expect(addRunRecord(records, record({ score: 500, date: 4 }))).toBe(2);
    expect(records.history.map((entry) => entry.date)).toEqual([4, 2, 3]);
    expect(runRank(records.history, 1500)).toBe(2);
  });

  it('caps the history, dropping the oldest runs', () => {
    const records = defaultSave().records;
    for (let i = 0; i < HISTORY_CAP + 10; i++) addRunRecord(records, record({ score: i, date: i }));
    expect(records.history).toHaveLength(HISTORY_CAP);
    expect(records.history[0]?.date).toBe(HISTORY_CAP + 9);
    expect(records.history.at(-1)?.date).toBe(10);
  });

  it('repairs a malformed save: garbage and wrong-mode entries are dropped, valid ones survive', () => {
    const good = record();
    store.set(
      KEY,
      JSON.stringify({
        version: 1,
        settings: {},
        records: {
          ...defaultSave().records,
          history: [{ nope: true }, { ...good, mode: 'sudden-death' }, good],
        },
      }),
    );
    expect(loadSave().records.history).toEqual([good]);
  });

  it('reads saves written before the history field existed', () => {
    store.set(KEY, JSON.stringify({ version: 1, settings: { music: 0.4 }, records: { bestScore: 12345 } }));
    const save = loadSave();
    expect(save.records.history).toEqual([]);
    expect(save.records.bestScore).toBe(12345);
  });

  it('never shares one history array between two saves', () => {
    const a = defaultSave().records;
    const b = defaultSave().records;
    addRunRecord(a, record());
    expect(b.history).toHaveLength(0);
  });
});

describe('learned render step', () => {
  it('is absent until the governor has learned one', () => {
    expect(defaultSave().device).toBeNull();
    store.set(KEY, JSON.stringify({ version: 1, settings: {}, records: {} }));
    expect(loadSave().device).toBeNull();
  });

  it('keeps a learned step, stripped to its two fields', () => {
    store.set(KEY, JSON.stringify({ settings: {}, device: { quality: 'low', scale: 0.75, extra: 'x' } }));
    expect(loadSave().device).toEqual({ quality: 'low', scale: 0.75 });
  });

  it('drops anything that is not a real step', () => {
    for (const bogus of [
      { quality: 'high', scale: 0.75 },
      { quality: 'low', scale: 0.5 },
      { quality: 'low' },
      { quality: 'ultra', scale: 1 },
      'low',
      7,
      [],
    ]) {
      store.set(KEY, JSON.stringify({ settings: { music: 0.4 }, device: bogus }));
      const save = loadSave();
      expect(save.device).toBeNull();
      // The rest of the save is untouched by the bad field.
      expect(save.settings.music).toBe(0.4);
    }
  });
});

describe('economy state (save v2)', () => {
  it('a fresh save starts with an empty wallet and a clean loadout', () => {
    const save = defaultSave();
    expect(save.version).toBe(2);
    expect(save.economy.stardust).toBe(0);
    expect(save.economy.protocols).toEqual([]);
    expect(save.economy.loadout).toEqual([]);
    expect(save.economy.wishlist).toBeNull();
  });

  it('migrates a v1 save: retro combo and difficulty clears from the history, empty wallet', () => {
    store.set(
      KEY,
      JSON.stringify({
        version: 1,
        settings: {},
        records: {
          bestScore: 5,
          history: [
            record({ mode: 'campaign', difficulty: 'hard', won: true, combo: 250 }),
            record({ mode: 'endless', difficulty: 'abyss', won: true, combo: 90 }),
          ],
        },
      }),
    );
    const save = loadSave();
    expect(save.version).toBe(2);
    expect(save.economy.bestCombo).toBe(250);
    // Only campaign wins count as clears; endless runs do not.
    expect(save.economy.winsByDifficulty).toEqual({ hard: 1 });
    expect(save.economy.stardust).toBe(0);
  });

  it('repairs a malformed economy instead of trusting it', () => {
    store.set(
      KEY,
      JSON.stringify({
        version: 2,
        settings: {},
        records: {},
        economy: {
          stardust: 'lots',
          supplies: ['cache', 'bogus'],
          loadout: ['nope'],
          wishlist: 5,
          milestones: 'all',
          picksByStarter: { chrono: 'many', venom: 3, bogus: 0 },
          counters: { perfects: 'many' },
        },
      }),
    );
    const save = loadSave();
    expect(save.economy.stardust).toBe(0);
    expect(save.economy.supplies).toEqual(['cache']);
    expect(save.economy.loadout).toEqual([]);
    expect(save.economy.wishlist).toBeNull();
    expect(save.economy.milestones).toEqual([]);
    expect(save.economy.picksByStarter).toEqual({ venom: 3 });
    expect(save.economy.counters.perfects).toBe(0);
  });

  it('round-trips a lived-in economy', () => {
    const save = defaultSave();
    save.economy.stardust = 4321;
    save.economy.lifetime = 12_345;
    save.economy.protocols = ['bulwark', 'venom'];
    save.economy.supplies = ['spare', 'secondwind'];
    save.economy.loadout = ['spare'];
    save.economy.wishlist = 'chrono';
    save.economy.milestones = ['perfect', 'win1'];
    save.economy.firstUsed = { fire: true };
    save.economy.bestCombo = 412;
    save.economy.winsByStarter = { blank: 2, barrage: 7 };
    save.economy.picksByStarter = { blank: 9, barrage: 20, chrono: 1 };
    storeSave(save);
    const again = loadSave();
    expect(again.economy.stardust).toBe(4321);
    expect(again.economy.protocols).toEqual(['bulwark', 'venom']);
    expect(again.economy.loadout).toEqual(['spare']);
    expect(again.economy.wishlist).toBe('chrono');
    expect(again.economy.milestones).toEqual(['perfect', 'win1']);
    expect(again.economy.firstUsed).toEqual({ fire: true });
    expect(again.economy.bestCombo).toBe(412);
    expect(again.economy.winsByStarter).toEqual({ blank: 2, barrage: 7 });
    expect(again.economy.picksByStarter).toEqual({ blank: 9, barrage: 20, chrono: 1 });
  });
});

describe('starter screen state', () => {
  it('a fresh save sorts the roster by default', () => {
    expect(defaultSave().settings.starterSort).toBe('default');
  });

  it('keeps a real roster sort and repairs a lookalike', () => {
    store.set(KEY, JSON.stringify({ version: 2, settings: { starterSort: 'name' }, records: {} }));
    expect(loadSave().settings.starterSort).toBe('name');
    store.set(KEY, JSON.stringify({ version: 2, settings: { starterSort: 'cheapest' }, records: {} }));
    expect(loadSave().settings.starterSort).toBe('default');
  });
});

describe('release-notes marker', () => {
  it('starts a fresh save on the running version: a new player has nothing to be updated about', () => {
    expect(defaultSave().settings.changelogSeen).toBe(APP_VERSION);
    // Nothing stored at all reads the same way.
    expect(loadSave().settings.changelogSeen).toBe(APP_VERSION);
    expect(changelogUnseen(loadSave().settings)).toBe(false);
  });

  it('reads a save written before the changelog existed as never shown', () => {
    store.set(KEY, JSON.stringify({ version: 1, settings: { music: 0.4 }, records: {} }));
    const save = loadSave();
    expect(save.settings.changelogSeen).toBe('');
    expect(changelogUnseen(save.settings)).toBe(true);
    // The rest of the save is untouched by the missing field.
    expect(save.settings.music).toBe(0.4);
  });

  it('keeps the version a device has already been shown, seen or not', () => {
    store.set(KEY, JSON.stringify({ settings: { changelogSeen: '0.0.1' }, records: {} }));
    expect(loadSave().settings.changelogSeen).toBe('0.0.1');
    store.set(KEY, JSON.stringify({ settings: { changelogSeen: APP_VERSION }, records: {} }));
    expect(changelogUnseen(loadSave().settings)).toBe(false);
  });

  it('drops a malformed marker rather than trusting it', () => {
    for (const bogus of [7, true, {}, [], null]) {
      store.set(KEY, JSON.stringify({ settings: { changelogSeen: bogus }, records: {} }));
      expect(loadSave().settings.changelogSeen, JSON.stringify(bogus)).toBe('');
    }
  });
});

describe('obfuscated storage', () => {
  /** Replaces one base64 character with a different valid one, keeping the blob well-formed. */
  function flipChar(blob: string, at: number): string {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    return (
      blob.slice(0, at) + alphabet[(alphabet.indexOf(blob[at]) + 7) % alphabet.length] + blob.slice(at + 1)
    );
  }

  it('stores the save obfuscated and reads it back untouched', () => {
    const save = defaultSave();
    save.economy.stardust = 4321;
    save.economy.lifetime = 12_345;
    save.records.bestScore = 987_654;
    save.economy.protocols = ['bulwark'];
    addRunRecord(save.records, record({ name: '测试扇区' }));
    storeSave(save);
    const raw = store.get(KEY) ?? '';
    expect(raw.startsWith('SVX1:')).toBe(true);
    // Not plaintext: neither the wallet nor the field names may survive into the blob.
    expect(() => JSON.parse(raw)).toThrow();
    expect(raw).not.toContain('stardust');
    expect(raw).not.toContain('4321');
    expect(raw).not.toContain('987654');
    expect(raw).not.toContain('测试扇区');
    const again = loadSave();
    expect(again.economy.stardust).toBe(4321);
    expect(again.economy.lifetime).toBe(12_345);
    expect(again.records.bestScore).toBe(987_654);
    expect(again.economy.protocols).toEqual(['bulwark']);
    expect(again.records.history[0]?.name).toBe('测试扇区');
  });

  it('writes each save differently, so identical states never store identical blobs', () => {
    const raw = JSON.stringify({ version: 2, settings: {}, records: {}, economy: { stardust: 7 } });
    store.set(KEY, raw);
    const first = loadSave();
    storeSave(first);
    const a = store.get(KEY);
    storeSave(first);
    expect(store.get(KEY)).not.toBe(a);
  });

  it('still reads a pre-obfuscation plaintext save, then re-writes it obfuscated', () => {
    store.set(
      KEY,
      JSON.stringify({
        version: 2,
        settings: { music: 0.4 },
        records: { bestScore: 777 },
        economy: { stardust: 55 },
      }),
    );
    const save = loadSave();
    expect(save.economy.stardust).toBe(55);
    expect(save.records.bestScore).toBe(777);
    expect(save.settings.music).toBe(0.4);
    storeSave(save);
    expect(store.get(KEY)?.startsWith('SVX1:')).toBe(true);
    expect(loadSave().economy.stardust).toBe(55);
  });

  it('a tampered blob reads as a fresh save instead of applying the edit', () => {
    const save = defaultSave();
    save.economy.stardust = 4321;
    save.records.bestScore = 999_999;
    storeSave(save);
    const raw = store.get(KEY) ?? '';
    // One flip inside the header breaks the keystream; one deep in the payload breaks the
    // checksum. Both must land on the same path as any other corrupted save.
    for (const at of [8, raw.length - 10]) {
      store.set(KEY, flipChar(raw, at));
      const fresh = loadSave();
      expect(fresh.economy.stardust).toBe(0);
      expect(fresh.records.bestScore).toBe(0);
    }
  });
});

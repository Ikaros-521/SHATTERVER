import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addRunRecord, defaultSave, HISTORY_CAP, loadSave, runRank, type RunRecord } from '../src/core/storage';

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
        records: { ...defaultSave().records, history: [{ nope: true }, { ...good, mode: 'sudden-death' }, good] },
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

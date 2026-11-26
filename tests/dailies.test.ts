import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultEconomy, defaultSave, loadSave, storeSave, type EconomyState } from '../src/core/storage';
import { createRun, type LevelRecord, type Run } from '../src/game/run';
import {
  DAILY_MISSIONS,
  DAILY_MISSION_PICK,
  DAILY_MISSION_REWARD,
  advanceDaily,
  dailyMissionsFor,
  doubleFirstRun,
  rollDaily,
} from '../src/game/economy/dailies';

const KEY = 'shatterverse.save.v1';
const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, value),
  removeItem: (key: string) => void store.delete(key),
});

/** A finished-run stand-in: everything dailies read lives on plain fields. */
function run(overrides: Partial<Run> = {}, history: LevelRecord[] = []): Run {
  const base = createRun('campaign', 1);
  return { ...base, history, ...overrides };
}

function level(overrides: Partial<LevelRecord> = {}): LevelRecord {
  return { level: 1, name: '测试', time: 30, killed: 10, maxCombo: 5, damageTaken: 1, ...overrides };
}

/** Dates advance one per step; draws are deterministic, so a scan always finds the same day. */
function dateAt(offset: number): string {
  const d = new Date(2026, 2, 1 + offset);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

/** First sampled date whose hand contains every given mission id. */
function dateWith(...ids: string[]): string {
  for (let offset = 0; offset < 500; offset++) {
    const date = dateAt(offset);
    const drawn = dailyMissionsFor(date).map((mission) => mission.id);
    if (ids.every((id) => drawn.includes(id))) return date;
  }
  throw new Error(`no sampled date draws ${ids.join('+')} (deterministic pool of ${DAILY_MISSIONS.length})`);
}

function rolled(date: string): EconomyState {
  const econ = defaultEconomy();
  rollDaily(econ, date);
  return econ;
}

/**
 * A rolled day trimmed to just the missions under test, so an advanceDaily run cannot settle an
 * unrelated hand member (e.g. `runs`, which scores every call) and blur the assertion.
 */
function rolledWith(date: string, ...ids: string[]): EconomyState {
  const econ = rolled(date);
  econ.daily.missions = econ.daily.missions.filter((mission) => ids.includes(mission.id));
  return econ;
}

beforeEach(() => store.clear());

describe('daily mission pool', () => {
  it('holds ten unique missions and deals three of them for sixty stardust each', () => {
    expect(DAILY_MISSIONS).toHaveLength(10);
    expect(new Set(DAILY_MISSIONS.map((mission) => mission.id)).size).toBe(DAILY_MISSIONS.length);
    expect(DAILY_MISSION_PICK).toBe(3);
    expect(DAILY_MISSION_REWARD).toBe(60);
  });

  it('deals the same three missions for the same date, and exactly three', () => {
    for (const date of ['2026-11-26', '2026-01-01', '2027-06-15']) {
      const a = dailyMissionsFor(date).map((mission) => mission.id);
      const b = dailyMissionsFor(date).map((mission) => mission.id);
      expect(a).toEqual(b);
      expect(a).toHaveLength(3);
      expect(new Set(a).size).toBe(3);
      for (const id of a) expect(DAILY_MISSIONS.some((mission) => mission.id === id)).toBe(true);
    }
  });

  it('deals different hands on different days (loose, over a fixed sample)', () => {
    const hands = Array.from({ length: 14 }, (_, i) =>
      dailyMissionsFor(dateAt(i)).map((mission) => mission.id).join(','),
    );
    expect(new Set(hands).size).toBeGreaterThan(1);
  });
});

describe('rollDaily', () => {
  it('arms a fresh day: the drawn hand, zeroed progress, the double re-armed', () => {
    const econ = rolled('2026-11-26');
    expect(econ.daily.date).toBe('2026-11-26');
    expect(econ.daily.doubled).toBe(false);
    expect(econ.daily.runs).toBe(0);
    expect(econ.daily.missions.map((mission) => mission.id)).toEqual(
      dailyMissionsFor('2026-11-26').map((mission) => mission.id),
    );
    for (const mission of econ.daily.missions) {
      expect(mission.progress).toBe(0);
      expect(mission.done).toBe(false);
    }
  });

  it('keeps today\u2019s progress on a second roll of the same date', () => {
    const econ = rolled('2026-11-26');
    econ.daily.doubled = true;
    econ.daily.missions[0]!.progress = 7;
    rollDaily(econ, '2026-11-26');
    expect(econ.daily.doubled).toBe(true);
    expect(econ.daily.missions[0]!.progress).toBe(7);
  });

  it('redraws and zeroes everything when the date changes', () => {
    const econ = rolled('2026-11-26');
    econ.daily.doubled = true;
    econ.daily.runs = 4;
    for (const mission of econ.daily.missions) mission.progress = 99;
    rollDaily(econ, '2026-11-27');
    expect(econ.daily.date).toBe('2026-11-27');
    expect(econ.daily.doubled).toBe(false);
    expect(econ.daily.runs).toBe(0);
    for (const mission of econ.daily.missions) {
      expect(mission.progress).toBe(0);
      expect(mission.done).toBe(false);
    }
  });
});

describe('doubleFirstRun', () => {
  it('doubles the day\u2019s first run share, then passes later runs through', () => {
    const econ = rolled('2026-11-26');
    expect(doubleFirstRun(econ, 100)).toBe(200);
    expect(econ.daily.doubled).toBe(true);
    expect(doubleFirstRun(econ, 100)).toBe(100);
    expect(doubleFirstRun(econ, 100)).toBe(100);
  });

  it('re-arms after the date rolls over', () => {
    const econ = rolled('2026-11-26');
    expect(doubleFirstRun(econ, 50)).toBe(100);
    rollDaily(econ, '2026-11-27');
    expect(econ.daily.doubled).toBe(false);
    expect(doubleFirstRun(econ, 50)).toBe(100);
  });
});

describe('advanceDaily', () => {
  it('accumulates sum missions across runs and settles each exactly once', () => {
    const date = dateWith('runs', 'perfects');
    const econ = rolledWith(date, 'runs', 'perfects');

    // Run 1: nothing settles yet (runs 1/3, perfects 4/15).
    const first = advanceDaily(econ, run({ perfects: 4 }), false);
    expect(first.missionReward).toBe(0);
    expect(first.settled).toBe(0);

    // Run 2: still short of both lines (runs 2/3, perfects 8/15).
    const second = advanceDaily(econ, run({ perfects: 4 }), false);
    expect(second.missionReward).toBe(0);
    expect(second.settled).toBe(0);

    // Run 3: the runs mission crosses its line — paid once, 60 stardust. Perfects still short.
    const third = advanceDaily(econ, run({ perfects: 4 }), false);
    expect(third.missionReward).toBe(DAILY_MISSION_REWARD);
    expect(third.settled).toBe(1);
    const runsMission = econ.daily.missions.find((mission) => mission.id === 'runs')!;
    expect(runsMission.done).toBe(true);
    expect(runsMission.progress).toBe(3);
    const perfectsMission = econ.daily.missions.find((mission) => mission.id === 'perfects')!;
    expect(perfectsMission.done).toBe(false);
    expect(perfectsMission.progress).toBe(12);

    // Run 4: the done mission stays done and pays nothing again; perfects now settle too.
    const fourth = advanceDaily(econ, run({ perfects: 5 }), false);
    expect(fourth.missionReward).toBe(DAILY_MISSION_REWARD);
    expect(fourth.settled).toBe(1);
    expect(runsMission.progress).toBe(3);
    expect(perfectsMission.done).toBe(true);
    expect(perfectsMission.progress).toBe(15);
  });

  it('keeps the day\u2019s best single-run combo instead of summing (the max template)', () => {
    const date = dateWith('combo');
    const econ = rolledWith(date, 'combo');

    advanceDaily(econ, run({ maxCombo: 60 }), false);
    const combo = econ.daily.missions.find((mission) => mission.id === 'combo')!;
    expect(combo.progress).toBe(60);

    // A weaker run never drags the day's best down, and the goal settles once.
    const weak = advanceDaily(econ, run({ maxCombo: 40 }), false);
    expect(combo.progress).toBe(60);
    expect(weak.missionReward).toBe(0);

    const peak = advanceDaily(econ, run({ maxCombo: 100 }), false);
    expect(combo.progress).toBe(100);
    expect(combo.done).toBe(true);
    expect(peak.missionReward).toBe(DAILY_MISSION_REWARD);

    const after = advanceDaily(econ, run({ maxCombo: 500 }), false);
    expect(combo.progress).toBe(100);
    expect(after.missionReward).toBe(0);
  });

  it('judges level histories for flawless and swift sectors', () => {
    const date = dateWith('flawless', 'swift');
    const econ = rolledWith(date, 'flawless', 'swift');
    const history = [
      level({ time: 12, damageTaken: 0 }), // flawless + swift
      level({ time: 40, damageTaken: 0 }), // flawless only
      level({ time: 8, damageTaken: 2 }), // swift only
    ];
    const outcome = advanceDaily(econ, run({}, history), false);
    const flawless = econ.daily.missions.find((mission) => mission.id === 'flawless')!;
    const swift = econ.daily.missions.find((mission) => mission.id === 'swift')!;
    expect(flawless.progress).toBe(2);
    expect(flawless.done).toBe(false); // target 3
    expect(swift.progress).toBe(2);
    expect(swift.done).toBe(true); // target 2
    expect(outcome.missionReward).toBe(DAILY_MISSION_REWARD);
    expect(outcome.settled).toBe(1);
  });

  it('pays the win mission for a campaign clear only', () => {
    const date = dateWith('win');
    const econ = rolledWith(date, 'win');

    const endless = advanceDaily(econ, run({ mode: 'endless' }), true);
    expect(endless.missionReward).toBe(0);
    const lost = advanceDaily(econ, run({ mode: 'campaign' }), false);
    expect(lost.missionReward).toBe(0);

    const won = advanceDaily(econ, run({ mode: 'campaign' }), true);
    expect(won.missionReward).toBe(DAILY_MISSION_REWARD);
    expect(won.settled).toBe(1);
    expect(econ.daily.missions.find((mission) => mission.id === 'win')!.done).toBe(true);
  });

  it('clamps finished rows at their target so they read target/target', () => {
    const date = dateWith('kills');
    const econ = rolledWith(date, 'kills');
    advanceDaily(econ, run({ kills: 2000 }), false);
    const kills = econ.daily.missions.find((mission) => mission.id === 'kills')!;
    expect(kills.done).toBe(true);
    expect(kills.progress).toBe(600);
  });

  it('counts a full day of three settled missions as 180 stardust', () => {
    const date = dateWith('runs', 'win', 'perfects');
    const econ = rolledWith(date, 'runs', 'win', 'perfects');
    let reward = 0;
    for (let i = 0; i < 3; i++) {
      reward += advanceDaily(econ, run({ perfects: 15, mode: 'campaign' }), true).missionReward;
    }
    expect(econ.daily.runs).toBe(3);
    expect(reward).toBe(180);
    expect(econ.daily.missions.every((mission) => mission.done)).toBe(true);
  });
});

describe('daily state in the save', () => {
  it('repairs a malformed daily block instead of trusting it', () => {
    store.set(
      KEY,
      JSON.stringify({
        version: 2,
        settings: {},
        records: {},
        economy: {
          stardust: 40,
          daily: {
            date: 20261126,
            doubled: 'yes',
            runs: -3,
            missions: [{ id: 'bogus' }, { id: 'kills', progress: 'many' }, { id: 'perfects', progress: 99, done: true }],
          },
        },
      }),
    );
    const econ = loadSave().economy;
    expect(econ.stardust).toBe(40);
    expect(econ.daily.date).toBe('');
    expect(econ.daily.doubled).toBe(false);
    expect(econ.daily.runs).toBe(0);
    // Unknown ids drop; known ids keep their parsed progress, clamped to the target.
    expect(econ.daily.missions.map((mission) => mission.id)).toEqual(['kills', 'perfects']);
    expect(econ.daily.missions.find((mission) => mission.id === 'kills')!.progress).toBe(0);
    expect(econ.daily.missions.find((mission) => mission.id === 'perfects')).toEqual({
      id: 'perfects',
      progress: 15,
      done: true,
    });
  });

  it('round-trips a lived-in daily block', () => {
    const save = defaultSave();
    save.economy.daily = {
      date: '2026-11-26',
      doubled: true,
      runs: 2,
      missions: [
        { id: 'kills', progress: 450, done: false },
        { id: 'perfects', progress: 15, done: true },
        { id: 'win', progress: 0, done: false },
      ],
    };
    storeSave(save);
    expect(loadSave().economy.daily).toEqual(save.economy.daily);
  });

  it('re-rolls a stale save\u2019s daily onto today at the next settle', () => {
    const econ = rolled('2026-11-25');
    econ.daily.doubled = true;
    econ.daily.missions[0]!.progress = 99;
    rollDaily(econ, '2026-11-26');
    expect(econ.daily.date).toBe('2026-11-26');
    expect(econ.daily.doubled).toBe(false);
    expect(econ.daily.missions.every((mission) => mission.progress === 0)).toBe(true);
  });
});

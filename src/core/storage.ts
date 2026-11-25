import type { QualityLevel } from '../render/layout';

export interface Settings {
  /** 0..1 */
  music: number;
  sfx: number;
  shake: boolean;
  flashes: boolean;
  quality: QualityLevel;
  /** Optional fixed run seed. Empty string means "random every run". */
  seed: string;
}

export interface Records {
  /** Furthest level reached (1-based) in each mode. */
  bestCampaign: number;
  bestEndless: number;
  bestScore: number;
  runs: number;
  wins: number;
  bricks: number;
  /** Upgrade ids that have ever been offered or taken. Drives the codex's "discovered" state. */
  discovered: string[];
  /** Finished runs, newest first, trimmed to HISTORY_CAP. The local leaderboard is derived from this. */
  history: RunRecord[];
}

/** One finished run, as shown on the leaderboard and the share card. */
export interface RunRecord {
  mode: 'campaign' | 'endless';
  score: number;
  /** Sector reached: `levelsCleared + 1` on a loss, the last sector on a win. */
  level: number;
  /** Display code of that sector, e.g. "2-3". */
  code: string;
  name: string;
  combo: number;
  damage: number;
  kills: number;
  time: number;
  won: boolean;
  /** Epoch ms. */
  date: number;
  seed: number;
  /** upgrade id → level at the end of the run. */
  build: Record<string, number>;
}

export interface SaveData {
  version: 1;
  settings: Settings;
  records: Records;
}

/** Oldest runs fall off the local leaderboard beyond this. */
export const HISTORY_CAP = 50;

const KEY = 'shatterverse.save.v1';

export const DEFAULT_SETTINGS: Settings = {
  music: 0.55,
  sfx: 0.8,
  shake: true,
  flashes: true,
  quality: 'high',
  seed: '',
};

export const DEFAULT_RECORDS: Records = {
  bestCampaign: 0,
  bestEndless: 0,
  bestScore: 0,
  runs: 0,
  wins: 0,
  bricks: 0,
  discovered: [],
  history: [],
};

export function defaultSave(): SaveData {
  // The array fields are re-created: spreading DEFAULT_RECORDS would share one array between saves.
  return {
    version: 1,
    settings: { ...DEFAULT_SETTINGS },
    records: { ...DEFAULT_RECORDS, discovered: [], history: [] },
  };
}

/** Loads the save, repairing anything missing or malformed so a corrupted entry can never brick the game. */
export function loadSave(): SaveData {
  const save = defaultSave();
  let raw: unknown;
  try {
    raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
  } catch {
    return save;
  }
  if (!raw || typeof raw !== 'object') return save;
  const data = raw as Partial<SaveData>;
  const settings: Partial<Settings> = data.settings ?? {};
  const records: Partial<Records> = data.records ?? {};
  const num = (value: unknown, fallback: number, lo = 0, hi = Number.MAX_SAFE_INTEGER): number =>
    typeof value === 'number' && Number.isFinite(value) ? Math.min(hi, Math.max(lo, value)) : fallback;
  const bool = (value: unknown, fallback: boolean): boolean =>
    typeof value === 'boolean' ? value : fallback;

  save.settings = {
    music: num(settings.music, DEFAULT_SETTINGS.music, 0, 1),
    sfx: num(settings.sfx, DEFAULT_SETTINGS.sfx, 0, 1),
    shake: bool(settings.shake, DEFAULT_SETTINGS.shake),
    flashes: bool(settings.flashes, DEFAULT_SETTINGS.flashes),
    quality:
      settings.quality === 'low' || settings.quality === 'medium' || settings.quality === 'high'
        ? settings.quality
        : 'high',
    seed: typeof settings.seed === 'string' ? settings.seed.slice(0, 24) : '',
  };
  save.records = {
    bestCampaign: Math.floor(num(records.bestCampaign, 0)),
    bestEndless: Math.floor(num(records.bestEndless, 0)),
    bestScore: Math.floor(num(records.bestScore, 0)),
    runs: Math.floor(num(records.runs, 0)),
    wins: Math.floor(num(records.wins, 0)),
    bricks: Math.floor(num(records.bricks, 0)),
    discovered: Array.isArray(records.discovered)
      ? records.discovered.filter((id): id is string => typeof id === 'string')
      : [],
    history: Array.isArray(records.history)
      ? records.history
          .slice(0, HISTORY_CAP)
          .map(parseRunRecord)
          .filter((record): record is RunRecord => record !== null)
          .sort((a, b) => b.date - a.date)
      : [],
  };
  return save;
}

/** Coerces one stored entry, dropping anything malformed rather than keeping a half-record. */
function parseRunRecord(raw: unknown): RunRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<RunRecord>;
  if (r.mode !== 'campaign' && r.mode !== 'endless') return null;
  const num = (value: unknown, fallback = 0): number =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  const build: Record<string, number> = {};
  if (r.build && typeof r.build === 'object') {
    for (const [id, level] of Object.entries(r.build)) {
      if (typeof level === 'number' && Number.isFinite(level) && level > 0) build[id] = Math.floor(level);
    }
  }
  return {
    mode: r.mode,
    score: Math.max(0, Math.floor(num(r.score))),
    level: Math.max(1, Math.floor(num(r.level, 1))),
    code: typeof r.code === 'string' ? r.code.slice(0, 12) : '',
    name: typeof r.name === 'string' ? r.name.slice(0, 24) : '',
    combo: Math.max(0, Math.floor(num(r.combo))),
    damage: Math.max(0, num(r.damage)),
    kills: Math.max(0, Math.floor(num(r.kills))),
    time: Math.max(0, num(r.time)),
    won: r.won === true,
    date: Math.max(0, Math.floor(num(r.date))),
    seed: Math.floor(num(r.seed)),
    build,
  };
}

/**
 * Inserts a finished run into the local leaderboard (newest first) and returns its score rank:
 * 1-based, competition style, so tied scores share a rank. Oldest entries beyond the cap drop off.
 */
export function addRunRecord(records: Records, record: RunRecord): number {
  records.history.unshift(record);
  if (records.history.length > HISTORY_CAP) records.history.length = HISTORY_CAP;
  return runRank(records.history, record.score);
}

/** Rank of a score among a history: 1 plus how many stored runs scored strictly higher. */
export function runRank(history: RunRecord[], score: number): number {
  return 1 + history.filter((entry) => entry.score > score).length;
}

export function storeSave(save: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    // Storage can be unavailable (private mode, quota). The game works fine without persistence.
  }
}

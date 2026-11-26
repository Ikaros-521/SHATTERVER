import { DEFAULT_LANG, isLang, type Lang } from './i18n';
import { DEFAULT_DIFFICULTY, isDifficultyId, type DifficultyId } from '../game/difficulty';
import { isSupplyId } from '../game/economy/catalog';
import { DAILY_MISSION_MAP, isDailyMissionId } from '../game/economy/dailies';
import { isBallSkinId, isBgSkinId, isSkinId } from '../render/skins';
import { isTier, type Tier } from '../render/governor';
import type { QualityLevel } from '../render/layout';
import { APP_VERSION } from './version';

export interface Settings {
  /** 0..1 */
  music: number;
  sfx: number;
  shake: boolean;
  flashes: boolean;
  quality: QualityLevel;
  /** Optional fixed run seed. Empty string means "random every run". */
  seed: string;
  /** The difficulty tier preselected on the starter screen. */
  difficulty: DifficultyId;
  /** True once the first-run tutorial has been shown (finished or skipped) on this device. */
  tutorialSeen: boolean;
  /**
   * Version whose release notes this device has already been shown, e.g. `0.3.0`; empty when none
   * has. A fresh save starts out having seen the running version — there is nothing to update
   * from — while a save written before the changelog existed reads as empty, so that device is
   * shown the notes once on its next launch.
   */
  changelogSeen: string;
  /** Interface language. Chinese is the default regardless of the browser locale. */
  language: Lang;
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
  /** Difficulty tier the run was played on. Older saves read as standard. */
  difficulty: DifficultyId;
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

/** Per-pattern play counters the milestone conditions read. All accumulate forever. */
export interface EconomyCounters {
  perfects: number;
  capsules: number;
  overdrives: number;
  reactions: number;
  bosses: number;
  /** Sectors cleared without taking a hit. */
  flawless: number;
  /** Sectors cleared inside the swift-clear window. */
  swift: number;
}

/** One daily mission's progress inside `EconomyState.daily`. */
export interface DailyMissionState {
  id: string;
  progress: number;
  done: boolean;
}

/** The per-day loop: the first-run double and the day's three missions (see economy/dailies). */
export interface DailyState {
  /** Local day key this state belongs to (`YYYY-MM-DD`), for the lazy daily reset. */
  date: string;
  /** True once the day's first scoring run has had its run share doubled. */
  doubled: boolean;
  /** Scoring runs settled today. */
  runs: number;
  missions: DailyMissionState[];
}

/**
 * Everything the 星尘商店 owns: the wallet, what has been bought and carried, milestone progress
 * and the aggregate counters the milestones read. Earned only by playing — nothing here can be
 * bought with money (see `game/economy/coins.ts` for the earning rules).
 */
export interface EconomyState {
  /** Spendable balance. */
  stardust: number;
  /** Everything ever earned; the progress tab shows it so spending never reads as loss. */
  lifetime: number;
  /** Purchased protocol ids (`game/economy/catalog`). */
  protocols: string[];
  /** Owned supply ids. */
  supplies: string[];
  /** Owned cosmetic skin ids (`render/skins`): ball looks and backdrop themes. */
  skins: string[];
  /** The equipped ball skin id, or null for the free stock look 「原色」. */
  skinBall: string | null;
  /** The equipped backdrop theme id, or null for the chapters' own palettes. */
  skinBg: string | null;
  /** Supplies carried into the next run; bounded by the earned slot count. */
  loadout: string[];
  /** The one catalog item the menu and results screens nudge towards; null clears it. */
  wishlist: string | null;
  /** The unowned supply riding along free for the next run; spent the moment that run opens. */
  trialSupply: string | null;
  /** Earned milestone ids; they settle automatically, there is no claim step. */
  milestones: string[];
  /** Upgrade kinds whose first-use bonus has already been paid. */
  firstUsed: Record<string, boolean>;
  firstGift: boolean;
  /** Local day key of `dailyRunCoins` (`YYYY-MM-DD`), for the daily soft cap. */
  dailyDate: string;
  /** Run earnings counted against today's soft cap; one-time rewards bypass it. */
  dailyRunCoins: number;
  /** The daily loop: first-run double and the day's missions (`game/economy/dailies`). */
  daily: DailyState;
  /** Best combo ever, so combo milestones survive the 50-run history cap. */
  bestCombo: number;
  /** Campaign wins per difficulty tier; first-clear milestones read this. */
  winsByDifficulty: Partial<Record<DifficultyId, number>>;
  /** Campaign wins per opening protocol; the styles milestone reads the free four. */
  winsByStarter: Record<string, number>;
  counters: EconomyCounters;
}

export interface SaveData {
  version: 2;
  settings: Settings;
  records: Records;
  economy: EconomyState;
  /**
   * What this device has learned about its own speed: the render step the quality governor last
   * settled on, when that is below the player's choice. Null until the governor steps down, and
   * cleared as soon as the player picks a quality by hand.
   */
  device: Tier | null;
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
  difficulty: DEFAULT_DIFFICULTY,
  tutorialSeen: false,
  changelogSeen: APP_VERSION,
  language: DEFAULT_LANG,
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

export const DEFAULT_ECONOMY: EconomyState = {
  stardust: 0,
  lifetime: 0,
  protocols: [],
  supplies: [],
  skins: [],
  skinBall: null,
  skinBg: null,
  loadout: [],
  wishlist: null,
  trialSupply: null,
  milestones: [],
  firstUsed: {},
  firstGift: false,
  dailyDate: '',
  dailyRunCoins: 0,
  daily: { date: '', doubled: false, runs: 0, missions: [] },
  bestCombo: 0,
  winsByDifficulty: {},
  winsByStarter: {},
  counters: { perfects: 0, capsules: 0, overdrives: 0, reactions: 0, bosses: 0, flawless: 0, swift: 0 },
};

/** A fresh economy state, with every collection re-created so saves never share arrays. */
export function defaultEconomy(): EconomyState {
  return {
    ...DEFAULT_ECONOMY,
    protocols: [],
    supplies: [],
    skins: [],
    loadout: [],
    milestones: [],
    firstUsed: {},
    winsByDifficulty: {},
    winsByStarter: {},
    counters: { ...DEFAULT_ECONOMY.counters },
    daily: { ...DEFAULT_ECONOMY.daily, missions: [] },
  };
}

export function defaultSave(): SaveData {
  // The array fields are re-created: spreading DEFAULT_RECORDS would share one array between saves.
  return {
    version: 2,
    settings: { ...DEFAULT_SETTINGS },
    records: { ...DEFAULT_RECORDS, discovered: [], history: [] },
    economy: defaultEconomy(),
    device: null,
  };
}

/**
 * Best-effort retro credits for a save from before the shop existed, from whatever the history
 * still holds: the best combo and the campaign wins per difficulty. The history is capped at
 * fifty runs, so this recovers progress approximately — close enough for milestone credit.
 */
function migrateEconomy(records: Records): EconomyState {
  const economy = defaultEconomy();
  for (const record of records.history) {
    economy.bestCombo = Math.max(economy.bestCombo, record.combo);
    if (record.mode === 'campaign' && record.won) {
      economy.winsByDifficulty[record.difficulty] =
        (economy.winsByDifficulty[record.difficulty] ?? 0) + 1;
    }
  }
  return economy;
}

/**
 * Coerces one stored economy state, keeping every well-formed field and dropping the rest.
 * Public because the Toy wallet mirror parses a cloud copy with the same rules (see
 * `net/toywallet.ts`); a malformed mirror therefore reads as "no wallet", never as corruption.
 */
export function parseEconomyState(raw: unknown): EconomyState | null {
  if (!raw || typeof raw !== 'object') return null;
  const e = raw as Partial<EconomyState>;
  const economy = defaultEconomy();
  const num = (value: unknown): number =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  const count = (value: unknown, target: Record<string, number>): void => {
    if (!value || typeof value !== 'object') return;
    for (const [id, n] of Object.entries(value as Record<string, unknown>)) {
      const parsed = num(n);
      if (parsed > 0) target[id] = parsed;
    }
  };

  economy.stardust = num(e.stardust);
  economy.lifetime = Math.max(economy.stardust, num(e.lifetime));
  economy.protocols = Array.isArray(e.protocols)
    ? e.protocols.filter((id): id is string => typeof id === 'string').slice(0, 64)
    : [];
  economy.supplies = Array.isArray(e.supplies) ? e.supplies.filter(isSupplyId) : [];
  // Skins: only real catalog ids survive, and an equip is kept only when it names an owned skin of
  // its own kind — a hand-edited save cannot wear something the wallet never bought.
  economy.skins = Array.isArray(e.skins) ? e.skins.filter(isSkinId) : [];
  economy.skinBall = isBallSkinId(e.skinBall) && economy.skins.includes(e.skinBall) ? e.skinBall : null;
  economy.skinBg = isBgSkinId(e.skinBg) && economy.skins.includes(e.skinBg) ? e.skinBg : null;
  economy.loadout = Array.isArray(e.loadout) ? e.loadout.filter(isSupplyId) : [];
  economy.wishlist = typeof e.wishlist === 'string' ? e.wishlist : null;
  // A trial only ever names a real supply; anything else reads as no trial at all.
  economy.trialSupply = typeof e.trialSupply === 'string' && isSupplyId(e.trialSupply) ? e.trialSupply : null;
  economy.milestones = Array.isArray(e.milestones)
    ? e.milestones.filter((id): id is string => typeof id === 'string').slice(0, 128)
    : [];
  economy.firstUsed = {};
  if (e.firstUsed && typeof e.firstUsed === 'object') {
    for (const [id, flag] of Object.entries(e.firstUsed as Record<string, unknown>)) {
      if (flag === true) economy.firstUsed[id] = true;
    }
  }
  economy.firstGift = e.firstGift === true;
  economy.dailyDate = typeof e.dailyDate === 'string' ? e.dailyDate.slice(0, 10) : '';
  economy.dailyRunCoins = num(e.dailyRunCoins);
  // The daily loop state: keep the well-formed fields, rebuild the rest. An empty date (or a
  // mission set that no longer matches its day's draw) re-rolls onto today at the next settle,
  // so a mangled entry can only cost today's progress, never the wallet.
  if (e.daily && typeof e.daily === 'object') {
    const d = e.daily as Partial<DailyState>;
    economy.daily.date = typeof d.date === 'string' ? d.date.slice(0, 10) : '';
    economy.daily.doubled = d.doubled === true;
    economy.daily.runs = num(d.runs);
    if (Array.isArray(d.missions)) {
      for (const entry of d.missions) {
        if (!entry || typeof entry !== 'object') continue;
        const m = entry as Partial<DailyMissionState>;
        if (!isDailyMissionId(m.id)) continue;
        economy.daily.missions.push({
          id: m.id,
          progress: Math.min(num(m.progress), DAILY_MISSION_MAP[m.id].target),
          done: m.done === true,
        });
      }
    }
  }
  economy.bestCombo = num(e.bestCombo);
  count(e.winsByDifficulty, economy.winsByDifficulty as Record<string, number>);
  count(e.winsByStarter, economy.winsByStarter);
  if (e.counters && typeof e.counters === 'object') {
    for (const key of Object.keys(economy.counters) as (keyof EconomyCounters)[]) {
      economy.counters[key] = num((e.counters as unknown as Record<string, unknown>)[key]);
    }
  }
  return economy;
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
    difficulty: isDifficultyId(settings.difficulty) ? settings.difficulty : DEFAULT_DIFFICULTY,
    tutorialSeen: bool(settings.tutorialSeen, DEFAULT_SETTINGS.tutorialSeen),
    // Deliberately not the default: only a save that predates the field lacks it, and that
    // device has never seen the notes.
    changelogSeen: typeof settings.changelogSeen === 'string' ? settings.changelogSeen.slice(0, 16) : '',
    language: isLang(settings.language) ? settings.language : DEFAULT_SETTINGS.language,
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
  // A stored economy state is kept field by field; anything else (a v1 save, a corrupted one)
  // migrates from the records, so old progress still counts towards the milestones.
  save.economy = parseEconomyState(data.economy) ?? migrateEconomy(save.records);
  // Only the two known fields are kept, and only when they name a real step.
  save.device = isTier(data.device) ? { quality: data.device.quality, scale: data.device.scale } : null;
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
    difficulty: isDifficultyId(r.difficulty) ? r.difficulty : 'standard',
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

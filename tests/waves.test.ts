import { describe, expect, it } from 'vitest';
import { RNG } from '../src/core/rng';
import { en } from '../src/i18n/en';
import { ja } from '../src/i18n/ja';
import { ko } from '../src/i18n/ko';
import { zh } from '../src/i18n/zh';
import {
  ENDLESS_WAVES,
  SECTOR_CLEAR_CRYSTALS_BASE,
  SECTOR_CLEAR_CRYSTALS_PER_LEVEL,
} from '../src/game/config';
import {
  BOSS_EVERY,
  buildLevel,
  CAMPAIGN_LENGTH,
  isBossLevel,
  sectorStart,
  waveOf,
  wavesInLevel,
  type LevelPlan,
} from '../src/game/levels/generator';
import { Session, type SessionEvents } from '../src/game/session';
import type { UpgradeDef } from '../src/game/upgrades/types';
import { sensible } from './sim';
import type { World } from '../src/game/world';

const DT = 1 / 60;

interface Log {
  levels: SessionEvents['level'][];
  drafts: SessionEvents['draft'][];
  clears: SessionEvents['sectorClear'][];
  /** Crystal balance just before each sector's bonus was booked. */
  beforeClear: number[];
}

/** Runs the session until `done` holds or `seconds` pass. With `autoDraft`, drafts take their first option. */
function play(session: Session, done: () => boolean, seconds: number, autoDraft = false): void {
  let t = 0;
  while (!done() && t < seconds) {
    if (autoDraft && session.phase === 'draft') session.choose(session.draft[0]?.id ?? '');
    session.update(DT);
    t += DT;
  }
}

/**
 * Shatters every brick on screen at once, then plays the clear out: until the next wave has
 * opened or — on a sector's last wave — its drafts are up. Returns the wave that fell. With
 * `plain`, the bricks are downgraded first so none of them drops a shield repair.
 */
function clearWave(session: Session, plain = false): World {
  const world = session.world;
  play(session, () => world.state === 'playing', 5);
  expect(world.state).toBe('playing');
  for (const brick of world.bricks) {
    if (brick.dead) continue;
    if (plain) brick.type = 'normal';
    world.killBrick(brick, {
      x: brick.x,
      y: brick.y,
      power: 1,
      source: 'ball',
      ball: null,
      crit: false,
      explosion: false,
    });
  }
  const moved = (): boolean => session.world !== world || session.phase === 'draft';
  play(session, moved, 10);
  expect(moved(), 'the wave never cleared').toBe(true);
  return world;
}

/** Drains the player's shield, respecting invulnerability frames. */
function killPlayer(session: Session): void {
  const world = session.world;
  play(session, () => world.state === 'playing', 5);
  while (world.state === 'playing') {
    world.damagePlayer(1);
    if (world.state === 'playing') play(session, () => false, 1.0);
  }
  play(session, () => session.phase === 'over', 10);
}

function record(session: Session): Log {
  const log: Log = { levels: [], drafts: [], clears: [], beforeClear: [] };
  session.events.on('level', (event) => log.levels.push(event));
  session.events.on('draft', (event) => log.drafts.push(event));
  // The bonus is booked before the event goes out, so this reads the balance it was added to.
  session.events.on('sectorClear', (event) => {
    log.clears.push(event);
    log.beforeClear.push(session.run.crystals - event.crystals);
  });
  return log;
}

const shape = (plan: LevelPlan): string =>
  plan.cells.map((cell) => `${cell.col},${cell.row},${cell.type}`).join(';');

describe('wave sectors: which levels are waves', () => {
  it('pairs the endless mode’s ordinary levels into two-wave sectors, and touches nothing else', () => {
    expect(CAMPAIGN_LENGTH).toBe(15);
    expect(ENDLESS_WAVES).toBe(2);
    for (let level = 1; level <= 150; level++) {
      expect(wavesInLevel(level), `level ${level}`).toBe(
        level > CAMPAIGN_LENGTH && !isBossLevel(level) ? ENDLESS_WAVES : 1,
      );
    }
    // The campaign is as it was; past it, two waves, two waves, boss — for as long as the run lasts.
    expect([15, 16, 17, 18, 19, 20, 21, 24, 25, 40, 41].map(wavesInLevel)).toEqual([
      1, 2, 2, 2, 2, 1, 2, 2, 1, 1, 2,
    ]);
  });

  it('numbers the waves so that a sector never straddles a boss', () => {
    // Four ordinary levels between two bosses, whole sectors wide.
    expect((BOSS_EVERY - 1) % ENDLESS_WAVES).toBe(0);
    for (let level = CAMPAIGN_LENGTH + 1; level <= 150; level++) {
      if (isBossLevel(level)) continue;
      const wave = waveOf(level);
      const waves = wavesInLevel(level);
      expect(wave, `level ${level}`).toBeGreaterThanOrEqual(1);
      expect(wave, `level ${level}`).toBeLessThanOrEqual(waves);
      if (wave < waves) {
        // Not the sector's last: the next level is its next wave, in the same sector.
        expect(waveOf(level + 1), `level ${level} continues`).toBe(wave + 1);
        expect(sectorStart(level + 1)).toBe(sectorStart(level));
      } else {
        // The sector's last: what follows is a boss or a new sector, never a third wave.
        expect(waveOf(level + 1), `level ${level} closes the sector`).toBe(1);
        expect(sectorStart(level)).toBeLessThan(level);
      }
      expect(waveOf(sectorStart(level))).toBe(1);
    }
    expect([16, 17, 18, 19, 20, 21, 22, 23, 24, 25].map(waveOf)).toEqual([1, 2, 1, 2, 1, 1, 2, 1, 2, 1]);
    expect([16, 17, 18, 19, 20, 21].map(sectorStart)).toEqual([16, 16, 18, 18, 20, 21]);
    // Single-wave levels are a sector of their own.
    expect([1, 5, 9, 15].map((level) => [waveOf(level), sectorStart(level)])).toEqual([
      [1, 1],
      [1, 5],
      [1, 9],
      [1, 15],
    ]);
  });

  it('gives a sector its first level’s code, and leaves the campaign codes alone', () => {
    const code = (level: number): string => buildLevel(level, new RNG(3)).code;
    // Two waves share a code; a chapter reads `4-1 · 4-2 · 4-3`.
    expect([16, 17, 18, 19, 20].map(code)).toEqual(['4-1', '4-1', '4-2', '4-2', '4-3']);
    expect([21, 22, 23, 24, 25].map(code)).toEqual(['5-1', '5-1', '5-2', '5-2', '5-3']);
    expect([1, 2, 3, 4, 5].map(code)).toEqual(['1-1', '1-2', '1-3', '1-4', '1-5']);
    expect(code(15)).toBe('3-5');
  });

  it('keeps every wave the level it always was: its own wall, tougher than the one before', () => {
    // Each level draws from a stream of its own in a session; so do these.
    const plan = (level: number): LevelPlan => buildLevel(level, new RNG(77 + level));
    expect(shape(plan(17))).not.toBe(shape(plan(16)));
    // Brick toughness still climbs level by level: a sector's second wave is the level it is,
    // not a replay of the sector's first.
    expect(plan(17).hpUnit).toBeGreaterThan(plan(16).hpUnit);
    expect(plan(19).hpUnit).toBeGreaterThan(plan(18).hpUnit);
    expect(plan(17).parTime).toBeGreaterThan(plan(16).parTime);
    // Deterministic as ever.
    expect(plan(17)).toEqual(buildLevel(17, new RNG(77 + 17)));
  });
});

describe('wave sectors: the session', () => {
  it('hands from the first wave to the second with no draft in between, and counts each as a level', () => {
    const session = new Session('endless', 5, { level: 16, bot: true });
    const log = record(session);
    const phases: string[] = [];
    session.events.on('phase', ({ phase }) => phases.push(phase));

    const first = clearWave(session);
    expect(session.phase).toBe('playing');
    // The wave was a level: counted, and written to the history under its own number.
    expect(session.run.level).toBe(17);
    expect(session.run.levelsCleared).toBe(1);
    expect(session.run.history).toEqual([
      {
        level: 16,
        name: first.level.name,
        time: first.time,
        killed: first.killed,
        maxCombo: first.maxCombo,
        damageTaken: first.damageTaken,
      },
    ]);
    expect(log.drafts).toHaveLength(0);
    expect(log.clears).toHaveLength(0);
    expect(log.levels.map(({ plan }) => [plan.index, plan.wave, plan.waves])).toEqual([[17, 2, 2]]);
    // No phase went by: to the interface it is the same run of play, a new wall.
    expect(phases).toEqual([]);
    // What the first wave earned is already the run's, and its shield carried over.
    expect(session.run.kills).toBe(first.killed);
    expect(session.run.hp).toBe(first.hp);
    expect(session.world.hp).toBe(first.hp);
    // Same sector: one name, one code, its second wall.
    expect(session.world.level.name).toBe(first.level.name);
    expect(session.world.level.code).toBe(first.level.code);
    expect(shape(session.world.level)).not.toBe(shape(first.level));

    const second = clearWave(session);
    expect(session.phase).toBe('draft');
    expect(session.run.level).toBe(17);
    expect(session.run.levelsCleared).toBe(2);
    expect(session.run.history.map((entry) => [entry.level, entry.time, entry.killed])).toEqual([
      [16, first.time, first.killed],
      [17, second.time, second.killed],
    ]);
    expect(log.clears).toHaveLength(1);
    expect(log.drafts).toHaveLength(1);
    // A sector's clear is the run's own to announce, exactly like any level's.
    expect(phases).toEqual(['draft']);
  });

  it('pays the sector once, at its end: crystals, a point of shield, and the drafts', () => {
    const session = new Session('endless', 9, { level: 16, bot: true });
    const log = record(session);
    clearWave(session);
    // Worn down by the first wave, as a real run would be.
    session.world.hp = 2;
    clearWave(session, true);

    const crystals = 2 * (SECTOR_CLEAR_CRYSTALS_BASE + SECTOR_CLEAR_CRYSTALS_PER_LEVEL * 17);
    expect(crystals).toBe(84);
    expect(log.beforeClear).toHaveLength(1);
    expect(session.run.crystals).toBe((log.beforeClear[0] ?? 0) + crystals);
    expect(session.run.hp).toBe(3);
    expect(log.clears).toEqual([
      { plan: expect.objectContaining({ index: 17, waves: 2, wave: 2 }), crystals, shield: 1, picks: 2 },
    ]);
    expect(log.drafts).toHaveLength(1);
    expect(log.drafts[0]?.reward).toEqual({ crystals, shield: 1, picks: 2, pick: 1 });
  });

  it('restores no shield past the cap, and says so', () => {
    const session = new Session('endless', 9, { level: 16, bot: true });
    const log = record(session);
    session.world.hp = session.run.maxHp;
    clearWave(session);
    expect(session.world.hp, 'carried across the wave').toBe(session.run.maxHp);
    clearWave(session, true);
    expect(log.clears[0]?.shield).toBe(0);
    expect(session.run.hp).toBe(session.run.maxHp);
    expect(log.drafts.at(-1)?.reward?.shield).toBe(0);
  });

  it('deals each wave the draft it earned, back to back, before the next sector opens', () => {
    const session = new Session('endless', 9, { level: 16, bot: true });
    const log = record(session);
    const taken: UpgradeDef[] = [];
    session.events.on('pick', ({ def }) => taken.push(def));
    clearWave(session);
    clearWave(session);
    expect(session.phase).toBe('draft');

    for (const pick of [1, 2]) {
      expect(session.phase, `draft ${pick}`).toBe('draft');
      expect(session.run.level, `still level 17 at draft ${pick}`).toBe(17);
      expect(log.drafts.at(-1)?.reward?.pick).toBe(pick);
      expect(session.draft).toHaveLength(3);
      // Each draft is priced as the level that earned it: the first as level 16's, the second as 17's.
      expect(session.rerollCost, `reroll at draft ${pick}`).toBe(15 + (15 + pick) * 6);
      expect(session.choose(session.draft[0]?.id ?? '')).toBe(true);
    }
    expect(taken).toHaveLength(2);
    expect(session.phase).toBe('playing');
    expect(session.run.level).toBe(18);
    expect(session.world.level.wave).toBe(1);
    expect(session.world.level.code).toBe('4-2');
    expect(session.run.levelsCleared).toBe(2);
    // The waves paid for two drafts and no more: the next sector brings none of its own.
    expect(log.drafts).toHaveLength(2);
    expect(log.levels.map(({ plan }) => [plan.index, plan.wave])).toEqual([
      [17, 2],
      [18, 1],
    ]);
  });

  it('starts each draft’s rerolls afresh, as a draft of its own', () => {
    const session = new Session('endless', 9, { level: 16, bot: true });
    const log = record(session);
    clearWave(session);
    clearWave(session);
    session.run.crystals = 1_000_000;
    const base = session.rerollCost;
    expect(session.reroll()).toBe(true);
    expect(session.rerollCost).toBe(base + 12);
    // A reroll does not spend the pick: the draft is still the first of the sector's.
    expect(log.drafts.at(-1)?.reward?.pick).toBe(1);
    expect(session.choose(session.draft[0]?.id ?? '')).toBe(true);
    expect(session.rerollCost, 'the second draft is a fresh one').toBe(base + 6);
    expect(session.choose(session.draft[0]?.id ?? '')).toBe(true);
    expect(session.phase).toBe('playing');
  });

  it('pays a skipped draft like any other, every time', () => {
    const session = new Session('endless', 9, { level: 16, bot: true });
    clearWave(session);
    clearWave(session);
    const before = session.run.crystals;
    const reward = session.skipReward;
    for (const pick of [1, 2]) {
      expect(session.phase, `skip ${pick}`).toBe('draft');
      expect(session.skip()).toBe(true);
    }
    expect(session.run.crystals).toBe(before + 2 * reward);
    expect(session.phase).toBe('playing');
    expect(session.run.level).toBe(18);
  });

  it('counts a loss in the second wave as the level it died in, exactly once', () => {
    const session = new Session('endless', 3, { level: 16, bot: true });
    const log = record(session);
    const first = clearWave(session);
    const second = session.world;
    killPlayer(session);

    expect(session.phase).toBe('over');
    // One level cleared (the first wave), the second one reached: level 17 is where it ended.
    expect(session.run.levelsCleared).toBe(1);
    expect(session.run.level).toBe(17);
    expect(session.run.history.map((entry) => entry.level)).toEqual([16]);
    expect(session.run.hp).toBe(0);
    expect(session.run.kills).toBe(first.killed + second.killed);
    expect(session.run.damageTaken).toBe(first.damageTaken + second.damageTaken);
    expect(log.clears).toHaveLength(0);
    expect(log.drafts).toHaveLength(0);
  });

  it('leaves single-wave levels exactly as they were', () => {
    const session = new Session('campaign', 4, { bot: true });
    const log = record(session);
    expect(session.world.level.waves).toBe(1);
    play(session, () => session.phase === 'draft', 180);
    expect(session.phase).toBe('draft');
    expect(session.run.levelsCleared).toBe(1);
    expect(log.drafts).toHaveLength(1);
    expect(log.drafts[0]?.reward).toBeNull();
    expect(log.clears).toHaveLength(0);
    expect(session.run.history).toHaveLength(1);
    expect(log.levels).toHaveLength(0);

    const boss = new Session('endless', 4, { level: 20, bot: true });
    const bossLog = record(boss);
    const bossWorld = clearWave(boss);
    expect(boss.phase).toBe('draft');
    expect(boss.world).toBe(bossWorld);
    expect(boss.world.level.waves).toBe(1);
    expect(boss.world.boss?.dead).toBe(true);
    expect(bossLog.clears).toHaveLength(0);
    expect(bossLog.drafts[0]?.reward).toBeNull();
    // The breather between chapters is the boss's own, and untouched.
    expect(boss.run.hp).toBe(Math.min(boss.run.maxHp, bossWorld.hp + 1));
  });

  it('walks from a sector through its drafts and the next one to a boss with nothing left over', () => {
    const session = new Session('endless', 8, { level: 17, bot: true });
    const log = record(session);
    const opened = (): [number, number, number][] =>
      log.levels.map(({ plan }) => [plan.index, plan.wave, plan.waves]);

    // Opened on a sector's second wave (a debug start): it still settles that sector.
    clearWave(session);
    expect(session.phase).toBe('draft');
    expect(log.drafts[0]?.reward?.picks).toBe(2);
    session.choose(session.draft[0]?.id ?? '');
    session.choose(session.draft[0]?.id ?? '');
    expect(opened()).toEqual([[18, 1, 2]]);
    expect(session.run.level).toBe(18);

    clearWave(session);
    expect(session.phase).toBe('playing');
    clearWave(session);
    expect(session.phase).toBe('draft');
    // Each event is a snapshot: the first sector's drafts still read 1 and 2.
    expect(log.drafts.filter((event) => event.reward).map((event) => event.reward?.pick)).toEqual([1, 2, 1]);
    session.choose(session.draft[0]?.id ?? '');
    session.choose(session.draft[0]?.id ?? '');
    expect(opened()).toEqual([
      [18, 1, 2],
      [19, 2, 2],
      [20, 1, 1],
    ]);
    expect(session.world.level.boss).not.toBeNull();

    clearWave(session);
    expect(session.phase).toBe('draft');
    // A boss is a level of its own: no sector behind it, so no bonus and no second draft.
    expect(log.drafts.at(-1)?.reward).toBeNull();
    expect(log.clears).toHaveLength(2);
    session.choose(session.draft[0]?.id ?? '');
    expect(opened().at(-1)).toEqual([21, 1, 2]);
    expect(session.run.levelsCleared).toBe(4);
    expect(session.run.history.map((entry) => entry.level)).toEqual([17, 18, 19, 20]);
  });
});

describe('wave sectors: a played sector', () => {
  const starter = {
    id: 'waves-test',
    name: '',
    en: '',
    desc: '',
    color: 0,
    // A build a run carries by the second endless lap, near enough: strong enough that the bot's
    // catches, not its damage, decide whether a sector is cleared.
    grants: {
      multiball: 5,
      power: 5,
      wide: 3,
      pierce: 4,
      crit: 5,
      split: 4,
      fire: 5,
      shatter: 3,
      explosive: 5,
      shield: 2,
      slowfield: 2,
      laser: 4,
      bigball: 3,
      homing: 3,
      empower: 4,
      echo: 3,
      frost: 4,
      shock: 5,
      combo: 3,
      solar: 3,
      orbital: 3,
    },
    crystals: 0,
  };

  // Each starts on a sector's first wave and settles onto a level that opens a sector of its own.
  for (const [seed, level] of [
    [11, 16],
    [12, 18],
    [13, 21],
  ] as const) {
    it(`plays levels ${level}–${level + 1} wave by wave (seed ${seed}) and settles them as one sector`, () => {
      const session = new Session('endless', seed, { level, bot: true, starter });
      const log = record(session);
      const picks: UpgradeDef[] = [];
      session.events.on('pick', ({ def }) => picks.push(def));

      play(session, () => session.phase !== 'playing', 900);

      expect(session.phase, 'the sector ends on its drafts').toBe('draft');
      expect(session.run.level).toBe(level + 1);
      expect(log.levels.map(({ plan }) => [plan.index, plan.wave])).toEqual([[level + 1, 2]]);
      expect(log.clears).toHaveLength(1);
      // Two waves, two levels in the books, each with its own numbers.
      expect(session.run.history.map((entry) => entry.level)).toEqual([level, level + 1]);
      expect(session.run.history[0]?.time).toBeGreaterThan(0);
      expect(session.run.history[1]?.time).toBeGreaterThan(0);
      expect(session.run.history[0]?.killed).toBeGreaterThan(12);
      expect(session.run.history[1]?.killed).toBeGreaterThan(12);
      expect(session.run.levelsCleared).toBe(2);
      expect(session.run.kills).toBe(
        (session.run.history[0]?.killed ?? 0) + (session.run.history[1]?.killed ?? 0),
      );
      expect(session.run.maxCombo).toBe(
        Math.max(session.run.history[0]?.maxCombo ?? 0, session.run.history[1]?.maxCombo ?? 0),
      );

      for (let i = 0; i < 2; i++) {
        const pick = sensible(session.draft, session.run.upgrades, new RNG(seed + i));
        expect(pick, `draft ${i + 1} offers something`).not.toBeNull();
        expect(log.drafts.at(-1)?.reward?.pick).toBe(i + 1);
        expect(session.choose(pick?.id ?? '')).toBe(true);
      }
      expect(picks).toHaveLength(2);
      expect(session.phase).toBe('playing');
      expect(session.run.level).toBe(level + 2);
      expect(session.world.level.wave).toBe(1);
    }, 120_000);
  }
});

describe('wave sectors: copy', () => {
  // The economy copy test's list, plus the commerce and chance words the review has rejected
  // since. Nothing a sector's clear bonus has to say needs any of them.
  const BANNED =
    /死|杀|血|毒|疫|瘟|处决|邪魔|武器|弹药|军事|尸体|0MB|免安装|极致|最强|顶级|第一|唯一|绝对|充值|付费|收费|内购|购买|礼包|抽奖|抽卡|计费|入账|钱包|到账|提现|ガチャ|課金|가챠|과금/;
  const BANNED_LATIN =
    /\b(KILLER|WEAPON|DEATH|BOMB|PAY|PAYS|PAID|BUY|WALLET|PURCHASE|GACHA|GAMBLE|CASINO|LOOT)\b/i;

  /** Every string the feature added, per locale. Filled by hand so a new key cannot slip by unseen. */
  const KEYS = [
    'hud.wave',
    'draft.rewardEyebrow',
    'draft.rewardTitle',
    'draft.rewardCrystals',
    'draft.rewardShield',
    'draft.rewardPicks',
    'callouts.waveClearSub',
    'callouts.waveCount',
  ];
  const at = (dict: object, path: string): unknown =>
    path
      .split('.')
      .reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key], dict);

  it('is defined in all four languages, with the same placeholders', () => {
    for (const key of KEYS) {
      const placeholders = (text: string): string[] =>
        [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? '').sort();
      const canonical = at(zh, key);
      expect(typeof canonical, `zh.${key}`).toBe('string');
      for (const [name, dict] of Object.entries({ en, ja, ko })) {
        const text = at(dict, key);
        expect(typeof text, `${name}.${key}`).toBe('string');
        expect(placeholders(text as string), `${name}.${key} placeholders`).toEqual(
          placeholders(canonical as string),
        );
      }
    }
  });

  it('stays inside the platform review vocabulary in every language', () => {
    for (const [name, dict] of Object.entries({ zh, en, ja, ko })) {
      for (const key of KEYS) {
        const text = at(dict, key) as string;
        expect(text, `${name}.${key}`).not.toMatch(BANNED);
        expect(text, `${name}.${key}`).not.toMatch(BANNED_LATIN);
      }
    }
  });

  it('reads the way the game names things', () => {
    expect(zh.hud.wave).toBe('波次 {n}/{total}');
    expect(zh.draft.rewardTitle).toBe('关卡结束奖励');
    expect(zh.draft.rewardShield).toBe('护盾 +{n}');
    expect(zh.callouts.sectorClearSub).toBe('关卡清除');
    // It is a wave of the same sector, not a new one: both words the game already uses for it.
    expect(zh.callouts.waveClearSub).not.toMatch(/关/);
    expect(en.hud.wave).toBe('Wave {n}/{total}');
  });
});

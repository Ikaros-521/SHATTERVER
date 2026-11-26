import { describe, expect, it } from 'vitest';
import { defaultEconomy, DEFAULT_RECORDS, type Records } from '../src/core/storage';
import {
  CAMPAIGN_CLEAR_BONUS,
  DAILY_RUN_SOFT_CAP,
  FIRST_GIFT,
  FIRST_USE_REWARD,
  applyDailyHalving,
  dayKey,
  runCoins,
} from '../src/game/economy/coins';
import {
  LOADOUT_SLOTS,
  PRECHARGE_ENERGY,
  PROTOCOLS,
  SECOND_WIND_HP,
  SLOT_GATES,
  SUPPLIES,
  SUPPLY_CRYSTALS,
  slotLimit,
  supplyCost,
} from '../src/game/economy/catalog';
import { MILESTONES, MILESTONE_TOTAL, settleMilestones } from '../src/game/economy/milestones';
import { UPGRADE_MAP } from '../src/game/upgrades/defs';
import { MAX_HP_BASE } from '../src/game/config';
import { STARTERS, type Starter } from '../src/game/starters';
import { Session } from '../src/game/session';

const blank = (): Starter => STARTERS.find((starter) => starter.id === 'blank')!;

describe('run coins', () => {
  it('pays the measured archetypes the rates the design promises', () => {
    // A weak first run, ~2.5 minutes, ~10k score.
    expect(runCoins(150, 10_000, false)).toEqual({ timeCoins: 15, scoreCoins: 6, clearBonus: 0, total: 21 });
    // A standard campaign win, ~5.5 minutes, ~700k score.
    expect(runCoins(330, 700_000, true)).toEqual({
      timeCoins: 33,
      scoreCoins: 52,
      clearBonus: CAMPAIGN_CLEAR_BONUS,
      total: 145,
    });
  });

  it('quadruples score into double coins (square-root share)', () => {
    expect(runCoins(0, 1_000_000, false).scoreCoins).toBe(62);
    expect(runCoins(0, 4_000_000, false).scoreCoins).toBe(125);
  });

  it('never goes negative', () => {
    expect(runCoins(-5, -1, true).total).toBe(CAMPAIGN_CLEAR_BONUS);
  });

  it('applies the daily soft cap: full inside the room, exactly half beyond it', () => {
    expect(applyDailyHalving(100, 0)).toBe(100);
    expect(applyDailyHalving(2000, 0)).toBe(Math.floor(DAILY_RUN_SOFT_CAP + 500 / 2));
    expect(applyDailyHalving(2000, 1000)).toBe(500 + 750);
    expect(applyDailyHalving(100, DAILY_RUN_SOFT_CAP - 100)).toBe(100);
    expect(applyDailyHalving(100, DAILY_RUN_SOFT_CAP - 10)).toBe(Math.floor(10 + 90 / 2));
    expect(applyDailyHalving(100, DAILY_RUN_SOFT_CAP)).toBe(50);
  });

  it('keys the soft cap by local calendar day', () => {
    expect(dayKey(new Date(2026, 10, 26, 23, 59))).toBe('2026-11-26');
    expect(dayKey(new Date(2026, 0, 3, 0, 5))).toBe('2026-01-03');
  });
});

describe('catalog', () => {
  it('offers fourteen protocols with unique ids that never collide with the free starters', () => {
    expect(PROTOCOLS).toHaveLength(14);
    const free = new Set(STARTERS.map((starter) => starter.id));
    const ids = PROTOCOLS.map((protocol) => protocol.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(free.has(id)).toBe(false);
  });

  it('only grants real upgrades, within their level caps, and prices never step down', () => {
    let previous = 0;
    for (const protocol of PROTOCOLS) {
      expect(protocol.price).toBeGreaterThanOrEqual(previous);
      previous = protocol.price;
      for (const [id, level] of Object.entries(protocol.grants)) {
        const def = UPGRADE_MAP[id];
        expect(def, `${protocol.id} grants ${id}`).toBeTruthy();
        expect(level).toBeLessThanOrEqual(def!.maxLevel);
      }
      expect(protocol.crystals).toBeGreaterThanOrEqual(0);
    }
  });

  it('prices the full protocol shelf at 10,200', () => {
    expect(PROTOCOLS.reduce((sum, protocol) => sum + protocol.price, 0)).toBe(10_200);
  });

  it('offers six supplies whose slots exceed the loadout, so carrying is a choice', () => {
    expect(SUPPLIES).toHaveLength(6);
    expect(new Set(SUPPLIES.map((supply) => supply.id)).size).toBe(SUPPLIES.length);
    expect(supplyCost(SUPPLIES.map((supply) => supply.id))).toBeGreaterThan(LOADOUT_SLOTS);
    for (const supply of SUPPLIES) {
      expect(supply.slots).toBeGreaterThanOrEqual(1);
      expect(supply.slots).toBeLessThanOrEqual(2);
    }
  });

  it('earns loadout slots by playing, never by buying', () => {
    expect(slotLimit(0, 0)).toBe(1);
    expect(slotLimit(9, 0)).toBe(1);
    expect(slotLimit(10, 0)).toBe(2);
    expect(slotLimit(0, 1)).toBe(3);
    expect(slotLimit(SLOT_GATES[0]!.count, 0)).toBe(2);
    expect(slotLimit(SLOT_GATES[0]!.count, 1)).toBe(3);
  });
});

describe('milestones', () => {
  const records = (overrides: Partial<Records> = {}): Records => ({
    ...DEFAULT_RECORDS,
    discovered: [],
    history: [],
    ...overrides,
  });

  it('pays a lifetime ceiling above thirteen thousand', () => {
    expect(MILESTONE_TOTAL).toBe(MILESTONES.reduce((sum, m) => sum + m.reward, 0));
    expect(MILESTONE_TOTAL).toBeGreaterThan(13_000);
  });

  it('settles only what the record supports, then stays settled', () => {
    const econ = defaultEconomy();
    const rec = records({ runs: 30, wins: 6, bricks: 12_000, bestEndless: 16 });
    econ.counters.perfects = 1;
    econ.counters.flawless = 2;
    econ.bestCombo = 320;
    econ.winsByDifficulty['hard'] = 1;

    const { earned, reward } = settleMilestones(rec, econ);
    for (const id of ['perfect', 'flawless', 'win1', 'win5', 'diff-hard', 'end15', 'combo300', 'runs30', 'bricks10k']) {
      expect(earned, id).toContain(id);
    }
    expect(earned).not.toContain('end20');
    expect(earned).not.toContain('win15');
    expect(reward).toBe(
      earned.reduce((sum, id) => sum + (MILESTONES.find((m) => m.id === id)?.reward ?? 0), 0),
    );
    expect(econ.stardust).toBe(0); // settling reports; the caller books the balance

    const again = settleMilestones(rec, econ);
    expect(again.earned).toEqual([]);
    expect(again.reward).toBe(0);
  });

  it('styles wants a campaign win under each free protocol', () => {
    const econ = defaultEconomy();
    const rec = records();
    expect(settleMilestones(rec, econ).earned).not.toContain('styles');
    for (const id of ['blank', 'barrage', 'battery', 'element']) econ.winsByStarter[id] = 1;
    econ.winsByStarter['bulwark'] = 4; // shop protocols do not count towards the four
    expect(settleMilestones(rec, econ).earned).toContain('styles');
  });
});

describe('supplies in a session', () => {
  it('spare shield raises the cap and fills itself', () => {
    const plain = new Session('campaign', 11, {});
    expect(plain.run.maxHp).toBe(MAX_HP_BASE);
    const carried = new Session('campaign', 11, { supplies: ['spare'] });
    expect(carried.run.maxHp).toBe(MAX_HP_BASE + 1);
    expect(carried.run.hp).toBe(MAX_HP_BASE + 1);
  });

  it('crystal cache tops up a blank protocol', () => {
    const session = new Session('campaign', 11, { starter: blank(), supplies: ['cache'] });
    expect(session.run.crystals).toBe(60 + SUPPLY_CRYSTALS);
  });

  it('pre-charge opens every sector with a half meter', () => {
    const plain = new Session('campaign', 12, {});
    expect(plain.world.energy).toBe(0);
    const session = new Session('campaign', 12, { supplies: ['precharge'] });
    expect(session.world.energy).toBe(PRECHARGE_ENERGY);
  });

  it('free reroll makes the first reroll of a draft free, and only the first', () => {
    const session = new Session('campaign', 13, { supplies: ['reroll', 'headstart'] });
    session.start();
    expect(session.phase).toBe('draft');
    expect(session.rerollCost).toBe(0);
    expect(session.reroll()).toBe(true);
    expect(session.rerolls).toBe(1);
    expect(session.rerollCost).toBe(15 + 6 + 12);
  });

  it('head start holds a draft before sector one; picking keeps the level, skipping pays nothing', () => {
    const pick = new Session('campaign', 14, { supplies: ['headstart'] });
    pick.start();
    expect(pick.phase).toBe('draft');
    expect(pick.draft).toHaveLength(3);
    const id = pick.draft[0]!.id;
    expect(pick.choose(id)).toBe(true);
    expect(pick.phase).toBe('playing');
    expect(pick.run.level).toBe(1);
    expect(pick.run.upgrades[id]).toBe(1);

    const skip = new Session('campaign', 14, { starter: blank(), supplies: ['headstart'] });
    skip.start();
    const before = skip.run.crystals;
    skip.skip();
    expect(skip.phase).toBe('playing');
    expect(skip.run.level).toBe(1);
    expect(skip.run.crystals).toBe(before);
  });

  it('second wind catches exactly the first lethal hit of the run', () => {
    const session = new Session('campaign', 15, { supplies: ['secondwind'] });
    const world = session.world;
    const clear = (): void => {
      (world as unknown as { invuln: number }).invuln = 0;
    };
    // Step past the launch intro: damage before it would be ignored by design.
    session.update(1.1);
    expect(world.state).toBe('playing');
    world.damagePlayer(1);
    expect(world.hp).toBe(MAX_HP_BASE - 1);
    clear();
    world.damagePlayer(1);
    expect(world.hp).toBe(MAX_HP_BASE - 2);
    clear();
    world.damagePlayer(MAX_HP_BASE - 1);
    expect(session.run.secondWindUsed).toBe(true);
    expect(world.hp).toBe(SECOND_WIND_HP);
    expect(world.state).toBe('playing');
    clear();
    world.damagePlayer(SECOND_WIND_HP);
    expect(world.state).toBe('dying');
  });

  it('an empty loadout is bitwise the same run as no loadout at all', () => {
    const a = new Session('campaign', 42, {});
    const b = new Session('campaign', 42, { supplies: [] });
    expect(b.run.maxHp).toBe(a.run.maxHp);
    expect(b.run.hp).toBe(a.run.hp);
    expect(b.run.crystals).toBe(a.run.crystals);
    expect(b.run.bonusHp).toBe(0);
    expect(b.run.secondWindUsed).toBe(false);
    expect(b.world.energy).toBe(a.world.energy);
    expect(b.world.balls).toHaveLength(a.world.balls.length);
    a.start();
    b.start();
    expect(b.phase).toBe(a.phase);
    expect(b.rerollCost).toBe(a.rerollCost);
    expect(b.skipReward).toBe(a.skipReward);
  });

  it('drops unknown supply ids instead of guessing', () => {
    const session = new Session('campaign', 16, { supplies: ['spare', 'time-machine', 7 as unknown as string] });
    expect(session.run.maxHp).toBe(MAX_HP_BASE + 1);
  });
});

describe('economy constants', () => {
  it('keeps the reward constants tied to the design', () => {
    expect(FIRST_GIFT).toBe(250);
    expect(FIRST_USE_REWARD).toBe(15);
    expect(FIRST_USE_REWARD * 56).toBe(840);
    expect(SECOND_WIND_HP).toBe(2);
    expect(SUPPLY_CRYSTALS).toBe(40);
    expect(PRECHARGE_ENERGY).toBe(50);
  });
});

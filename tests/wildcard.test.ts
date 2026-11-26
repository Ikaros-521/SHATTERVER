import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultEconomy, loadSave, storeSave } from '../src/core/storage';
import { PROTOCOLS, type ShopProtocol } from '../src/game/economy/catalog';
import { Session } from '../src/game/session';
import { STARTERS, type Starter } from '../src/game/starters';
import { MAX_HP_BASE } from '../src/game/config';
import { rollDraft } from '../src/game/upgrades/draft';
import { RNG } from '../src/core/rng';

/**
 * P1 星尘商店 additions: the wildcard protocol (a generalized opening draft — the head-start
 * supply's mechanic, now with a pick count and a rarity band) and the one-run supply trial.
 *
 * The head-start regressions in `tests/economy.test.ts` keep guarding P0 semantics; this file
 * covers the new generalization on top of them.
 */

const BAND = ['common', 'rare'] as const;

const wildcard = (): ShopProtocol => {
  const protocol = PROTOCOLS.find((entry) => entry.id === 'wildcard');
  expect(protocol, 'the wildcard protocol is in the catalog').toBeTruthy();
  return protocol!;
};

const blank = (): Starter => STARTERS.find((starter) => starter.id === 'blank')!;

describe('draft: rarity band and exclusion', () => {
  it('a banded draft only offers those rarities, and both of them show up', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 200; seed++) {
      const draft = rollDraft({ levels: {}, level: 1, rng: new RNG(seed), count: 4, rarities: [...BAND] });
      expect(draft).toHaveLength(4);
      for (const option of draft) {
        expect(BAND, `${option.id} is ${option.rarity}`).toContain(option.rarity);
        seen.add(option.rarity);
      }
    }
    expect(seen).toEqual(new Set<string>(BAND));
  });

  it('an excluded id never appears, across many rolls', () => {
    for (let seed = 0; seed < 100; seed++) {
      const draft = rollDraft({ levels: {}, level: 1, rng: new RNG(seed), count: 3, exclude: ['fire'] });
      expect(draft.some((option) => option.id === 'fire')).toBe(false);
    }
  });

  it('without a band or exclusions, the draft is the plain three-card roll', () => {
    const rng = new RNG(7);
    for (let i = 0; i < 100; i++) {
      expect(rollDraft({ levels: {}, level: rng.int(1, 10), rng })).toHaveLength(3);
    }
  });
});

describe('wildcard protocol (catalog)', () => {
  it('is the 2500 capstone: no grants, no crystals, two banded self-picks', () => {
    const protocol = wildcard();
    expect(protocol.price).toBe(2500);
    expect(protocol.grants).toEqual({});
    expect(protocol.crystals).toBe(0);
    expect(protocol.introPicks).toBe(2);
    expect(protocol.introRarities).toEqual([...BAND]);
    const ids = PROTOCOLS.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('sits at the top of the price ladder, after every other protocol', () => {
    const prices = PROTOCOLS.map((entry) => entry.price);
    expect(prices[prices.length - 1]).toBe(2500);
    expect([...prices].sort((a, b) => a - b)).toEqual(prices);
  });
});

describe('wildcard session: the generalized opening draft', () => {
  it('drafts four banded cards, then a fresh four without the pick, then opens sector one', () => {
    const session = new Session('campaign', 21, { starter: wildcard() });
    expect(session.introPicks).toBe(2);
    session.start();
    expect(session.phase).toBe('draft');
    expect(session.draft).toHaveLength(4);
    for (const option of session.draft) expect(BAND).toContain(option.rarity);

    const first = session.draft[0]!.id;
    expect(session.choose(first)).toBe(true);
    // Still drafting: another four, the taken card gone, sector one not open yet.
    expect(session.phase).toBe('draft');
    expect(session.run.level).toBe(1);
    expect(session.introPicks).toBe(1);
    expect(session.draft).toHaveLength(4);
    expect(session.draft.some((option) => option.id === first)).toBe(false);
    for (const option of session.draft) expect(BAND).toContain(option.rarity);

    const second = session.draft[0]!.id;
    expect(session.choose(second)).toBe(true);
    expect(session.phase).toBe('playing');
    expect(session.run.level).toBe(1);
    expect(session.run.upgrades[first]).toBe(1);
    expect(session.run.upgrades[second]).toBe(1);
    expect(session.introPicks).toBe(0);
  });

  it('a skipped pick is spent without a card; remaining picks still stand', () => {
    const session = new Session('campaign', 22, { starter: wildcard() });
    session.start();
    const before = session.run.crystals;
    expect(session.skip()).toBe(true);
    expect(session.phase).toBe('draft');
    expect(session.introPicks).toBe(1);
    expect(session.draft).toHaveLength(4);
    expect(session.run.crystals).toBe(before);

    expect(session.skip()).toBe(true);
    expect(session.phase).toBe('playing');
    expect(session.run.level).toBe(1);
    expect(Object.keys(session.run.upgrades)).toEqual([]);
  });

  it('the opening draft never offers what a starter granted — only picks add to the build here', () => {
    // Wildcard grants nothing, so the second four excludes exactly the first pick.
    for (let seed = 20; seed < 45; seed++) {
      const session = new Session('campaign', seed, { starter: wildcard() });
      session.start();
      const taken = session.draft[0]!.id;
      session.choose(taken);
      expect(session.phase).toBe('draft');
      expect(session.draft.some((option) => option.id === taken)).toBe(false);
      session.choose(session.draft[0]!.id);
      expect(session.phase).toBe('playing');
    }
  });

  it('head start stacks on top of the wildcard picks and keeps the banded hand', () => {
    const session = new Session('campaign', 23, { starter: wildcard(), supplies: ['headstart'] });
    expect(session.introPicks).toBe(3);
    session.start();
    expect(session.draft).toHaveLength(4);
    for (let i = 0; i < 3; i++) {
      expect(session.phase).toBe('draft');
      session.choose(session.draft[0]!.id);
    }
    expect(session.phase).toBe('playing');
    expect(session.run.level).toBe(1);
  });

  it('leaves plain runs alone: no picks, no draft before sector one', () => {
    const session = new Session('campaign', 24, { starter: blank() });
    expect(session.introPicks).toBe(0);
    session.start();
    expect(session.phase).toBe('playing');
    expect(session.run.level).toBe(1);
  });
});

describe('head start keeps its P0 shape', () => {
  it('one unrestricted pick from three cards; picking or skipping opens sector one', () => {
    const session = new Session('campaign', 25, { supplies: ['headstart'] });
    expect(session.introPicks).toBe(1);
    expect(session.introRarities).toBeUndefined();
    session.start();
    expect(session.phase).toBe('draft');
    expect(session.draft).toHaveLength(3);
    session.choose(session.draft[0]!.id);
    expect(session.phase).toBe('playing');
    expect(session.run.level).toBe(1);

    const skip = new Session('campaign', 25, { supplies: ['headstart'] });
    skip.start();
    skip.skip();
    expect(skip.phase).toBe('playing');
    expect(skip.run.level).toBe(1);
  });

  it('the free pick can still land above the wildcard band', () => {
    let above = false;
    for (let seed = 0; seed < 100 && !above; seed++) {
      const session = new Session('campaign', seed, { supplies: ['headstart'] });
      session.start();
      above = session.draft.some((option) => !BAND.includes(option.rarity as (typeof BAND)[number]));
    }
    expect(above, 'unbanded drafts should reach epic or better across seeds').toBe(true);
  });
});

describe('supply trial (save state)', () => {
  const KEY = 'shatterverse.save.v1';
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  });

  beforeEach(() => store.clear());

  it('a fresh economy carries no trial', () => {
    expect(defaultEconomy().trialSupply).toBeNull();
  });

  it('round-trips a set trial', () => {
    const save = loadSave();
    save.economy.trialSupply = 'cache';
    storeSave(save);
    expect(loadSave().economy.trialSupply).toBe('cache');
  });

  it('repairs an unknown or non-string trial id to no trial at all', () => {
    store.set(
      KEY,
      JSON.stringify({
        version: 2,
        settings: {},
        records: {},
        economy: { trialSupply: 'time-machine' },
      }),
    );
    expect(loadSave().economy.trialSupply).toBeNull();
    store.set(
      KEY,
      JSON.stringify({ version: 2, settings: {}, records: {}, economy: { trialSupply: 7 } }),
    );
    expect(loadSave().economy.trialSupply).toBeNull();
  });

  it('a trial id duplicated into the carried list is harmless: the session de-duplicates supplies', () => {
    const carried = new Session('campaign', 26, { supplies: ['spare', 'spare'] });
    expect(carried.run.maxHp).toBe(MAX_HP_BASE + 1);
    expect(carried.run.bonusHp).toBe(1);
  });
});

import { describe, expect, it } from 'vitest';
import { RNG } from '../src/core/rng';
import { availableUpgrades, meetsRequires, rarityWeights, rollDraft } from '../src/game/upgrades/draft';
import { UPGRADES, UPGRADE_MAP } from '../src/game/upgrades/defs';
import { computeStats } from '../src/game/upgrades/stats';

/** A random, legal build: every upgrade at a random level from 0 to its cap. */
function randomBuild(rng: RNG): Record<string, number> {
  const levels: Record<string, number> = {};
  for (const def of UPGRADES) {
    const level = rng.int(0, def.maxLevel);
    if (level > 0) levels[def.id] = level;
  }
  return levels;
}

describe('upgrade definitions', () => {
  it('has unique ids and resolvable prerequisites', () => {
    const ids = UPGRADES.map((u) => u.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const def of UPGRADES) {
      for (const id of Object.keys(def.requires ?? {})) {
        expect(UPGRADE_MAP[id], `${def.id} requires unknown upgrade "${id}"`).toBeDefined();
      }
    }
  });

  it('covers the intended spread of rarities', () => {
    const byRarity = new Map<string, number>();
    for (const def of UPGRADES) byRarity.set(def.rarity, (byRarity.get(def.rarity) ?? 0) + 1);
    expect(byRarity.get('common')).toBe(12);
    expect(byRarity.get('rare')).toBe(19);
    expect(byRarity.get('epic')).toBe(14);
    expect(byRarity.get('legendary')).toBe(7);
    expect(byRarity.get('mythic')).toBe(4);
    expect(UPGRADES).toHaveLength(56);
  });

  it('every upgrade is internally consistent at every level', () => {
    for (const def of UPGRADES) {
      expect(def.name.length).toBeGreaterThan(0);
      expect(def.tags.length).toBeGreaterThan(0);
      for (let level = 1; level <= def.maxLevel; level++) {
        const stats = computeStats({ [def.id]: level }, 0);
        for (const [key, value] of Object.entries(stats)) {
          if (typeof value === 'number') {
            expect(Number.isFinite(value), `${def.id} lv${level} produced a non-finite ${key}`).toBe(true);
          }
        }
        const text = def.describe(level);
        expect(text.length).toBeGreaterThan(6);
        expect(text, `${def.id} lv${level}: "${text}"`).not.toMatch(/NaN|undefined|Infinity/);
      }
      if (def.maxLevel > 1) expect(def.describe(def.maxLevel), def.id).not.toBe(def.describe(1));
    }
  });

  it('mythics are always the payoff of a committed build', () => {
    for (const def of UPGRADES.filter((u) => u.rarity === 'mythic')) {
      expect(def.requires, def.id).toBeDefined();
      expect(Object.keys(def.requires ?? {}).length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('computeStats', () => {
  it('starts from the baseline build', () => {
    const stats = computeStats({}, 0);
    expect(stats.ballCount).toBe(4);
    expect(stats.damageMult).toBe(1);
    expect(stats.critChance).toBeCloseTo(0.05);
  });

  it('folds upgrades at their total level', () => {
    expect(computeStats({ multiball: 3 }, 0).ballCount).toBe(7);
    expect(computeStats({ power: 2 }, 0).damageMult).toBeCloseTo(1.6);
    expect(computeStats({ crit: 3 }, 0).critChance).toBeCloseTo(0.41);
    expect(computeStats({ shield: 2 }, 0).maxHpBonus).toBe(2);
  });

  it('ignores levels above the cap', () => {
    expect(computeStats({ multiball: 99 }, 0).ballCount).toBe(4 + (UPGRADE_MAP.multiball?.maxLevel ?? 0));
  });

  it('growth scales with cleared levels only', () => {
    expect(computeStats({ growth: 2 }, 0).damageMult).toBeCloseTo(1);
    // +15% per level per upgrade level, additive: 2 × 15% × 5 cleared levels.
    expect(computeStats({ growth: 2 }, 5).damageMult).toBeCloseTo(2.5);
  });

  it('legendary overrides compose on top of the stacks they require', () => {
    expect(computeStats({ pierce: 2, phantom: 1 }, 0).pierceChance).toBe(1);
    expect(computeStats({ split: 3, recursion: 1 }, 0).splitChildren).toBe(true);
    expect(computeStats({ frost: 1, absolutezero: 1 }, 0).freezeChance).toBe(1);
  });

  it('is a pure function of its inputs', () => {
    const build = { fire: 3, explosive: 2, laser: 1, void: 2 };
    expect(computeStats(build, 4)).toEqual(computeStats({ ...build }, 4));
  });
});

describe('draft', () => {
  it('never offers a maxed or locked upgrade, and never duplicates', () => {
    const rng = new RNG(99);
    for (let i = 0; i < 3000; i++) {
      const levels = randomBuild(rng);
      const draft = rollDraft({ levels, level: rng.int(1, 30), rng });
      expect(draft.length).toBeLessThanOrEqual(3);
      expect(new Set(draft.map((d) => d.id)).size).toBe(draft.length);
      for (const option of draft) {
        expect(levels[option.id] ?? 0, `${option.id} is maxed`).toBeLessThan(option.maxLevel);
        expect(meetsRequires(option, levels), `${option.id} is locked`).toBe(true);
      }
    }
  });

  it('returns an empty draft when everything is maxed', () => {
    const levels = Object.fromEntries(UPGRADES.map((u) => [u.id, u.maxLevel]));
    expect(availableUpgrades(levels)).toEqual([]);
    expect(rollDraft({ levels, level: 20, rng: new RNG(1) })).toEqual([]);
  });

  it('offers three options whenever the pool allows', () => {
    const rng = new RNG(3);
    for (let i = 0; i < 300; i++) {
      expect(rollDraft({ levels: {}, level: rng.int(1, 15), rng }).length).toBe(3);
    }
  });

  it('cannot offer mythics before their prerequisites exist', () => {
    const rng = new RNG(17);
    const levels = { explosive: 5, void: 3, frost: 4 };
    for (let i = 0; i < 2000; i++) {
      for (const option of rollDraft({ levels, level: 30, rng })) {
        expect(option.rarity, option.id).not.toBe('mythic');
      }
    }
  });

  it('offers every upgrade across many drafts', () => {
    const rng = new RNG(2024);
    const seen = new Set<string>();
    for (let i = 0; i < 20_000; i++) {
      for (const option of rollDraft({ levels: randomBuild(rng), level: rng.int(1, 20), rng }))
        seen.add(option.id);
    }
    expect([...seen].sort()).toEqual(UPGRADES.map((u) => u.id).sort());
  });

  it('shifts towards rare options as the run goes on and with luck', () => {
    const share = (
      rarity: keyof ReturnType<typeof rarityWeights>,
      w: ReturnType<typeof rarityWeights>,
    ): number => {
      const total = Object.values(w).reduce((sum, v) => sum + v, 0);
      return w[rarity] / total;
    };
    const early = rarityWeights(1, 0);
    const late = rarityWeights(15, 0);
    const lucky = rarityWeights(8, 3);
    const plain = rarityWeights(8, 0);
    expect(share('legendary', late)).toBeGreaterThan(share('legendary', early) * 2);
    expect(share('mythic', late)).toBeGreaterThan(share('mythic', early) * 3);
    expect(share('epic', lucky)).toBeGreaterThan(share('epic', plain));
    expect(share('common', lucky)).toBeLessThan(share('common', plain));
  });

  it('is deterministic for a given rng state', () => {
    const roll = (): string[] =>
      rollDraft({ levels: { fire: 1 }, level: 6, rng: new RNG(555) }).map((d) => d.id);
    expect(roll()).toEqual(roll());
  });
});

import type { RNG } from '../../core/rng';
import type { UpgradeDef } from './types';
import { UPGRADES } from './defs';

/** Tags broad enough that owning them should not bias the draft towards anything in particular. */
const GENERIC_TAGS = new Set(['ball', 'damage', 'paddle', 'greed', 'defense']);

/**
 * Base share of each rarity at a given level and luck.
 *
 * Early levels are mostly commons so the first decisions are legible; legendaries and mythics
 * ramp up as the run goes on. Luck tilts the table towards the top end.
 */
export function rarityWeights(level: number, luck: number): Record<UpgradeDef['rarity'], number> {
  const l = Math.max(1, level) - 1;
  const k = Math.max(0, luck);
  return {
    common: Math.max(30, 100 - 5 * l) * (1 - 0.1 * k),
    rare: (46 + 2.2 * l) * (1 + 0.12 * k),
    epic: (14 + 2.6 * l) * (1 + 0.22 * k),
    legendary: Math.min(22, 2.5 + 0.9 * l) * (1 + 0.35 * k),
    mythic: Math.min(7, 0.5 + 0.25 * l) * (1 + 0.5 * k),
  };
}

export function meetsRequires(def: UpgradeDef, levels: Record<string, number>): boolean {
  if (!def.requires) return true;
  return Object.entries(def.requires).every(([id, min]) => (levels[id] ?? 0) >= min);
}

/** Upgrades that can still be taken: below max level, with prerequisites satisfied. */
export function availableUpgrades(levels: Record<string, number>): UpgradeDef[] {
  return UPGRADES.filter((u) => (levels[u.id] ?? 0) < u.maxLevel && meetsRequires(u, levels));
}

/**
 * Owned upgrades whose requirement on `id` outlives dropping `id` to `nextLevel`: they would sit
 * in the build without their prerequisite, so the drop cannot happen until they are gone. For a
 * full removal pass 0; for a one-level discard pass the level it would fall to.
 */
export function dependentsBrokenBy(
  id: string,
  levels: Record<string, number>,
  nextLevel: number,
): UpgradeDef[] {
  return UPGRADES.filter((u) => (levels[u.id] ?? 0) > 0 && (u.requires?.[id] ?? 0) > nextLevel);
}

function synergyBoost(def: UpgradeDef, owned: Set<string>): number {
  let matches = 0;
  for (const tag of def.tags) if (!GENERIC_TAGS.has(tag) && owned.has(tag)) matches++;
  return 1 + 0.7 * matches;
}

export interface DraftOptions {
  levels: Record<string, number>;
  level: number;
  rng: RNG;
  count?: number;
  /** Restricts the pool to these rarities; unset or empty means every open rarity competes. */
  rarities?: readonly UpgradeDef['rarity'][];
  /** Upgrade ids the draft must not offer (e.g. what an opening self-pick already granted). */
  exclude?: readonly string[];
}

/**
 * Rolls a draft of distinct upgrades.
 *
 * A rarity is drawn first (so the distribution is explicit and testable), then an upgrade of that
 * rarity. Upgrades that share an archetype tag with the current build are weighted up, which is
 * what makes builds cohere without ever forcing a choice.
 */
export function rollDraft(options: DraftOptions): UpgradeDef[] {
  const { levels, level, rng } = options;
  const count = options.count ?? 3;
  const luck = levels.lucky ?? 0;

  const owned = new Set<string>();
  for (const def of UPGRADES) if ((levels[def.id] ?? 0) > 0) for (const tag of def.tags) owned.add(tag);

  const band = options.rarities?.length ? new Set(options.rarities) : null;
  const excluded = options.exclude?.length ? new Set(options.exclude) : null;
  const pool = availableUpgrades(levels).filter(
    (u) => (!band || band.has(u.rarity)) && (!excluded || !excluded.has(u.id)),
  );
  const picked: UpgradeDef[] = [];

  for (let i = 0; i < count; i++) {
    const remaining = pool.filter((u) => !picked.includes(u));
    if (remaining.length === 0) break;

    const weights = rarityWeights(level, luck);
    // Only let rarities that can actually be fulfilled compete for the roll.
    const open = remaining.filter((u) => weights[u.rarity] > 0);
    const rarity = rng.weighted(open, (u) => weights[u.rarity])?.rarity;
    const tier = remaining.filter((u) => u.rarity === rarity);
    const choice = rng.weighted(tier, (u) => synergyBoost(u, owned)) ?? rng.pick(remaining);
    picked.push(choice);
  }
  return picked;
}

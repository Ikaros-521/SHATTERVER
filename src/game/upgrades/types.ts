export type Rarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';

/** Build archetypes. Upgrades that share tags are offered together more often. */
export type Tag =
  | 'ball'
  | 'paddle'
  | 'damage'
  | 'fire'
  | 'frost'
  | 'shock'
  | 'poison'
  | 'void'
  | 'explosion'
  | 'laser'
  | 'time'
  | 'greed'
  | 'defense'
  | 'overdrive';

/**
 * Data-driven upgrade definition.
 *
 * `apply` folds one owned upgrade (at its total level) into the flat stat block, and
 * `describe` renders the card text for a given total level. Everything else in the game reads
 * the resulting stats — no other code needs to know which upgrades exist.
 */
export interface UpgradeDef {
  id: string;
  name: string;
  /** Short English codename, displayed as flavour. */
  code: string;
  flavor: string;
  rarity: Rarity;
  maxLevel: number;
  tags: Tag[];
  /** Upgrade id → minimum level required before this one can be offered. */
  requires?: Record<string, number>;
  apply: (stats: import('./stats').BuildStats, level: number) => void;
  describe: (level: number) => string;
}

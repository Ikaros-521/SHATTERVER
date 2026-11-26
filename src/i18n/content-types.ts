import type { BuffId } from '../game/buffs/defs';
import type { DifficultyId } from '../game/difficulty';
import type { ModifierId, ReactionId } from '../game/levels/definitions';
import type { Rarity, Tag } from '../game/upgrades/types';

/**
 * Localized copies of the game-content strings that live canonically in the `game/` modules.
 *
 * The Chinese text is the canonical source (it stays in `defs.ts`, `difficulty.ts`,
 * `definitions.ts`, `starters.ts`, `present.ts`); every other locale carries a full override
 * table shaped like this, keyed by the canonical ids. `tests/i18n.test.ts` asserts the tables
 * cover every id the game defines, so a future upgrade cannot ship untranslated.
 */
export interface ContentOverrides {
  /** By upgrade id, e.g. `power`. `describe` mirrors the canonical template's numbers and `<b>` markup. */
  upgrades: Record<string, { name: string; flavor: string; describe: (lv: number) => string }>;
  /** By buff id, e.g. `split`. `short` is the banner line of an instant buff. */
  buffs: Record<BuffId, { name: string; desc: string; short?: string }>;
  /** By difficulty id. The selector's bullet points live in `detail`; the name is the heading. */
  difficulty: Record<DifficultyId, { name: string; detail: string[] }>;
  /** By starter id. */
  starters: Record<string, { name: string; desc: string }>;
  /** By chapter index (0-based, matches `CHAPTERS`). */
  chapters: { places: string[] }[];
  /** By mutator id. */
  mutators: Record<ModifierId, { name: string; desc: string }>;
  /** By boss id. */
  bosses: Record<string, { name: string; title: string }>;
  /** By reaction id. */
  reactions: Record<ReactionId, { name: string; recipe: string; desc: string }>;
  /** The localized label of each combo tier, ascending, matching `COMBO_TIERS`. */
  comboTiers: string[];
  rarity: Record<Rarity, string>;
  tags: Record<Tag, string>;
}

import { dict, getLang } from '../core/i18n';
import type { BuffDef } from '../game/buffs/defs';
import { difficultyOf, type Difficulty, type DifficultyId } from '../game/difficulty';
import { CHAPTERS, COMBO_TIERS } from '../game/levels/definitions';
import type { BossDef, ModifierDef, ReactionDef } from '../game/levels/definitions';
import { UPGRADE_MAP } from '../game/upgrades/defs';
import { RARITY_INFO, TAG_INFO } from '../game/upgrades/present';
import type { Rarity, Tag } from '../game/upgrades/types';
import type { UpgradeDef } from '../game/upgrades/types';
import type { Starter } from '../game/starters';
import type { ContentOverrides } from './content-types';

/**
 * Localized reads for the game-content strings whose Chinese text is canonical in `game/`.
 *
 * Chinese reads the canonical fields directly; every other language looks up the per-locale
 * override table (see `content-types.ts`), falling back to the canonical field when an override
 * is missing, so a translation gap degrades to Chinese rather than to `undefined`. Tests assert
 * the tables are complete, so the fallback is a safety net, not a license.
 */

function overrides(): ContentOverrides | undefined {
  return getLang() === 'zh' ? undefined : dict().content;
}

// ── upgrades ──

export function upgradeName(def: UpgradeDef): string {
  return overrides()?.upgrades[def.id]?.name ?? def.name;
}

export function upgradeFlavor(def: UpgradeDef): string {
  return overrides()?.upgrades[def.id]?.flavor ?? def.flavor;
}

export function upgradeDescribe(def: UpgradeDef, level: number): string {
  return overrides()?.upgrades[def.id]?.describe(level) ?? def.describe(level);
}

/** Localized name of any upgrade by id (codex requirements, starter grant lists, run records). */
export function upgradeNameById(id: string): string {
  return overrides()?.upgrades[id]?.name ?? UPGRADE_MAP[id]?.name ?? id;
}

// ── temporary buffs ──

export function buffName(def: BuffDef): string {
  return overrides()?.buffs[def.id]?.name ?? def.name;
}

export function buffDesc(def: BuffDef): string {
  return overrides()?.buffs[def.id]?.desc ?? def.desc;
}

/** The banner line of an instant buff. A timed one shows its countdown instead. */
export function buffShort(def: BuffDef): string {
  return overrides()?.buffs[def.id]?.short ?? def.short ?? def.desc;
}

// ── difficulty ──

export function difficultyName(tier: Difficulty): string {
  return overrides()?.difficulty[tier.id]?.name ?? tier.name;
}

export function difficultyDetail(id: DifficultyId): string[] {
  return overrides()?.difficulty[id]?.detail ?? difficultyOf(id).detail;
}

// ── starters ──

export function starterName(starter: Starter): string {
  return overrides()?.starters[starter.id]?.name ?? starter.name;
}

export function starterDesc(starter: Starter): string {
  return overrides()?.starters[starter.id]?.desc ?? starter.desc;
}

// ── chapters & levels ──

/**
 * A level's display name. The canonical name is one of the chapter's place names, so its index
 * selects the localized entry — the level generator stores no place index of its own.
 */
export function levelName(chapterIndex: number, canonicalName: string): string {
  const places = overrides()?.chapters[chapterIndex]?.places;
  if (!places) return canonicalName;
  const index = CHAPTERS[chapterIndex]?.places.indexOf(canonicalName) ?? -1;
  return (index >= 0 ? places[index] : undefined) ?? canonicalName;
}

// ── mutators ──

export function mutatorName(modifier: ModifierDef): string {
  return overrides()?.mutators[modifier.id]?.name ?? modifier.name;
}

export function mutatorDesc(modifier: ModifierDef): string {
  return overrides()?.mutators[modifier.id]?.desc ?? modifier.desc;
}

// ── bosses ──

export function bossName(boss: BossDef): string {
  return overrides()?.bosses[boss.id]?.name ?? boss.name;
}

export function bossTitle(boss: BossDef): string {
  return overrides()?.bosses[boss.id]?.title ?? boss.title;
}

// ── reactions ──

export function reactionName(reaction: ReactionDef): string {
  return overrides()?.reactions[reaction.id]?.name ?? reaction.name;
}

export function reactionRecipe(reaction: ReactionDef): string {
  return overrides()?.reactions[reaction.id]?.recipe ?? reaction.recipe;
}

export function reactionDesc(reaction: ReactionDef): string {
  return overrides()?.reactions[reaction.id]?.desc ?? reaction.desc;
}

// ── combo tiers ──

/** The localized second line of a combo-tier call-out, by index into `COMBO_TIERS`. */
export function comboTierLabel(index: number): string {
  const tier = COMBO_TIERS[index];
  if (!tier) return '';
  return overrides()?.comboTiers[index] ?? tier.cn;
}

// ── presentation vocabularies ──

export function rarityName(rarity: Rarity): string {
  return overrides()?.rarity[rarity] ?? RARITY_INFO[rarity].name;
}

export function tagName(tag: Tag): string {
  return overrides()?.tags[tag] ?? TAG_INFO[tag].name;
}

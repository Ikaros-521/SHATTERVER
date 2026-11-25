import type { Rarity, Tag } from './types';

/** How upgrades are presented: rarity and archetype names and colours. Shared by the HUD, the draft and the codex. */

export interface RarityInfo {
  name: string;
  en: string;
  /** 0xRRGGBB */
  color: number;
  rank: number;
}

export const RARITY_INFO: Record<Rarity, RarityInfo> = {
  common: { name: '普通', en: 'COMMON', color: 0xa7b8cc, rank: 0 },
  rare: { name: '稀有', en: 'RARE', color: 0x4da6ff, rank: 1 },
  epic: { name: '史诗', en: 'EPIC', color: 0xb866ff, rank: 2 },
  legendary: { name: '传说', en: 'LEGENDARY', color: 0xff9f2e, rank: 3 },
  mythic: { name: '神话', en: 'MYTHIC', color: 0xff2fa0, rank: 4 },
};

export const RARITY_ORDER: Rarity[] = ['common', 'rare', 'epic', 'legendary', 'mythic'];

export interface TagInfo {
  name: string;
  color: number;
}

export const TAG_INFO: Record<Tag, TagInfo> = {
  ball: { name: '球体', color: 0x4dd8ff },
  paddle: { name: '挡板', color: 0xffd166 },
  damage: { name: '伤害', color: 0xff5c8a },
  fire: { name: '烈焰', color: 0xff7a2f },
  frost: { name: '极寒', color: 0x7ad7ff },
  shock: { name: '雷霆', color: 0xffe14d },
  poison: { name: '腐蚀', color: 0x8dff5a },
  void: { name: '虚空', color: 0xb06bff },
  explosion: { name: '爆炸', color: 0xff4d6d },
  laser: { name: '激光', color: 0xfff0a0 },
  time: { name: '时空', color: 0xc9d6ff },
  greed: { name: '贪婪', color: 0xffc93c },
  defense: { name: '生存', color: 0x6dffa8 },
  overdrive: { name: '超载', color: 0xffffff },
};

/** Tags that describe a build archetype rather than a generic stat, so they can colour its icon. */
const ARCHETYPE_TAGS: Tag[] = [
  'fire',
  'frost',
  'shock',
  'poison',
  'void',
  'explosion',
  'laser',
  'time',
  'overdrive',
];

/** The colour an upgrade is drawn in: its archetype if it has one, otherwise its rarity. */
export function upgradeColor(tags: Tag[], rarity: Rarity): number {
  for (const tag of ARCHETYPE_TAGS) {
    if (tags.includes(tag)) return TAG_INFO[tag].color;
  }
  return RARITY_INFO[rarity].color;
}

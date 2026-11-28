/** Starting archetypes. Each one points the build in a different direction from level one. */
export interface Starter {
  id: string;
  name: string;
  en: string;
  desc: string;
  color: number;
  grants: Record<string, number>;
  crystals: number;
}

/** The orders the starter screen can arrange its protocol roster in. */
export type StarterSortId = 'default' | 'frequent' | 'name';

export const STARTER_SORT_IDS: readonly StarterSortId[] = ['default', 'frequent', 'name'];

export function isStarterSort(value: unknown): value is StarterSortId {
  return typeof value === 'string' && (STARTER_SORT_IDS as readonly string[]).includes(value);
}

/**
 * Arranges the starter roster: `default` keeps free starters first and shop unlocks in price
 * order (the catalog order), `frequent` lifts the protocols this player actually opens runs
 * with (the economy's picks counter), and `name` sorts by the localized display name so a long
 * roster stays findable. Ties keep the catalog order, and `nameOf` keeps the game layer free
 * of i18n — each screen passes its own localized accessor.
 */
export function sortStarters<T extends Starter>(
  roster: readonly T[],
  sort: StarterSortId,
  picks: Readonly<Record<string, number>>,
  nameOf: (starter: T) => string,
): T[] {
  if (sort === 'default') return [...roster];
  const entries = roster.map((starter, index) => ({ starter, index }));
  entries.sort((a, b) => {
    if (sort === 'name') {
      const byName = nameOf(a.starter).localeCompare(nameOf(b.starter));
      if (byName !== 0) return byName;
    } else {
      const byPicks = (picks[b.starter.id] ?? 0) - (picks[a.starter.id] ?? 0);
      if (byPicks !== 0) return byPicks;
    }
    return a.index - b.index;
  });
  return entries.map((entry) => entry.starter);
}

export const STARTERS: Starter[] = [
  {
    id: 'blank',
    name: '空白协议',
    en: 'BLANK SLATE',
    desc: '不带任何强化出发，但携带 60 碎晶——想走哪条路，由你之后的每一次选择决定。',
    color: 0x9fb4c8,
    grants: {},
    crystals: 60,
  },
  {
    id: 'barrage',
    name: '弹幕协议',
    en: 'BARRAGE',
    desc: '多重球 Lv1 + 分裂协议 Lv1。屏幕上的球会越来越多。',
    color: 0x4dd8ff,
    grants: { multiball: 1, split: 1 },
    crystals: 0,
  },
  {
    id: 'battery',
    name: '火力协议',
    en: 'BATTERY',
    desc: '激光阵列 Lv1 + 高能球芯 Lv1。挡板自己就会开火。',
    color: 0xffd166,
    grants: { laser: 1, power: 1 },
    crystals: 0,
  },
  {
    id: 'element',
    name: '元素协议',
    en: 'ELEMENTAL',
    desc: '烈焰附魔 Lv1 + 雷霆附魔 Lv1。开局即可触发元素反应「过载」。',
    color: 0xff7a2f,
    grants: { fire: 1, shock: 1 },
    crystals: 0,
  },
];

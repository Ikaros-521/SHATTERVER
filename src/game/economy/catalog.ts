import type { Starter } from '../starters';

/**
 * The 星尘商店 catalog: purchasable opening protocols and carried supplies.
 *
 * Design bounds, all measured against the free starters (see the power-parity probes behind the
 * shop design): every protocol's opening grants stay inside the spread the four free starters
 * already span — the shop sells starting variety, not power — and supplies only help a weak
 * start (they measurably move a struggling player's run, and vanish into noise for a strong
 * one). Nothing here is consumed per run: protocols unlock forever, supplies are owned forever
 * and carried into a run through the loadout slots.
 *
 * Chinese names/descriptions are canonical here; other locales override them through the
 * content tables (see `i18n/content.ts`), same as the free starters.
 */

/** A purchasable opening protocol. Once unlocked it plays exactly like a free starter. */
export interface ShopProtocol extends Starter {
  price: number;
}

export const PROTOCOLS: ShopProtocol[] = [
  {
    id: 'bulwark',
    name: '壁垒协议',
    en: 'BULWARK',
    desc: '相位护盾 Lv1 + 宽域力场 Lv1。更宽的挡板，多一次机会。',
    color: 0x7dffe0,
    grants: { shield: 1, wide: 1 },
    crystals: 0,
    price: 300,
  },
  {
    id: 'glacier',
    name: '寒霜协议',
    en: 'GLACIER',
    desc: '极寒附魔 Lv1 + 相位穿透 Lv1。冻住，然后穿过去。',
    color: 0x9be8ff,
    grants: { frost: 1, pierce: 1 },
    crystals: 0,
    price: 450,
  },
  {
    id: 'chrono',
    name: '时序协议',
    en: 'CHRONO',
    desc: '缓速力场 Lv1 + 精准校准 Lv1。让世界慢半拍，分毫之间见真章。',
    color: 0xcfe6ff,
    grants: { slowfield: 1, calibration: 1 },
    crystals: 0,
    price: 450,
  },
  {
    id: 'critical',
    name: '暴击协议',
    en: 'CRITICAL',
    desc: '暴击矩阵 Lv1 + 精准校准 Lv1。每一次反弹都在寻找弱点。',
    color: 0xffd24a,
    grants: { crit: 1, calibration: 1 },
    crystals: 0,
    price: 450,
  },
  {
    id: 'overdrive',
    name: '超载协议',
    en: 'OVERDRIVE',
    desc: '电容组 Lv1 + 蓄能反射 Lv1。把超载养成主力。',
    color: 0x9ff3ff,
    grants: { capacitor: 1, empower: 1 },
    crystals: 0,
    price: 450,
  },
  {
    id: 'stasis',
    name: '时停协议',
    en: 'STASIS',
    desc: '时停力场 Lv1。按下空格的瞬间，世界为你静止。',
    color: 0xe8f2ff,
    grants: { timestop: 1 },
    crystals: 0,
    price: 600,
  },
  {
    id: 'melt',
    name: '融化协议',
    en: 'MELT',
    desc: '烈焰附魔 Lv1 + 极寒附魔 Lv1。开局即可触发元素反应「融化」。',
    color: 0xff9a5c,
    grants: { fire: 1, frost: 1 },
    crystals: 0,
    price: 600,
  },
  {
    id: 'void',
    name: '虚空协议',
    en: 'VOID',
    desc: '虚空侵蚀 Lv1，另携带 30 碎晶。空间不太稳定，但那是你的优势。',
    color: 0xb06bff,
    grants: { void: 1 },
    crystals: 30,
    price: 900,
  },
  {
    id: 'orbital',
    name: '轨道协议',
    en: 'ORBITAL',
    desc: '轨道打击 Lv1。天基支援每 4 秒贯穿一列。',
    color: 0xffef9a,
    grants: { orbital: 1 },
    crystals: 0,
    price: 900,
  },
  {
    id: 'thunderhead',
    name: '雷云协议',
    en: 'THUNDERHEAD',
    desc: '雷云 Lv1。头顶的云，替你出手。',
    color: 0xf7f77f,
    grants: { thunderhead: 1 },
    crystals: 0,
    price: 900,
  },
  {
    id: 'volt',
    name: '雷霆协议',
    en: 'VOLTAGE',
    desc: '雷霆附魔 Lv1 + 电容组 Lv1。闪电与超载一起到场。',
    color: 0xfff36b,
    grants: { shock: 1, capacitor: 1 },
    crystals: 0,
    price: 900,
  },
  {
    id: 'mirror',
    name: '镜像协议',
    en: 'MIRROR',
    desc: '镜像宇宙 Lv1。每个球，都带着一个影子。',
    color: 0xd9c9ff,
    grants: { mirror: 1 },
    crystals: 0,
    price: 900,
  },
  {
    id: 'superconduct',
    name: '超导协议',
    en: 'SUPERCONDUCT',
    desc: '极寒附魔 Lv1 + 雷霆附魔 Lv1。开局即可触发元素反应「超导」。',
    color: 0xa9f0ff,
    grants: { frost: 1, shock: 1 },
    crystals: 0,
    price: 1200,
  },
  {
    id: 'venom',
    name: '剧爆协议',
    en: 'CORROSION BLAST',
    desc: '深度腐蚀 Lv1 + 烈焰附魔 Lv1。开局即可触发元素反应「剧爆」。',
    color: 0x8dff5a,
    grants: { poison: 1, fire: 1 },
    crystals: 0,
    price: 1200,
  },
];

export const PROTOCOL_MAP: Record<string, ShopProtocol> = Object.fromEntries(
  PROTOCOLS.map((protocol) => [protocol.id, protocol]),
);

export type SupplyId = 'cache' | 'precharge' | 'spare' | 'reroll' | 'headstart' | 'secondwind';

export interface SupplyDef {
  id: SupplyId;
  /** Chinese canonical; other locales override through the content tables. */
  name: string;
  en: string;
  desc: string;
  price: number;
  /** Loadout slots the supply occupies. */
  slots: number;
}

/** Crystals added at run start by 「碎晶箱」. */
export const SUPPLY_CRYSTALS = 40;
/** Overdrive energy a sector opens with under 「预充能」. */
export const PRECHARGE_ENERGY = 50;
/** Shield restored by 「续战核心」, once per run. */
export const SECOND_WIND_HP = 2;

export const SUPPLIES: SupplyDef[] = [
  {
    id: 'cache',
    name: '碎晶箱',
    en: 'CRYSTAL CACHE',
    desc: '开局碎晶 +40。',
    price: 200,
    slots: 1,
  },
  {
    id: 'precharge',
    name: '预充能',
    en: 'PRE-CHARGE',
    desc: '每关开局时，超载能量为一半。',
    price: 240,
    slots: 1,
  },
  {
    id: 'spare',
    name: '应急护盾',
    en: 'SPARE SHIELD',
    desc: '护盾上限 +1。',
    price: 300,
    slots: 1,
  },
  {
    id: 'reroll',
    name: '保底刷新',
    en: 'FREE REROLL',
    desc: '每次三选一的首次刷新免费。',
    price: 600,
    slots: 1,
  },
  {
    id: 'headstart',
    name: '先手模块',
    en: 'HEAD START',
    desc: '开局先多选一次强化。',
    price: 600,
    slots: 1,
  },
  {
    id: 'secondwind',
    name: '续战核心',
    en: 'SECOND WIND',
    desc: '本局首次护盾击穿时，补回 2 格护盾（每局一次）。',
    price: 1200,
    slots: 2,
  },
];

export const SUPPLY_MAP: Record<SupplyId, SupplyDef> = Object.fromEntries(
  SUPPLIES.map((supply) => [supply.id, supply]),
) as Record<SupplyId, SupplyDef>;

export function isSupplyId(value: unknown): value is SupplyId {
  return typeof value === 'string' && Object.hasOwn(SUPPLY_MAP, value);
}

/** Total loadout slots the carried supplies occupy. */
export function supplyCost(loadout: readonly string[]): number {
  return loadout.reduce((sum, id) => sum + (isSupplyId(id) ? SUPPLY_MAP[id].slots : 0), 0);
}

/** The loadout's slot count. Grows with the player's record, never with purchases. */
export const LOADOUT_SLOTS = 3;

export interface SlotGate {
  /** 2-based slot the gate unlocks. Slot 1 is always open. */
  slot: number;
  kind: 'runs' | 'campaign-clear';
  count: number;
}

/**
 * Slot 2 opens after ten finished runs, slot 3 after the first campaign clear: every extra slot
 * belongs to a player who has already proven something, so carrying more never substitutes for
 * having played.
 */
export const SLOT_GATES: SlotGate[] = [
  { slot: 2, kind: 'runs', count: 10 },
  { slot: 3, kind: 'campaign-clear', count: 1 },
];

/** How many loadout slots this record has earned. */
export function slotLimit(runs: number, campaignClears: number): number {
  let slots = 1;
  for (const gate of SLOT_GATES) {
    const value = gate.kind === 'runs' ? runs : campaignClears;
    if (value >= gate.count) slots = Math.max(slots, gate.slot);
  }
  return slots;
}

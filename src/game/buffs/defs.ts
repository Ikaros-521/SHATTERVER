/**
 * Temporary power-ups: 「增益胶囊」.
 *
 * Upgrades are the run's build — chosen in drafts, kept until the run ends. A buff is the other
 * kind of power: not chosen, not kept. Bricks drop capsules at a steady, seeded cadence (see
 * `World.dropLoot`), the paddle collects them like any other loot, and what they grant lasts a
 * handful of seconds: long enough to change how a moment plays, short enough that the next
 * capsule still matters.
 *
 * Almost every buff is a modifier folded into the live stat block (`buffs/live.ts`), so the
 * simulation never asks "is this buff on" — it reads `world.live`, and the numbers are simply
 * different while it lasts.
 */
export type BuffId =
  | 'split'
  | 'giant'
  | 'wide'
  | 'laser'
  | 'magnet'
  | 'ghost'
  | 'homing'
  | 'rage'
  | 'aegis'
  | 'gold'
  | 'deadeye'
  | 'blast'
  | 'storm'
  | 'timestop'
  | 'turbo'
  | 'overcharge'
  | 'repair';

export interface BuffDef {
  id: BuffId;
  name: string;
  /** Short English codename, displayed as flavour. */
  code: string;
  /** What it does, for the codex. */
  desc: string;
  /** The banner's second line. Only instant buffs need one: a timed buff shows its countdown instead. */
  short?: string;
  /** 0xRRGGBB. */
  color: number;
  /** Seconds it lasts before upgrades; 0 for an instant buff. */
  duration: number;
  /** Relative chance to be the next capsule, before the world's own weighting. */
  weight: number;
}

/** A buff currently in force. `t` counts down to zero; `max` is what it was rolled at. */
export interface ActiveBuff {
  id: BuffId;
  t: number;
  max: number;
}

/** 17 buffs: fifteen timed, two instant. Timed ones are listed first. */
export const BUFFS: readonly BuffDef[] = [
  {
    id: 'split',
    name: '球体分裂',
    code: 'SPLIT',
    desc: '场上每个本体球分裂出 2 个分身（70% 伤害），增益结束时消散。',
    color: 0x4dd8ff,
    duration: 10,
    weight: 9,
  },
  {
    id: 'giant',
    name: '球体巨化',
    code: 'GIANT',
    desc: '球体半径 ×2.2，伤害 +60%。',
    color: 0xff7a2f,
    duration: 8,
    weight: 9,
  },
  {
    id: 'wide',
    name: '延展挡板',
    code: 'WIDE',
    desc: '挡板宽度 ×1.8。',
    color: 0x8fa8ff,
    duration: 10,
    weight: 9,
  },
  {
    id: 'laser',
    name: '激光爆发',
    code: 'LASER BURST',
    desc: '挡板额外发射 3 道激光。',
    color: 0xfff0a0,
    duration: 8,
    weight: 8,
  },
  {
    id: 'magnet',
    name: '超级磁铁',
    code: 'SUPER MAGNET',
    desc: '强力磁力场把下落的球与增益胶囊吸向挡板。',
    color: 0x9ff3ff,
    duration: 10,
    weight: 7,
  },
  {
    id: 'ghost',
    name: '幽灵穿透',
    code: 'PHASE',
    desc: '球体穿过砖块而不反弹；每次穿透伤害 +20%（触碰挡板后重置）。',
    color: 0xb06bff,
    duration: 7,
    weight: 8,
  },
  {
    id: 'homing',
    name: '制导蜂群',
    code: 'SEEKER',
    desc: '球体强力制导：每次触板装填 6 次锁定打击。',
    color: 0x7dffe0,
    duration: 8,
    weight: 8,
  },
  {
    id: 'rage',
    name: '暴走',
    code: 'RAGE',
    desc: '伤害 ×2。',
    color: 0xff3d5a,
    duration: 7,
    weight: 9,
  },
  {
    id: 'aegis',
    name: '弹幕屏障',
    code: 'AEGIS',
    desc: '挡板下方展开屏障，拦截所有弹幕。',
    color: 0x6dffa8,
    duration: 10,
    weight: 8,
  },
  {
    id: 'gold',
    name: '碎晶雨',
    code: 'CRYSTAL RAIN',
    desc: '每块砖必掉碎晶，数量 ×2。',
    color: 0xffc93c,
    duration: 10,
    weight: 8,
  },
  {
    id: 'deadeye',
    name: '弱点看破',
    code: 'WEAK POINT',
    desc: '暴击率 100%。',
    color: 0xffe14d,
    duration: 7,
    weight: 8,
  },
  {
    id: 'blast',
    name: '全域爆破',
    code: 'DEMOLITION',
    desc: '每块砖被击碎时引发爆炸。',
    color: 0xff4d6d,
    duration: 8,
    weight: 8,
  },
  {
    id: 'storm',
    name: '元素风暴',
    code: 'ELEMENTAL STORM',
    desc: '命中附加灼烧、腐蚀与闪电，并有 35% 概率冻结，触发全部元素反应。',
    color: 0xf0f0ff,
    duration: 8,
    weight: 7,
  },
  {
    id: 'timestop',
    name: '时停',
    code: 'TIME STOP',
    desc: '敌方全部静止，球体伤害 ×2。',
    color: 0xcfe6ff,
    duration: 4,
    weight: 7,
  },
  {
    id: 'turbo',
    name: '极速冲刺',
    code: 'TURBO',
    desc: '球速 +40%，伤害 +40%。',
    color: 0x6b8cff,
    duration: 8,
    weight: 8,
  },
  {
    id: 'overcharge',
    name: '超载充能',
    code: 'OVERCHARGE',
    desc: '立即充满超载能量。',
    short: '超载能量已充满',
    color: 0x9ff3ff,
    duration: 0,
    weight: 7,
  },
  {
    id: 'repair',
    name: '应急修复',
    code: 'REPAIR',
    desc: '立即回复 1 点护盾。',
    short: '护盾 +1',
    color: 0xff5c8a,
    duration: 0,
    weight: 6,
  },
];

export const BUFF_MAP: Record<BuffId, BuffDef> = Object.fromEntries(BUFFS.map((b) => [b.id, b])) as Record<
  BuffId,
  BuffDef
>;

/** The buffs that tear the wall down. A field sinking towards the danger line is offered more of them. */
export const OFFENCE: ReadonlySet<BuffId> = new Set<BuffId>([
  'split',
  'giant',
  'homing',
  'rage',
  'deadeye',
  'blast',
  'storm',
  'turbo',
  'laser',
]);

/** The buffs that only keep the paddle out of trouble. The same field is offered fewer of them: they do not stop a wall. */
export const COVER: ReadonlySet<BuffId> = new Set<BuffId>(['aegis', 'magnet', 'wide']);

export function isBuffId(value: unknown): value is BuffId {
  return typeof value === 'string' && value in BUFF_MAP;
}

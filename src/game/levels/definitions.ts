/** Static content definitions: chapters, level mutators, bosses, elemental reactions, combo tiers. */

export interface ChapterDef {
  name: string;
  en: string;
  /** Background palette (nebula low, nebula high, deep base) as 0xRRGGBB. */
  bg: [number, number, number];
  /** Brick colours, cycled by row. */
  bricks: number[];
  accent: number;
  places: string[];
}

export const CHAPTERS: ChapterDef[] = [
  {
    name: '霓虹都市',
    en: 'NEON CITY',
    bg: [0x123a6e, 0x7a1450, 0x050816],
    bricks: [0x27e0ff, 0xff2fb0, 0x3d7bff, 0x20f0c8],
    accent: 0x27e0ff,
    places: ['霓虹街区', '数据高速', '全息广场', '脉冲高塔', '量子车站', '镜像大厦', '电网枢纽', '午夜商场'],
  },
  {
    name: '熔火核心',
    en: 'SOLAR CORE',
    bg: [0x8a1f0a, 0x6b3a06, 0x120404],
    bricks: [0xff7a2f, 0xffc93c, 0xff3d5a, 0xffe08a],
    accent: 0xff7a2f,
    places: ['熔岩管线', '日冕井', '过载炉', '赤铁矿带', '灼热回廊', '喷发口', '灰烬储罐'],
  },
  {
    name: '虚空深渊',
    en: 'VOID RIFT',
    bg: [0x2a0f6e, 0x5a0a6a, 0x04140f],
    bricks: [0xb06bff, 0x4dffc3, 0xff4df0, 0x8fa8ff],
    accent: 0xb06bff,
    places: ['虚空回廊', '奇点边缘', '静默之海', '裂隙深处', '湮灭之地', '零度空间', '梦境残骸'],
  },
];

export type ModifierId = 'gravity' | 'rush' | 'regen' | 'stealth' | 'flak' | 'gold';

/** A level-wide rule change ("变异"). Announced in the level banner. */
export interface ModifierDef {
  id: ModifierId;
  name: string;
  en: string;
  desc: string;
  color: number;
}

export const MODIFIERS: ModifierDef[] = [
  {
    id: 'gravity',
    name: '重力乱流',
    en: 'GRAVITY WELL',
    desc: '球体受到向下的引力，轨迹弯曲成弧线。',
    color: 0x9be8ff,
  },
  {
    id: 'rush',
    name: '高压协议',
    en: 'OVERPRESSURE',
    desc: '砖墙下沉 +50%。球速 +25%，伤害 +25%。',
    color: 0xff5c8a,
  },
  {
    id: 'regen',
    name: '再生装甲',
    en: 'REGENERATING',
    desc: '砖块每秒回复 2.5% 生命，异常状态可抑制再生。',
    color: 0x8dff5a,
  },
  {
    id: 'stealth',
    name: '光学迷彩',
    en: 'CLOAKED',
    desc: '40% 的砖块处于隐形状态，被击中后才会显形。',
    color: 0xc9d6ff,
  },
  {
    id: 'flak',
    name: '火力网',
    en: 'FLAK ZONE',
    desc: '炮台向挡板发射弹幕。用挡板拦截即可，漏到底部会损失生命。',
    color: 0xffe14d,
  },
  { id: 'gold', name: '黄金潮', en: 'GOLD RUSH', desc: '碎晶掉落 ×2，金砖大量出现。', color: 0xffc93c },
];

export type SummonKind = 'wings' | 'row' | 'cross';

export interface BossDef {
  id: string;
  name: string;
  en: string;
  title: string;
  /**
   * ASCII body on the 12-column lattice:
   * `#` armour · `@` core (lots of HP) · `t` turret (shoots at the paddle)
   */
  rows: string[];
  color: number;
  coreColor: number;
  /** Horizontal sway amplitude (world units) and angular frequency. */
  ampX: number;
  sway: number;
  /** Vertical bob amplitude and angular frequency. */
  ampY: number;
  bob: number;
  /** Seconds between shots. The boss fires on one shared clock from a random turret. */
  shootInterval: number;
  summonInterval: number;
  summon: SummonKind;
  /** Seconds before the boss loses patience and starts descending. */
  enrage: number;
}

export const BOSSES: BossDef[] = [
  {
    id: 'warden',
    name: '守望者·零式',
    en: 'WARDEN-0',
    title: '霓虹都市的注视者',
    rows: [
      '....####....',
      '..##tttt##..',
      '.###@@@@###.',
      '##t#@##@#t##',
      '.###@@@@###.',
      '..##tttt##..',
      '....####....',
    ],
    color: 0x27e0ff,
    coreColor: 0xff2fb0,
    ampX: 110,
    sway: 0.9,
    ampY: 14,
    bob: 2.2,
    shootInterval: 2.2,
    summonInterval: 9,
    summon: 'wings',
    enrage: 70,
  },
  {
    id: 'solar',
    name: '熔阳之心',
    en: 'SOLAR HEART',
    title: '永不停歇的过载炉',
    rows: [
      '#....tt....#',
      '.#..####..#.',
      '..##@@@@##..',
      'tt#@@@@@@#tt',
      '..##@@@@##..',
      '.#..####..#.',
      '#....tt....#',
    ],
    color: 0xff7a2f,
    coreColor: 0xffe14d,
    ampX: 150,
    sway: 0.6,
    ampY: 40,
    bob: 1.4,
    shootInterval: 1.9,
    summonInterval: 7,
    summon: 'row',
    enrage: 80,
  },
  {
    id: 'sovereign',
    name: '虚空君主',
    en: 'VOID SOVEREIGN',
    title: '深渊尽头的王座',
    rows: [
      '##...##...##',
      '###..##..###',
      '####@##@####',
      '##t#@##@#t##',
      '############',
      '.#.##tt##.#.',
      '..########..',
    ],
    color: 0xb06bff,
    coreColor: 0x4dffc3,
    ampX: 190,
    sway: 1.3,
    ampY: 26,
    bob: 3,
    shootInterval: 1.5,
    summonInterval: 6,
    summon: 'cross',
    enrage: 90,
  },
];

export type ReactionId = 'melt' | 'overload' | 'superconduct' | 'venom';

export interface ReactionDef {
  id: ReactionId;
  name: string;
  en: string;
  recipe: string;
  desc: string;
  color: number;
}

/** Elemental reactions. They unlock automatically once the build owns both elements. */
export const REACTIONS: ReactionDef[] = [
  {
    id: 'melt',
    name: '融化',
    en: 'MELT',
    recipe: '冰 + 火',
    desc: '冰与火相遇的瞬间造成 120% 攻击力伤害，并融化冰冻。',
    color: 0xff9a5c,
  },
  {
    id: 'overload',
    name: '过载',
    en: 'OVERLOAD',
    recipe: '火 + 雷',
    desc: '雷电击中灼烧中的砖块时引发爆炸。',
    color: 0xffe14d,
  },
  {
    id: 'superconduct',
    name: '超导',
    en: 'SUPERCONDUCT',
    recipe: '冰 + 雷',
    desc: '雷电击中冻结的砖块：闪电链额外跳跃 2 次，伤害提升至 90%，并传播冰冻。',
    color: 0x9be8ff,
  },
  {
    id: 'venom',
    name: '剧爆',
    en: 'CORROSION BLAST',
    recipe: '腐蚀 + 火',
    desc: '火焰引爆腐蚀中的砖块，造成大范围爆炸。',
    color: 0x8dff5a,
  },
];

export interface ComboTier {
  at: number;
  name: string;
  cn: string;
  color: number;
}

/** Ascending. `comboTierOf` returns the index into this table. */
export const COMBO_TIERS: ComboTier[] = [
  { at: 10, name: 'HOT', cn: '热度上升', color: 0xffe14d },
  { at: 30, name: 'BLAZING', cn: '炽热', color: 0xffa02f },
  { at: 60, name: 'RADIANT', cn: '炫目', color: 0xff6b1a },
  { at: 100, name: 'FEROCIOUS', cn: '凶猛', color: 0xff3d5a },
  { at: 200, name: 'GODLIKE', cn: '如神一般', color: 0xff2fb0 },
  { at: 400, name: 'TRANSCENDENT', cn: '超越', color: 0xb06bff },
  { at: 800, name: 'COSMIC', cn: '宇宙级', color: 0x6b8cff },
  { at: 1500, name: 'SINGULAR', cn: '奇点', color: 0x27e0ff },
  { at: 3000, name: 'BEYOND', cn: '不可名状', color: 0xffffff },
];

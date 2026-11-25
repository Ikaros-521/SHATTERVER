import { b, pct } from './format';
import type { UpgradeDef } from './types';

const def = (u: UpgradeDef): UpgradeDef => u;

/**
 * The upgrade pool. 56 upgrades across five rarities.
 *
 * Common upgrades are raw stats; rarer ones change how the ball behaves; legendaries and mythics
 * are the "离谱" payoffs that builds converge on. Mythics always require a commitment
 * (see `requires`) so they read as the culmination of an archetype rather than a lucky roll.
 *
 * The `resonance` school is about the temporary buffs capsules grant (`game/buffs`): it makes
 * them last longer, come sooner and hit harder, rather than doing anything on its own.
 */
export const UPGRADES: UpgradeDef[] = [
  // ───────────────────────────── COMMON ─────────────────────────────
  def({
    id: 'multiball',
    name: '多重球',
    code: 'MULTIBALL',
    flavor: '一个不够，那就再来一个。',
    rarity: 'common',
    maxLevel: 5,
    tags: ['ball'],
    apply: (s, lv) => {
      s.ballCount += lv;
    },
    describe: (lv) => `球体数量 ${b('+' + lv)}。`,
  }),
  def({
    id: 'power',
    name: '高能球芯',
    code: 'POWER CORE',
    flavor: '把整座电站塞进一颗球。',
    rarity: 'common',
    maxLevel: 5,
    tags: ['damage'],
    apply: (s, lv) => {
      s.damageMult += 0.3 * lv;
    },
    describe: (lv) => `基础伤害 ${b('+' + pct(0.3 * lv))}。`,
  }),
  def({
    id: 'wide',
    name: '宽域力场',
    code: 'WIDE FIELD',
    flavor: '面积就是正义。',
    rarity: 'common',
    maxLevel: 3,
    tags: ['paddle'],
    apply: (s, lv) => {
      s.paddleWidth += 0.22 * lv;
    },
    describe: (lv) => `挡板宽度 ${b('+' + pct(0.22 * lv))}。`,
  }),
  def({
    id: 'bigball',
    name: '巨型球体',
    code: 'BULWARK',
    flavor: '物理学的道歉信。',
    rarity: 'common',
    maxLevel: 3,
    tags: ['ball'],
    apply: (s, lv) => {
      s.ballRadius += 0.28 * lv;
      s.damageMult += 0.15 * lv;
    },
    describe: (lv) => `球体半径 ${b('+' + pct(0.28 * lv))}，基础伤害 ${b('+' + pct(0.15 * lv))}。`,
  }),
  def({
    id: 'speed',
    name: '超音速',
    code: 'SUPERSONIC',
    flavor: '音爆是唯一的刹车声。',
    rarity: 'common',
    maxLevel: 5,
    tags: ['ball'],
    apply: (s, lv) => {
      s.ballSpeed += 0.14 * lv;
      s.damageMult += 0.12 * lv;
    },
    describe: (lv) => `球速 ${b('+' + pct(0.14 * lv))}，基础伤害 ${b('+' + pct(0.12 * lv))}。`,
  }),
  def({
    id: 'lucky',
    name: '幸运星',
    code: 'LUCKY CHARM',
    flavor: '宇宙偶尔也会站在你这边。',
    rarity: 'common',
    maxLevel: 3,
    tags: ['greed'],
    apply: (s, lv) => {
      s.luck += lv;
      s.crystalMult += 0.25 * lv;
    },
    describe: (lv) => `幸运 ${b('+' + lv)}（更高稀有度的出现率），碎晶获取 ${b('+' + pct(0.25 * lv))}。`,
  }),
  def({
    id: 'growth',
    name: '成长协议',
    code: 'GROWTH PROTOCOL',
    flavor: '复利是世界第八大奇迹。',
    rarity: 'common',
    maxLevel: 3,
    tags: ['damage'],
    apply: (s, lv) => {
      s.growthPerLevel += 0.15 * lv;
    },
    describe: (lv) => `每通过一关，基础伤害 ${b('+' + pct(0.15 * lv))}（永久叠加）。`,
  }),
  def({
    id: 'shield',
    name: '相位护盾',
    code: 'PHASE SHIELD',
    flavor: '多一条命，多一次离谱的机会。',
    rarity: 'common',
    maxLevel: 2,
    tags: ['defense'],
    apply: (s, lv) => {
      s.maxHpBonus += lv;
    },
    describe: (lv) => `生命上限 ${b('+' + lv)}，并立即回复 ${b(lv)} 点。`,
  }),
  def({
    id: 'resonator',
    name: '共振线圈',
    code: 'RESONANCE COIL',
    flavor: '让每一份力量都多留一会儿。',
    rarity: 'common',
    maxLevel: 3,
    tags: ['resonance'],
    apply: (s, lv) => {
      s.buffDurationMult += 0.35 * lv;
    },
    describe: (lv) => `临时增益持续时间 ${b('+' + pct(0.35 * lv))}。`,
  }),
  def({
    id: 'capacitor',
    name: '电容组',
    code: 'CAPACITOR',
    flavor: '再充一点，就一点。',
    rarity: 'common',
    maxLevel: 3,
    tags: ['overdrive'],
    apply: (s, lv) => {
      s.odGain += 0.3 * lv;
    },
    describe: (lv) => `超载能量获取 ${b('+' + pct(0.3 * lv))}。`,
  }),
  def({
    id: 'recycler',
    name: '回收协议',
    code: 'RECYCLER',
    flavor: '没有真正的废料。',
    rarity: 'common',
    maxLevel: 3,
    tags: ['greed'],
    apply: (s, lv) => {
      s.crystalMult += 0.4 * lv;
    },
    describe: (lv) => `碎晶获取 ${b('+' + pct(0.4 * lv))}。`,
  }),
  def({
    id: 'calibration',
    name: '精准校准',
    code: 'CALIBRATION',
    flavor: '分毫之间，天地之别。',
    rarity: 'common',
    maxLevel: 2,
    tags: ['paddle'],
    apply: (s, lv) => {
      s.perfectWindow += 0.096 * lv;
      s.perfectEnergy += 0.25 * lv;
    },
    describe: (lv) =>
      `完美接球的判定区域 ${b('+' + pct(0.6 * lv))}，完美接球充能 ${b('+' + pct(0.25 * lv))}。`,
  }),

  // ───────────────────────────── RARE ─────────────────────────────
  def({
    id: 'crit',
    name: '暴击矩阵',
    code: 'CRIT MATRIX',
    flavor: '弱点？全都是弱点。',
    rarity: 'rare',
    maxLevel: 5,
    tags: ['damage'],
    apply: (s, lv) => {
      s.critChance += 0.12 * lv;
      s.critMult += 0.3 * lv;
    },
    describe: (lv) => `暴击率 ${b('+' + pct(0.12 * lv))}，暴击伤害 ${b('+' + pct(0.3 * lv))}。`,
  }),
  def({
    id: 'pierce',
    name: '相位穿透',
    code: 'PHASE PIERCE',
    flavor: '墙？什么墙？',
    rarity: 'rare',
    maxLevel: 4,
    tags: ['ball'],
    apply: (s, lv) => {
      s.pierceChance += 0.22 * lv;
    },
    describe: (lv) => `球有 ${b(pct(0.22 * lv))} 概率${b('穿透')}砖块而不反弹。`,
  }),
  def({
    id: 'homing',
    name: '制导核心',
    code: 'GUIDANCE',
    flavor: '它们自己知道该去哪。',
    rarity: 'rare',
    maxLevel: 3,
    tags: ['ball'],
    apply: (s, lv) => {
      s.homing += 2.4 * lv;
    },
    describe: (lv) => `球体自动追踪最近的砖块，转向力 ${b('+' + lv)} 级。`,
  }),
  def({
    id: 'split',
    name: '分裂协议',
    code: 'MITOSIS',
    flavor: '细胞分裂，指数增长。',
    rarity: 'rare',
    maxLevel: 4,
    tags: ['ball'],
    apply: (s, lv) => {
      s.splitChance += 0.16 * lv;
    },
    describe: (lv) => `击碎砖块时 ${b(pct(0.16 * lv))} 概率分裂出子球（45% 伤害，存活 4 秒）。`,
  }),
  def({
    id: 'fire',
    name: '烈焰附魔',
    code: 'IGNITION',
    flavor: '让一切烧起来。',
    rarity: 'rare',
    maxLevel: 5,
    tags: ['fire'],
    apply: (s, lv) => {
      s.fire += lv;
    },
    describe: (lv) => `命中附加${b('灼烧')}：每秒造成 ${b(pct(0.45 * lv))} 攻击力伤害，持续 3 秒。`,
  }),
  def({
    id: 'frost',
    name: '极寒附魔',
    code: 'CRYO',
    flavor: '绝对冷静。',
    rarity: 'rare',
    maxLevel: 4,
    tags: ['frost'],
    apply: (s, lv) => {
      s.frost += lv;
      s.freezeChance = Math.min(1, s.freezeChance + 0.22 * lv);
    },
    describe: (lv) =>
      `命中 ${b(pct(Math.min(1, 0.22 * lv)))} 概率${b('冻结')} 1.6 秒；被冻结的砖块受到伤害 ${b('+30%')}。`,
  }),
  def({
    id: 'shock',
    name: '雷霆附魔',
    code: 'TESLA',
    flavor: '高压电，请勿触摸。',
    rarity: 'rare',
    maxLevel: 5,
    tags: ['shock'],
    apply: (s, lv) => {
      s.shock += lv;
      s.shockChains += 2 * lv;
    },
    describe: (lv) => `命中释放${b('闪电链')}，跳跃 ${b(2 * lv)} 个目标，每个受到 ${b('45%')} 伤害。`,
  }),
  def({
    id: 'laser',
    name: '激光阵列',
    code: 'LASER ARRAY',
    flavor: '挡板表示不想只当挡板。',
    rarity: 'rare',
    maxLevel: 4,
    tags: ['paddle', 'laser'],
    apply: (s, lv) => {
      s.laserLevel += lv;
    },
    describe: (lv) => `挡板每 0.9 秒发射 ${b(lv)} 道激光，每道造成 ${b(pct(0.6 * lv))} 攻击力伤害。`,
  }),
  def({
    id: 'magnet',
    name: '磁力锚',
    code: 'MAGNET',
    flavor: '你可以错过，但球不会。',
    rarity: 'rare',
    maxLevel: 2,
    tags: ['paddle'],
    apply: (s, lv) => {
      s.magnetRadius += 110 * lv;
    },
    describe: (lv) => `挡板上方形成${b('磁力场')}（范围 ${b(110 * lv)}），把下落的球与增益胶囊吸向挡板。`,
  }),
  def({
    id: 'empower',
    name: '蓄能反射',
    code: 'CHARGED RETURN',
    flavor: '回来的路上顺便充了个电。',
    rarity: 'rare',
    maxLevel: 4,
    tags: ['paddle'],
    apply: (s, lv) => {
      s.empowerBonus += 0.6 * lv;
    },
    describe: (lv) => `被挡板弹回的球获得${b('蓄能')}：伤害 ${b('+' + pct(0.6 * lv))}，持续 3 秒。`,
  }),
  def({
    id: 'echo',
    name: '回响协议',
    code: 'ECHO',
    flavor: '第一下是问候，第二下才是答案。',
    rarity: 'rare',
    maxLevel: 3,
    tags: ['damage'],
    apply: (s, lv) => {
      s.echoChance += 0.18 * lv;
    },
    describe: (lv) => `命中时 ${b(pct(0.18 * lv))} 概率触发${b('回响')}：0.25 秒后再次造成 60% 伤害。`,
  }),
  def({
    id: 'shatter',
    name: '碎片风暴',
    code: 'SHRAPNEL',
    flavor: '碎片比砖块本身更危险。',
    rarity: 'rare',
    maxLevel: 3,
    tags: ['explosion'],
    apply: (s, lv) => {
      s.shatterCount += 3 * lv;
    },
    describe: (lv) => `砖块破碎时飞出 ${b(3 * lv)} 枚碎片，每枚造成 30% 攻击力伤害。`,
  }),
  def({
    id: 'explosive',
    name: '爆裂核心',
    code: 'BLAST CORE',
    flavor: '每一块砖都是烟花。',
    rarity: 'rare',
    maxLevel: 5,
    tags: ['explosion'],
    apply: (s, lv) => {
      s.explosionDamage += 0.5 * lv;
      s.explosionRadius = Math.max(s.explosionRadius, 85 + 18 * (lv - 1));
    },
    describe: (lv) =>
      `击碎砖块时引发${b('爆炸')}：范围 ${b(85 + 18 * (lv - 1))}，造成 ${b(pct(0.5 * lv))} 攻击力伤害。`,
  }),
  def({
    id: 'combo',
    name: '连击过载',
    code: 'COMBO FLOW',
    flavor: '别停下来。',
    rarity: 'rare',
    maxLevel: 3,
    tags: ['damage'],
    apply: (s, lv) => {
      s.comboDamagePer10 += 0.05 * lv;
    },
    describe: (lv) => `每 10 连击，伤害 ${b('+' + pct(0.05 * lv))}。${b('没有上限')}。`,
  }),
  def({
    id: 'antenna',
    name: '增益天线',
    code: 'SURGE ANTENNA',
    flavor: '好东西总是先找到你。',
    rarity: 'rare',
    maxLevel: 2,
    tags: ['resonance'],
    apply: (s, lv) => {
      s.buffRate += 0.5 * lv;
    },
    describe: (lv) => `增益胶囊出现得更勤：间隔缩短 ${b(pct(1 - 1 / (1 + 0.5 * lv)))}。`,
  }),
  def({
    id: 'adrenaline',
    name: '肾上腺素',
    code: 'ADRENALINE',
    flavor: '心跳到一百八。',
    rarity: 'rare',
    maxLevel: 2,
    tags: ['resonance', 'damage'],
    apply: (s, lv) => {
      s.buffDamage += 0.4 * lv;
      s.buffSpeed += 0.2 * lv;
    },
    describe: (lv) =>
      `任意临时增益生效期间，伤害 ${b('+' + pct(0.4 * lv))}，球速 ${b('+' + pct(0.2 * lv))}。`,
  }),
  def({
    id: 'trampoline',
    name: '弹性地板',
    code: 'TRAMPOLINE',
    flavor: '地板表示：再来一次。',
    rarity: 'rare',
    maxLevel: 2,
    tags: ['ball'],
    apply: (s, lv) => {
      s.floorBounces += lv;
    },
    describe: (lv) => `球落到底部时会从地板${b('反弹 ' + lv + ' 次')}，然后才重新发射。`,
  }),
  def({
    id: 'evade',
    name: '闪避协议',
    code: 'EVADE',
    flavor: '擦肩而过。',
    rarity: 'rare',
    maxLevel: 2,
    tags: ['defense'],
    apply: (s, lv) => {
      s.evade += 0.2 * lv;
    },
    describe: (lv) => `受到伤害时有 ${b(pct(0.2 * lv))} 概率${b('闪避')}：不损失护盾，也不清空连击。`,
  }),
  def({
    id: 'slowfield',
    name: '缓速力场',
    code: 'SLOW FIELD',
    flavor: '让世界慢半拍。',
    rarity: 'rare',
    maxLevel: 2,
    tags: ['time'],
    apply: (s, lv) => {
      s.slowField += 0.15 * lv;
    },
    describe: (lv) => `砖墙下沉速度与弹幕飞行速度 ${b('−' + pct(0.15 * lv))}。`,
  }),

  // ───────────────────────────── EPIC ─────────────────────────────
  def({
    id: 'chainreaction',
    name: '连锁反应',
    code: 'CHAIN REACTION',
    flavor: '一块砖倒下，一整面墙陪葬。',
    rarity: 'epic',
    maxLevel: 1,
    tags: ['explosion'],
    requires: { explosive: 1 },
    apply: (s) => {
      s.explosionChain = true;
    },
    describe: () => `被爆炸击碎的砖块会${b('再次爆炸')}，伤害不衰减。一场链式反应就够了。`,
  }),
  def({
    id: 'meltdown',
    name: '熔毁核心',
    code: 'MELTDOWN',
    flavor: '冷却系统？拆了。',
    rarity: 'epic',
    maxLevel: 1,
    tags: ['explosion', 'fire'],
    requires: { explosive: 2 },
    apply: (s) => {
      s.explosionRadiusMult += 0.6;
      s.firePool = true;
    },
    describe: () => `爆炸范围 ${b('+60%')}，并在原地留下持续 2 秒的${b('火海')}（每秒 70% 攻击力伤害）。`,
  }),
  def({
    id: 'void',
    name: '虚空侵蚀',
    code: 'VOID TOUCH',
    flavor: '这里的空间不太稳定。',
    rarity: 'epic',
    maxLevel: 3,
    tags: ['void'],
    apply: (s, lv) => {
      s.voidChance += 0.07 * lv;
    },
    describe: (lv) =>
      `击碎砖块时 ${b(pct(0.07 * lv))} 概率撕开${b('黑洞')}：弯曲球体轨迹、绞碎周围砖块，结束时爆裂。`,
  }),
  def({
    id: 'reaper',
    name: '终末宣告',
    code: 'DECREE',
    flavor: '数值只是建议。',
    rarity: 'epic',
    maxLevel: 4,
    tags: ['damage'],
    apply: (s, lv) => {
      s.reaperRatio += 0.06 * lv;
    },
    describe: (lv) => `对生命低于 ${b(pct(0.06 * lv))} 的砖块直接${b('处决')}（BOSS 核心免疫）。`,
  }),
  def({
    id: 'poison',
    name: '腐蚀之毒',
    code: 'CORROSIVE',
    flavor: '百分比，无视一切防御。',
    rarity: 'epic',
    maxLevel: 3,
    tags: ['poison'],
    apply: (s, lv) => {
      s.poison += lv;
      s.poisonRatio = 0.025 * lv;
    },
    describe: (lv) =>
      `命中附加${b('腐蚀')}：每秒造成目标最大生命 ${b(pct(0.025 * lv))} 的伤害，持续 4 秒。BOSS 克星。`,
  }),
  def({
    id: 'solar',
    name: '日珥之球',
    code: 'PROMINENCE',
    flavor: '每一颗球都是一颗小太阳。',
    rarity: 'epic',
    maxLevel: 3,
    tags: ['fire'],
    apply: (s, lv) => {
      s.solarDps += 0.45 * lv;
    },
    describe: (lv) => `球体周围形成${b('日冕')}（范围 80），每秒造成 ${b(pct(0.45 * lv))} 攻击力伤害。`,
  }),
  def({
    id: 'orbital',
    name: '轨道打击',
    code: 'ORBITAL LANCE',
    flavor: '天基支援已就位。',
    rarity: 'epic',
    maxLevel: 3,
    tags: ['laser'],
    apply: (s, lv) => {
      s.orbitalCount += lv;
    },
    describe: (lv) => `每 4 秒召唤 ${b(lv)} 道${b('轨道光束')}贯穿整列砖块，列内每块砖受到 300% 攻击力伤害。`,
  }),
  def({
    id: 'timestop',
    name: '时停力场',
    code: 'TEMPORAL STASIS',
    flavor: '世界，停下。',
    rarity: 'epic',
    maxLevel: 2,
    tags: ['time'],
    apply: (s, lv) => {
      s.timeStopInterval = 20;
      s.timeStopDuration = 2.5 + 0.5 * lv;
    },
    describe: (lv) =>
      `每 20 秒自动触发 ${b((2.5 + 0.5 * lv).toFixed(1))} 秒${b('时停')}：敌方全部静止，球体伤害 ${b('×2')}。`,
  }),
  def({
    id: 'mirror',
    name: '镜像宇宙',
    code: 'MIRROR VERSE',
    flavor: '镜子里也有人在打球。',
    rarity: 'epic',
    maxLevel: 2,
    tags: ['ball'],
    apply: (s, lv) => {
      s.ghostRatio = 0.4 * lv;
    },
    describe: (lv) => `每个球体附带一个${b('镜像幽灵球')}，造成 ${b(pct(0.4 * lv))} 伤害。`,
  }),
  def({
    id: 'afterglow',
    name: '过载余波',
    code: 'AFTERGLOW',
    flavor: '余温也能烫伤人。',
    rarity: 'epic',
    maxLevel: 1,
    tags: ['overdrive'],
    apply: (s) => {
      s.afterglow = true;
    },
    describe: () => `超载结束时释放${b('全屏冲击波')}，对所有砖块造成 ${b('200%')} 攻击力伤害。`,
  }),
  def({
    id: 'thunderhead',
    name: '雷云',
    code: 'THUNDERHEAD',
    flavor: '头顶总有朵乌云。',
    rarity: 'epic',
    maxLevel: 2,
    tags: ['shock'],
    apply: (s, lv) => {
      s.thunder += lv;
      s.shockChains += 2 * lv;
    },
    describe: (lv) =>
      `每 2.5 秒，闪电击中最靠近警戒线的砖块：${b(pct(3 * lv))} 攻击力伤害，并引发${b('闪电链')}（跳跃 ${b(2 * lv)} 次）。`,
  }),
  def({
    id: 'plague',
    name: '瘟疫传播',
    code: 'PLAGUE',
    flavor: '一个倒下，一排传染。',
    rarity: 'epic',
    maxLevel: 1,
    tags: ['poison'],
    requires: { poison: 1 },
    apply: (s) => {
      s.plague = true;
    },
    describe: () => `被${b('腐蚀')}的砖块击碎时，把腐蚀扩散给半径 ${b(150)} 内的所有砖块。`,
  }),
  def({
    id: 'wildfire',
    name: '野火',
    code: 'WILDFIRE',
    flavor: '烧起来就停不下来。',
    rarity: 'epic',
    maxLevel: 1,
    tags: ['fire'],
    requires: { fire: 1 },
    apply: (s) => {
      s.wildfire = true;
    },
    describe: () => `${b('灼烧')}中的砖块被击碎时，点燃半径 ${b(140)} 内的所有砖块。`,
  }),
  def({
    id: 'prism',
    name: '棱镜',
    code: 'PRISM',
    flavor: '一束进去，三束出来。',
    rarity: 'epic',
    maxLevel: 1,
    tags: ['laser'],
    requires: { laser: 1 },
    apply: (s) => {
      s.prism = true;
    },
    describe: () => `激光命中时向左右${b('折射')}，各自再命中 1 块相邻砖块（${b('50%')} 攻击力伤害）。`,
  }),

  // ───────────────────────────── LEGENDARY ─────────────────────────────
  def({
    id: 'singularity',
    name: '奇点',
    code: 'SINGULARITY',
    flavor: '它不挑食。',
    rarity: 'legendary',
    maxLevel: 1,
    tags: ['void'],
    apply: (s) => {
      s.singularity = true;
    },
    describe: () => `一枚${b('奇点')}在场地中游荡，持续绞碎它经过的每一块砖。`,
  }),
  def({
    id: 'phantom',
    name: '万物皆穿',
    code: 'PHANTOM LANCE',
    flavor: '挡在前面的，都只是装饰。',
    rarity: 'legendary',
    maxLevel: 1,
    tags: ['ball'],
    requires: { pierce: 3 },
    apply: (s) => {
      s.pierceChance = 1;
      s.pierceBonus = 0.25;
      s.momentumMax = Math.max(s.momentumMax, 3);
    },
    describe: () =>
      `穿透概率提升至 ${b('100%')}；每次穿透使该球伤害 ${b('+25%')}（触碰挡板后重置，最高 +300%）。`,
  }),
  def({
    id: 'recursion',
    name: '无限分裂',
    code: 'RECURSION',
    flavor: '分裂的分裂的分裂……',
    rarity: 'legendary',
    maxLevel: 1,
    tags: ['ball'],
    requires: { split: 3 },
    apply: (s) => {
      s.splitChance += 0.3;
      s.splitChildren = true;
    },
    describe: () => `分裂概率 ${b('+30%')}，且${b('子球也能继续分裂')}。理论上没有尽头。`,
  }),
  def({
    id: 'overclock',
    name: '超频',
    code: 'OVERCLOCK',
    flavor: '保修？什么保修？',
    rarity: 'legendary',
    maxLevel: 1,
    tags: ['overdrive'],
    apply: (s) => {
      s.odDurationMult = 2;
      s.odDamageBonus = 2;
    },
    describe: () => `${b('超载')}持续时间 ${b('×2')}，期间伤害额外 ${b('×2')}。`,
  }),
  def({
    id: 'momentum',
    name: '动量累积',
    code: 'MOMENTUM',
    flavor: '越弹越痛。',
    rarity: 'legendary',
    maxLevel: 1,
    tags: ['ball'],
    apply: (s) => {
      s.momentumPerHit = 0.12;
      s.momentumMax = Math.max(s.momentumMax, 3);
    },
    describe: () => `球每次击中砖块，伤害 ${b('+12%')}（触碰挡板后重置，最高 ${b('+300%')}）。`,
  }),
  def({
    id: 'twinresonance',
    name: '双共振',
    code: 'TWIN RESONANCE',
    flavor: '一颗胶囊，两份快乐。',
    rarity: 'legendary',
    maxLevel: 1,
    tags: ['resonance'],
    requires: { resonator: 2 },
    apply: (s) => {
      s.buffTwin = true;
    },
    describe: () => `拾取临时增益时，额外随机触发${b('另一个增益')}（持续时间为 50%）。`,
  }),
  def({
    id: 'criticalmass',
    name: '临界质量',
    code: 'CRITICAL MASS',
    flavor: '链式反应，停不下来。',
    rarity: 'legendary',
    maxLevel: 1,
    tags: ['overdrive'],
    requires: { capacitor: 2 },
    apply: (s) => {
      s.criticalMass = true;
    },
    describe: () => `超载期间每击碎 ${b(5)} 块砖，超载延长 ${b('0.5 秒')}（最多延长 ${b('6 秒')}）。`,
  }),

  // ───────────────────────────── MYTHIC ─────────────────────────────
  def({
    id: 'supernova',
    name: '超新星',
    code: 'SUPERNOVA',
    flavor: '恒星最后的谢幕。',
    rarity: 'mythic',
    maxLevel: 1,
    tags: ['explosion'],
    requires: { meltdown: 1, chainreaction: 1 },
    apply: (s) => {
      s.explosionRadiusMult += 1;
      s.supernova = 0.25;
    },
    describe: () =>
      `爆炸范围 ${b('×2')}；每次爆炸有 ${b('25%')} 概率升华为${b('超新星')}——范围 ×3.5，伤害 ×3，照亮整个屏幕。`,
  }),
  def({
    id: 'eventhorizon',
    name: '事件视界',
    code: 'EVENT HORIZON',
    flavor: '连光都无法逃逸。',
    rarity: 'mythic',
    maxLevel: 1,
    tags: ['void'],
    requires: { void: 2, singularity: 1 },
    apply: (s) => {
      s.holeDurationMult = 2;
      s.holeRadiusMult = 2;
      s.holeDamageMult = 3;
      s.singularityDamageMult = 2;
    },
    describe: () => `黑洞范围与持续时间 ${b('×2')}，爆裂伤害 ${b('×3')}；奇点伤害 ${b('×2')}。`,
  }),
  def({
    id: 'absolutezero',
    name: '绝对零度',
    code: 'ABSOLUTE ZERO',
    flavor: '分子也停止了思考。',
    rarity: 'mythic',
    maxLevel: 1,
    tags: ['frost', 'shock'],
    requires: { frost: 3, shock: 2 },
    apply: (s) => {
      s.freezeChance = 1;
      s.iceBurst = true;
    },
    describe: () => `冻结${b('必定触发')}；被冻结的砖块破碎时引发${b('冰爆')}（范围 130，120% 攻击力伤害）。`,
  }),
  def({
    id: 'perpetuum',
    name: '永动引擎',
    code: 'PERPETUUM',
    flavor: '能量守恒？没听说过。',
    rarity: 'mythic',
    maxLevel: 1,
    tags: ['resonance', 'overdrive'],
    requires: { overclock: 1, resonator: 2 },
    apply: (s) => {
      s.buffPerpetuum = true;
    },
    describe: () => `超载期间${b('增益倒计时暂停')}；增益生效期间，超载能量获取 ${b('×3')}。`,
  }),
];

export const UPGRADE_MAP: Record<string, UpgradeDef> = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));

export const RARITIES: readonly UpgradeDef['rarity'][] = ['common', 'rare', 'epic', 'legendary', 'mythic'];

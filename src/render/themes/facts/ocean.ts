import type { ThemeFacts } from '../types';

/**
 * OCEAN as the shop, the save and the wallet mirror know it: names, prices and colours, and
 * nothing a renderer needs. The scene and the recipes it throws live in `../art/ocean`.
 */
export const OCEAN: ThemeFacts<'ocean'> = {
  id: 'ocean',
  name: '深海秘境',
  en: 'OCEAN FANTASY',
  desc: '蓝青色的梦幻海底：海神水流、深海水晶与光束下的遗迹。',
  price: 4800,
  colors: {
    primary: 0x16d9f5,
    secondary: 0x397eff,
    highlight: 0xd6ffff,
    accent: 0x2fd9f7,
    depths: [0x020a1e, 0x04194a, 0x0a3a7a],
  },
  paddle: {
    price: 1200,
    name: '海神水流',
    en: 'NEPTUNE FLOW',
    desc: '弹板主题：凝聚的水元素能量，两端水流向上卷曲，移动时冒出气泡。',
  },
  ball: {
    price: 1600,
    name: '深海水晶',
    en: 'ABYSS CRYSTAL',
    desc: '球体主题：蓝色发光水晶裹在透明水球里，拖着气泡前行。',
    glow: { glow: 0x3fb5ff, trail: 0x5fe6ff, core: 0xd8f6ff },
    halo: [0.8, 0.62],
  },
  bg: {
    price: 3000,
    name: '深海遗迹',
    en: 'SUNKEN TEMPLE',
    desc: '背景主题：海面透下的光束里，沉睡的海底神殿、珊瑚与海草。',
  },
};

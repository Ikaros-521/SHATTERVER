import type { ThemeFacts } from '../types';

/**
 * FOREST as the shop, the save and the wallet mirror know it: names, prices and colours, and
 * nothing a renderer needs. The scene and the recipes it throws live in `../art/forest`.
 */
export const FOREST: ThemeFacts<'forest'> = {
  id: 'forest',
  name: '精灵森林',
  en: 'FOREST FANTASY',
  desc: '绿色的治愈森林：精灵树枝、生命宝石与洒满光束的林间空地。',
  price: 4800,
  colors: {
    primary: 0x7dff9b,
    secondary: 0x28c77a,
    highlight: 0xe2ffb4,
    accent: 0x6df795,
    depths: [0x04140c, 0x0a2e1b, 0x164a2a],
  },
  paddle: {
    price: 1200,
    name: '精灵树枝',
    en: 'ELVEN BOUGH',
    desc: '弹板主题：一根弯曲的魔法树枝，两侧生着叶片，中央嵌着生命宝石。',
  },
  ball: {
    price: 1600,
    name: '生命宝石',
    en: 'LIFE GEM',
    desc: '球体主题：绿色生命宝石，内部流淌着能量，身后跟着萤火。',
    glow: { glow: 0x6cf59a, trail: 0x9dffb8, core: 0xeaffd0 },
    halo: [0.8, 0.62],
  },
  bg: {
    price: 3000,
    name: '魔法森林',
    en: 'ENCHANTED FOREST',
    desc: '背景主题：古树、藤蔓与瀑布的魔法森林，阳光穿过树叶，萤火漂浮。',
  },
};

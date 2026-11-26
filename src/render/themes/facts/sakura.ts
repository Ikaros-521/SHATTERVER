import type { ThemeFacts } from '../types';

/**
 * SAKURA as the shop, the save and the wallet mirror know it: names, prices and colours, and
 * nothing a renderer needs. The scene and the recipes it throws live in `../art/sakura`.
 */
export const SAKURA: ThemeFacts<'sakura'> = {
  id: 'sakura',
  name: '樱花物语',
  en: 'SAKURA FANTASY',
  desc: '粉紫色的夜樱庭院：樱花魔法扇、樱花核心与一轮明月。',
  price: 4800,
  colors: {
    primary: 0xff91c8,
    secondary: 0xd9a7ff,
    highlight: 0xfff0f8,
    accent: 0xff8fc6,
    depths: [0x0a0722, 0x1c1048, 0x43256f],
  },
  paddle: {
    price: 1200,
    name: '樱花魔法扇',
    en: 'SAKURA FAN',
    desc: '弹板主题：粉色能量扇面，两端展开樱花扇骨，移动时洒落花瓣。',
  },
  ball: {
    price: 1600,
    name: '樱花核心',
    en: 'SAKURA CORE',
    desc: '球体主题：粉白能量核心带着淡粉光环，拖尾化作飘落的花瓣。',
    glow: { glow: 0xff9ad0, trail: 0xffb9de, core: 0xfff0f8 },
    halo: [1, 1],
  },
  bg: {
    price: 3000,
    name: '夜樱庭院',
    en: 'SAKURA NIGHT GARDEN',
    desc: '背景主题：月下的庭园，远山、石灯笼与小桥，樱花缓缓飘落。',
  },
};

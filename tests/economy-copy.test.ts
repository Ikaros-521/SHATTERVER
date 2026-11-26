import { describe, expect, it } from 'vitest';
import { en } from '../src/i18n/en';
import { ja } from '../src/i18n/ja';
import { ko } from '../src/i18n/ko';
import { zh } from '../src/i18n/zh';
import { PROTOCOLS, SUPPLIES } from '../src/game/economy/catalog';
import { SKINS } from '../src/render/skins';

/**
 * The shop adds a lot of player-facing copy at once; this is the tutorial test's pattern applied
 * to it. The platform review rejects bundles over single words, so the guard runs over the
 * canonical Chinese (the locale the reviewers read first), every other locale's shop namespace,
 * and the catalog's canonical strings — and it is stricter than the release scanner, because
 * nothing here needs commerce or chance vocabulary anyway.
 */

const BANNED = /死|杀|血|毒|疫|瘟|处决|邪魔|0MB|极致|最强|顶级|唯一|绝对|免安装|充值|付费|内购|购买|礼包|抽奖|开箱|转盘|钻石|赌博|色情|约炮/;
const BANNED_LATIN =
  /\b(KILLER|WEAPON|DEATH|BOMB|GAMBLE|GAMBLING|CASINO|PORN|LOOT|GACHA|REVIVE|LETHAL|PURCHASE|PAID)\b/i;

const hits: string[] = [];

function walk(value: unknown, path: string): void {
  if (typeof value === 'string') {
    if (BANNED.test(value)) hits.push(`${path}: ${value}`);
    else if (BANNED_LATIN.test(value)) hits.push(`${path}: ${value}`);
  } else if (Array.isArray(value)) {
    value.forEach((entry, i) => walk(entry, `${path}[${i}]`));
  } else if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) walk(entry, `${path}.${key}`);
  }
}

describe('shop copy stays inside the platform review vocabulary', () => {
  it('the canonical Chinese shop namespace is clean', () => {
    walk(zh.shop, 'zh.shop');
    expect(hits).toEqual([]);
  });

  it('every other locale is clean too', () => {
    walk(en.shop, 'en.shop');
    walk(ja.shop, 'ja.shop');
    walk(ko.shop, 'ko.shop');
    expect(hits).toEqual([]);
  });

  it('the catalog\u2019s canonical names and descriptions are clean', () => {
    for (const protocol of PROTOCOLS) {
      walk({ name: protocol.name, desc: protocol.desc, en: protocol.en }, `protocol.${protocol.id}`);
    }
    for (const supply of SUPPLIES) {
      walk({ name: supply.name, desc: supply.desc, en: supply.en }, `supply.${supply.id}`);
    }
    expect(hits).toEqual([]);
  });

  it('the skins module\u2019s canonical names and descriptions are clean', () => {
    for (const skin of SKINS) {
      walk({ name: skin.name, desc: skin.desc, en: skin.en }, `skin.${skin.id}`);
    }
    expect(hits).toEqual([]);
  });

  it('every milestone id has copy in the canonical dictionary, in 名称｜描述 shape', () => {
    for (const milestone of MILESTONE_IDS) {
      const entry = zh.shop.ms[milestone as keyof typeof zh.shop.ms];
      expect(entry, milestone).toBeTruthy();
      expect(entry?.includes('｜'), milestone).toBe(true);
    }
  });
});

import { MILESTONES } from '../src/game/economy/milestones';

const MILESTONE_IDS = MILESTONES.map((milestone) => milestone.id);

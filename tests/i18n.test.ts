import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_LANG, dict, getLang, isLang, setLang, t } from '../src/core/i18n';
import { ko } from '../src/i18n/ko';
import { en } from '../src/i18n/en';
import { ja } from '../src/i18n/ja';
import { zh } from '../src/i18n/zh';
import { buffDesc, buffName, buffShort } from '../src/i18n/content';
import { DEFAULT_SETTINGS } from '../src/core/storage';
import { BUFFS, BUFF_MAP } from '../src/game/buffs/defs';
import { DIFFICULTIES } from '../src/game/difficulty';
import { BOSSES, CHAPTERS, COMBO_TIERS, MODIFIERS, REACTIONS } from '../src/game/levels/definitions';
import { STARTERS } from '../src/game/starters';
import { UPGRADES } from '../src/game/upgrades/defs';
import { RARITY_INFO, TAG_INFO } from '../src/game/upgrades/present';

/** Every locale and its content-override table, for the parity assertions below. */
const TRANSLATED = { en, ja, ko } as const;

/** Collects every string-key path of a plain object, e.g. `menu.recordWins`. */
function keyPaths(value: unknown, prefix = ''): string[] {
  if (typeof value === 'string') return [prefix];
  if (Array.isArray(value)) {
    return value.flatMap((entry, i) => keyPaths(entry, `${prefix}.${i}`));
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, entry]) =>
      keyPaths(entry, prefix ? `${prefix}.${key}` : key),
    );
  }
  return [];
}

describe('locale parity', () => {
  it('en, ja and ko carry every UI key the canonical zh dictionary defines', () => {
    // The `content` subtree is the per-locale game-content override table (zh keeps none — its
    // canonical text lives in the game modules), so it is excluded from the key comparison.
    const uiKeys = (value: object): string[] =>
      keyPaths(value)
        .filter((path) => !path.startsWith('content.'))
        .sort();
    const canonical = uiKeys(zh);
    for (const [name, table] of Object.entries(TRANSLATED)) {
      expect(uiKeys(table), `${name} is missing UI keys`).toEqual(canonical);
    }
  });

  it('overrides every game-content id the game defines, with working describe templates', () => {
    for (const [name, table] of Object.entries(TRANSLATED)) {
      const content = table.content;
      for (const def of UPGRADES) {
        const override = content.upgrades[def.id];
        expect(override, `${name}: upgrade ${def.id} is untranslated`).toBeTruthy();
        expect(override.name.trim()).not.toBe('');
        expect(override.flavor.trim()).not.toBe('');
        for (const lv of [1, def.maxLevel]) {
          const text = override.describe(lv);
          expect(text).not.toMatch(/\{/);
          expect(text).toContain('<b>');
        }
      }
      for (const buff of BUFFS) {
        const override = content.buffs[buff.id];
        expect(override, `${name}: buff ${buff.id} is untranslated`).toBeTruthy();
        expect(override.name.trim()).not.toBe('');
        expect(override.desc.trim()).not.toBe('');
        expect(override.desc, `${name}: buff ${buff.id}`).not.toMatch(/\{/);
        // An instant buff has no countdown to show, so its banner needs a line of its own.
        if (buff.duration > 0) expect(override.short).toBeUndefined();
        else expect(override.short?.trim(), `${name}: instant buff ${buff.id}`).not.toBe('');
      }
      for (const tier of DIFFICULTIES) {
        const override = content.difficulty[tier.id];
        expect(override, `${name}: difficulty ${tier.id} is untranslated`).toBeTruthy();
        expect(override.detail.length).toBe(tier.detail.length);
      }
      for (const starter of STARTERS) {
        expect(content.starters[starter.id], `${name}: starter ${starter.id} is untranslated`).toBeTruthy();
      }
      expect(content.chapters.map((chapter) => chapter.places.length)).toEqual(
        CHAPTERS.map((chapter) => chapter.places.length),
      );
      for (const modifier of MODIFIERS) {
        expect(content.mutators[modifier.id], `${name}: mutator ${modifier.id} is untranslated`).toBeTruthy();
      }
      for (const boss of BOSSES) {
        expect(content.bosses[boss.id], `${name}: boss ${boss.id} is untranslated`).toBeTruthy();
      }
      for (const reaction of REACTIONS) {
        expect(
          content.reactions[reaction.id],
          `${name}: reaction ${reaction.id} is untranslated`,
        ).toBeTruthy();
      }
      expect(content.comboTiers).toHaveLength(COMBO_TIERS.length);
      expect(Object.keys(content.rarity).sort()).toEqual(Object.keys(RARITY_INFO).sort());
      expect(Object.keys(content.tags).sort()).toEqual(Object.keys(TAG_INFO).sort());
    }
  });
});

describe('t()', () => {
  beforeEach(() => {
    setLang(DEFAULT_LANG);
  });

  it('defaults to Chinese and reads dot paths', () => {
    expect(getLang()).toBe('zh');
    expect(t('menu.settings')).toBe('设置');
  });

  it('fills {param} placeholders', () => {
    expect(t('menu.recordWins', { n: 3 })).toBe('通关 3 次');
  });

  it('falls back to the raw key when the path is missing everywhere', () => {
    expect(t('no.such.key')).toBe('no.such.key');
  });

  it('switches with the language and updates content accessors', () => {
    setLang('en');
    expect(t('menu.settings')).toBe('Settings');
    const power = UPGRADES.find((def) => def.id === 'power');
    expect(power).toBeTruthy();
    expect(dict().content?.upgrades.power?.name).toBe('Power Core');
    expect(buffName(BUFF_MAP.split)).toBe('Ball Split');
    expect(buffDesc(BUFF_MAP.aegis)).toContain('barrier');
    expect(buffShort(BUFF_MAP.overcharge)).toBe('Meter full');
    // Chinese reads the canonical fields: there is no override table to consult.
    setLang('zh');
    expect(buffName(BUFF_MAP.split)).toBe('球体分裂');
    expect(buffShort(BUFF_MAP.overcharge)).toBe(BUFF_MAP.overcharge.short);
  });

  it('isLang narrows only real languages and rejects lookalikes', () => {
    for (const lang of ['zh', 'en', 'ja', 'ko']) expect(isLang(lang)).toBe(true);
    for (const lang of ['fr', 'ZH', 'enn', '', null]) expect(isLang(lang)).toBe(false);
  });

  it('ships Chinese as the default language, regardless of anything else', () => {
    expect(DEFAULT_SETTINGS.language).toBe('zh');
  });
});

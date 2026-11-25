import { en } from '../i18n/en';
import { ja } from '../i18n/ja';
import { ko } from '../i18n/ko';
import { zh, type UiDict } from '../i18n/zh';
import type { ContentOverrides } from '../i18n/content-types';

/**
 * The game's own i18n: a module-level language, dot-path lookup with `{param}` interpolation,
 * and per-locale game-content overrides.
 *
 * - **UI copy** lives in the dictionaries (`i18n/zh.ts` and friends). `zh` is canonical; the
 *   other locales are typed as `UiDict & { content: ContentOverrides }`, so a missing key is a
 *   compile error and an untranslated game id is a failed test (`tests/i18n.test.ts`).
 * - **Game-content copy** (upgrade names, level names, …) stays canonical in the `game/` modules;
 *   `i18n/content.ts` routes reads through the active locale's override table.
 * - The default language is Chinese regardless of the browser locale — this is a Chinese-first
 *   game; switching happens explicitly in settings (or a stored save).
 * - `t()` falls back to the canonical string at runtime if a key is somehow absent, so a lookup
 *   can never render `undefined` into the DOM.
 */

export type Lang = 'zh' | 'en' | 'ja' | 'ko';

export type Locale = UiDict & { content?: ContentOverrides };

/** Languages as offered in settings, labels in their own language (never translated). */
export const LANGS: readonly { id: Lang; label: string; htmlLang: string }[] = [
  { id: 'zh', label: '中文', htmlLang: 'zh-CN' },
  { id: 'en', label: 'English', htmlLang: 'en' },
  { id: 'ja', label: '日本語', htmlLang: 'ja' },
  { id: 'ko', label: '한국어', htmlLang: 'ko' },
];

const DICTS: Record<Lang, Locale> = { zh, en, ja, ko };

export const DEFAULT_LANG: Lang = 'zh';

export function isLang(value: unknown): value is Lang {
  return typeof value === 'string' && DICTS[value as Lang] !== undefined;
}

let current: Lang = DEFAULT_LANG;

export function getLang(): Lang {
  return current;
}

export function setLang(lang: Lang): void {
  current = lang;
}

/** The active locale's dictionary, for code that wants whole sections (tutorial pages, …). */
export function dict(): Locale {
  return DICTS[current];
}

function lookup(dict: unknown, key: string): string | undefined {
  let node: unknown = dict;
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null || !(part in node)) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' ? node : undefined;
}

/**
 * Looks up `key` in the active locale and fills `{param}` placeholders. Falls back to the
 * canonical Chinese string when the key is missing, and to the raw key when it is missing
 * everywhere (a bug, but a visible and debuggable one).
 */
export function t(key: string, params: Record<string, string | number> = {}): string {
  const raw = lookup(DICTS[current], key) ?? lookup(DICTS[DEFAULT_LANG], key) ?? key;
  return raw.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}

/**
 * Applies the active language to the static markup: `data-i18n` text nodes, `data-i18n-html`
 * blocks, attribute hooks (`data-i18n-title`, `data-i18n-placeholder`), plus `<title>`, the meta
 * description and `<html lang>`. Screens that render from data re-render themselves; this sweep
 * covers the parts that only exist in `index.html`.
 */
export function applyDom(doc: Document = document): void {
  const d = DICTS[current];
  doc.documentElement.lang = d.meta.htmlLang;
  doc.title = d.meta.title;
  doc.querySelector('meta[name="description"]')?.setAttribute('content', d.meta.description);
  doc.querySelectorAll<HTMLElement>('[data-i18n]').forEach((node) => {
    node.textContent = t(node.dataset.i18n as string);
  });
  doc.querySelectorAll<HTMLElement>('[data-i18n-html]').forEach((node) => {
    node.innerHTML = t(node.dataset.i18nHtml as string);
  });
  doc.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach((node) => {
    node.setAttribute('title', t(node.dataset.i18nTitle as string));
  });
  doc.querySelectorAll<HTMLElement>('[data-i18n-placeholder]').forEach((node) => {
    node.setAttribute('placeholder', t(node.dataset.i18nPlaceholder as string));
  });
  doc.querySelectorAll<HTMLElement>('[data-i18n-aria]').forEach((node) => {
    node.setAttribute('aria-label', t(node.dataset.i18nAria as string));
  });
}

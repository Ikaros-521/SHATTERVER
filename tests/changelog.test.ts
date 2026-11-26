import { describe, expect, it } from 'vitest';
import { dict, setLang } from '../src/core/i18n';
import { APP_VERSION } from '../src/core/version';
import type { ChangelogEntry } from '../src/i18n/zh';
import { changelogUnseen } from '../src/ui/changelog';

const LOCALES = ['zh', 'en', 'ja', 'ko'] as const;

/** The release notes as `lang` writes them. */
function entries(lang: (typeof LOCALES)[number]): ChangelogEntry[] {
  setLang(lang);
  return dict().changelog.versions;
}

/** `[major, minor, patch]` of a release version. */
function parts(version: string): number[] {
  return version.split('.').map(Number);
}

/** Positive when `a` is the newer version. */
function compare(a: string, b: string): number {
  const pa = parts(a);
  const pb = parts(b);
  for (let i = 0; i < 3; i++) {
    const delta = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (delta !== 0) return delta;
  }
  return 0;
}

/** Everything the changelog screen can put on screen in the canonical locale, as one string. */
function canonicalCopy(): string {
  setLang('zh');
  return JSON.stringify(dict().changelog);
}

describe('release notes', () => {
  it('covers the running build: the newest entry is this version, in every locale', () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    for (const lang of LOCALES) {
      const list = entries(lang);
      expect(list.length).toBeGreaterThan(0);
      expect(list[0]?.version, lang).toBe(APP_VERSION);
    }
  });

  it('is a well-ordered history: versions newest first, each x.y.z with a real ISO date', () => {
    for (const lang of LOCALES) {
      entries(lang).forEach((entry, i, list) => {
        expect(entry.version, `${lang} ${entry.version}`).toMatch(/^\d+\.\d+\.\d+$/);
        expect(entry.date, `${lang} ${entry.version}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        // A made-up date such as 2026-13-40 does not round-trip.
        expect(new Date(entry.date).toISOString().slice(0, 10), `${lang} ${entry.version}`).toBe(entry.date);
        if (i === 0) return;
        const newer = list[i - 1];
        if (!newer) return;
        expect(
          compare(newer.version, entry.version),
          `${lang}: ${newer.version} then ${entry.version}`,
        ).toBeGreaterThan(0);
        expect(entry.date <= newer.date, `${lang}: ${newer.date} then ${entry.date}`).toBe(true);
      });
    }
  });

  it('tells every locale the same versions on the same dates', () => {
    const [canonical, ...others] = LOCALES.map((lang) =>
      entries(lang).map((entry) => [entry.version, entry.date]),
    );
    for (const other of others) expect(other).toEqual(canonical);
  });

  it('says something in every entry, in every locale: a title, real notes, highlights only in <b>', () => {
    for (const lang of LOCALES) {
      entries(lang).forEach((entry) => {
        expect(entry.title.trim(), `${lang} ${entry.version}`).not.toBe('');
        expect(entry.notes.length, `${lang} ${entry.version}`).toBeGreaterThan(0);
        for (const note of entry.notes) {
          expect(note.trim(), `${lang} ${entry.version}`).not.toBe('');
          // A placeholder nobody filled in would read as literal braces.
          expect(note, `${lang} ${entry.version}`).not.toMatch(/\{\w+\}/);
          // Notes are set as HTML, so `<b>` is the only tag they may carry.
          expect(note.replace(/<\/?b>/g, ''), `${lang} ${entry.version}`).not.toMatch(/[<>]/);
        }
      });
    }
  });

  it('is translated, not copied: no locale repeats the canonical entry word for word', () => {
    const canonical = JSON.stringify(entries('zh'));
    for (const lang of ['en', 'ja', 'ko'] as const) {
      expect(JSON.stringify(entries(lang)), lang).not.toBe(canonical);
    }
  });

  it('labels the screen itself in every locale, the eyebrow naming the version', () => {
    for (const lang of LOCALES) {
      setLang(lang);
      const copy = dict().changelog;
      for (const text of [copy.title, copy.sub, copy.latest, copy.close, copy.menuLabel, copy.menuAria]) {
        expect(text.trim(), `${lang}`).not.toBe('');
      }
      expect(copy.eyebrow, lang).toContain('{version}');
    }
  });

  it('keeps the Chinese copy within the platform review vocabulary', () => {
    const copy = canonicalCopy();
    // Combat-flavoured words, the inflated "0MB" claim, and anything pointing off-platform (links,
    // other services) have each cost a review rejection before — the tutorial's test holds the same
    // rule. Naming the platform itself is established vocabulary ("B站排行榜") and is fine.
    expect(copy).not.toMatch(/死|杀|血|武器|弹药|军事|尸体/);
    expect(copy).not.toMatch(/0\s?MB/i);
    expect(copy).not.toMatch(/https?:\/\/|www\.|\.com|github|chedda/i);
  });

  it('keeps the English copy clear of the same words', () => {
    setLang('en');
    // "dead-center" is established game vocabulary and not matched; these are the nouns that are.
    expect(JSON.stringify(dict().changelog)).not.toMatch(
      /\b(kill\w*|weapon\w*|ammunition|military|corpse|blood\w*)\b/i,
    );
  });
});

describe('changelogUnseen', () => {
  it('is false once the running version’s notes have been shown', () => {
    expect(changelogUnseen({ changelogSeen: APP_VERSION })).toBe(false);
  });

  it('is true on a device that has never seen the notes', () => {
    expect(changelogUnseen({ changelogSeen: '' })).toBe(true);
  });

  it('is true for anything but the exact version string: older, newer, or nearly right', () => {
    const [major, minor, patch] = APP_VERSION.split('.').map(Number);
    const older = minor > 0 ? `${major}.${minor - 1}.${patch}` : `${major - 1}.9.9`;
    const newer = `${major}.${minor}.${(patch ?? 0) + 1}`;
    for (const seen of [older, newer, `v${APP_VERSION}`, `${APP_VERSION} `, `${APP_VERSION}.0`]) {
      expect(seen, seen).not.toBe(APP_VERSION);
      expect(changelogUnseen({ changelogSeen: seen }), seen).toBe(true);
    }
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { setLang } from '../src/core/i18n';
import { MAX_HP_BASE, OVERDRIVE_DURATION } from '../src/game/config';
import { MODIFIERS } from '../src/game/levels/definitions';
import { DEFAULT_SETTINGS } from '../src/core/storage';
import { shouldAutoShow } from '../src/ui/tutorial';
import { TUTORIAL_ART } from '../src/ui/tutorialArt';

import { dict } from '../src/core/i18n';

/** The deck, always read in the canonical locale: the review vocabulary constraint is zh-specific. */
function pages() {
  return dict().tutorial.pages;
}

describe('TUTORIAL_PAGES', () => {
  beforeEach(() => {
    setLang('zh');
  });

  it('has a complete deck: every page carries an eyebrow, a title and body copy', () => {
    expect(pages().length).toBeGreaterThanOrEqual(5);
    for (const page of pages()) {
      expect(page.eyebrow.trim()).not.toBe('');
      expect(page.title.trim()).not.toBe('');
      expect(page.html.trim()).not.toBe('');
    }
    expect(new Set(pages().map((page) => page.eyebrow)).size).toBe(pages().length);
  });

  it('covers the topics the tutorial promises: rules, shield, damage, buffs, debuffs', () => {
    const all = pages()
      .map((page) => page.html)
      .join('\n');
    for (const term of ['护盾', '警戒线', '弹幕', '超载', '三选一', '碎晶', '变异', '元素反应', '红心']) {
      expect(all).toContain(term);
    }
  });

  it('quotes the tuning constants, so the copy cannot drift from the simulation', () => {
    // The placeholders are filled by the UI layer; the dictionary carries them verbatim.
    expect(pages()[1]?.html).toContain('{overdrive}');
    expect(pages()[2]?.html).toContain('{maxHp}');
    expect(OVERDRIVE_DURATION).toBe(6);
    expect(MAX_HP_BASE).toBe(4);
  });

  it('keeps the copy within the platform review vocabulary (no combat-flavored words)', () => {
    const all = pages()
      .map((page) => `${page.eyebrow} ${page.title} ${page.html}`)
      .join('\n');
    expect(all).not.toMatch(/死|杀|血|武器|弹药|军事|尸体/);
  });

  it('renders exactly one mutator page, backed by the real modifier table', () => {
    const mutatorPages = pages().filter((page) => page.mutators);
    expect(mutatorPages).toHaveLength(1);
    expect(MODIFIERS.length).toBeGreaterThanOrEqual(5);
  });

  it('references only illustrations that exist, and illustrates the hands-on pages', () => {
    const named = pages().filter((page): page is typeof page & { art: string } => Boolean(page.art));
    expect(named.length).toBeGreaterThanOrEqual(3);
    for (const page of named) {
      const art = TUTORIAL_ART[page.art];
      expect(art, `page ${page.eyebrow} references missing art "${page.art}"`).toBeTruthy();
      expect(art).toMatch(/^<svg /);
      // Pictures stay language-neutral: no words in any locale, only shapes (numbers like −1 are fine).
      expect(art).not.toMatch(/<text[^>]*>[^<]*[A-Za-z\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/);
    }
    expect(TUTORIAL_ART.danger).toContain('#ff2fb0'); // boss bullets keep their in-game magenta
  });
});

describe('shouldAutoShow', () => {
  it('is true only on a fresh, never-tutored save', () => {
    expect(shouldAutoShow({ tutorialSeen: false }, { runs: 0 })).toBe(true);
  });
  it('is false once the tutorial has been seen, however few the runs', () => {
    expect(shouldAutoShow({ tutorialSeen: true }, { runs: 0 })).toBe(false);
  });
  it('never interrupts a device that already played, even if it has not seen the deck', () => {
    expect(shouldAutoShow({ tutorialSeen: false }, { runs: 3 })).toBe(false);
  });
  it('reads the shipped default as unseen', () => {
    expect(DEFAULT_SETTINGS.tutorialSeen).toBe(false);
  });
});

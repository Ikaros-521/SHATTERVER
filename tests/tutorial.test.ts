import { describe, expect, it } from 'vitest';
import { MAX_HP_BASE, OVERDRIVE_DURATION } from '../src/game/config';
import { MODIFIERS } from '../src/game/levels/definitions';
import { DEFAULT_SETTINGS } from '../src/core/storage';
import { shouldAutoShow, TUTORIAL_PAGES } from '../src/ui/tutorial';

describe('TUTORIAL_PAGES', () => {
  it('has a complete deck: every page carries an eyebrow, a title and body copy', () => {
    expect(TUTORIAL_PAGES.length).toBeGreaterThanOrEqual(5);
    for (const page of TUTORIAL_PAGES) {
      expect(page.eyebrow.trim()).not.toBe('');
      expect(page.title.trim()).not.toBe('');
      expect(page.html.trim()).not.toBe('');
    }
    expect(new Set(TUTORIAL_PAGES.map((page) => page.eyebrow)).size).toBe(TUTORIAL_PAGES.length);
  });

  it('covers the topics the tutorial promises: rules, shield, damage, buffs, debuffs', () => {
    const all = TUTORIAL_PAGES.map((page) => page.html).join('\n');
    for (const term of ['护盾', '警戒线', '弹幕', '超载', '三选一', '碎晶', '变异', '元素反应', '红心']) {
      expect(all).toContain(term);
    }
  });

  it('quotes the tuning constants, so the copy cannot drift from the simulation', () => {
    const all = TUTORIAL_PAGES.map((page) => page.html).join('\n');
    expect(all).toContain(String(MAX_HP_BASE));
    expect(all).toContain(String(OVERDRIVE_DURATION));
  });

  it('keeps the copy within the platform review vocabulary (no combat-flavored words)', () => {
    const all = TUTORIAL_PAGES.map((page) => `${page.eyebrow} ${page.title} ${page.html}`).join('\n');
    expect(all).not.toMatch(/死|杀|血|武器|弹药|军事|尸体/);
  });

  it('renders exactly one mutator page, backed by the real modifier table', () => {
    const mutatorPages = TUTORIAL_PAGES.filter((page) => page.mutators);
    expect(mutatorPages).toHaveLength(1);
    expect(MODIFIERS.length).toBeGreaterThanOrEqual(5);
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

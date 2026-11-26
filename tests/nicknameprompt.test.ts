import { describe, expect, it } from 'vitest';
import { dict, setLang } from '../src/core/i18n';
import type { Leaderboard } from '../src/net/leaderboard';
import { shouldAskNickname } from '../src/ui/nickname';

const LOCALES = ['zh', 'en', 'ja', 'ko'] as const;

/** Minimal fakes: the ask condition only reads the channel kind and the current nickname. */
const channel = (kind: 'chedda' | 'toy', nickname: string): Leaderboard =>
  ({ kind, nickname }) as Leaderboard;

describe('entry nickname ask', () => {
  it('asks on the Chedda channel until a name is chosen', () => {
    expect(shouldAskNickname(channel('chedda', ''))).toBe(true);
    expect(shouldAskNickname(channel('chedda', 'Ace'))).toBe(false);
  });

  it('never asks on the B站 Toy channel: the platform names the player', () => {
    expect(shouldAskNickname(channel('toy', ''))).toBe(false);
    expect(shouldAskNickname(channel('toy', '阿碎'))).toBe(false);
  });

  it('never asks when there is no cloud channel at all', () => {
    expect(shouldAskNickname(null)).toBe(false);
  });

  it('carries the ask copy in every locale, with the saved-name interpolation', () => {
    for (const lang of LOCALES) {
      setLang(lang);
      const cloud = dict().cloud;
      expect(cloud.askEyebrow.length, lang).toBeGreaterThan(0);
      expect(cloud.askTitle.length, lang).toBeGreaterThan(0);
      expect(cloud.askSub.length, lang).toBeGreaterThan(0);
      expect(cloud.askSkip.length, lang).toBeGreaterThan(0);
      expect(cloud.askSaved, lang).toContain('{name}');
    }
    setLang('zh');
  });
});

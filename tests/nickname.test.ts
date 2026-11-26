import { describe, expect, it } from 'vitest';
import {
  checkNickname,
  cleanNickname,
  isBlockedName,
  isReservedName,
  NICKNAME_MAX,
  NICKNAME_MIN,
} from '../src/net/nickname';

/** `checkNickname` reduced to a boolean, for the cases that are only interesting as pass/fail. */
const accepts = (name: string): boolean => checkNickname(name).ok;

describe('nickname shape', () => {
  it('accepts letters, digits and underscores within the platform length', () => {
    for (const name of ['Alex', 'alex_99', 'Shatter1', 'A_1', '_ab', 'x'.repeat(NICKNAME_MAX)]) {
      expect(accepts(name), name).toBe(true);
    }
  });

  it('rejects names the server would reject', () => {
    expect(accepts('')).toBe(false);
    expect(accepts('ab')).toBe(false);
    expect(accepts('x'.repeat(NICKNAME_MAX + 1))).toBe(false);
    expect(accepts('has space')).toBe(false);
    expect(accepts('emoji🎉')).toBe(false);
    expect(accepts('dash-name')).toBe(false);
  });

  it('folds fullwidth letters rather than rejecting them', () => {
    // A phone keyboard can produce these; the player meant "Alex".
    expect(checkNickname('Ａｌｅｘ')).toEqual({ ok: true, value: 'Alex' });
    expect(cleanNickname('  Alex  ')).toBe('Alex');
  });

  it('reports why a name was rejected, for the input helper line', () => {
    const short = checkNickname('ab');
    expect(short.ok).toBe(false);
    if (!short.ok) {
      expect(short.problem).toBe('length');
      expect(short.message).toContain(String(NICKNAME_MIN));
    }
    const chinese = checkNickname('测试昵称');
    expect(chinese.ok).toBe(false);
    if (!chinese.ok) {
      expect(chinese.problem).toBe('charset');
      // The hint has to say what *is* allowed, or the player just tries again.
      expect(chinese.message).toContain('英文字母');
    }
  });

  it('strips invisible characters before judging, so a zero-width name is not "unique"', () => {
    expect(cleanNickname('Al\u200bex')).toBe('Alex');
    // Two names that look identical must not both be accepted as different.
    expect(checkNickname('Al\u200bex')).toEqual(checkNickname('Alex'));
  });
});

describe('blocked handles', () => {
  it('catches the obvious', () => {
    for (const name of [
      'fuck',
      'FUCK',
      'sh1t',
      'bitch',
      'nigger',
      'nazi',
      'pornhub',
      'casino',
      'sex',
      'rape',
    ]) {
      expect(isBlockedName(name), name).toBe(true);
    }
  });

  it('catches the usual bypasses', () => {
    for (const name of [
      'f_u_c_k', // separators
      'sh1t', // leet
      '$hit', // leet punctuation
      'f u c k', // spaces
      'fuuuck', // repeated letters
      'fuc.c.k', // punctuation
      'n1gg3r', // leet + digits
      'ｆｕｃｋ', // fullwidth
      'f\u200bu\u200bc\u200bk', // zero-width
      'Naaazi', // repeated vowel
    ]) {
      expect(isBlockedName(name), name).toBe(true);
    }
  });

  it('leaves ordinary names that merely contain the letters alone', () => {
    for (const name of [
      'Cass',
      'Classic',
      'Sussex',
      'Grape',
      'Bassman',
      'Passage',
      'Analyst',
      'Scunthorpe',
    ]) {
      expect(isBlockedName(name), name).toBe(false);
    }
  });

  it('blocks a short term only when it is the whole handle, with an optional digit suffix', () => {
    expect(isBlockedName('ass')).toBe(true);
    // A suffix does not launder it: `Ass_1` normalises to the same word.
    expect(isBlockedName('Ass_1')).toBe(true);
    expect(isBlockedName('ass123')).toBe(true);
    expect(isBlockedName('badass')).toBe(false); // `ass` is a whole-only term, so this passes
  });

  it('rejects non-ASCII handles at the charset step, before the blocklist is consulted', () => {
    for (const name of ['赌博之星', '法轮功', '碎界玩家']) {
      const check = checkNickname(name);
      expect(check.ok, name).toBe(false);
      if (!check.ok) expect(check.problem, name).toBe('charset');
    }
  });
});

describe('reserved handles', () => {
  it('blocks impersonation of the game, the platform and its staff', () => {
    for (const name of [
      'admin',
      'Admin',
      'admin_1',
      'admin42',
      'ADMIN',
      'moderator',
      'mod_2',
      'official',
      'shatterver',
      'Shatterverse_Staff',
      'cheddaboards',
      'player_1234',
      'support1',
    ]) {
      expect(isReservedName(name), name).toBe(true);
    }
  });

  it('leaves names that merely start with those letters alone', () => {
    for (const name of ['Admiral', 'Modern', 'Modest', 'Modular', 'Model', 'Supportive']) {
      expect(isReservedName(name), name).toBe(false);
    }
  });

  it('a reserved name is rejected by the full check even though it is well-formed', () => {
    const check = checkNickname('admin');
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.problem).toBe('reserved');
  });
});

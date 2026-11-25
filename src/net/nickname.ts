/**
 * Nickname policy.
 *
 * Two layers, and they answer different questions:
 *
 * 1. **The platform's rule.** CheddaBoards stores 3–16 characters of `A–Z a–z 0–9 _` and rejects
 *    everything else with a permanent 400. Chinese, emoji and spaces cannot be sent at all, so the
 *    input has to say that plainly instead of letting the player type a name and hit a wall.
 * 2. **This game's rule.** A name that passes the platform can still be abusive, illegal or
 *    politically unpublishable. `isBlockedName` catches those, including the usual bypasses
 *    (`f_u_c_k`, `sh1t`, `fuuuck`, fullwidth and zero-width tricks).
 *
 * Everything here is pure and synchronous, so the input can validate on every keystroke and the
 * submit path never has to trust a name it did not check itself.
 */

import {
  BLOCKED_CJK,
  BLOCKED_SUBSTRINGS,
  BLOCKED_WHOLE,
  RESERVED_PREFIXES,
  RESERVED_SEGMENTS,
} from './blocklist';

export const NICKNAME_MIN = 3;
export const NICKNAME_MAX = 16;

export type NicknameProblem = 'empty' | 'length' | 'charset' | 'blocked' | 'reserved';

export interface NicknameAccepted {
  ok: true;
  /** The cleaned value to send: NFKC-folded, invisibles stripped, trimmed. */
  value: string;
}

export interface NicknameRejected {
  ok: false;
  problem: NicknameProblem;
  /** Player-facing explanation, ready for the input's helper line. */
  message: string;
}

export type NicknameCheck = NicknameAccepted | NicknameRejected;

/* eslint-disable no-control-regex -- the invisible/control character class is the point of this regex */
const INVISIBLE =
  /[\u0000-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff\ufff9-\ufffb]/g;

const LENGTH_MESSAGE = `昵称需为 ${NICKNAME_MIN}–${NICKNAME_MAX} 个字符`;
const CHARSET_MESSAGE = '昵称只能使用英文字母、数字和下划线（云榜不支持中文、空格与表情）';
const BLOCKED_MESSAGE = '这个昵称不可用，请换一个';
const RESERVED_MESSAGE = '这个昵称被系统保留，请换一个';

/** Folds fullwidth forms to ASCII and removes invisibles. Does not validate. */
export function cleanNickname(raw: string): string {
  return raw.normalize('NFKC').replace(INVISIBLE, '').trim();
}

/** True when a string is pure printable ASCII — the only thing the platform accepts. */
export function isAsciiOnly(text: string): boolean {
  return /^[\x20-\x7e]*$/.test(text);
}

/**
 * CheddaBoards' own rule, checked locally so the player is told before a round trip. This is a
 * necessary condition, not a sufficient one: `checkNickname` runs this and then the blocklist.
 */
export function checkNickname(raw: string): NicknameCheck {
  const value = cleanNickname(raw);
  if (value.length === 0) return { ok: false, problem: 'empty', message: '昵称不能为空' };
  if (value.length < NICKNAME_MIN || value.length > NICKNAME_MAX) {
    return { ok: false, problem: 'length', message: LENGTH_MESSAGE };
  }
  if (!/^[A-Za-z0-9_]+$/.test(value)) {
    return { ok: false, problem: 'charset', message: CHARSET_MESSAGE };
  }
  if (isBlockedName(value)) return { ok: false, problem: 'blocked', message: BLOCKED_MESSAGE };
  if (isReservedName(value)) return { ok: false, problem: 'reserved', message: RESERVED_MESSAGE };
  return { ok: true, value };
}

// ───────────────────────────── blocklist matching ─────────────────────────────

/** Digit-and-lookalike substitutions people reach for when a word is filtered. */
const LEET: Readonly<Record<string, string>> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '6': 'g',
  '7': 't',
  '8': 'b',
  '9': 'g',
  '@': 'a',
  $: 's',
  '!': 'i',
  '|': 'i',
  '+': 't',
};

/**
 * Reduces text to letters and (optionally) digits: NFKC, lowercase, leet folded, separators
 * dropped. Dropping separators is what makes `f_u_c_k` one word again.
 */
function reduce(text: string, foldLeet: boolean): string {
  const normal = text.normalize('NFKC').toLowerCase();
  let out = '';
  for (const char of normal) {
    if (char >= 'a' && char <= 'z') out += char;
    else if (char >= '0' && char <= '9') out += foldLeet ? (LEET[char] ?? '') : char;
    else if (foldLeet && char in LEET) out += LEET[char];
  }
  return out;
}

/** Collapses runs of a repeated character: `fuuuck` → `fuck`. */
function collapse(text: string): string {
  return text.replace(/(.)\1+/g, '$1');
}

interface Term {
  plain: string;
  collapsed: string;
}

function terms(list: readonly string[]): Term[] {
  return list.map((term) => {
    const plain = reduce(term, true);
    return { plain, collapsed: collapse(plain) };
  });
}

const SUBSTRING_TERMS = terms(BLOCKED_SUBSTRINGS);
const WHOLE_TERMS = terms(BLOCKED_WHOLE);

/** How many characters of a leaked handle we are willing to compare. */
const MAX_SCAN = 64;

/**
 * True when the handle contains (or is) a blocked term, after folding evasions.
 *
 * Short terms only count as the whole handle: `Cass` and `Sussex` must stay playable, so `ass`
 * and `sex` are compared for equality rather than containment.
 */
export function isBlockedName(raw: string): boolean {
  const text = cleanNickname(raw).slice(0, MAX_SCAN);
  if (text.length === 0) return false;

  // Chinese handles are not accepted by the platform today, but the same filter guards them.
  if (!isAsciiOnly(text)) {
    const cjk = text.normalize('NFKC').toLowerCase();
    if (BLOCKED_CJK.some((term) => cjk.includes(term))) return true;
  }

  const folded = reduce(text, true);
  const squashed = collapse(folded);
  if (!folded) return false;
  for (const term of SUBSTRING_TERMS) {
    if (term.plain && (folded.includes(term.plain) || squashed.includes(term.collapsed))) return true;
  }

  // A short term only blocks a handle that *is* it, with an optional digit suffix (`Ass`, `ass123`).
  const literal = reduce(text, false).replace(/\d+$/, '');
  const literalCollapsed = collapse(literal);
  const foldedCollapsed = collapse(folded.replace(/\d+$/, ''));
  for (const term of WHOLE_TERMS) {
    if (!term.plain) continue;
    if (literal === term.plain || literalCollapsed === term.collapsed || foldedCollapsed === term.collapsed) {
      return true;
    }
  }
  return false;
}

/**
 * True when the handle claims to belong to the game or its staff.
 *
 * Only an exact name, a `_` variant or a digit suffix counts, so `Admiral` and `Modern` stay
 * available while `Admin`, `admin_x` and `admin42` do not.
 */
export function isReservedName(raw: string): boolean {
  const text = cleanNickname(raw)
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '');
  // A role word anywhere as its own `_`-separated segment is impersonation, whatever precedes it.
  const segments = text.split(/_+/).filter(Boolean);
  if (segments.some((segment) => RESERVED_SEGMENTS.includes(segment))) return true;
  for (const prefix of RESERVED_PREFIXES) {
    const term = prefix.replace(/[^a-z0-9]/g, '');
    if (!term) continue;
    if (text === term) return true;
    if (!text.startsWith(term)) continue;
    const rest = text.slice(term.length);
    if (/^_\d*$/.test(rest) || /^\d+$/.test(rest)) return true;
  }
  return false;
}

/**
 * The device's anonymous CheddaBoards identity.
 *
 * Kept under its own localStorage key rather than inside the game save: the save is a versioned
 * schema that the game repairs on load, and a leaderboard identity is not game progress — losing
 * it must not cost the player their records, and clearing the save should not orphan a board
 * profile. Both are independent, so they are stored independently.
 *
 * There is no login call for anonymous players: the id is generated once, locally, and the first
 * accepted score creates the profile behind it.
 */

import { checkNickname, cleanNickname } from './nickname';

const KEY = 'shatterverse.cloud.v1';

export interface CloudIdentity {
  /** `dev_<unix-seconds>_<hex>`. Never shown to other players; only the nickname is public. */
  playerId: string;
  /** The name the board shows. Empty until the player picks one. */
  nickname: string;
  /** A rename was accepted while the profile did not exist yet; it lands on the first score. */
  pending: boolean;
  /** A score has been accepted at least once, so the profile exists. */
  scored: boolean;
}

const PLAYER_ID = /^dev_\d{9,12}_[0-9a-f]{6,16}$/;

/** `dev_<unix-seconds>_<8 hex chars>`, the format the platform documents. */
export function newPlayerId(now: number = Date.now(), random: () => number = Math.random): string {
  const seconds = Math.floor(now / 1000);
  const suffix = Math.floor(random() * 0xffffffff)
    .toString(16)
    .padStart(8, '0')
    .slice(-8);
  return `dev_${seconds}_${suffix}`;
}

export function defaultIdentity(now: number = Date.now(), random: () => number = Math.random): CloudIdentity {
  return { playerId: newPlayerId(now, random), nickname: '', pending: false, scored: false };
}

/**
 * Reads the stored identity, repairing anything malformed. A corrupt entry is replaced rather
 * than repaired field by field: an id that is not the documented shape cannot address a profile.
 */
export function loadIdentity(): CloudIdentity {
  let raw: unknown;
  try {
    raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
  } catch {
    return defaultIdentity();
  }
  if (!raw || typeof raw !== 'object') return defaultIdentity();
  const data = raw as Partial<CloudIdentity>;
  const identity = defaultIdentity();
  if (typeof data.playerId === 'string' && PLAYER_ID.test(data.playerId)) {
    identity.playerId = data.playerId;
  }
  if (typeof data.nickname === 'string') {
    // A name that fails the local policy is dropped: the server would reject it anyway, and a
    // stale blocked name must not be displayed as if it were in use.
    const check = checkNickname(data.nickname);
    identity.nickname = check.ok ? check.value : '';
  }
  identity.pending = identity.nickname !== '' && data.pending === true;
  identity.scored = data.scored === true;
  return identity;
}

export function storeIdentity(identity: CloudIdentity): void {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        playerId: identity.playerId,
        nickname: cleanNickname(identity.nickname),
        pending: identity.pending,
        scored: identity.scored,
      }),
    );
  } catch {
    // Storage can be unavailable (private mode, quota). The board keeps working for this session.
  }
}

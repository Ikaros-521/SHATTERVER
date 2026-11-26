import { describe, expect, it, vi } from 'vitest';
import { defaultIdentity, loadIdentity, storeIdentity } from '../src/net/identity';

const KEY = 'shatterverse.cloud.v1';
const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, value),
  removeItem: (key: string) => void store.delete(key),
});

function stored(over: Record<string, unknown>): void {
  store.set(
    KEY,
    JSON.stringify({ playerId: 'dev_1730000000_1a2b3c4d', nickname: '', pending: false, scored: false, ...over }),
  );
}

describe('loadIdentity', () => {
  it('starts from a fresh anonymous identity when nothing is stored', () => {
    store.clear();
    const identity = loadIdentity();
    expect(identity.nickname).toBe('');
    expect(identity.pending).toBe(false);
    expect(identity.scored).toBe(false);
    expect(identity.playerId).toMatch(/^dev_\d{9,12}_[0-9a-f]{8}$/);
  });

  it('keeps a nickname the local policy accepts', () => {
    stored({ nickname: 'Ace_Runner', pending: false, scored: true });
    expect(loadIdentity().nickname).toBe('Ace_Runner');
  });

  it('keeps a server-suffixed nickname that outgrew the local 16-character rule', () => {
    // The server applies suffixes after validating the pre-suffix name, so it hands out names
    // our own rule would refuse; clearing one would fight what the board still shows.
    stored({ nickname: 'SixteenCharsHere_1', pending: false, scored: true });
    const identity = loadIdentity();
    expect(identity.nickname).toBe('SixteenCharsHere_1');
    expect(identity.pending).toBe(false);
    storeIdentity(identity);
    expect(JSON.parse(store.get(KEY)!).nickname).toBe('SixteenCharsHere_1');
  });

  it('accepts only the server-suffix shape: a locally-valid stem plus _<digits>', () => {
    stored({ nickname: 'has spaces but long enough' }); // no suffix, wrong charset
    expect(loadIdentity().nickname).toBe('');
    stored({ nickname: ' fuckfuckfuckfuckfuckfuck ' }); // word-repetition is not the suffix shape
    expect(loadIdentity().nickname).toBe('');
    stored({ nickname: 'Admin_moderator_team' }); // reserved, no numeric suffix
    expect(loadIdentity().nickname).toBe('');
    stored({ nickname: 'Admin_1' }); // suffix shape, but the stem itself is reserved
    expect(loadIdentity().nickname).toBe('');
    stored({ nickname: 'ab' }); // too short is not the server-suffix shape
    expect(loadIdentity().nickname).toBe('');
  });

  it('holds a pending rename only while a nickname survived the load', () => {
    stored({ nickname: 'SixteenCharsHere_1', pending: true, scored: true });
    expect(loadIdentity().pending).toBe(true);
    stored({ nickname: 'has spaces but long enough', pending: true, scored: true });
    expect(loadIdentity().pending).toBe(false);
  });

  it('replaces an id that is not the documented shape', () => {
    stored({ playerId: 'not-an-id' });
    expect(loadIdentity().playerId).toMatch(/^dev_\d{9,12}_[0-9a-f]{8}$/);
    expect(loadIdentity().playerId).not.toBe('not-an-id');
  });

  it('defaults round-trip through the store untouched', () => {
    store.clear();
    storeIdentity(defaultIdentity());
    expect(loadIdentity().playerId).toBe(JSON.parse(store.get(KEY)!).playerId);
  });
});

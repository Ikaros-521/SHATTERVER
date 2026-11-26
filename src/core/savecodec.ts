/**
 * Obfuscation for the locally stored save.
 *
 * The save holds everything a bored player can trivially abuse in plaintext — the best score, the
 * run history and the 星尘 wallet. This module is not cryptography: everything needed to decode a
 * blob ships in this same bundle, so a determined attacker can always reverse it. The goal is
 * narrower: the stored value must not read as editable JSON, and flipping any byte inside it must
 * fail the checksum, so "change the number in DevTools" stops working.
 *
 * A blob is `SVX1:` plus base64 of `[8-byte nonce][4-byte checksum][payload]`. The payload is the
 * save's UTF-8 bytes XORed with a keystream seeded from a bundle pepper and the nonce; the
 * checksum is FNV-1a over the plaintext with a separately seeded mixer. Every write uses a fresh
 * nonce, so identical saves never produce identical blobs. UTF-8 and base64 are hand-rolled (no
 * TextEncoder, no atob) so non-browser shells reusing `src/` — the WeChat port — can run it too.
 */

const PREFIX = 'SVX1:';
/** Baked into the bundle; mixed into both the keystream seed and the checksum seed. */
const PEPPER = 'shatterverse.save.v1';
/** FNV-1a offset basis. */
const FNV_INIT = 0x811c9dc5;
const NONCE_BYTES = 8;
const CHECKSUM_BYTES = 4;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const ALPHABET_INDEX = (() => {
  const table = new Int8Array(128).fill(-1);
  for (let i = 0; i < ALPHABET.length; i++) table[ALPHABET.charCodeAt(i)] = i;
  return table;
})();

function hashBytes(bytes: Uint8Array, seed: number): number {
  let hash = seed >>> 0;
  for (let i = 0; i < bytes.length; i++) {
    hash ^= bytes[i];
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

function hashText(text: string, seed: number): number {
  let hash = seed >>> 0;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/** Mulberry32: a 32-bit PRNG that is small and produces identical streams on every engine. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

function keystream(seed: number, length: number): Uint8Array {
  const next = mulberry32(seed);
  const out = new Uint8Array(length);
  for (let i = 0; i < length; i += 4) {
    const word = (next() * 0x100000000) >>> 0;
    out[i] = (word >>> 24) & 0xff;
    if (i + 1 < length) out[i + 1] = (word >>> 16) & 0xff;
    if (i + 2 < length) out[i + 2] = (word >>> 8) & 0xff;
    if (i + 3 < length) out[i + 3] = word & 0xff;
  }
  return out;
}

function randomNonce(): Uint8Array {
  const nonce = new Uint8Array(NONCE_BYTES);
  const source = globalThis.crypto;
  if (source && typeof source.getRandomValues === 'function') {
    source.getRandomValues(nonce);
  } else {
    for (let i = 0; i < nonce.length; i++) nonce[i] = Math.floor(Math.random() * 256);
  }
  return nonce;
}

function utf8Encode(text: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const code = text.codePointAt(i);
    if (code === undefined) continue;
    if (code > 0xffff) i++; // The astral code point consumed its low surrogate.
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      // Lone surrogates (possible via a \uXXXX escape in the JSON) encode like any BMP value and
      // decode back to the same code unit, so the round trip stays lossless.
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return Uint8Array.from(bytes);
}

/** Continuation byte of a multi-byte sequence, or 0 when the sequence is truncated or invalid. */
function utf8Continuation(bytes: Uint8Array, start: number, offset: number): number {
  const byte = bytes[start + offset];
  return byte >= 0x80 && byte < 0xc0 ? byte & 0x3f : 0;
}

function utf8Decode(bytes: Uint8Array): string {
  const parts: string[] = [];
  let i = 0;
  while (i < bytes.length) {
    const lead = bytes[i];
    let code: number;
    let width: number;
    if (lead < 0x80) {
      code = lead;
      width = 1;
    } else if (lead < 0xc0) {
      code = 0xfffd; // Stray continuation byte; the checksum keeps this unreachable in practice.
      width = 1;
    } else if (lead < 0xe0) {
      code = ((lead & 0x1f) << 6) | utf8Continuation(bytes, i, 1);
      width = 2;
    } else if (lead < 0xf0) {
      code = ((lead & 0x0f) << 12) | (utf8Continuation(bytes, i, 1) << 6) | utf8Continuation(bytes, i, 2);
      width = 3;
    } else {
      code =
        ((lead & 0x07) << 18) |
        (utf8Continuation(bytes, i, 1) << 12) |
        (utf8Continuation(bytes, i, 2) << 6) |
        utf8Continuation(bytes, i, 3);
      width = 4;
    }
    i += width;
    if (code > 0xffff) {
      const value = code - 0x10000;
      parts.push(String.fromCharCode(0xd800 + (value >>> 10), 0xdc00 + (value & 0x3ff)));
    } else {
      parts.push(String.fromCharCode(code));
    }
  }
  return parts.join('');
}

function base64Encode(bytes: Uint8Array): string {
  const out: string[] = [];
  for (let i = 0; i < bytes.length; i += 3) {
    const b1 = bytes[i];
    const b2 = i + 1 < bytes.length ? bytes[i + 1] : undefined;
    const b3 = i + 2 < bytes.length ? bytes[i + 2] : undefined;
    const word = (b1 << 16) | ((b2 ?? 0) << 8) | (b3 ?? 0);
    out.push(ALPHABET[(word >>> 18) & 63], ALPHABET[(word >>> 12) & 63]);
    out.push(b2 === undefined ? '=' : ALPHABET[(word >>> 6) & 63]);
    out.push(b3 === undefined ? '=' : ALPHABET[word & 63]);
  }
  return out.join('');
}

function base64Decode(text: string): Uint8Array | null {
  if (text.length === 0 || text.length % 4 !== 0) return null;
  const groups = text.length / 4;
  const tail = text.slice(-2);
  // '=' only ever pads the final group, one byte per pad; anything else is not our blob.
  const padding = tail === '==' ? 2 : tail.endsWith('=') ? 1 : 0;
  const bytes = new Uint8Array(groups * 3 - padding);
  let o = 0;
  for (let g = 0; g < groups; g++) {
    const limit = 4 - (g === groups - 1 ? padding : 0);
    let word = 0;
    for (let j = 0; j < limit; j++) {
      const code = text.charCodeAt(g * 4 + j);
      const value = code < 128 ? ALPHABET_INDEX[code] : -1;
      if (value < 0) return null;
      word = (word << 6) | value;
    }
    // Left-align the last group to 24 bits so the byte slices below stay the same as a full one.
    if (limit < 4) word <<= (4 - limit) * 6;
    bytes[o++] = (word >>> 16) & 0xff;
    if (o < bytes.length) bytes[o++] = (word >>> 8) & 0xff;
    if (o < bytes.length) bytes[o++] = word & 0xff;
  }
  return o === bytes.length ? bytes : null;
}

/** Encodes one save's JSON text into an obfuscated, checksum-protected blob. */
export function encodeSave(json: string): string {
  const nonce = randomNonce();
  const mix = hashBytes(nonce, FNV_INIT);
  const plain = utf8Encode(json);
  const bytes = new Uint8Array(NONCE_BYTES + CHECKSUM_BYTES + plain.length);
  bytes.set(nonce, 0);
  const sum = hashBytes(plain, hashText(`${PEPPER}#sum`, mix));
  bytes[NONCE_BYTES] = (sum >>> 24) & 0xff;
  bytes[NONCE_BYTES + 1] = (sum >>> 16) & 0xff;
  bytes[NONCE_BYTES + 2] = (sum >>> 8) & 0xff;
  bytes[NONCE_BYTES + 3] = sum & 0xff;
  const stream = keystream(hashText(`${PEPPER}#key`, mix), plain.length);
  for (let i = 0; i < plain.length; i++) bytes[NONCE_BYTES + CHECKSUM_BYTES + i] = plain[i] ^ stream[i];
  return PREFIX + base64Encode(bytes);
}

/**
 * Decodes a blob produced by `encodeSave` back into its JSON text, or null when the value is not
 * one of ours (a pre-obfuscation plaintext save) or has been corrupted or tampered with.
 */
export function decodeSave(blob: string | null): string | null {
  if (!blob || !blob.startsWith(PREFIX)) return null;
  const bytes = base64Decode(blob.slice(PREFIX.length));
  if (bytes === null || bytes.length < NONCE_BYTES + CHECKSUM_BYTES) return null;
  const nonce = bytes.subarray(0, NONCE_BYTES);
  const payload = bytes.subarray(NONCE_BYTES + CHECKSUM_BYTES);
  const stored =
    ((bytes[NONCE_BYTES] << 24) |
      (bytes[NONCE_BYTES + 1] << 16) |
      (bytes[NONCE_BYTES + 2] << 8) |
      bytes[NONCE_BYTES + 3]) >>>
    0;
  const mix = hashBytes(nonce, FNV_INIT);
  const stream = keystream(hashText(`${PEPPER}#key`, mix), payload.length);
  const plain = new Uint8Array(payload.length);
  for (let i = 0; i < payload.length; i++) plain[i] = payload[i] ^ stream[i];
  if (hashBytes(plain, hashText(`${PEPPER}#sum`, mix)) !== stored) return null;
  return utf8Decode(plain);
}

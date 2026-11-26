/**
 * Sync storage for the WeChat mini-game runtime.
 *
 * The minigame runtime has no `localStorage`; `wx.getStorageSync`/`setStorageSync` is its
 * counterpart (10 MB total, synchronous, available from the first frame). This module is the only
 * place that touches it, so the rest of the game keeps one storage shape on every platform:
 * `core/storage.ts` routes reads and writes through here under `__WECHAT__`, and every other build
 * tree-shakes the module away entirely (it has no top-level effects).
 *
 * Reading an absent key yields `''` on WeChat rather than null — normalized here so callers see
 * the web shape. Failures (quota, storage unavailable) are swallowed exactly like the web path:
 * the game works without persistence.
 */

/** Reads a string key; null when absent or not a string. */
export function wxStorageRead(key: string): string | null {
  try {
    const value = wx.getStorageSync(key);
    return typeof value === 'string' && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

/** Best-effort write; a quota or storage failure must never interrupt the game. */
export function wxStorageWrite(key: string, value: string): void {
  try {
    wx.setStorageSync(key, value);
  } catch {
    // Same contract as the web path: the game runs fine without persistence.
  }
}

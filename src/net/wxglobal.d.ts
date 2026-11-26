/**
 * The WeChat mini-game runtime, as this game touches it.
 *
 * `__WECHAT__` is the compile-time switch injected by Vite's `define` (false in the web and Toy
 * builds, true only in the WeChat package build). Everything that talks to `wx` lives behind it,
 * so no other build ever evaluates these declarations at runtime — they exist so the WeChat slice
 * typechecks with the rest of the project.
 *
 * The `wx` global below is the minimal slice used by the game (cloud calls and sync storage); it
 * is declared unconditionally because ambient declarations cost nothing at runtime, but nothing
 * outside a `__WECHAT__` branch may reference it.
 */

declare const __WECHAT__: boolean;

/** `wx.cloud.callFunction` result envelope. */
interface WxCloudCallResult {
  result?: unknown;
}

interface WxCloud {
  init(config?: { env?: string; traceUser?: boolean }): void;
  callFunction(request: { name: string; data?: Record<string, unknown> }): Promise<WxCloudCallResult>;
}

interface WxMinGame {
  /** Absent when the base library or the project has no cloud support. */
  cloud?: WxCloud;
  getStorageSync(key: string): unknown;
  setStorageSync(key: string, value: string): void;
}

declare const wx: WxMinGame;

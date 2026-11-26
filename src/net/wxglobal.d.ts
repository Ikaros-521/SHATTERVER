/**
 * The WeChat mini-game runtime, as this game touches it.
 *
 * `__WECHAT__` is the compile-time switch injected by Vite's `define` (false in the web and Toy
 * builds, true only in the WeChat package build). Everything that talks to `wx` lives behind it,
 * so no other build ever evaluates these declarations at runtime — they exist so the WeChat slice
 * typechecks with the rest of the project.
 *
 * The `wx` global below is the minimal slice used by the game (cloud calls, sync storage, the
 * screen canvas and the touch bridge); it is declared unconditionally because ambient
 * declarations cost nothing at runtime, but nothing outside a `__WECHAT__` branch or the
 * `src/wechat/` entry may reference it.
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

/** One finger in a touch event; coordinates are logical px (CSS px), same as the canvas UI's space. */
interface WxTouch {
  clientX: number;
  clientY: number;
}

interface WxTouchEvent {
  touches: WxTouch[];
  /** Fingers involved in the ending of a gesture (`onTouchEnd`'s `touches` is empty). */
  changedTouches: WxTouch[];
}

interface WxSystemInfo {
  windowWidth: number;
  windowHeight: number;
  pixelRatio: number;
}

interface WxMinGame {
  /** Absent when the base library or the project has no cloud support. */
  cloud?: WxCloud;
  getStorageSync(key: string): unknown;
  setStorageSync(key: string, value: string): void;
  /**
   * Creates a canvas. The **first** call returns the on-screen canvas; every later call returns an
   * offscreen one. Typed as HTMLCanvasElement because the mini-game canvas mirrors that API
   * surface (getContext, width, height) — it is not a DOM node.
   */
  createCanvas(): HTMLCanvasElement;
  getSystemInfoSync(): WxSystemInfo;
  onTouchStart(callback: (event: WxTouchEvent) => void): void;
  onTouchMove(callback: (event: WxTouchEvent) => void): void;
  onTouchEnd(callback: (event: WxTouchEvent) => void): void;
  /** The minigame's WebAudio shim (base library 2.19+); the audio engine probes for it. */
  createWebAudioContext?(): AudioContext;
  /** App foreground/background transitions — the minigame's visibilitychange. */
  onShow?(callback: () => void): void;
  onHide?(callback: () => void): void;
}

declare const wx: WxMinGame;

/**
 * Page visibility, across platforms.
 *
 * The DOM answers through `document.hidden`; the WeChat minigame runtime has no document and
 * answers through `wx.onHide`/`wx.onShow` — this module maintains that value from registration
 * time on. Everything that asks (the audio heartbeat, the context watchdog) goes through here,
 * so the two platforms cannot disagree about what "hidden" means.
 */

let wechatHidden = false;
let wired = false;

function wireWeChat(): void {
  if (wired) return;
  wired = true;
  // `wx` is declared as a global; on platforms without it this probe never runs.
  const api = (globalThis as { wx?: { onHide?(cb: () => void): void; onShow?(cb: () => void): void } }).wx;
  api?.onHide?.(() => {
    wechatHidden = true;
  });
  api?.onShow?.(() => {
    wechatHidden = false;
  });
}

/** True when the page or app is not visible. */
export function pageHidden(): boolean {
  if (typeof document !== 'undefined') return document.hidden;
  wireWeChat();
  return wechatHidden;
}

/** Registers a callback for the visibility coming back (used to resume a suspended context). */
export function onPageVisible(callback: () => void): void {
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) callback();
    });
    return;
  }
  wireWeChat();
  const api = (globalThis as { wx?: { onShow?(cb: () => void): void } }).wx;
  api?.onShow?.(callback);
}

/**
 * The AudioContext constructor for this platform: WeChat's WebAudio shim when present, the
 * browser's otherwise. Undefined when neither exists — the engine then stays silent, which is
 * the correct degradation for audio.
 */
export function audioContextFactory(): (() => AudioContext) | undefined {
  const wxApi = (globalThis as { wx?: { createWebAudioContext?(): AudioContext } }).wx;
  if (typeof wxApi?.createWebAudioContext === 'function') {
    const create = wxApi.createWebAudioContext.bind(wxApi);
    return () => create() as AudioContext;
  }
  if (typeof window !== 'undefined') {
    const w = window as unknown as {
      AudioContext?: typeof AudioContext;
      webkitAudioContext?: typeof AudioContext;
    };
    const Ctor = w.AudioContext ?? w.webkitAudioContext;
    if (Ctor) return () => new Ctor() as AudioContext;
  }
  return undefined;
}

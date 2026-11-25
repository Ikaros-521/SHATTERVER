import './ui/styles.css';
import { App } from './app';

/** Shown when the game cannot start at all. The player should never have to open the console to learn why. */
function fatal(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const noWebgl = /WebGL2/i.test(message);
  const overlay = document.createElement('div');
  overlay.className = 'fatal';
  overlay.innerHTML = `
    <div class="fatal-title">碎界 <span>SHATTERVERSE</span></div>
    <h1>${noWebgl ? '无法启动' : '启动时出错'}</h1>
    <p>${noWebgl ? '当前浏览器或设备不支持 WebGL2。请使用最新版 Chrome、Edge 或 Firefox，并确认已开启硬件加速。' : '请刷新页面重试。如果问题持续，请把下面的信息反馈给开发者。'}</p>
    <pre></pre>`;
  (overlay.querySelector('pre') as HTMLElement).textContent = message;
  document.body.replaceChildren(overlay);
  console.error(error);
}

function main(): void {
  const canvas = document.getElementById('gl');
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Canvas element is missing.');
  const app = new App(canvas);
  // Keep a record of uncaught problems so automated checks can assert on a clean console.
  window.addEventListener('error', (event) => app.debug.errors.push(event.error ?? event.message));
  window.addEventListener('unhandledrejection', (event) => app.debug.errors.push(event.reason));
  // Debug and automation handle. Harmless in production; documented in the README.
  Object.defineProperty(window, '__shatterverse', { value: app.debug, writable: false });
  app.start();
}

try {
  main();
} catch (error) {
  fatal(error);
}

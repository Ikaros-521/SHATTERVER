/**
 * The WeChat mini-game package build: `vite build` with `vite.wechat.config.ts`, then the
 * platform's own `game.json` and a self-contained `project.config.json` written next to the
 * bundle.
 *
 * Output (`dist-wechat/`) is a complete, importable mini-game project — `compileType: game`
 * lives in the copied config so importing this directory works even when the IDE has cached a
 * stale project type for the repo root (the app.json complaint). Nothing else from `dist/`
 * belongs in it. The cloud function in `wechat/cloudfunctions/` is deployed separately through
 * the developer tools and never ships inside this package.
 */
import { build } from 'vite';
import { readFileSync, statSync, writeFileSync } from 'node:fs';

// The AppID is read BEFORE the build: `vite build` empties dist-wechat, and an appid corrected
// there — the 小游戏测试号 paste, or the IDE's own rewrite — must survive every rebuild. The
// repo-root appid is only the placeholder a fresh checkout falls back to.
let appid = '';
try {
  const existing = JSON.parse(readFileSync('dist-wechat/project.config.json', 'utf8'));
  if (typeof existing.appid === 'string' && existing.appid) appid = existing.appid;
} catch {
  // No previous output (first build): fall through to the root config.
}

await build({ configFile: 'vite.wechat.config.ts' });

// Portrait for the menu shell; the arena's orientation is decided with the gameplay screens.
writeFileSync('dist-wechat/game.json', `${JSON.stringify({ deviceOrientation: 'portrait' }, null, 2)}\n`);

// Self-contained IDE project.
const root = JSON.parse(readFileSync('project.config.json', 'utf8'));
const ide = {
  compileType: 'game',
  libVersion: root.libVersion ?? '3.18.1',
  projectname: root.projectname ?? 'shatterverse',
  appid: appid || root.appid || '',
  setting: root.setting ?? {},
  editorSetting: root.editorSetting ?? {},
};
writeFileSync('dist-wechat/project.config.json', `${JSON.stringify(ide, null, 2)}\n`);

const game = statSync('dist-wechat/game.js');
console.log(`dist-wechat/game.js: ${(game.size / 1024).toFixed(1)} KiB (main-package limit: 4096 KiB)`);

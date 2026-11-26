/**
 * The WeChat mini-game package build: `vite build` with `vite.wechat.config.ts`, then the
 * platform's own `game.json` written next to the bundle.
 *
 * Output (`dist-wechat/`) is what the 微信开发者工具 opens as a mini-game project; nothing else
 * from `dist/` belongs in it. The cloud function in `wechat/cloudfunctions/` is deployed
 * separately through the developer tools and never ships inside this package.
 */
import { build } from 'vite';
import { statSync, writeFileSync } from 'node:fs';

await build({ configFile: 'vite.wechat.config.ts' });

// Portrait for the menu shell; the arena's orientation is decided with the gameplay screens.
writeFileSync('dist-wechat/game.json', `${JSON.stringify({ deviceOrientation: 'portrait' }, null, 2)}\n`);

const game = statSync('dist-wechat/game.js');
console.log(`dist-wechat/game.js: ${(game.size / 1024).toFixed(1)} KiB (main-package limit: 4096 KiB)`);

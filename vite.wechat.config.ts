import { defineConfig } from 'vite';

/**
 * The WeChat mini-game submission build.
 *
 * Entry is `src/wechat/game.ts` (no index.html, no DOM), emitted as one IIFE `game.js` into
 * `dist-wechat/`; `scripts/build-wechat.mjs` adds `game.json` afterwards. `__WECHAT__` is baked
 * in as `true`, which tree-shakes the Chedda and Toy clients away — this package talks only to
 * the project's own cloud function. No source map, same reasoning as the Toy package.
 */
export default defineConfig({
  define: { __TOY__: 'false', __WECHAT__: 'true' },
  // No public/ assets: the web-only SEO files must not enter the package (same rule as Toy).
  publicDir: false,
  build: {
    outDir: 'dist-wechat',
    emptyOutDir: true,
    sourcemap: false,
    target: 'es2022',
    rollupOptions: { input: 'src/wechat/game.ts', output: { format: 'iife', entryFileNames: 'game.js' } },
  },
});

import { defineConfig } from 'vite';

/**
 * The Bilibili Toy submission build.
 *
 * Same app, different packaging rules: the platform package must not carry off-platform promotion,
 * so `__TOY__` is baked in as `true` (the game then uses only the platform's leaderboard and the
 * Chedda client is tree-shaken away), and `scripts/build-toy.mjs` strips the web-only SEO files
 * and absolute links from the output afterwards.
 */
export default defineConfig({
  base: './',
  define: { __TOY__: 'true' },
  server: { host: '127.0.0.1', port: 5173 },
  // No source map: the map embeds every module's original text, which is both a large scanning
  // surface for the review and of no use inside a platform package.
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 1200 },
});

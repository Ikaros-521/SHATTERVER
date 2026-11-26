import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so `dist/` works from any sub-path or static server.
  base: './',
  // Web build: the Chedda cloud channel is available. The Toy package flips this — see
  // `vite.toy.config.ts` and `scripts/build-toy.mjs`.
  define: { __TOY__: 'false' },
  server: { host: '127.0.0.1', port: 5173 },
  build: { target: 'es2022', sourcemap: true, chunkSizeWarningLimit: 1200 },
});

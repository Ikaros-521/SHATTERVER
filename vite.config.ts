import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so `dist/` works from any sub-path or static server.
  base: './',
  server: { host: '127.0.0.1', port: 5173 },
  build: { target: 'es2022', sourcemap: true, chunkSizeWarningLimit: 1200 },
});

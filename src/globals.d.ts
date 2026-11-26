/**
 * Build-time constants injected by Vite's `define`.
 *
 * `__TOY__` is true only in the Bilibili Toy package build (`vite.toy.config.ts`). It forces the
 * platform leaderboard channel and lets the bundler drop the Chedda client entirely, so the
 * submitted package contains no third-party service or branding.
 */
declare const __TOY__: boolean;

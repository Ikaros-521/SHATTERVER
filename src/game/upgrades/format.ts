/**
 * Formatting helpers shared by the upgrade definitions and the per-locale `describe` templates.
 * Kept out of `defs.ts` so the i18n dictionaries can reuse them without importing the pool.
 */

/** Bold markup used inside `describe` text (the UI renders descriptions as HTML). */
export const b = (v: string | number): string => `<b>${v}</b>`;

/** Percent with no decimals, the pool's convention for chances and multipliers. */
export const pct = (v: number): string => `${Math.round(v * 100)}%`;

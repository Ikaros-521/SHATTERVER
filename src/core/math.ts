export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const saturate = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Frame-rate independent exponential approach. `rate` is roughly "fraction closed per second". */
export const damp = (a: number, b: number, rate: number, dt: number): number =>
  a + (b - a) * (1 - Math.exp(-rate * dt));

export const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = saturate((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);
export const easeOutQuint = (t: number): number => 1 - Math.pow(1 - t, 5);
export const easeInCubic = (t: number): number => t * t * t;
export const easeOutExpo = (t: number): number => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
/** Overshoots and settles — the backbone of every "pop" in the UI. */
export const easeOutBack = (t: number, strength = 1.70158): number => {
  const c3 = strength + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + strength * Math.pow(t - 1, 2);
};

/** Shortest signed angle from `a` to `b`, in (-PI, PI]. */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d <= -Math.PI) d += TAU;
  return d;
}

const NUMBER_UNITS = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp'];

/** Compact game-style number: 999 → "999", 1234 → "1.23K", 1_500_000 → "1.5M". */
export function formatNumber(n: number, decimals = 2): string {
  if (!Number.isFinite(n)) return '∞';
  const abs = Math.abs(n);
  if (abs < 1000) return String(Math.round(n));
  let unit = 0;
  let value = abs;
  while (value >= 1000 && unit < NUMBER_UNITS.length - 1) {
    value /= 1000;
    unit++;
  }
  const shown = value >= 100 ? 0 : value >= 10 ? Math.min(1, decimals) : decimals;
  // 1.50M reads worse than 1.5M: drop trailing zeros, but only after a decimal point.
  const text = value.toFixed(shown);
  const trimmed = text.includes('.') ? text.replace(/0+$/, '').replace(/\.$/, '') : text;
  return `${n < 0 ? '-' : ''}${trimmed}${NUMBER_UNITS[unit] ?? ''}`;
}

/** Thousands separated with a thin space-ish separator for scores that should read as "big". */
export function formatScore(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** mm:ss, or h:mm:ss past an hour. */
export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`;
}

/** 0xRRGGBB → linear-ish [r, g, b] in 0..1 (what every shader in the project expects). */
export function hexToRgb(hex: number): [number, number, number] {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

/** Mix two 0xRRGGBB colours. */
export function mixHex(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255,
    ag = (a >> 8) & 255,
    ab = a & 255;
  const br = (b >> 16) & 255,
    bg = (b >> 8) & 255,
    bb = b & 255;
  return (
    (Math.round(lerp(ar, br, t)) << 16) | (Math.round(lerp(ag, bg, t)) << 8) | Math.round(lerp(ab, bb, t))
  );
}

/** 0xRRGGBB → "#rrggbb" for DOM consumption. */
export function cssHex(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

/** Brightness of a colour, 0..1 — used to pick readable text on top of it. */
export function luminance(hex: number): number {
  const r = ((hex >> 16) & 255) / 255,
    g = ((hex >> 8) & 255) / 255,
    b = (hex & 255) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

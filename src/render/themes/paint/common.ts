/** 0..1: the slow pulse everything at rest breathes to. */
export const breathe = (time: number, rate: number): number => 0.5 + 0.5 * Math.sin(time * rate);

/** -1..1: how hard the paddle is moving and which way, from its velocity in world units per second. */
export const leanOf = (vx: number): number => (vx < -2400 ? -1 : vx > 2400 ? 1 : vx / 2400);

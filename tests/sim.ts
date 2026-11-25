import { RNG } from '../src/core/rng';
import { Session } from '../src/game/session';
import type { RunMode } from '../src/game/run';
import type { Starter } from '../src/game/starters';
import { UPGRADES } from '../src/game/upgrades/defs';
import type { UpgradeDef } from '../src/game/upgrades/types';
import type { World } from '../src/game/world';

/**
 * Headless play-through driver.
 *
 * The paddle is driven by the built-in bot (near-perfect catches), drafts are resolved by a
 * `Policy`, and the world is stepped at a fixed 60 Hz. Everything here runs without a browser.
 */

export type Policy = (draft: UpgradeDef[], levels: Record<string, number>, rng: RNG) => UpgradeDef | null;

const RANK: Record<UpgradeDef['rarity'], number> = { common: 0, rare: 1, epic: 2, legendary: 3, mythic: 4 };

export const rarest: Policy = (draft) =>
  [...draft].sort((a, b) => RANK[b.rarity] - RANK[a.rarity])[0] ?? null;

/** Chases whatever shares a tag with the current build, then rarity. A naive but common way to pick. */
export const synergy: Policy = (draft, levels) => {
  const owned = new Set<string>();
  for (const def of UPGRADES) {
    if ((levels[def.id] ?? 0) > 0) for (const tag of def.tags) owned.add(tag);
  }
  const score = (d: UpgradeDef): number =>
    RANK[d.rarity] + d.tags.filter((tag) => owned.has(tag)).length * 0.8 + (levels[d.id] ? 0.3 : 0);
  return [...draft].sort((a, b) => score(b) - score(a))[0] ?? null;
};

/**
 * A competent player: values rarity and synergy like `synergy`, but keeps roughly every other
 * pick in raw damage or ball count so the build can actually kill things. This is the baseline
 * the campaign is balanced around.
 */
export const sensible: Policy = (draft, levels) => {
  const owned = new Set<string>();
  let picks = 0;
  let damagePicks = 0;
  for (const def of UPGRADES) {
    const level = levels[def.id] ?? 0;
    if (level <= 0) continue;
    picks += level;
    if (def.tags.includes('damage')) damagePicks += level;
    for (const tag of def.tags) owned.add(tag);
  }
  const needsDamage = damagePicks < 0.3 * (picks + 1);
  const score = (d: UpgradeDef): number => {
    let value = RANK[d.rarity] * 0.9 + d.tags.filter((tag) => owned.has(tag)).length * 0.5;
    if (needsDamage && d.tags.includes('damage')) value += 1.2;
    return value;
  };
  return [...draft].sort((a, b) => score(b) - score(a))[0] ?? null;
};

export const randomPick: Policy = (draft, _levels, rng) => (draft.length > 0 ? rng.pick(draft) : null);

export interface SimOptions {
  seed: number;
  mode?: RunMode;
  starter?: Starter;
  policy?: Policy;
  /** Hard stop in game-time, so a regression can never hang the suite. */
  maxSeconds?: number;
  /** Called after every simulated frame. Use it to assert on world state. */
  sample?: (session: Session) => void;
}

export interface SimResult {
  session: Session;
  won: boolean;
  seconds: number;
  frames: number;
  msPerFrame: number;
  worstFrameMs: number;
}

export function simulate(options: SimOptions): SimResult {
  const seed = options.seed;
  const session = new Session(options.mode ?? 'campaign', seed, { bot: true, starter: options.starter });
  const rng = new RNG(seed ^ 0x5eed);
  const policy = options.policy ?? synergy;

  session.events.on('draft', () => {
    const pick = policy(session.draft, session.run.upgrades, rng);
    if (pick) session.choose(pick.id);
    else session.skip();
  });

  const dt = 1 / 60;
  const limit = options.maxSeconds ?? 2400;
  let frames = 0;
  let totalMs = 0;
  let worstMs = 0;

  while (session.phase === 'playing' && frames * dt < limit) {
    const t0 = performance.now();
    session.update(dt);
    const ms = performance.now() - t0;
    totalMs += ms;
    if (ms > worstMs) worstMs = ms;
    options.sample?.(session);
    frames++;
  }

  return {
    session,
    won: session.phase === 'won',
    seconds: frames * dt,
    frames,
    msPerFrame: frames > 0 ? totalMs / frames : 0,
    worstFrameMs: worstMs,
  };
}

/** True when every number that matters in the world is finite. */
export function worldIsFinite(world: World): boolean {
  if (!Number.isFinite(world.hp) || !Number.isFinite(world.combo) || !Number.isFinite(world.run.score))
    return false;
  if (!Number.isFinite(world.paddle.x) || !Number.isFinite(world.fieldOffset)) return false;
  for (const ball of world.balls) {
    if (
      !Number.isFinite(ball.x) ||
      !Number.isFinite(ball.y) ||
      !Number.isFinite(ball.vx) ||
      !Number.isFinite(ball.vy)
    )
      return false;
  }
  for (const brick of world.bricks) {
    if (!Number.isFinite(brick.x) || !Number.isFinite(brick.y) || !Number.isFinite(brick.hp)) return false;
  }
  return true;
}

/** Width of a 5–95 percentile band, to keep balance summaries honest in the presence of outliers. */
export function summarize(values: number[]): {
  min: number;
  median: number;
  p95: number;
  max: number;
  mean: number;
} {
  if (values.length === 0) return { min: 0, median: 0, p95: 0, max: 0, mean: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number): number => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
  return {
    min: at(0),
    median: at(0.5),
    p95: at(0.95),
    max: at(1),
    mean: values.reduce((sum, v) => sum + v, 0) / values.length,
  };
}

import { describe, expect, it } from 'vitest';
import { MAX_HP_BASE } from '../src/game/config';
import { CAMPAIGN_LENGTH } from '../src/game/levels/generator';
import {
  randomPick,
  rarest,
  sensible,
  simulate,
  summarize,
  synergy,
  worldIsFinite,
  type Policy,
} from './sim';

/**
 * Balance smoke test.
 *
 * Bots with different drafting personalities play whole campaigns. A bot catches and blocks
 * almost perfectly, so its results bound what a sharp human can do; the drafting personalities
 * stand in for player skill at building. The assertions guard against pacing regressions, while
 * the printed report is what a human reads when tuning `config.ts` and `upgrades/defs.ts`.
 */

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const POLICIES: [string, Policy, number][] = [
  ['sensible', sensible, 0.75],
  ['rarest', rarest, 0.5],
  ['synergy', synergy, 0.25],
  ['random', randomPick, 0],
];

function fmt(n: number): string {
  return n.toFixed(1).padStart(6);
}

describe('campaign balance (bot players)', () => {
  for (const [name, policy, minWinRate] of POLICIES) {
    it(`"${name}" drafter finishes the campaign at least ${Math.round(minWinRate * 100)}% of the time`, () => {
      const times: number[][] = Array.from({ length: CAMPAIGN_LENGTH }, () => []);
      const damage: number[][] = Array.from({ length: CAMPAIGN_LENGTH }, () => []);
      const totals: number[] = [];
      let wins = 0;
      let worstFrame = 0;

      for (const seed of SEEDS) {
        const result = simulate({
          seed,
          policy,
          maxSeconds: 3000,
          sample: (session) => {
            expect(worldIsFinite(session.world)).toBe(true);
          },
        });
        worstFrame = Math.max(worstFrame, result.worstFrameMs);
        if (result.won) {
          wins++;
          totals.push(result.seconds);
        }
        for (const record of result.session.run.history) {
          times[record.level - 1]?.push(record.time);
          damage[record.level - 1]?.push(record.damageTaken);
        }
      }

      const lines: string[] = [];
      const run = summarize(totals);
      lines.push(
        `\n┌─ ${name.toUpperCase()} · ${wins}/${SEEDS.length} won · winning run ${fmt(run.median)}s median (${fmt(run.min)}–${fmt(run.max)}) ─────┐`,
      );
      lines.push('│ lvl reached  time: median   p95   max │ damage: mean  max │');
      for (let level = 0; level < CAMPAIGN_LENGTH; level++) {
        const t = summarize(times[level] ?? []);
        const d = summarize(damage[level] ?? []);
        const boss = (level + 1) % 5 === 0 ? ' BOSS' : '';
        lines.push(
          `│ ${(level + 1).toString().padStart(3)} ${String((times[level] ?? []).length).padStart(7)}   ${fmt(t.median)} ${fmt(t.p95)} ${fmt(t.max)} │ ${d.mean.toFixed(2).padStart(13)} ${d.max.toFixed(0).padStart(5)} │${boss}`,
        );
      }
      lines.push(`└─ worst simulated frame: ${worstFrame.toFixed(1)}ms ─────┘`);
      console.log(lines.join('\n'));

      expect(wins / SEEDS.length, `${name} win rate`).toBeGreaterThanOrEqual(minWinRate);

      // Pacing is judged on the levels that were actually reached.
      const median = (level: number): number => summarize(times[level] ?? []).median;
      expect(median(0), 'level 1 is the hook: it must be quick').toBeGreaterThan(0);
      expect(median(0)).toBeLessThan(25);
      for (let level = 0; level < CAMPAIGN_LENGTH; level++) {
        if ((times[level] ?? []).length >= SEEDS.length / 2) {
          expect(median(level), `level ${level + 1} median`).toBeLessThan(80);
        }
      }
      expect(worstFrame, 'no runaway frame').toBeLessThan(60);
    }, 240_000);
  }

  it('sensible play survives well past the campaign in endless mode', () => {
    for (const seed of [11, 12]) {
      const result = simulate({ seed, mode: 'endless', policy: sensible, maxSeconds: 1500 });
      const run = result.session.run;
      console.log(
        `[endless seed ${seed}] level ${run.level} reached · ${run.levelsCleared} cleared in ${result.seconds.toFixed(0)}s · avg ${(result.msPerFrame * 1000).toFixed(0)}µs/frame · worst ${result.worstFrameMs.toFixed(1)}ms · score ${Math.round(run.score).toExponential(2)}`,
      );
      expect(run.levelsCleared).toBeGreaterThanOrEqual(CAMPAIGN_LENGTH);
      expect(result.msPerFrame).toBeLessThan(10);
    }
  }, 120_000);

  it('a fresh run starts with the intended resources', () => {
    const result = simulate({ seed: 1, policy: sensible, maxSeconds: 0.5 });
    expect(result.session.run.hp).toBe(MAX_HP_BASE);
    expect(result.session.run.maxHp).toBe(MAX_HP_BASE);
    expect(result.session.world.balls).toHaveLength(4);
  });
});

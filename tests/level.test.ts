import { describe, expect, it } from 'vitest';
import { RNG } from '../src/core/rng';
import { bossScale, DANGER_Y, GRID, hpUnit } from '../src/game/config';
import { rowToY } from '../src/game/entities';
import { BOSSES, CHAPTERS, MODIFIERS } from '../src/game/levels/definitions';
import {
  buildLevel,
  CAMPAIGN_LENGTH,
  chapterOf,
  cycleOf,
  isBossLevel,
  type LevelPlan,
} from '../src/game/levels/generator';
import { sprite, wave, diamond, pyramid, funnel, cross, SPRITES } from '../src/game/levels/patterns';

function assertWellFormed(plan: LevelPlan): void {
  expect(plan.cells.length, `level ${plan.index} has bricks`).toBeGreaterThan(12);
  expect(plan.cells.length, `level ${plan.index} is not absurd`).toBeLessThan(220);
  const seen = new Set<string>();
  for (const cell of plan.cells) {
    expect(cell.col).toBeGreaterThanOrEqual(0);
    expect(cell.col).toBeLessThan(GRID.cols);
    expect(cell.row).toBeGreaterThanOrEqual(0);
    const key = `${cell.col},${cell.row}`;
    expect(seen.has(key), `level ${plan.index} has two bricks on ${key}`).toBe(false);
    seen.add(key);
    // The lowest brick must start with some breathing room above the danger line.
    expect(rowToY(cell.row) + GRID.brickH / 2).toBeLessThan(DANGER_Y - 200);
    expect(Number.isFinite(cell.color)).toBe(true);
  }
  expect(plan.hpUnit).toBeGreaterThan(0);
}

describe('level generation', () => {
  it('is deterministic for a seed and varies across seeds', () => {
    const build = (seed: number): LevelPlan => buildLevel(7, new RNG(seed));
    expect(build(10)).toEqual(build(10));
    expect(build(10)).not.toEqual(build(11));
  });

  it('lays out all 15 campaign levels inside the lattice', () => {
    for (let level = 1; level <= CAMPAIGN_LENGTH; level++) {
      assertWellFormed(buildLevel(level, new RNG(1000 + level)));
    }
  });

  it('keeps endless levels well formed far into a run', () => {
    for (const level of [16, 17, 23, 30, 41, 58, 77, 120, 300]) {
      assertWellFormed(buildLevel(level, new RNG(level * 7919)));
    }
  });

  it('schedules a boss every fifth level and nothing else', () => {
    for (let level = 1; level <= 40; level++) {
      const plan = buildLevel(level, new RNG(level));
      expect(plan.boss !== null, `level ${level}`).toBe(isBossLevel(level));
      if (plan.boss) {
        expect(plan.modifier).toBeNull();
        expect(plan.descent).toBe(0);
      }
    }
    expect(CAMPAIGN_LENGTH).toBe(15);
  });

  it('walks through the three chapters in order and wraps in endless', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 10, 11, 15, 16, 30, 31].map(chapterOf)).toEqual([
      0, 0, 0, 0, 0, 1, 1, 1, 2, 2, 0, 2, 0,
    ]);
    expect([1, 15, 16, 30, 31].map(cycleOf)).toEqual([0, 0, 1, 1, 2]);
    expect(buildLevel(16, new RNG(1)).code).toBe('4-1');
    expect(buildLevel(15, new RNG(1)).code).toBe('3-5');
  });

  it('cycles bosses and scales them up on each endless lap', () => {
    const first = buildLevel(5, new RNG(1));
    const again = buildLevel(20, new RNG(1));
    expect(first.boss?.id).toBe(BOSSES[0]?.id);
    expect(again.boss?.id).toBe(BOSSES[0]?.id);
    expect(again.hpUnit).toBeGreaterThan(first.hpUnit);
  });

  it('gives each boss a body with armour, cores and turrets', () => {
    BOSSES.forEach((boss, i) => {
      for (const line of boss.rows) expect(line.length, `${boss.id} row width`).toBe(GRID.cols);
      const body = boss.rows.join('');
      expect(body).toContain('@');
      expect(body).toContain('t');

      const built = buildLevel(i * 5 + 5, new RNG(3));
      expect(built.boss?.id).toBe(boss.id);
      expect(built.name).toBe(boss.name);
      expect(built.cells.filter((c) => c.role === 'core').length).toBeGreaterThanOrEqual(2);
      expect(built.cells.every((c) => c.role !== null)).toBe(true);
    });
  });

  it('never mutates boss levels and only mutates from level 3', () => {
    for (let level = 1; level <= 40; level++) {
      const plan = buildLevel(level, new RNG(level * 31));
      if (plan.boss || level < 3) expect(plan.modifier).toBeNull();
      else if (plan.modifier) expect(MODIFIERS.map((m) => m.id)).toContain(plan.modifier.id);
    }
    const seen = new Set<string>();
    for (let seed = 0; seed < 200; seed++) {
      const modifier = buildLevel(8, new RNG(seed)).modifier;
      if (modifier) seen.add(modifier.id);
    }
    expect(seen.size).toBe(MODIFIERS.length);
  });

  it('escalates pace and toughness with depth', () => {
    const first = buildLevel(1, new RNG(1));
    const last = buildLevel(14, new RNG(1));
    // Bricks toughen ~16% per level: noticeably, but far slower than a real build's damage grows.
    expect(last.hpUnit).toBeGreaterThan(first.hpUnit * 6);
    expect(last.hpUnit).toBeLessThan(first.hpUnit * 8);
    expect(last.descent).toBeGreaterThan(first.descent);
    expect(hpUnit(30)).toBeGreaterThan(hpUnit(15));
    expect(bossScale(15)).toBeGreaterThan(bossScale(5) * 2);
  });

  it('uses every chapter and place name', () => {
    expect(CHAPTERS).toHaveLength(3);
    for (const chapter of CHAPTERS) expect(chapter.places.length).toBeGreaterThanOrEqual(5);
  });
});

describe('patterns', () => {
  const inBounds = (cells: { col: number; row: number }[]): boolean =>
    cells.every((c) => c.col >= 0 && c.col < GRID.cols && c.row >= 0);

  it('stay inside the 12-column lattice', () => {
    for (const name of Object.keys(SPRITES) as (keyof typeof SPRITES)[]) {
      const cells = sprite(name);
      expect(cells.length, name).toBeGreaterThan(20);
      expect(inBounds(cells), name).toBe(true);
    }
    expect(inBounds(wave(5))).toBe(true);
    expect(inBounds(diamond(9))).toBe(true);
    expect(inBounds(pyramid(6))).toBe(true);
    expect(inBounds(funnel(7))).toBe(true);
    expect(inBounds(cross(9))).toBe(true);
  });

  it('are symmetric where they should be', () => {
    const mirrored = (cells: { col: number; row: number }[]): boolean =>
      cells.every((c) => cells.some((o) => o.row === c.row && o.col === GRID.cols - 1 - c.col));
    expect(mirrored(diamond(9))).toBe(true);
    expect(mirrored(pyramid(6))).toBe(true);
    expect(mirrored(cross(9))).toBe(true);
    expect(mirrored(sprite('skull'))).toBe(true);
  });
});

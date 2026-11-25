import { describe, expect, it } from 'vitest';
import { OUTLIER_MS } from '../src/core/frametimes';
import {
  isLighter,
  isTier,
  LOWEST_SCALE,
  QualityGovernor,
  STRUGGLING,
  TIERS,
  tierLabel,
  tierOf,
  WINDOW_FRAMES,
  type GovernorEvent,
  type Tier,
} from '../src/render/governor';

const HIGH = tierOf('high');
const MEDIUM = tierOf('medium');
const LOW = tierOf('low');
const LOWEST: Tier = { quality: 'low', scale: LOWEST_SCALE };
const SCALED = tierLabel(LOWEST);

/** Feeds whole judgement windows of a constant frame time; returns every event, in order. */
function play(governor: QualityGovernor, ...windows: number[]): GovernorEvent[] {
  const events: GovernorEvent[] = [];
  for (const ms of windows) {
    for (let i = 0; i < WINDOW_FRAMES; i++) {
      const event = governor.frame(ms);
      if (event) events.push(event);
    }
  }
  return events;
}

/** One readable token per event: "↓" stepped, "✓" the step helped, "✋" gave up. */
const tokens = (events: GovernorEvent[]): string[] =>
  events.map((event) => {
    let token = tierLabel(event.tier);
    if (event.stepped) token = `↓${token}`;
    if (event.relieved) token += ' ✓';
    if (event.gaveUp) token += ' ✋';
    return token;
  });

describe('quality governor', () => {
  it('holds its step through ordinary jitter', () => {
    // A minute of 60 fps play with every fourth frame missing a beat.
    const governor = new QualityGovernor(HIGH);
    for (let i = 0; i < 3600; i++) expect(governor.frame(i % 4 === 0 ? 33 : 16.7)).toBeNull();
    expect(governor.current).toEqual(HIGH);
    expect(governor.adjusted).toBe(false);
    expect(governor.gaveUp).toBe(false);
  });

  it('ignores a heavy moment that does not fill a window', () => {
    const governor = new QualityGovernor(HIGH);
    // Just under the struggling share of one window: the biggest chain reaction never gets there.
    const late = Math.ceil(WINDOW_FRAMES * STRUGGLING) - 1;
    for (let i = 0; i < late; i++) expect(governor.frame(33)).toBeNull();
    for (let i = 0; i < WINDOW_FRAMES - late; i++) expect(governor.frame(16.7)).toBeNull();
    expect(governor.current).toEqual(HIGH);
  });

  it('steps down after one window of sustained struggle, and confirms the step when it helps', () => {
    const governor = new QualityGovernor(HIGH);
    // 25 fps, then 60 fps: a device one step too deep.
    expect(tokens(play(governor, 40, 16.7))).toEqual(['↓中', '中 ✓']);
    expect(governor.current).toEqual(MEDIUM);
    expect(governor.adjusted).toBe(true);
    expect(governor.gaveUp).toBe(false);
  });

  it('keeps stepping while the device stays short, each step judged on its own window', () => {
    const governor = new QualityGovernor(HIGH);
    // 25 fps → 30 fps → 30 fps → 60 fps. The middle step is confirmed by the window after it,
    // even though that window is still late: the mean did fall.
    expect(tokens(play(governor, 40, 33, 33, 16.7))).toEqual(['↓中', '↓低 ✓', `↓${SCALED}`, `${SCALED} ✓`]);
    expect(governor.current).toEqual(LOWEST);
    expect(governor.gaveUp).toBe(false);
  });

  it('returns to the last step that helped when the rest bring nothing', () => {
    const governor = new QualityGovernor(HIGH);
    // The first step helps (25 → 30 fps); two more do nothing.
    expect(tokens(play(governor, 40, 33, 33, 33))).toEqual(['↓中', '↓低 ✓', `↓${SCALED}`, '中 ✋']);
    expect(governor.current).toEqual(MEDIUM);
    expect(governor.adjusted).toBe(true);
    expect(governor.gaveUp).toBe(true);
  });

  it('tells a throttled device from a slow one: a flat 30 fps comes back to the player’s choice', () => {
    const governor = new QualityGovernor(HIGH);
    // What a power saver looks like: 30 fps at every step, never a frame better.
    expect(tokens(play(governor, 33, 33, 33, 33))).toEqual(['↓中', '↓低', `↓${SCALED}`, '高 ✋']);
    expect(governor.current).toEqual(HIGH);
    expect(governor.adjusted).toBe(false);
    expect(governor.gaveUp).toBe(true);
  });

  it('stops judging once it has given up, until the player chooses', () => {
    const governor = new QualityGovernor(HIGH);
    play(governor, 33, 33, 33, 33);
    expect(play(governor, 33, 33, 16.7)).toEqual([]);
    governor.choose(LOW);
    expect(governor.current).toEqual(LOW);
    expect(governor.gaveUp).toBe(false);
    expect(tokens(play(governor, 33, 16.7))).toEqual([`↓${SCALED}`, `${SCALED} ✓`]);
  });

  it('requires the mean frame time to fall clearly before calling a step helpful', () => {
    // The window that triggers the step averages 40 ms, so the next one must reach 34 ms or less.
    const justEnough = new QualityGovernor(HIGH);
    expect(tokens(play(justEnough, 40, 34, 16.7))).toEqual(['↓中', '↓低 ✓', '低 ✓']);
    const justShort = new QualityGovernor(HIGH);
    expect(tokens(play(justShort, 40, 34.1, 16.7))).toEqual(['↓中', '↓低', '低 ✓']);
  });

  it('is not fooled by tab switches or resize hitches', () => {
    const governor = new QualityGovernor(HIGH);
    for (let i = 0; i < WINDOW_FRAMES * 3; i++) expect(governor.frame(OUTLIER_MS + 1)).toBeNull();
    expect(governor.current).toEqual(HIGH);
    // Those frames counted for nothing: the window still needs its full complement of real ones,
    // so the step comes on the hundredth late frame, not any sooner.
    for (let i = 0; i < WINDOW_FRAMES - 1; i++) expect(governor.frame(33)).toBeNull();
    expect(governor.frame(33)?.stepped).toBe(true);
  });

  it('starts from a step learned earlier, and reports it as an adjustment', () => {
    const governor = new QualityGovernor(HIGH, MEDIUM);
    expect(governor.current).toEqual(MEDIUM);
    expect(governor.adjusted).toBe(true);
    // It keeps going down from there when it must.
    expect(tokens(play(governor, 33, 33, 33, 33))).toEqual(['↓低', `↓${SCALED}`, '中 ✋']);
  });

  it('adopts a choice made by hand exactly and starts judging afresh', () => {
    const governor = new QualityGovernor(HIGH);
    play(governor, 33, 33); // on its way down, with a step still unjudged
    governor.choose(LOW);
    expect(governor.current).toEqual(LOW);
    expect(governor.adjusted).toBe(false);
    // The half-finished judgement does not leak into the new choice.
    expect(tokens(play(governor, 16.7, 33, 16.7))).toEqual([`↓${SCALED}`, `${SCALED} ✓`]);
  });
});

describe('render steps', () => {
  it('run from the heaviest to the lightest', () => {
    for (let i = 1; i < TIERS.length; i++) {
      const lighter = TIERS[i]!;
      const heavier = TIERS[i - 1]!;
      expect(isLighter(lighter, heavier)).toBe(true);
      expect(isLighter(heavier, lighter)).toBe(false);
    }
    // Only the last step is drawn below full resolution, and every tier is represented.
    expect(TIERS.filter((step) => step.scale < 1).map((step) => step.scale)).toEqual([LOWEST_SCALE]);
    expect(new Set(TIERS.map((step) => step.quality)).size).toBe(3);
  });

  it("a player's choice names that tier at full resolution", () => {
    expect(tierOf('low')).toEqual(LOW);
    // A learned step only counts while it is below what the player asks for.
    expect(isLighter(MEDIUM, HIGH)).toBe(true);
    expect(isLighter(MEDIUM, MEDIUM)).toBe(false);
    expect(isLighter(MEDIUM, LOW)).toBe(false);
  });

  it('recognises only real steps', () => {
    for (const step of TIERS) expect(isTier(step)).toBe(true);
    for (const bogus of [
      { quality: 'high', scale: LOWEST_SCALE },
      { quality: 'medium', scale: LOWEST_SCALE },
      { quality: 'low', scale: 0.5 },
      { quality: 'low' },
      { quality: 'ultra', scale: 1 },
      null,
      'low',
    ]) {
      expect(isTier(bogus)).toBe(false);
    }
  });
});

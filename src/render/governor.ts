import { OUTLIER_MS, SLOW_MS } from '../core/frametimes';
import { t } from '../core/i18n';
import type { QualityLevel } from './layout';

/** A step the renderer can sit on: a quality tier plus a scale on its pixel ratio. */
export interface Tier {
  quality: QualityLevel;
  /**
   * Multiplier on the tier's pixel ratio. Below 1 the frame is drawn smaller and upscaled by the
   * browser: the last resort for devices that cannot hold the frame rate even on "low".
   */
  scale: number;
}

export const LOWEST_SCALE = 0.75;

/**
 * From the heaviest to the lightest step. On a high-density phone each step draws roughly half
 * the pixels of the one above it, and pixel count is what GPU time follows.
 */
export const TIERS: readonly Tier[] = [
  { quality: 'high', scale: 1 },
  { quality: 'medium', scale: 1 },
  { quality: 'low', scale: 1 },
  { quality: 'low', scale: LOWEST_SCALE },
];

/** Frames per judgement window. At a steady 30 frames per second that is about 3.3 seconds. */
export const WINDOW_FRAMES = 100;
/** A window in which at least this share of frames were late says the device is struggling. */
export const STRUGGLING = 0.8;
/** A step helped when the mean frame time fell to this share of what it was, or lower. */
export const RELIEF = 0.85;

/** Player-facing name of a step, e.g. "低" or "低（75% 渲染分辨率）" — in the active language. */
export function tierLabel(tier: Tier): string {
  const key =
    tier.quality === 'high'
      ? 'governor.qualityHigh'
      : tier.quality === 'medium'
        ? 'governor.qualityMedium'
        : 'governor.qualityLow';
  const name = t(key);
  return tier.scale < 1 ? t('governor.scaled', { name, pct: Math.round(tier.scale * 100) }) : name;
}

/** The step a player's choice names: that tier at full resolution. */
export function tierOf(quality: QualityLevel): Tier {
  return { quality, scale: 1 };
}

function indexOf(tier: Tier): number {
  return TIERS.findIndex((step) => step.quality === tier.quality && step.scale === tier.scale);
}

/** True when `a` renders fewer pixels (or fewer effects) than `b`. Unknown tiers count as lightest. */
export function isLighter(a: Tier, b: Tier): boolean {
  const ia = indexOf(a);
  const ib = indexOf(b);
  return (ia < 0 ? TIERS.length : ia) > (ib < 0 ? TIERS.length : ib);
}

/** Whether `value` is one of the steps the governor uses; used to repair saved device state. */
export function isTier(value: unknown): value is Tier {
  return !!value && typeof value === 'object' && indexOf(value as Tier) >= 0;
}

/** What one frame told the governor. At most one of these arrives per judgement window. */
export interface GovernorEvent {
  /** The step in effect after this frame. */
  tier: Tier;
  /** The step just changed to something lighter. */
  stepped: boolean;
  /** The previous step measurably helped: this device really is limited by what it is asked to draw. */
  relieved: boolean;
  /**
   * Taking things away has stopped helping, so the frame rate is not being decided by the GPU —
   * most likely a system power-saving cap. Back at the best step that did help; no more steps
   * until the player chooses.
   */
  gaveUp: boolean;
}

/**
 * Steps the render quality down while frames are consistently late — and only down.
 *
 * Raising quality again is left to the player: stepping up on a quiet moment and back down on
 * the next busy one would make the image pulse. Every step has to earn its place: the window
 * after it must show a clearly shorter mean frame time than the one that triggered it. That
 * keeps a step from being remembered on the strength of one heavy explosion, and it is what
 * tells a slow device apart from a throttled one — a phone capped at 30 frames per second by
 * its power saver stays at 30 whatever it is asked to draw.
 */
export class QualityGovernor {
  private tier: Tier;
  private wanted: Tier;
  /** The last step that measurably helped. Where the governor returns to when it gives up. */
  private best: Tier;
  /** Mean frame time of the window that led to the latest step; the next window is judged against it. */
  private reference = Number.POSITIVE_INFINITY;
  private windowMs = 0;
  private windowLate = 0;
  private windowCount = 0;
  /** Steps in a row that did not help. */
  private barren = 0;
  /** A step was taken and its window has not been judged yet. */
  private pending = false;
  private locked = false;

  /** `start`: a step this device learned earlier, when it is lighter than what the player wants. */
  constructor(wanted: Tier, start: Tier = wanted) {
    this.wanted = wanted;
    this.tier = start;
    this.best = start;
  }

  get current(): Tier {
    return this.tier;
  }

  /** True while the step is below the player's choice. Drives the note in the settings screen. */
  get adjusted(): boolean {
    return isLighter(this.tier, this.wanted);
  }

  /** True once stepping down proved not to help. Nothing more happens until the player chooses. */
  get gaveUp(): boolean {
    return this.locked;
  }

  /** Feeds one frame duration. Returns an event when a judgement window just closed, else null. */
  frame(ms: number): GovernorEvent | null {
    // A tab switch or a resize hitch says nothing about sustained load.
    if (ms > OUTLIER_MS || this.locked) return null;
    this.windowMs += ms;
    if (ms > SLOW_MS) this.windowLate++;
    this.windowCount++;
    if (this.windowCount < WINDOW_FRAMES) return null;

    const mean = this.windowMs / this.windowCount;
    const struggling = this.windowLate / this.windowCount >= STRUGGLING;
    this.windowMs = 0;
    this.windowLate = 0;
    this.windowCount = 0;

    let relieved = false;
    if (this.pending) {
      if (mean <= this.reference * RELIEF) {
        this.best = this.tier;
        this.barren = 0;
        relieved = true;
      } else {
        this.barren++;
      }
      this.pending = false;
    }

    let stepped = false;
    let gaveUp = false;
    if (struggling) {
      const next = TIERS[indexOf(this.tier) + 1];
      if (next) {
        this.tier = next;
        this.reference = mean;
        this.pending = true;
        stepped = true;
      } else if (this.barren >= 2) {
        // Nothing left to take away, and the last steps bought nothing.
        this.tier = this.best;
        this.locked = true;
        gaveUp = true;
      }
    }
    if (!(stepped || relieved || gaveUp)) return null;
    return { tier: this.tier, stepped, relieved, gaveUp };
  }

  /** The player picked a step by hand: adopt it exactly and start judging afresh. */
  choose(tier: Tier): void {
    this.wanted = tier;
    this.tier = tier;
    this.best = tier;
    this.reference = Number.POSITIVE_INFINITY;
    this.windowMs = 0;
    this.windowLate = 0;
    this.windowCount = 0;
    this.barren = 0;
    this.pending = false;
    this.locked = false;
  }
}

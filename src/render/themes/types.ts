import type { Ball } from '../../game/entities';
import type { World } from '../../game/world';
import type { Pen } from '../batch';

/**
 * What a theme is made of, as contracts. Nothing in here knows a theme by name.
 *
 * A theme is two kinds of thing. Its {@link ThemeFacts} — names, prices, colours — are all the
 * shop, the save and the wallet mirror need, and live one file per theme under `facts/`. Its
 * {@link ThemeArt} — the background's shader source and the recipes it throws — and its painters
 * under `paint/` are the renderer's business alone. The registry (`index.ts`) puts the three
 * together into the {@link ThemeConfig} a frame is drawn from.
 *
 * A theme has three parts — paddle, ball and background — each bought and worn on its own, and
 * sells as one set. Everything a theme provides is looks: it reads the simulation's presentation
 * state (position, velocity, the flash a landing leaves) and may draw anywhere, but it never
 * writes back. The collision box is the simulation's and stays exactly where it was.
 */

export interface ThemeColors {
  /** The lead colour. */
  primary: number;
  secondary: number;
  /** Near-white; cores, rims and anything that should read as light. */
  highlight: number;
  /** Arena frame and lines while the theme's background is worn. */
  accent: number;
  /** Deep tones for whatever wants a ground, darkest first. */
  depths: readonly [number, number, number];
}

/** What the stock ball layers wear under a theme: the halo, the comet tail and the hot centre. */
export interface ThemeBallGlow {
  glow: number;
  trail: number;
  core: number;
}

/**
 * The paddle as its painter sees it. `hw`/`hh` are the live half extents of the collision box —
 * a painter may ornament around them freely, but this box is what the ball bounces off, so it is
 * also what has to stay legible as the paddle's body.
 */
export interface PaddleFrame {
  x: number;
  y: number;
  hw: number;
  hh: number;
  /** Velocity along x in world units per second. */
  vx: number;
  /** 1 the instant a ball lands, easing back to 0: the clock of an "opening" animation. */
  hit: number;
  /** Seconds since the last landing (capped), for things that scatter and then grow back. */
  sinceHit: number;
  /** 0 at rest, 1 at a quick swipe; smoothed, so a lean follows the hand without jitter. */
  move: number;
  /** True while Overdrive runs: its body colour is feedback the theme steps aside for. */
  overdrive: boolean;
  /** The theme layer's own clock: it stops with the game, unlike the frame's time. */
  time: number;
}

/** A ball as its painter sees it. Only ordinary balls reach a painter: twins, ghosts and the like keep their own look. */
export interface BallFrame {
  x: number;
  y: number;
  r: number;
  /** Direction of travel, radians. */
  rot: number;
  /** 0..1. */
  alpha: number;
  time: number;
}

/** Draws a themed paddle. Called in place of the stock body and thruster wash. */
export type PaddlePainter = (pen: Pen, frame: PaddleFrame, colors: ThemeColors) => void;

/**
 * Draws a themed ball's body and accents. It runs before the stock glow layers, which then wear
 * the theme's `glow` colours on top, so the hot centre always wins and the ball stays readable.
 */
export type BallPainter = (pen: Pen, frame: BallFrame, colors: ThemeColors) => void;

/**
 * A thrown handful of one particle kind. Angles are measured from `dir`, the outward normal of
 * whatever was hit, so the same recipe works on a wall, a brick and the paddle.
 */
export interface Burst {
  kind: number;
  count: number;
  color: number;
  /** Speed in world units per second. */
  speed: readonly [number, number];
  /** Lifetime in seconds. */
  life: readonly [number, number];
  /** Size in world units: at birth, then at the end of life (a petal shrinks as it fades). */
  size: readonly [number, number];
  /** Half-angle of the cone around `dir` in radians. The default is every direction. */
  spread?: number;
  /** Where to spawn, as an offset range from the contact point on each axis. */
  offset?: readonly [number, number, number, number];
  /** Downward pull, or a negative number for buoyancy. */
  grav?: number;
  /** Exponential velocity damping per second. */
  drag?: number;
  /** Spin in radians per second, as a range; the sign is picked at random. */
  rotV?: number;
  alpha?: number;
  /** Brightness multiplier (HDR). */
  intensity?: number;
  /** Rings only: the end radius. */
  reach?: number;
}

/** What drifts across a theme's background. */
export type AmbientKind = 'petal' | 'bubble' | 'leaf' | 'firefly' | 'mote' | 'fish';

export interface AmbientSpec {
  kind: AmbientKind;
  /** How many are adrift on the low, medium and high step. */
  count: readonly [number, number, number];
  /** Colours, picked at random per particle. */
  colors: readonly number[];
  /**
   * Speed along the kind's own way in CSS px per second: petals, leaves and dust fall, bubbles
   * rise, fish hold their depth and only bob.
   */
  drift: readonly [number, number];
  /** Speed across it. Fish take this as how fast they swim, either way; the rest as a wind. */
  wind: readonly [number, number];
  /** How far each one sways about its course, in CSS px. */
  sway: number;
  /** Size in CSS px. */
  size: readonly [number, number];
  /** Tumble in radians per second. */
  spin: readonly [number, number];
}

export interface ThemeEffects {
  /** The background's own drifting layer, heaviest first (behind the rest). */
  ambient: readonly AmbientSpec[];
  /** Shed from the paddle's trailing end while it moves. */
  paddleTrail: Burst;
  /** Something rarer shed from the same end while it moves, `chance` of the time: fireflies off leaves. */
  paddleSpark?: { burst: Burst; chance: number };
  /** Shed from the paddle at rest too, every `every` seconds: bubbles off water, nothing off wood. */
  paddleIdle?: { burst: Burst; every: number };
  /** Left behind a ball every `stride` world units of travel. */
  ballTrail: Burst & { stride: number };
  /** A ball landing on the paddle. */
  paddleHit: readonly Burst[];
  /** A ball bouncing off a wall or a brick. */
  bounce: readonly Burst[];
}

export interface ThemePartCopy {
  /** Chinese canonical; other locales override through the UI dictionary. */
  name: string;
  en: string;
  desc: string;
}

/** A background scene's GLSL: helper functions, then the body that paints `col` (see `background.ts`). */
export interface ThemeScene {
  helpers: string;
  body: string;
}

// The part kinds are spelled in `ids.ts`; the UI has always read the name from here.
export type { ThemePartKind } from './ids';

/**
 * What the shop, the save and the wallet mirror know a theme by. Pure data with no drawing code
 * and no shader source in it, so the skin catalog can import it without dragging either into a
 * bundle that never draws a theme.
 */
export interface ThemeFacts<T extends string = string> {
  id: T;
  name: string;
  en: string;
  desc: string;
  /** The whole set at once. Never more than its three parts together. */
  price: number;
  colors: ThemeColors;
  paddle: ThemePartCopy & { price: number };
  ball: ThemePartCopy & {
    price: number;
    glow: ThemeBallGlow;
    /** Scale of the stock wide halo and saturated bloom, 0..1: a crystal wants less than a comet. */
    halo: readonly [number, number];
  };
  bg: ThemePartCopy & { price: number };
}

/** What only the renderer needs: the background's shader source, and what the theme throws. */
export interface ThemeArt<T extends string = string> {
  id: T;
  scene: ThemeScene;
  effects: ThemeEffects;
}

/** A whole theme as a frame is drawn from it: its facts, its art, and its painters. */
export interface ThemeConfig<T extends string = string> extends ThemeFacts<T> {
  paddle: ThemeFacts<T>['paddle'] & { paint: PaddlePainter };
  ball: ThemeFacts<T>['ball'] & { paint: BallPainter };
  /** `frag` is the scene assembled into a complete fragment shader (`background.ts`). */
  bg: ThemeFacts<T>['bg'] & { frag: string };
  effects: ThemeEffects;
}

/**
 * The theme worn in each slot. The three are independent: a paddle from one theme, a ball from
 * another and a third's scene are a perfectly good outfit, and any slot may be the stock look.
 */
export interface ThemeSlots {
  paddle: ThemeConfig | null;
  ball: ThemeConfig | null;
  bg: ThemeConfig | null;
}

/**
 * What a theme adds to a frame. `ThemeLayer` implements it; the scene only knows this much. The
 * scene calls each at the right moment in its own draw order, so a theme never has to know how
 * the frame is put together.
 */
export interface ThemeOverlay {
  /** Everything that belongs beneath the bricks: the background's drifting layer and the theme's particles. */
  under(pen: Pen, world: World): void;
  /** The paddle's body and ornament, in place of the stock body and thruster wash. */
  paddle(pen: Pen, world: World): void;
  /** A ball's themed body and accents. Called for ordinary balls only. */
  ball(pen: Pen, ball: Ball): void;
}

import { describe, expect, it, vi } from 'vitest';
import { dict, setLang, t } from '../src/core/i18n';
import { RNG } from '../src/core/rng';
import { loadSave, parseEconomyState, storeSave, type SaveData } from '../src/core/storage';
import { PADDLE_H } from '../src/game/config';
import { makeBall } from '../src/game/entities';
import { CHAPTERS } from '../src/game/levels/definitions';
import { buildLevel } from '../src/game/levels/generator';
import { createRun } from '../src/game/run';
import { computeStats } from '../src/game/upgrades/stats';
import { World } from '../src/game/world';
import { InstanceBatch, Pen, TextBatch } from '../src/render/batch';
import { Fx } from '../src/render/fx';
import { PK_BUBBLE, PK_FIRE, PK_LEAF, PK_PETAL, PK_RING, ParticleSystem } from '../src/render/particles';
import { drawScene, type SceneInfo } from '../src/render/scene';
import { SHAPE_BOX } from '../src/render/shaders/instances';
import {
  SHAPE_ARC,
  SHAPE_BLOSSOM,
  SHAPE_BRANCH,
  SHAPE_BUBBLE,
  SHAPE_CRYSTAL,
  SHAPE_CURL,
  SHAPE_FAN,
  SHAPE_FISH,
  SHAPE_LEAF,
  SHAPE_PETAL,
} from '../src/render/shaders/sprites';

import {
  SKIN_MAP,
  SKINS,
  THEME_PARTS,
  canBuySkin,
  canEquipSkin,
  isBallSkinId,
  isBgSkinId,
  isPaddleSkinId,
  isSkinId,
} from '../src/render/skins';
import type { GlyphAtlas } from '../src/render/textAtlas';
import { AmbientField, plateDim, type AmbientStage } from '../src/render/themes/ambient';
import { themeFragment } from '../src/render/themes/background';
import {
  THEME_FACTS,
  THEME_IDS,
  canBuyTheme,
  canEquipTheme,
  themeFacts,
  themeMissing,
  themePart,
  themePartDefs,
  themePartId,
  themeRemainder,
} from '../src/render/themes/catalog';
import { FOREST } from '../src/render/themes/facts/forest';
import { OCEAN } from '../src/render/themes/facts/ocean';
import { SAKURA } from '../src/render/themes/facts/sakura';
import { FOREST_ART } from '../src/render/themes/art/forest';
import { OCEAN_ART } from '../src/render/themes/art/ocean';
import { SAKURA_ART } from '../src/render/themes/art/sakura';
import { THEMES, THEME_CONFIGS, ThemeRegistry } from '../src/render/themes/index';
import { ThemeLayer, themeParticleCapacity } from '../src/render/themes/layer';
import { emitBurst } from '../src/render/themes/recipes';
import type {
  AmbientKind,
  BallPainter,
  Burst,
  PaddlePainter,
  ThemeConfig,
  ThemeOverlay,
} from '../src/render/themes/types';

/**
 * The cosmetic themes: the catalog, the set's buy/equip rules, storage, the layer that watches a
 * world, and the seam a fourth theme goes through. The one rule the whole system hangs on has its
 * own test: a theme changes what is drawn and nothing else — a world played with every part of a
 * theme worn ends up bit-identical to the same world played bare.
 */

const DT = 1 / 60;
const CHAPTER = CHAPTERS[0]!;
const KINDS = ['paddle', 'ball', 'bg'] as const;
const LEGAL_HEX = (c: number): boolean => Number.isInteger(c) && c >= 0 && c <= 0xffffff;

function makeWorld(seed = 1, level = 3): World {
  const run = createRun('endless', seed);
  run.stats = computeStats(run.upgrades, 0);
  const rng = new RNG(seed * 31 + level);
  return new World(run, buildLevel(level, rng), rng.fork(), { bot: true });
}

/** Everything of a world's simulation that a frame can move, as one comparable value. */
function snapshot(world: World): string {
  return JSON.stringify({
    state: world.state,
    time: world.time,
    hp: world.hp,
    combo: world.combo,
    energy: world.energy,
    killed: world.killed,
    paddle: world.paddle,
    balls: world.balls.map((b) => [b.x, b.y, b.vx, b.vy, b.radius, b.alive, b.docked, b.momentum, b.squash]),
    bricks: world.bricks.map((b) => [b.x, b.y, b.hp, b.dead, b.flash, b.scale]),
    score: world.run.score,
  });
}

/** A world past its countdown with one ball in free flight, where a painter can reach it. */
function flyingWorld(): World {
  const world = makeWorld();
  world.state = 'playing';
  const ball = world.balls[0]!;
  ball.docked = false;
  ball.x = 200;
  ball.y = 500;
  ball.vx = 300;
  ball.vy = -400;
  return world;
}

/** A second ball in free flight beside the first; `clone` makes it a Split twin. */
function addBall(world: World, clone = false): void {
  world.balls.push(makeBall({ x: 60, y: 500, angle: -1.2, speed: 300, radius: 8, mult: 0.7, clone }));
}

const stage = (): AmbientStage => ({
  width: 1000,
  height: 800,
  scale: 1,
  ox: 0,
  oy: 0,
  ax: 260,
  ay: 80,
  aw: 480,
  ah: 640,
});

const allOf = (id: (typeof THEME_IDS)[number]) => {
  const theme = THEMES.get(id)!;
  return { paddle: theme, ball: theme, bg: theme };
};

/** A pen with no WebGL whose sprite and haze calls can be read back. */
function spyPen(): Pen & { sprite: ReturnType<typeof vi.fn>; haze: ReturnType<typeof vi.fn> } {
  const sprite = vi.fn();
  const haze = vi.fn();
  return { sprite, haze } as unknown as Pen & {
    sprite: ReturnType<typeof vi.fn>;
    haze: ReturnType<typeof vi.fn>;
  };
}

// ───────────────────────────── a pen that records ─────────────────────────────

/** A `Pen` over plain batches: enough to read back what a frame drew, with no WebGL. */
function makePen(): Pen {
  const glyphs = {
    texture: null,
    index: {},
    advance: new Float32Array(0),
    width: new Float32Array(0),
    u0: new Float32Array(0),
    u1: new Float32Array(0),
    heightRatio: 1,
  } as unknown as GlyphAtlas;
  return new Pen(
    new InstanceBatch(8192),
    new InstanceBatch(16384),
    new TextBatch(256),
    glyphs,
    new InstanceBatch(4096),
    new InstanceBatch(4096),
  );
}

/**
 * Where an instance sits in the alpha-blended pass, which is drawn in this order: a theme's
 * sprites beneath the surfaces, the surfaces themselves (bricks, a stock paddle body, and the
 * lights that belong beneath them), then a theme's sprites in front.
 */
type Layer = 'under' | 'stock' | 'front';

interface Drawn {
  layer: Layer;
  shape: number;
  x: number;
  y: number;
  hw: number;
  hh: number;
}

const STRIDE = 20;

function decode(layer: Layer, batch: InstanceBatch): Drawn[] {
  const out: Drawn[] = [];
  const d = batch.data;
  for (let i = 0; i < batch.count; i++) {
    const at = i * STRIDE;
    out.push({ layer, shape: d[at + 9]!, x: d[at]!, y: d[at + 1]!, hw: d[at + 10]!, hh: d[at + 11]! });
  }
  return out;
}

/** Everything the alpha-blended pass would draw, in the order it draws it. */
function painted(pen: Pen): Drawn[] {
  return [
    ...decode('under', pen.spritesBack),
    ...decode('stock', pen.box),
    ...decode('front', pen.spritesFront),
  ];
}

/** What one layer holds. */
const layerOf = (pen: Pen, layer: Layer): Drawn[] => painted(pen).filter((d) => d.layer === layer);

/** Every theme sprite of the frame, both layers: everything that is not a stock shape. */
const spritesOf = (pen: Pen): Drawn[] => painted(pen).filter((d) => d.layer !== 'stock');

/** A spy for `ThemeOverlay`: records what the scene asked of a theme, and in what order. */
function spyOverlay(): ThemeOverlay & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    under: () => void calls.push('under'),
    paddle: () => void calls.push('paddle'),
    ball: (_pen, ball) => void calls.push(`ball:${ball.id}`),
  };
}

describe('theme catalog', () => {
  it('every part is a skin of its own kind, at its own price, colliding with nothing', () => {
    const ids = THEME_PARTS.map((part) => part.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(THEME_FACTS.length * 3);
    for (const part of THEME_PARTS) {
      expect(SKIN_MAP[part.id], part.id).toBe(part);
      expect(isSkinId(part.id), part.id).toBe(true);
      expect(
        SKINS.some((skin) => skin.id === part.id),
        part.id,
      ).toBe(false);
      expect(part.price, part.id).toBeGreaterThan(0);
      // It guards as its own kind, and only as its own kind.
      const guards = [isBallSkinId, isPaddleSkinId, isBgSkinId];
      expect(
        guards.filter((is) => is(part.id)),
        part.id,
      ).toHaveLength(1);
      expect(guards[['ball', 'paddle', 'bg'].indexOf(part.kind)]!(part.id), part.id).toBe(true);
    }
    expect(themePartDefs().map((def) => def.id)).toEqual(ids);
  });

  it('part ids parse back to their theme and slot, and nothing else parses', () => {
    expect(themePart('sakura_paddle')).toEqual({ theme: 'sakura', kind: 'paddle' });
    expect(themePart('ocean_bg')).toEqual({ theme: 'ocean', kind: 'bg' });
    for (const junk of [
      'sakura_nope',
      'bogus_paddle',
      'paddle',
      'sakura',
      'startrail',
      'neon',
      '',
      '_paddle',
      'sakura_',
      null,
      7,
    ]) {
      expect(themePart(junk), String(junk)).toBeNull();
    }
    expect(themePartId('forest', 'ball')).toBe('forest_ball');
  });

  it('the set never costs more than its parts, and finishing one is cheaper than its last part', () => {
    for (const theme of THEME_FACTS) {
      const sum = theme.paddle.price + theme.ball.price + theme.bg.price;
      expect(theme.price, theme.id).toBeGreaterThan(0);
      expect(theme.price, theme.id).toBeLessThanOrEqual(sum);
      // Finishing a set never costs more than the parts still missing would cost alone…
      for (const owned of [
        [],
        [themePartId(theme.id, 'paddle')],
        [themePartId(theme.id, 'bg')],
        [themePartId(theme.id, 'ball')],
      ]) {
        const missing = themeMissing(owned, theme.id);
        const alone = missing.reduce((total, kind) => total + theme[kind].price, 0);
        const left = themeRemainder(owned, theme.id);
        expect(left, `${theme.id}: ${owned}`).toBeLessThanOrEqual(alone);
        expect(left, `${theme.id}: ${owned}`).toBe(theme.price - (sum - alone));
      }
      // …and with only the dearest part left, finishing is cheaper than buying that part alone.
      const rest = ['paddle', 'ball'].filter((kind) => kind !== dearestKind(theme));
      expect(
        themeRemainder(
          rest.map((kind) => themePartId(theme.id, kind as 'paddle')),
          theme.id,
        ),
        theme.id,
      ).toBeLessThan(theme[dearestKind(theme)].price);
    }
  });

  it('the three themes are different looks, not three palettes', () => {
    expect(new Set(THEME_CONFIGS.map((theme) => theme.colors.primary)).size).toBe(THEME_CONFIGS.length);
    expect(new Set(THEME_CONFIGS.map((theme) => theme.paddle.paint)).size).toBe(THEME_CONFIGS.length);
    expect(new Set(THEME_CONFIGS.map((theme) => theme.ball.paint)).size).toBe(THEME_CONFIGS.length);
    // Each scene is its own piece of work, built around its own landmark: a torii, coral, a hut.
    const landmarks: Record<string, string> = { sakura: 'torii', ocean: 'coral', forest: 'hut' };
    for (const theme of THEME_CONFIGS) {
      const frag = theme.bg.frag;
      expect(frag.length, theme.id).toBeGreaterThan(4000);
      for (const [other, mark] of Object.entries(landmarks)) {
        if (other === theme.id) expect(frag, `${theme.id}: ${mark}`).toContain(mark);
        else expect(frag, `${theme.id} must not build ${other}'s scene`).not.toContain(mark);
      }
    }
  });

  it('every theme carries legal colours, glow and a balanced scene', () => {
    const balanced = (src: string, open: string, close: string): boolean =>
      src.split(open).length === src.split(close).length;
    for (const theme of THEME_CONFIGS) {
      const c = theme.colors;
      for (const hex of [c.primary, c.secondary, c.highlight, c.accent, ...c.depths]) {
        expect(LEGAL_HEX(hex), `${theme.id} ${hex.toString(16)}`).toBe(true);
      }
      const { glow, halo } = theme.ball;
      for (const hex of [glow.glow, glow.trail, glow.core]) expect(LEGAL_HEX(hex), theme.id).toBe(true);
      expect(halo, theme.id).toHaveLength(2);
      for (const k of halo) {
        expect(k, theme.id).toBeGreaterThan(0.3);
        expect(k, theme.id).toBeLessThanOrEqual(1);
      }
      expect(balanced(theme.bg.frag, '{', '}'), theme.id).toBe(true);
      expect(balanced(theme.bg.frag, '(', ')'), theme.id).toBe(true);
      expect(theme.bg.frag, theme.id).not.toMatch(/\$\{/);
      expect(theme.bg.frag.trimEnd().endsWith('}'), theme.id).toBe(true);
      const e = theme.effects;
      for (const burst of [e.paddleTrail, e.ballTrail, ...e.paddleHit, ...e.bounce]) {
        expect(burst.count, theme.id).toBeGreaterThan(0);
        expect(burst.life[0], theme.id).toBeGreaterThan(0);
        expect(burst.life[0], theme.id).toBeLessThanOrEqual(burst.life[1]);
        expect(burst.size[0], theme.id).toBeGreaterThan(0);
      }
      expect(e.ballTrail.stride, theme.id).toBeGreaterThan(0);
      for (const spec of e.ambient) {
        expect(spec.count, theme.id).toHaveLength(3);
        expect(spec.count[0], theme.id).toBeLessThanOrEqual(spec.count[1]);
        expect(spec.count[1], theme.id).toBeLessThanOrEqual(spec.count[2]);
        expect(spec.colors.length, theme.id).toBeGreaterThan(0);
      }
    }
  });

  it('every theme on the shelf is registered complete', () => {
    expect(THEME_IDS).toEqual(['sakura', 'ocean', 'forest']);
    expect(THEME_CONFIGS.map((theme) => theme.id)).toEqual([...THEME_IDS]);
    for (const id of THEME_IDS) {
      const theme = THEMES.get(id);
      expect(theme, id).not.toBeNull();
      expect(theme!.id, id).toBe(id);
      expect(themeFacts(id).price, id).toBe(theme!.price);
      expect(typeof theme!.paddle.paint, id).toBe('function');
      expect(typeof theme!.ball.paint, id).toBe('function');
    }
    expect(THEMES.get('nope')).toBeNull();
    expect(THEMES.get(undefined)).toBeNull();
    expect(THEMES.get('startrail')).toBeNull();
  });

  it('keeps the facts free of the art: what a shop loads carries no shader source', () => {
    // The skin catalog, the save and the wallet mirror import the facts and nothing else of a
    // theme. A package that never draws one (the WeChat shell) must not pay for its scenes.
    const facts = [SAKURA, OCEAN, FOREST];
    expect(THEME_FACTS).toEqual(facts);
    const text = JSON.stringify(facts);
    expect(text.length).toBeLessThan(4000);
    expect(text).not.toContain('void main');
    expect(text).not.toContain('vec2');
    expect(text).not.toContain('uniform');
    for (const theme of facts) {
      for (const part of [theme.paddle, theme.ball, theme.bg]) {
        expect(Object.hasOwn(part, 'scene'), `${theme.id} scene`).toBe(false);
        expect(Object.hasOwn(part, 'effects'), `${theme.id} effects`).toBe(false);
      }
      expect(Object.hasOwn(theme, 'effects'), `${theme.id} effects`).toBe(false);
    }
    // The shader source and the recipes are in the art, once per theme, under the same id.
    const art = [SAKURA_ART, OCEAN_ART, FOREST_ART];
    expect(art.map((a) => a.id)).toEqual(facts.map((f) => f.id));
    for (const a of art) {
      expect(Object.keys(a).sort()).toEqual(['effects', 'id', 'scene']);
      expect(a.scene.body.length + a.scene.helpers.length).toBeGreaterThan(3000);
      expect(a.effects.ballTrail.stride).toBeGreaterThan(0);
      expect(a.effects.ambient.length).toBeGreaterThan(0);
    }
  });
});

describe('theme fragment assembly', () => {
  it('gives a scene the window, the arena, the clock and the parallax, then its own code', () => {
    const scene = {
      helpers: 'float myShape(vec2 p) { return length(p) - 0.1; }',
      body: 'col += vec3(1.0) * fill(myShape(a));',
    };
    const src = themeFragment(scene);
    expect(src.startsWith('#version 300 es')).toBe(true);
    for (const [type, uniform] of [
      ['vec2', 'uCss'],
      ['vec4', 'uArena'],
      ['float', 'uTime'],
      ['float', 'uEnergy'],
      ['float', 'uPar'],
      ['float', 'uDetail'],
    ]) {
      expect(src, uniform).toContain(`uniform ${type} ${uniform};`);
    }
    expect(src).toContain(scene.helpers);
    expect(src).toMatch(/\n {2}col \+= vec3\(1\.0\) \* fill\(myShape\(a\)\);\n/);
    expect(src).not.toContain('__BODY__');
    expect(src.split('{').length).toBe(src.split('}').length);
    // The scene's own code runs after the coordinates it reads have been prepared.
    for (const layer of ['far', 'mid', 'near']) expect(src).toContain(`vec2 ${layer} = a;`);
    expect(src.indexOf(scene.helpers)).toBeLessThan(src.indexOf('void main()'));
    expect(src.indexOf('vec2 near = a;')).toBeLessThan(src.indexOf(scene.body));
  });
});

/** The slot whose part costs the most. */
function dearestKind(theme: (typeof THEME_FACTS)[number]): 'paddle' | 'ball' | 'bg' {
  return (['paddle', 'ball', 'bg'] as const).reduce(
    (best, kind) => (theme[kind].price > theme[best].price ? kind : best),
    'paddle',
  );
}

describe('set verdicts', () => {
  const sakura = themeFacts('sakura');
  const all = KINDS.map((kind) => themePartId('sakura', kind));

  it('an empty wallet owns nothing of a theme, and a full one owns all three slots', () => {
    expect(themeMissing([], 'sakura')).toEqual(['paddle', 'ball', 'bg']);
    expect(themeMissing(all, 'sakura')).toEqual([]);
    expect(canEquipTheme([], 'sakura')).toBe(false);
    expect(canEquipTheme(['sakura_paddle'], 'sakura')).toBe(false);
    expect(canEquipTheme(all, 'sakura')).toBe(true);
  });

  it('the set is bought whole, or finished for what is left', () => {
    expect(themeRemainder([], 'sakura')).toBe(sakura.price);
    expect(canBuyTheme(sakura.price - 1, [], 'sakura')).toBe(false);
    expect(canBuyTheme(sakura.price, [], 'sakura')).toBe(true);
    // After the paddle: only its price comes off the set's.
    expect(themeRemainder(['sakura_paddle'], 'sakura')).toBe(sakura.price - sakura.paddle.price);
    expect(canBuyTheme(sakura.price - sakura.paddle.price - 1, ['sakura_paddle'], 'sakura')).toBe(false);
    expect(canBuyTheme(sakura.price - sakura.paddle.price, ['sakura_paddle'], 'sakura')).toBe(true);
    // Already complete: nothing to buy, whatever the wallet.
    expect(themeRemainder(all, 'sakura')).toBe(0);
    expect(canBuyTheme(1e9, all, 'sakura')).toBe(false);
    // Another theme's parts do not count towards this one.
    expect(themeRemainder(['ocean_paddle'], 'sakura')).toBe(sakura.price);
  });

  it('parts go on buying and wearing as ordinary skins', () => {
    const id = themePartId('forest', 'ball');
    const price = themeFacts('forest').ball.price;
    expect(canBuySkin(price - 1, [], id)).toBe(false);
    expect(canBuySkin(price, [], id)).toBe(true);
    expect(canBuySkin(1e9, [id], id)).toBe(false);
    expect(canBuySkin(1e9, [], 'nope')).toBe(false);
    expect(canEquipSkin([id], id, 'ball')).toBe(true);
    expect(canEquipSkin([id], id, 'paddle')).toBe(false);
    expect(canEquipSkin([], id, 'ball')).toBe(false);
    expect(canEquipSkin([], null, 'bg')).toBe(true);
  });
});

describe('theme storage', () => {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  });

  const owned = (): SaveData => {
    const save = loadSave();
    save.economy.skins = ['sakura_paddle', 'sakura_ball', 'sakura_bg', 'ocean_bg', 'startrail'];
    return save;
  };

  it('round-trips a theme worn as a set, and a mix across themes', () => {
    const save = owned();
    save.economy.skinPaddle = 'sakura_paddle';
    save.economy.skinBall = 'sakura_ball';
    save.economy.skinBg = 'sakura_bg';
    storeSave(save);
    const again = loadSave();
    expect(again.economy.skins).toEqual(save.economy.skins);
    expect(again.economy.skinPaddle).toBe('sakura_paddle');
    expect(again.economy.skinBall).toBe('sakura_ball');
    expect(again.economy.skinBg).toBe('sakura_bg');
    // A paddle from one theme and a scene from another is a good outfit too.
    save.economy.skins.push('ocean_paddle');
    save.economy.skinPaddle = 'ocean_paddle';
    save.economy.skinBg = 'ocean_bg';
    storeSave(save);
    const mixed = loadSave();
    expect(mixed.economy.skinPaddle).toBe('ocean_paddle');
    expect(mixed.economy.skinBall).toBe('sakura_ball');
    expect(mixed.economy.skinBg).toBe('ocean_bg');
  });

  it('drops a theme part that was never bought, and one riding the wrong slot', () => {
    const save = owned();
    save.economy.skins = ['sakura_ball'];
    save.economy.skinPaddle = 'sakura_paddle'; // real id, not owned
    save.economy.skinBall = 'sakura_ball';
    save.economy.skinBg = 'sakura_ball'; // owned, but a ball
    storeSave(save);
    const again = loadSave();
    expect(again.economy.skins).toEqual(['sakura_ball']);
    expect(again.economy.skinPaddle).toBeNull();
    expect(again.economy.skinBg).toBeNull();
    expect(again.economy.skinBall).toBe('sakura_ball');
  });

  it('the wallet mirror parses a theme the same way (it shares the save rules)', () => {
    const parsed = parseEconomyState({
      stardust: 10,
      skins: ['forest_bg', 'forest_nope', 4],
      skinBg: 'forest_bg',
      skinBall: 'forest_bg',
    });
    expect(parsed!.skins).toEqual(['forest_bg']);
    expect(parsed!.skinBg).toBe('forest_bg');
    expect(parsed!.skinBall).toBeNull();
  });
});

describe('ThemeLayer: a theme changes what is drawn, nothing else', () => {
  it('a world played with every part of a theme worn ends up bit-identical to a bare one', () => {
    for (const id of THEME_IDS) {
      const bare = makeWorld(7, 4);
      const dressed = makeWorld(7, 4);
      const layer = new ThemeLayer('high');
      layer.wear(allOf(id));
      layer.attach(dressed);
      let landings = 0;
      dressed.events.on('paddle', () => void landings++);
      let peak = 0;
      for (let frame = 0; frame < 60 * 45; frame++) {
        bare.update(DT);
        dressed.update(DT);
        layer.update(DT, dressed);
        peak = Math.max(peak, layer.particles);
      }
      // The guard only means something if the run actually exercised the theme.
      expect(landings, id).toBeGreaterThan(5);
      expect(peak, id).toBeGreaterThan(0);
      expect(snapshot(dressed), id).toBe(snapshot(bare));
      expect(layer.particles, id).toBeLessThanOrEqual(themeParticleCapacity('high'));
    }
  });

  it('a landing belongs to the paddle theme, a bounce to the ball theme', () => {
    const world = flyingWorld();
    const bare = new ThemeLayer('high');
    bare.wear({ paddle: THEMES.get('ocean')!, ball: null, bg: null });
    bare.attach(world);
    // No ball theme: a wall is just a wall.
    world.events.emit('bounce', { x: 100, y: 100, nx: 1, ny: 0 });
    expect(bare.particles).toBe(0);
    // Ocean's hit: one ring, two rings offset, seven bubbles.
    world.events.emit('paddle', { x: 360, off: 0, perfect: false });
    expect(bare.particles).toBe(10);
    expect(bare.liveKinds()).toEqual([PK_BUBBLE, PK_RING].sort());
    expect(bare.openness).toBeCloseTo(1);
    bare.update(DT, world);
    expect(bare.openness).toBeLessThan(1);
    expect(bare.openness).toBeGreaterThan(0.8);

    const flying = new ThemeLayer('high');
    flying.wear({ paddle: null, ball: THEMES.get('sakura')!, bg: null });
    flying.attach(world);
    // Sakura's bounce: one ring and two petals.
    world.events.emit('bounce', { x: 100, y: 100, nx: 1, ny: 0 });
    expect(flying.particles).toBe(3);
    expect(flying.liveKinds()).toEqual([PK_PETAL, PK_RING].sort());
    // No paddle theme: a landing throws nothing (the paddle still notes the hit).
    world.events.emit('paddle', { x: 360, off: 0, perfect: false });
    expect(flying.particles).toBe(3);
    expect(flying.openness).toBeCloseTo(1);
  });

  it('the hit clock eases back down instead of snapping', () => {
    const world = flyingWorld();
    const layer = new ThemeLayer('high');
    layer.wear(allOf('forest'));
    layer.attach(world);
    expect(layer.openness).toBe(0);
    world.events.emit('paddle', { x: 360, off: 0, perfect: false });
    expect(layer.openness).toBeCloseTo(1);
    for (let i = 0; i < 30; i++) layer.update(DT, world);
    expect(layer.openness).toBeLessThan(0.1);
    expect(layer.openness).toBeGreaterThan(0);
  });

  it('a moving ball leaves the ball theme\u2019s trail every stride, and a twin leaves none', () => {
    const world = flyingWorld();
    const layer = new ThemeLayer('high');
    layer.wear({ paddle: null, ball: THEMES.get('ocean')!, bg: null });
    layer.attach(world);
    const ball = world.balls[0]!;
    const stride = OCEAN_ART.effects.ballTrail.stride;
    ball.vx = 0;
    ball.vy = 0;
    for (let i = 0; i < 10; i++) {
      ball.x += stride;
      layer.update(DT, world);
    }
    // The first frame only opens the ball\u2019s trail; each of the next nine covers one stride.
    expect(layer.particles).toBe(9);
    expect(layer.liveKinds()).toEqual([PK_BUBBLE]);
    // Parked on the paddle, it leaves nothing.
    layer.clear();
    ball.docked = true;
    for (let i = 0; i < 10; i++) layer.update(DT, world);
    expect(layer.particles).toBe(0);
    ball.docked = false;

    addBall(world, true);
    const twin = world.balls[1]!;
    for (let i = 0; i < 10; i++) {
      ball.x += stride;
      twin.x += stride;
      layer.update(DT, world);
    }
    expect(layer.particles).toBe(9);
  });

  it('a swarm never floods the pool: bounces are rationed per frame and recipes thin out', () => {
    const world = flyingWorld();
    const layer = new ThemeLayer('low');
    layer.wear(allOf('sakura'));
    layer.attach(world);
    // Fifty balls rattling in a corner in one frame is one splash, not fifty.
    for (let i = 0; i < 50; i++) world.events.emit('bounce', { x: 10, y: 10 + i, nx: 1, ny: 0 });
    expect(layer.particles).toBe(6 * 3);
    expect(layer.particles).toBeLessThanOrEqual(themeParticleCapacity('low'));
    // The next frame has its own ration.
    layer.update(DT, world);
    world.events.emit('bounce', { x: 10, y: 10, nx: 1, ny: 0 });
    expect(layer.particles).toBeGreaterThan(6 * 3);
  });

  it('follows a quality step: a smaller pool and a thinner drifting layer', () => {
    expect(themeParticleCapacity('low')).toBeLessThan(themeParticleCapacity('medium'));
    expect(themeParticleCapacity('medium')).toBeLessThan(themeParticleCapacity('high'));
    const layer = new ThemeLayer('low');
    layer.wear({ paddle: null, ball: null, bg: THEMES.get('forest')! });
    layer.begin(stage());
    const total = (step: number): number =>
      FOREST_ART.effects.ambient.reduce((sum, spec) => sum + spec.count[step]!, 0);
    expect(layer.ambientCount).toBe(total(0));
    layer.setQuality('high');
    expect(layer.ambientCount).toBe(total(2));
    layer.setQuality('high'); // a no-op
    expect(layer.ambientCount).toBe(total(2));
    layer.setQuality('medium');
    expect(layer.ambientCount).toBe(total(1));
  });

  it('wearing is read slot by slot, and a changed background rebuilds only its drifting layer', () => {
    const layer = new ThemeLayer('high');
    expect(layer.active).toBe(false);
    layer.wear({ paddle: THEMES.get('ocean')!, ball: THEMES.get('sakura')!, bg: null });
    expect(layer.active).toBe(true);
    expect(layer.slots().paddle?.id).toBe('ocean');
    expect(layer.slots().ball?.id).toBe('sakura');
    expect(layer.slots().bg).toBeNull();
    expect(layer.ambientCount).toBe(0);
    layer.begin(stage());
    expect(layer.fieldCount).toBe(0);
    layer.wear({ paddle: THEMES.get('ocean')!, ball: THEMES.get('sakura')!, bg: THEMES.get('forest')! });
    expect(layer.slots().bg?.id).toBe('forest');
    expect(layer.fieldCount).toBe(FOREST_ART.effects.ambient.length);
    expect(layer.ambientCount).toBeGreaterThan(0);
    // Re-dressing with the same scene keeps the fields (and what is already adrift).
    layer.wear({ paddle: null, ball: null, bg: THEMES.get('forest')! });
    expect(layer.slots().bg?.id).toBe('forest');
    expect(layer.fieldCount).toBe(FOREST_ART.effects.ambient.length);
    layer.wear({ paddle: null, ball: null, bg: THEMES.get('ocean')! });
    expect(layer.slots().bg?.id).toBe('ocean');
    expect(layer.fieldCount).toBe(OCEAN_ART.effects.ambient.length);
    layer.wear({ paddle: null, ball: null, bg: null });
    expect(layer.active).toBe(false);
    expect(layer.fieldCount).toBe(0);
    expect(layer.ambientCount).toBe(0);
  });

  it('clear forgets everything in flight, and detach stops the watching', () => {
    const world = flyingWorld();
    const layer = new ThemeLayer('high');
    layer.wear(allOf('forest'));
    const detach = layer.attach(world);
    world.events.emit('paddle', { x: 360, off: 0, perfect: false });
    expect(layer.particles).toBeGreaterThan(0);
    layer.clear();
    expect(layer.particles).toBe(0);
    expect(layer.openness).toBe(0);
    detach();
    world.events.emit('paddle', { x: 360, off: 0, perfect: false });
    expect(layer.particles).toBe(0);
    expect(layer.openness).toBe(0);
  });
});

describe('ThemeLayer through drawScene', () => {
  const info = (): SceneInfo => ({ danger: 0, energy: 0 });

  function frame(world: World, theme: ThemeOverlay | null): Pen {
    const pen = makePen();
    const fx = new Fx(1000, { shake: true, flashes: true, quality: 'high' });
    drawScene(pen, world, fx, CHAPTER, 12.5, info(), null, null, theme);
    return pen;
  }

  it('with nothing worn, no theme shape is drawn', () => {
    const world = flyingWorld();
    const pen = frame(world, null);
    // Neither sprite layer has a single instance: with the stock look on, the renderer never
    // even compiles the sprite program.
    expect(pen.spritesFront.count).toBe(0);
    expect(pen.spritesBack.count).toBe(0);
    // …and the paddle is the stock surface, on its collision box.
    const body = layerOf(pen, 'stock').find(
      (s) => s.shape === SHAPE_BOX && s.x === world.paddle.x && s.y === world.paddle.y,
    );
    expect(body).toBeDefined();
    expect(body!.hw).toBeCloseTo(world.paddle.halfW);
    expect(body!.hh).toBeCloseTo(PADDLE_H / 2);
  });

  it('the scene asks three things of a theme, in draw order, and only about ordinary balls', () => {
    const world = flyingWorld();
    addBall(world, true);
    const spy = spyOverlay();
    frame(world, spy);
    expect(spy.calls[0]).toBe('under');
    expect(spy.calls[1]).toBe('paddle');
    expect(spy.calls.slice(2)).toEqual([`ball:${world.balls[0]!.id}`]);
    // No world on screen: nothing is asked at all.
    const idle = spyOverlay();
    drawScene(
      makePen(),
      null,
      new Fx(100, { shake: true, flashes: true, quality: 'low' }),
      CHAPTER,
      0,
      info(),
      null,
      null,
      idle,
    );
    expect(idle.calls).toEqual([]);
  });

  it('each theme draws its own paddle around the collision box, and its own ball', () => {
    // What must appear, and everything that may: three looks share no silhouette.
    const looks: Record<string, { must: number[]; allowed: number[] }> = {
      sakura: {
        must: [SHAPE_FAN, SHAPE_BLOSSOM, SHAPE_PETAL],
        allowed: [SHAPE_FAN, SHAPE_BLOSSOM, SHAPE_PETAL, SHAPE_ARC],
      },
      ocean: {
        must: [SHAPE_CURL, SHAPE_CRYSTAL, SHAPE_ARC],
        allowed: [SHAPE_CURL, SHAPE_CRYSTAL, SHAPE_ARC],
      },
      forest: {
        must: [SHAPE_BRANCH, SHAPE_CRYSTAL, SHAPE_LEAF],
        allowed: [SHAPE_BRANCH, SHAPE_CRYSTAL, SHAPE_LEAF],
      },
    };
    for (const id of THEME_IDS) {
      const world = flyingWorld();
      const layer = new ThemeLayer('high');
      layer.wear(allOf(id));
      layer.update(DT, world);
      const drawn = painted(frame(world, layer));
      const theme = drawn.filter((d) => d.layer !== 'stock');
      for (const shape of looks[id]!.must) {
        expect(theme.filter((s) => s.shape === shape).length, `${id} shape ${shape}`).toBeGreaterThan(0);
      }
      const mine = new Set(looks[id]!.allowed);
      expect(
        theme.filter((s) => !mine.has(s.shape)).map((s) => s.shape),
        id,
      ).toEqual([]);
      // The themed body sits centred on the collision box and spans its whole width.
      const p = world.paddle;
      const body = drawn.find(
        (s) => Math.abs(s.x - p.x) < 1e-6 && Math.abs(s.y - p.y) < 1e-6 && s.hw >= p.halfW - 1e-6,
      );
      expect(body, `${id} body`).toBeDefined();
    }
  });

  it('worn alone, a theme\u2019s paddle leaves the ball and the background stock', () => {
    const world = flyingWorld();
    const layer = new ThemeLayer('high');
    layer.wear({ paddle: THEMES.get('sakura')!, ball: null, bg: null });
    const drawn = spritesOf(frame(world, layer));
    expect(drawn.filter((s) => s.shape === SHAPE_FAN).length).toBe(2);
    expect(drawn.filter((s) => s.shape === SHAPE_PETAL)).toEqual([]);
  });

  it('a theme\u2019s drifting layer and particles go down beneath the bricks, its paddle above them', () => {
    const world = flyingWorld();
    const layer = new ThemeLayer('high');
    layer.wear(allOf('forest'));
    layer.begin(stage());
    layer.attach(world);
    world.events.emit('paddle', { x: 360, off: 0, perfect: false });
    const pen = frame(world, layer);
    // The alpha-blended pass is drawn in the order of `painted`: what the theme puts beneath the
    // surfaces lands in the batch the renderer draws first, so a brick always covers it.
    const under = layerOf(pen, 'under');
    const front = layerOf(pen, 'front');
    // The drifting layer's leaves and the leaves the landing scattered…
    expect(under.filter((s) => s.shape === SHAPE_LEAF).length).toBeGreaterThanOrEqual(14);
    expect(under.some((s) => s.shape === SHAPE_BRANCH)).toBe(false);
    // …and the bough itself, in front.
    expect(front.some((s) => s.shape === SHAPE_BRANCH)).toBe(true);
    // The bricks are stock surfaces, drawn between the two.
    expect(layerOf(pen, 'stock').some((s) => s.shape === SHAPE_BOX && s.hw < 30)).toBe(true);
    // The two layers really are the pen's two sprite batches, nothing mixed into the surfaces.
    expect(pen.spritesBack.count).toBe(under.length);
    expect(pen.spritesFront.count).toBe(front.length);
  });

  it('a landing scatters the bough\u2019s leaves, and they grow back', () => {
    const world = flyingWorld();
    const layer = new ThemeLayer('high');
    layer.wear({ paddle: THEMES.get('forest')!, ball: null, bg: null });
    layer.attach(world);
    const onTheBough = (pen: Pen): number =>
      layerOf(pen, 'front').filter((s) => s.shape === SHAPE_LEAF && Math.abs(s.y - world.paddle.y) < 40)
        .length;
    expect(onTheBough(frame(world, layer))).toBe(6);
    expect(layer.particles).toBe(0);
    world.events.emit('paddle', { x: 360, off: 0, perfect: false });
    // Off the bough, into the air: eight leaves, a ring, five fireflies.
    expect(onTheBough(frame(world, layer))).toBe(0);
    expect(layer.particles).toBe(14);
    for (let i = 0; i < 60; i++) layer.update(DT, world);
    expect(onTheBough(frame(world, layer))).toBe(6);
  });
});

describe('the drifting layer', () => {
  const STAGE = stage();

  it('is never fuller than its capacity, however many are asked for', () => {
    const field = new AmbientField(SAKURA_ART.effects.ambient[0]!, 30, new RNG(1));
    field.resize(800, 600);
    expect(field.count).toBe(0);
    field.setCount(50);
    expect(field.count).toBe(30);
    field.setCount(12);
    expect(field.count).toBe(12);
    field.setCount(-4);
    expect(field.count).toBe(0);
  });

  it('keeps everything inside the window, give or take the margin, for as long as it runs', () => {
    const specs = [
      ...SAKURA_ART.effects.ambient,
      ...OCEAN_ART.effects.ambient,
      ...FOREST_ART.effects.ambient,
    ];
    for (const spec of specs) {
      const field = new AmbientField(spec, 40, new RNG(3));
      field.resize(800, 600);
      field.setCount(40);
      for (let i = 0; i < 60 * 60; i++) field.update(DT, i * DT);
      const pen = spyPen();
      field.draw(pen, { ...STAGE, width: 800, height: 600 }, 60);
      const places: [number, number][] = [
        ...pen.sprite.mock.calls.map((c: unknown[]) => [c[1], c[2]] as [number, number]),
        ...pen.haze.mock.calls.map((c: unknown[]) => [c[1], c[2]] as [number, number]),
      ];
      // A particle that was only just reborn is still faded out, so a few of the 40 sit a frame out.
      expect(places.length, spec.kind).toBeGreaterThan(30);
      for (const [x, y] of places) {
        expect(x, spec.kind).toBeGreaterThanOrEqual(-40);
        expect(x, spec.kind).toBeLessThanOrEqual(840);
        expect(y, spec.kind).toBeGreaterThanOrEqual(-40);
        expect(y, spec.kind).toBeLessThanOrEqual(640);
      }
    }
  });

  it('what drifts across the field is dimmed, most of all over the bricks', () => {
    const outside = plateDim(STAGE, 100, 100);
    const overBricks = plateDim(STAGE, 500, 160);
    const centre = plateDim(STAGE, 500, 400);
    const low = plateDim(STAGE, 500, 700);
    expect(outside).toBe(1);
    expect(overBricks).toBeCloseTo(0.2, 5);
    expect(overBricks).toBeLessThan(centre);
    expect(centre).toBeLessThan(low);
    expect(low).toBeLessThan(1);
    // The plate is feathered: a point on the arena's edge keeps half of the full dimming.
    const edge = plateDim(STAGE, 260, 400);
    expect(edge).toBeGreaterThan(overBricks);
    expect(edge).toBeLessThan(1);
    // …and one just outside it, past the feather, is not dimmed at all.
    expect(plateDim(STAGE, 230, 400)).toBe(1);
  });

  it('each kind draws with its own shape', () => {
    const cases: [AmbientKind, number | null][] = [
      ['petal', SHAPE_PETAL],
      ['bubble', SHAPE_BUBBLE],
      ['leaf', SHAPE_LEAF],
      ['fish', SHAPE_FISH],
      ['firefly', null],
      ['mote', null],
    ];
    const spec = SAKURA_ART.effects.ambient[0]!;
    for (const [kind, shape] of cases) {
      const field = new AmbientField({ ...spec, kind }, 6, new RNG(5));
      field.resize(400, 300);
      field.setCount(6);
      const pen = spyPen();
      field.draw(pen, { ...STAGE, width: 400, height: 300 }, 0);
      if (shape === null) {
        // A point of light: only a haze, never a sprite.
        expect(pen.haze.mock.calls.length, kind).toBeGreaterThan(0);
        expect(pen.sprite.mock.calls.length, kind).toBe(0);
      } else {
        expect(new Set(pen.sprite.mock.calls.map((c: unknown[]) => c[0])), kind).toEqual(new Set([shape]));
        expect(pen.haze.mock.calls.length, kind).toBe(0);
      }
    }
  });
});

describe('recipes', () => {
  const pool = new ParticleSystem(10000);
  const base: Burst = {
    kind: PK_PETAL,
    count: 1,
    color: 0xff91c8,
    speed: [10, 20],
    life: [0.5, 0.5],
    size: [4, 2],
  };

  it('a ring grows to its reach; a petal shrinks to its end size', () => {
    pool.clear();
    emitBurst(pool, { ...base, kind: PK_RING, size: [4, 4], reach: 120 }, 0, 0, 0, -1);
    const ring = pool.pool.find((p) => p.alive)!;
    expect([ring.size, ring.sizeEnd, ring.kind]).toEqual([4, 120, PK_RING]);
    pool.clear();
    emitBurst(pool, base, 0, 0, 0, -1);
    const petal = pool.pool.find((p) => p.alive)!;
    // Born somewhere inside its size range, and shrinking to the range's end.
    expect(petal.size).toBeGreaterThanOrEqual(2);
    expect(petal.size).toBeLessThanOrEqual(4);
    expect(petal.sizeEnd).toBe(2);
  });

  it('a thinned single-particle recipe fires that often', () => {
    pool.clear();
    for (let i = 0; i < 4000; i++) emitBurst(pool, base, 0, 0, 0, -1, 0.5);
    const alive = pool.pool.filter((p) => p.alive).length;
    expect(alive).toBeGreaterThan(1700);
    expect(alive).toBeLessThan(2300);
  });

  it('a splash is thrown back along the normal, inside its cone', () => {
    pool.clear();
    emitBurst(pool, { ...base, count: 200, spread: 0.3, speed: [100, 100] }, 0, 0, 0, -1); // the floor of something: straight up
    expect(pool.alive).toBe(200);
    for (const p of pool.pool) {
      if (!p.alive) continue;
      // Measured from straight up, either way.
      expect(Math.abs(Math.atan2(p.vx, -p.vy))).toBeLessThanOrEqual(0.3);
      expect(p.vy).toBeLessThan(0);
    }
  });

  it('never spawns more than asked, and reports what it managed', () => {
    // A full pool recycles its oldest particle rather than refusing: a burst never leaves more
    // than a pool's worth behind, and says so.
    const tiny = new ParticleSystem(5);
    expect(emitBurst(tiny, { ...base, count: 50 }, 0, 0, 0, -1)).toBe(5);
    expect(emitBurst(tiny, { ...base, count: 50 }, 0, 0, 0, -1)).toBe(5);
    expect(tiny.alive).toBe(5);
    expect(emitBurst(tiny, { ...base, count: 3 }, 0, 0, 0, -1)).toBe(3);
    expect(emitBurst(tiny, base, 0, 0, 0, -1, 0)).toBe(0);
    expect(emitBurst(tiny, { ...base, count: 0 }, 0, 0, 0, -1)).toBe(0);
    expect(emitBurst(tiny, { ...base, count: 3 }, 0, 0, 0, -1, 2)).toBe(3);
  });

  it('every theme\u2019s recipes only name kinds and colours the renderer can draw', () => {
    const drawable = new Set([PK_PETAL, PK_BUBBLE, PK_LEAF, 7, PK_RING, PK_FIRE]);
    for (const theme of THEME_CONFIGS) {
      const e = theme.effects;
      for (const burst of [e.paddleTrail, e.ballTrail, ...e.paddleHit, ...e.bounce]) {
        expect(drawable.has(burst.kind), `${theme.id} kind ${burst.kind}`).toBe(true);
        expect(LEGAL_HEX(burst.color), theme.id).toBe(true);
      }
      for (const spec of e.ambient) for (const hex of spec.colors) expect(LEGAL_HEX(hex)).toBe(true);
    }
  });
});

describe('a fourth theme', () => {
  const scene = { helpers: '', body: 'col = vec3(1.0, 0.5, 0.2) * (0.5 + 0.5 * a.y);' };
  const emberDrawn: string[] = [];
  const emberPaddle: PaddlePainter = () => void emberDrawn.push('paddle');
  const emberBall: BallPainter = () => void emberDrawn.push('ball');
  const FOURTH: ThemeConfig = {
    id: 'ember',
    name: '余烬庭院',
    en: 'EMBER COURT',
    desc: '一套只由配置构成的主题。',
    price: 3000,
    colors: {
      primary: 0xff8a3d,
      secondary: 0xffd24a,
      highlight: 0xfff3d0,
      accent: 0xffa050,
      depths: [0x140602, 0x3a0f04, 0x7a2a08],
    },
    paddle: { price: 800, name: '余烬弹板', en: 'EMBER PADDLE', desc: '测试用。', paint: emberPaddle },
    ball: {
      price: 1000,
      name: '余烬核心',
      en: 'EMBER CORE',
      desc: '测试用。',
      glow: { glow: 0xffa050, trail: 0xffd24a, core: 0xfff3d0 },
      halo: [1, 1],
      paint: emberBall,
    },
    bg: {
      price: 1400,
      name: '余烬庭院',
      en: 'EMBER GARDEN',
      desc: '测试用。',
      frag: themeFragment(scene),
    },
    effects: {
      ambient: [
        {
          kind: 'mote',
          count: [1, 2, 3],
          colors: [0xffd24a],
          drift: [2, 4],
          wind: [0, 0],
          sway: 4,
          size: [1, 2],
          spin: [0, 0],
        },
      ],
      paddleTrail: {
        kind: PK_FIRE,
        count: 1,
        color: 0xffd24a,
        speed: [1, 2],
        life: [0.3, 0.3],
        size: [2, 1],
      },
      ballTrail: {
        kind: PK_FIRE,
        count: 1,
        color: 0xffa050,
        speed: [1, 2],
        life: [0.3, 0.3],
        size: [2, 1],
        stride: 30,
      },
      paddleHit: [
        {
          kind: PK_RING,
          count: 1,
          color: 0xffd24a,
          speed: [0, 0],
          life: [0.2, 0.2],
          size: [4, 4],
          reach: 40,
        },
      ],
      bounce: [],
    },
  };

  it('is registered by adding it to the list: the registry, the layer and the scene need no change', () => {
    const registry = new ThemeRegistry([...THEME_CONFIGS, FOURTH]);
    expect(registry.all).toHaveLength(THEME_CONFIGS.length + 1);
    expect(registry.get('ember')).toBe(FOURTH);
    expect(registry.get('sakura')).toBe(THEMES.get('sakura'));
    expect(registry.get('nope')).toBeNull();
    expect(() => new ThemeRegistry([FOURTH, FOURTH])).toThrow(/ember/);

    const layer = new ThemeLayer('high');
    layer.wear({ paddle: FOURTH, ball: FOURTH, bg: FOURTH });
    layer.begin({ width: 800, height: 600, scale: 1, ox: 0, oy: 0, ax: 160, ay: 30, aw: 480, ah: 640 });
    const world = flyingWorld();
    layer.attach(world);
    world.events.emit('paddle', { x: 360, off: 0, perfect: false });
    layer.update(DT, world);
    expect(layer.particles).toBe(1);
    expect(layer.ambientCount).toBe(3);
    const pen = makePen();
    drawScene(
      pen,
      world,
      new Fx(1000, { shake: true, flashes: true, quality: 'high' }),
      CHAPTER,
      3,
      { danger: 0, energy: 0 },
      null,
      null,
      layer,
    );
    expect(emberDrawn).toEqual(['paddle', 'ball']);
    // Its drifting layer went down into the frame too: three motes, as hazes in the box batch.
    expect(pen.box.count).toBeGreaterThan(3);
    expect(pen.spritesFront.count).toBe(0);
    expect(pen.spritesBack.count).toBe(0);
  });
});

describe('theme copy', () => {
  const LOCALES = ['zh', 'en', 'ja', 'ko'] as const;
  const shop = (): Record<string, any> => (dict() as unknown as Record<string, any>).shop;

  it('every theme and every part has a name and a line of its own in all four locales', () => {
    for (const lang of LOCALES) {
      setLang(lang);
      for (const theme of THEME_FACTS) {
        const keys = [
          `shop.theme.${theme.id}.name`,
          `shop.theme.${theme.id}.desc`,
          'shop.theme.buySet',
          'shop.theme.complete',
          'shop.theme.wear',
          'shop.theme.worn',
          'shop.theme.part.paddle',
          'shop.theme.part.ball',
          'shop.theme.part.bg',
          'shop.skinGroup.themes',
          ...KINDS.flatMap((kind) => [
            `shop.skin.${themePartId(theme.id, kind)}.name`,
            `shop.skin.${themePartId(theme.id, kind)}.desc`,
          ]),
        ];
        for (const key of keys) {
          expect(t(key), `${lang} ${key}`).not.toBe(key);
          expect(t(key).trim(), `${lang} ${key}`).not.toBe('');
        }
        // The Chinese dictionary and the theme's own canonical text agree: one sentence, everywhere.
        if (lang === 'zh') {
          for (const [kind, part] of [
            ['paddle', theme.paddle],
            ['ball', theme.ball],
            ['bg', theme.bg],
          ] as const) {
            expect(t(`shop.skin.${themePartId(theme.id, kind)}.name`), `${theme.id} ${kind}`).toBe(part.name);
            expect(t(`shop.skin.${themePartId(theme.id, kind)}.desc`), `${theme.id} ${kind}`).toBe(part.desc);
          }
          expect(t(`shop.theme.${theme.id}.name`)).toBe(theme.name);
          expect(t(`shop.theme.${theme.id}.desc`)).toBe(theme.desc);
        }
      }
    }
  });

  it('stays inside the platform\u2019s review vocabulary, money wording included', () => {
    // The release scanner's list, plus the commerce and real-money words the shop keeps out of
    // its copy. Nothing a theme says needs any of them.
    const BANNED =
      /死|杀|血|毒|疫|瘟|处决|邪魔|0MB|极致|最强|顶级|第一|唯一|绝对|免安装|抽卡|计费|入账|钱包|充值|付费|收费|到账|提现|内购|购买|礼包|抽奖|开箱|转盘|钻石|赌博|色情|约炮/;
    const BANNED_LATIN =
      /\b(KILLER|WEAPON|DEATH|BOMB|GAMBLE|GAMBLING|CASINO|PORN|LOOT|GACHA|REVIVE|LETHAL|PURCHASE|PAID)\b/i;
    const walk = (value: unknown, path: string): void => {
      if (typeof value === 'string') {
        expect(BANNED.test(value), `${path}: ${value}`).toBe(false);
        expect(BANNED_LATIN.test(value), `${path}: ${value}`).toBe(false);
      } else if (Array.isArray(value)) value.forEach((entry, i) => walk(entry, `${path}[${i}]`));
      else if (value && typeof value === 'object')
        for (const [k, v] of Object.entries(value)) walk(v, `${path}.${k}`);
    };
    for (const lang of LOCALES) {
      setLang(lang);
      walk(shop().theme, `${lang}.shop.theme`);
      walk(shop().skinGroup, `${lang}.shop.skinGroup`);
      for (const theme of THEME_FACTS) {
        for (const kind of KINDS)
          walk(shop().skin[themePartId(theme.id, kind)], `${lang}.skin.${theme.id}.${kind}`);
      }
    }
    setLang('zh');
    for (const theme of THEME_FACTS) {
      walk(
        {
          name: theme.name,
          en: theme.en,
          desc: theme.desc,
          parts: [theme.paddle, theme.ball, theme.bg].map((part) => [part.name, part.en, part.desc]),
        },
        `data.${theme.id}`,
      );
    }
  });
});

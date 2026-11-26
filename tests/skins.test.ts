import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSave, loadSave, storeSave } from '../src/core/storage';
import { isSupplyId, PROTOCOL_MAP } from '../src/game/economy/catalog';
import { CHAPTERS } from '../src/game/levels/definitions';
import {
  applyBgSkin,
  canBuySkin,
  canEquipSkin,
  defaultBallSkin,
  defaultPaddleSkin,
  isPaddleSkinId,
  isSkinId,
  SKINS,
  SKIN_MAP,
  type BgSkinDef,
} from '../src/render/skins';

/**
 * The cosmetic shelf: catalog invariants, the deterministic backdrop transform, storage
 * round-trips and repairs, and the pure buy/equip verdicts the app actions delegate to. The
 * copy itself is guarded by `economy-copy.test.ts`, locale parity by `i18n.test.ts`.
 */

const KEY = 'shatterverse.save.v1';
const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, value),
  removeItem: (key: string) => void store.delete(key),
});

beforeEach(() => store.clear());

describe('skin catalog', () => {
  it('ids are unique and never collide with protocols or supplies', () => {
    const ids = SKINS.map((skin) => skin.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(PROTOCOL_MAP[id], id).toBeUndefined();
      // A supply id would ride the loadout slots; a skin must never pass as one.
      expect(isSupplyId(id), id).toBe(false);
    }
  });

  it('prices ascend within each kind', () => {
    for (const kind of ['ball', 'paddle', 'bg'] as const) {
      let previous = 0;
      for (const skin of SKINS.filter((def) => def.kind === kind)) {
        expect(skin.price).toBeGreaterThan(previous);
        previous = skin.price;
      }
    }
  });

  it('the stock look is free, always there, and not a catalog entry', () => {
    expect(defaultBallSkin).toBe('classic');
    expect(defaultPaddleSkin).toBe(defaultBallSkin);
    expect(isSkinId(defaultBallSkin)).toBe(false);
    expect(SKINS.some((skin) => skin.id === defaultBallSkin)).toBe(false);
  });

  it('ball colours are legal 0xRRGGBB values', () => {
    const legal = (c: number): boolean => Number.isInteger(c) && c >= 0 && c <= 0xffffff;
    for (const skin of SKINS) {
      expect(skin.price).toBeGreaterThan(0);
      if (skin.kind !== 'ball') continue;
      expect(legal(skin.colors.core), `${skin.id} core`).toBe(true);
      expect(legal(skin.colors.glow), `${skin.id} glow`).toBe(true);
      expect(legal(skin.colors.trail), `${skin.id} trail`).toBe(true);
    }
  });

  it('paddle colours are legal 0xRRGGBB values, and every paddle id guards as one', () => {
    const legal = (c: number): boolean => Number.isInteger(c) && c >= 0 && c <= 0xffffff;
    const paddles = SKINS.filter((skin) => skin.kind === 'paddle');
    expect(paddles).toHaveLength(3);
    for (const skin of paddles) {
      expect(legal(skin.colors.body), `${skin.id} body`).toBe(true);
      expect(legal(skin.colors.glow), `${skin.id} glow`).toBe(true);
      expect(isPaddleSkinId(skin.id), skin.id).toBe(true);
      // A paddle id cannot ride the ball or backdrop slot.
      expect(SKIN_MAP[skin.id].kind).toBe('paddle');
    }
    expect(isPaddleSkinId('startrail')).toBe(false);
    expect(isPaddleSkinId('neon')).toBe(false);
    expect(isPaddleSkinId('classic')).toBe(false);
  });

  it('the backdrop theme carries a fixed transform', () => {
    const themes = SKINS.filter((skin) => skin.kind === 'bg');
    expect(themes).toHaveLength(1);
    const neon = themes[0]!;
    expect(neon.transform.hue).not.toBe(0);
    expect(neon.transform.sat).toBeGreaterThan(0);
    expect(neon.transform.lum).toBeGreaterThan(0);
  });
});

describe('applyBgSkin', () => {
  const neon = SKIN_MAP.neon as BgSkinDef;

  it('is deterministic: the same palette, accent and skin always agree', () => {
    const a = applyBgSkin([0x123a6e, 0x7a1450, 0x050816], 0x27e0ff, neon);
    const b = applyBgSkin([0x123a6e, 0x7a1450, 0x050816], 0x27e0ff, neon);
    expect(a).toEqual(b);
  });

  it('keeps every output a legal 0xRRGGBB value, even at the extremes', () => {
    for (const hex of [0x000000, 0xffffff, 0xff0000, 0x00ff00, 0x0000ff, 0x123456, 0xfedcba]) {
      const out = applyBgSkin([hex, hex, hex], hex, neon);
      for (const c of [...out.bg, out.accent]) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(0xffffff);
        expect(Number.isInteger(c)).toBe(true);
      }
    }
  });

  it('shifts a saturated accent clearly away from its original value', () => {
    for (const chapter of CHAPTERS) {
      const out = applyBgSkin(chapter.bg, chapter.accent, neon);
      expect(out.accent).not.toBe(chapter.accent);
    }
  });

  it('keeps the deep base dark: the near-black third colour barely moves', () => {
    const base = (hex: number): number => hex & 0xff;
    for (const chapter of CHAPTERS) {
      const out = applyBgSkin(chapter.bg, chapter.accent, neon);
      // The transform must not blow out the sky floor, or the arena loses its depth.
      expect(base(out.bg[2])).toBeLessThanOrEqual(base(chapter.bg[2]) + 40);
    }
  });
});

describe('skin storage', () => {
  it('a fresh save owns nothing and wears nothing', () => {
    const save = defaultSave();
    expect(save.economy.skins).toEqual([]);
    expect(save.economy.skinBall).toBeNull();
    expect(save.economy.skinPaddle).toBeNull();
    expect(save.economy.skinBg).toBeNull();
  });

  it('round-trips owned skins and equips', () => {
    const save = defaultSave();
    save.economy.skins = ['startrail', 'frostline', 'neon'];
    save.economy.skinBall = 'startrail';
    save.economy.skinPaddle = 'frostline';
    save.economy.skinBg = 'neon';
    storeSave(save);
    const again = loadSave();
    expect(again.economy.skins).toEqual(['startrail', 'frostline', 'neon']);
    expect(again.economy.skinBall).toBe('startrail');
    expect(again.economy.skinPaddle).toBe('frostline');
    expect(again.economy.skinBg).toBe('neon');
  });

  it('drops unknown skin ids and falls back to the stock look when the equip is unowned', () => {
    store.set(
      KEY,
      JSON.stringify({
        version: 2,
        settings: {},
        records: {},
        economy: {
          skins: ['startrail', 'bogus', 'molten'],
          skinBall: 'aurora', // a real id, but not owned
          skinPaddle: 'duskveil', // not owned either
          skinBg: 'neon', // not owned either
        },
      }),
    );
    const save = loadSave();
    expect(save.economy.skins).toEqual(['startrail', 'molten']);
    expect(save.economy.skinBall).toBeNull();
    expect(save.economy.skinPaddle).toBeNull();
    expect(save.economy.skinBg).toBeNull();
  });

  it('a skin id cannot ride a slot of another kind', () => {
    store.set(
      KEY,
      JSON.stringify({
        version: 2,
        settings: {},
        records: {},
        economy: {
          skins: ['neon', 'startrail', 'frostline'],
          skinBall: 'neon',
          skinBg: 'startrail',
          skinPaddle: 'aurora',
        },
      }),
    );
    const save = loadSave();
    expect(save.economy.skinBall).toBeNull();
    expect(save.economy.skinBg).toBeNull();
    expect(save.economy.skinPaddle).toBeNull();
  });
});

describe('buy/equip verdicts', () => {
  it('buySkin refuses unknown, owned and unaffordable', () => {
    expect(canBuySkin(800, [], 'startrail')).toBe(true);
    expect(canBuySkin(799, [], 'startrail')).toBe(false);
    expect(canBuySkin(5000, ['startrail'], 'startrail')).toBe(false);
    expect(canBuySkin(5000, [], 'nope')).toBe(false);
  });

  it('equipSkin always accepts null, and otherwise only an owned skin of its own kind', () => {
    expect(canEquipSkin([], null, 'ball')).toBe(true);
    expect(canEquipSkin([], null, 'bg')).toBe(true);
    expect(canEquipSkin([], null, 'paddle')).toBe(true);
    expect(canEquipSkin(['startrail'], 'startrail', 'ball')).toBe(true);
    expect(canEquipSkin([], 'startrail', 'ball')).toBe(false);
    expect(canEquipSkin(['neon'], 'neon', 'ball')).toBe(false);
    expect(canEquipSkin(['neon'], 'neon', 'bg')).toBe(true);
    expect(canEquipSkin(['startrail'], 'startrail', 'bg')).toBe(false);
    expect(canEquipSkin(['frostline'], 'frostline', 'paddle')).toBe(true);
    expect(canEquipSkin(['frostline'], 'frostline', 'ball')).toBe(false);
    expect(canEquipSkin(['startrail'], 'startrail', 'paddle')).toBe(false);
  });
});

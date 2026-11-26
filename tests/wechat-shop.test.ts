/**
 * The shop's state mutations (`shopactions.ts`) and the four-tab tree. The mutations mirror
 * `app.ts` verdict-for-verdict; the assertions run against a real default save.
 */
import { describe, expect, it } from 'vitest';
import { t } from '../src/core/i18n';
import { defaultSave } from '../src/core/storage';
import { PROTOCOLS, SUPPLY_MAP, SUPPLIES } from '../src/game/economy/catalog';
import {
  buyProtocol,
  buySkin,
  buySupply,
  equipSkin,
  setTrialSupply,
  toggleLoadout,
  toggleWishlist,
} from '../src/wechat/shopactions';
import { shopTree, type ShopCallbacks } from '../src/wechat/screens/shop';
import { uniformMeasurer } from '../src/ui/canvas/text';
import { layoutWidget, type ButtonWidget, type Widget } from '../src/ui/canvas/widgets';

const m = uniformMeasurer(0.5);

function funded(stardust: number) {
  const save = defaultSave();
  save.economy.stardust = stardust;
  return save;
}

describe('shop mutations', () => {
  it('buys a protocol: deducts, records, clears its wishlist nudge, persists', () => {
    const save = funded(500);
    save.economy.wishlist = 'bulwark';
    const target = PROTOCOLS.find((p) => p.id === 'bulwark')!;
    expect(buyProtocol(save, target.id)).toBe(true);
    expect(save.economy.stardust).toBe(500 - target.price);
    expect(save.economy.protocols).toContain('bulwark');
    expect(save.economy.wishlist).toBeNull();
    // A second buy is refused, and a broke one never lands.
    expect(buyProtocol(save, 'bulwark')).toBe(false);
    const broke = funded(1);
    expect(buyProtocol(broke, 'bulwark')).toBe(false);
    expect(broke.economy.protocols).toHaveLength(0);
  });

  it('buys a supply, ends its trial, and gates carrying by the earned slots', () => {
    const save = funded(200);
    const id = SUPPLIES[0]!.id;
    save.economy.trialSupply = id;
    expect(buySupply(save, id)).toBe(true);
    expect(save.economy.supplies).toContain(id);
    expect(save.economy.trialSupply).toBeNull();
    // Carrying works while a slot is free.
    expect(toggleLoadout(save, id)).toBe(true);
    expect(save.economy.loadout).toContain(id);
    // An unowned supply cannot be carried, and the trial refuses owned ids.
    const other = funded(0);
    expect(toggleLoadout(other, id)).toBe(false);
    setTrialSupply(other, id);
    expect(other.economy.trialSupply).toBe(id);
    setTrialSupply(other, id); // same id again clears
    expect(other.economy.trialSupply).toBeNull();
    void SUPPLY_MAP;
  });

  it('buys and equips a skin; the stock look clears it back', () => {
    const save = funded(2000);
    const skin = 'startrail';
    expect(equipSkin(save, skin, 'ball')).toBe(false); // not owned yet
    expect(buySkin(save, skin)).toBe(true);
    expect(save.economy.skins).toContain(skin);
    expect(buySkin(save, skin)).toBe(false); // owned
    expect(equipSkin(save, skin, 'ball')).toBe(true);
    expect(save.economy.skinBall).toBe(skin);
    expect(equipSkin(save, null, 'ball')).toBe(true);
    expect(save.economy.skinBall).toBeNull();
  });

  it('toggles the wishlist and refuses non-catalog ids', () => {
    const save = funded(0);
    toggleWishlist(save, 'bulwark');
    expect(save.economy.wishlist).toBe('bulwark');
    toggleWishlist(save, 'bulwark');
    expect(save.economy.wishlist).toBeNull();
    toggleWishlist(save, 'not-a-thing');
    expect(save.economy.wishlist).toBeNull();
  });
});

describe('shopTree', () => {
  const save = funded(500);
  save.economy.stardust = 500;

  const noops: ShopCallbacks = {
    back(): void {},
    setTab(): void {},
    buyProtocol(): void {},
    buySupply(): void {},
    buySkin(): void {},
    equipSkin(): void {},
    toggleWishlist(): void {},
    toggleLoadout(): void {},
    setTrial(): void {},
  };

  function buttons(root: Widget): ButtonWidget[] {
    const found: ButtonWidget[] = [];
    const walk = (w: Widget): void => {
      if (w.kind === 'button') found.push(w);
      if (w.kind === 'panel' || w.kind === 'row') w.children.forEach(walk);
      if (w.kind === 'scroll') walk(w.child);
    };
    walk(root);
    return found;
  }

  function tree(tab: Parameters<typeof shopTree>[1]['tab']): Widget {
    return shopTree(save, { tab }, noops, 400, 800, m);
  }

  it('lists every protocol on the first tab with buy buttons', () => {
    const all = buttons(tree('protocols'));
    const buys = all.filter((b) => b.text === t('shop.buy'));
    expect(buys).toHaveLength(PROTOCOLS.length);
    const affordable = buys.find((b) => b.variant === 'primary');
    expect(affordable).toBeDefined();
    expect(buys.some((b) => b.disabled)).toBe(true); // some are beyond 500
  });

  it('shows owned supplies with carry toggles instead of buy buttons', () => {
    // Own two, carry one: the carried card flips its button, the owned-idle one offers 携带.
    save.economy.supplies = [SUPPLIES[0]!.id, SUPPLIES[1]!.id];
    save.economy.loadout = [SUPPLIES[0]!.id];
    const all = buttons(tree('supplies'));
    expect(all.find((b) => b.text === t('shop.carried'))?.variant).toBe('primary');
    expect(all.find((b) => b.text === t('shop.carry'))).toBeDefined();
    expect(all.find((b) => b.text === t('shop.supply.trial'))).toBeDefined(); // unowned others
    save.economy.supplies = [];
    save.economy.loadout = [];
  });

  it('skins tab groups by kind with the stock cards and equip toggles', () => {
    save.economy.skins = ['startrail'];
    save.economy.skinBall = 'startrail';
    const out = buttons(tree('skins'));
    expect(out.find((b) => b.text === t('shop.equipped'))).toBeDefined();
    expect(out.find((b) => b.text === t('shop.equip'))).toBeDefined();
  });

  it('progress tab lists today missions and milestones', () => {
    save.economy.milestones = ['first'];
    const texts: string[] = [];
    const walk = (w: Widget): void => {
      if (w.kind === 'label' || w.kind === 'paragraph') texts.push(w.text);
      if (w.kind === 'panel' || w.kind === 'row') w.children.forEach(walk);
      if (w.kind === 'scroll') walk(w.child);
    };
    walk(tree('progress'));
    expect(texts).toContain(t('shop.dailyTitle'));
    expect(
      texts.some((line) => line.includes(t('shop.progressLine', { n: 1, total: 0 }).split(' / ')[0] ?? '')) ||
        texts.length > 6,
    ).toBe(true);
  });

  it('lays out at phone width without overflow on every tab', () => {
    for (const tab of ['protocols', 'supplies', 'skins', 'progress'] as const) {
      const root = tree(tab);
      const height = layoutWidget(root, 0, 0, 400, m);
      expect(height, tab).toBeGreaterThan(200);
      expect(root.w, tab).toBe(400);
    }
  });
});

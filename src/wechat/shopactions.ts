/**
 * The shop's state mutations, as pure functions over the save.
 *
 * Mirrors `app.ts`'s buy/equip/wish/trial actions verdict-for-verdict — the WeChat shell calls
 * these instead of reaching into `App` (which is DOM-bound). `pushWallet` is deliberately absent:
 * it mirrors the Toy wallet, which the WeChat package never runs. Each function persists through
 * `storeSave` and answers `true` when the save changed.
 */

import { storeSave, type SaveData } from '../core/storage';
import { PROTOCOL_MAP, SUPPLY_MAP, isSupplyId, slotLimit, supplyCost } from '../game/economy/catalog';
import { SKIN_MAP, canBuySkin, canEquipSkin, type SkinKind } from '../render/skins';

/** Buys an opening protocol. False when unknown, owned, or unaffordable. */
export function buyProtocol(save: SaveData, id: string): boolean {
  const def = PROTOCOL_MAP[id];
  const econ = save.economy;
  if (!def || econ.protocols.includes(id) || econ.stardust < def.price) return false;
  econ.stardust -= def.price;
  econ.protocols.push(id);
  if (econ.wishlist === id) econ.wishlist = null;
  storeSave(save);
  return true;
}

/** Buys a supply. False when unknown, owned, or unaffordable; owning it ends its trial. */
export function buySupply(save: SaveData, id: string): boolean {
  if (!isSupplyId(id)) return false;
  const def = SUPPLY_MAP[id];
  const econ = save.economy;
  if (econ.supplies.includes(id) || econ.stardust < def.price) return false;
  econ.stardust -= def.price;
  econ.supplies.push(id);
  if (econ.wishlist === id) econ.wishlist = null;
  // Owning it ends the trial: a taste of something you now have would be dead weight.
  if (econ.trialSupply === id) econ.trialSupply = null;
  storeSave(save);
  return true;
}

/** Spends 星尘 on a cosmetic skin. False when unknown, owned, or unaffordable. */
export function buySkin(save: SaveData, id: string): boolean {
  const econ = save.economy;
  if (!SKIN_MAP[id] || !canBuySkin(econ.stardust, econ.skins, id)) return false;
  econ.stardust -= SKIN_MAP[id]!.price;
  econ.skins.push(id);
  if (econ.wishlist === id) econ.wishlist = null;
  storeSave(save);
  return true;
}

/** Equips an owned skin of the kind; null clears back to the stock look. */
export function equipSkin(save: SaveData, id: string | null, kind: SkinKind): boolean {
  const econ = save.economy;
  if (!canEquipSkin(econ.skins, id, kind)) return false;
  if (kind === 'ball') econ.skinBall = id;
  else if (kind === 'paddle') econ.skinPaddle = id;
  else econ.skinBg = id;
  storeSave(save);
  return true;
}

/** Points the one-run free trial at an unowned supply; the same id again clears it. */
export function setTrialSupply(save: SaveData, id: string): void {
  const econ = save.economy;
  // A trial is a taste of something not owned yet: unknown or owned ids are refused.
  if (!isSupplyId(id) || econ.supplies.includes(id)) return;
  econ.trialSupply = econ.trialSupply === id ? null : id;
  storeSave(save);
}

/** Toggles a supply in the carried loadout. False when unowned or the earned slots are full. */
export function toggleLoadout(save: SaveData, id: string): boolean {
  if (!isSupplyId(id)) return false;
  const econ = save.economy;
  if (!econ.supplies.includes(id)) return false;
  const index = econ.loadout.indexOf(id);
  if (index >= 0) econ.loadout.splice(index, 1);
  else {
    // Slot gates read the record, so carrying more is always earned by playing, never bought.
    const clears = Object.values(econ.winsByDifficulty).some((n) => (n ?? 0) > 0) ? 1 : 0;
    if (supplyCost(econ.loadout) + SUPPLY_MAP[id].slots > slotLimit(save.records.runs, clears)) {
      return false;
    }
    econ.loadout.push(id);
  }
  storeSave(save);
  return true;
}

/** Points the menu/results nudge at a catalog item, or clears the nudge when it is the same one. */
export function toggleWishlist(save: SaveData, id: string): void {
  const econ = save.economy;
  if (!PROTOCOL_MAP[id] && !isSupplyId(id)) return;
  econ.wishlist = econ.wishlist === id ? null : id;
  storeSave(save);
}

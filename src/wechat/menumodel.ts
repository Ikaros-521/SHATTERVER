/**
 * Builds the canvas menu's display model from the real save.
 *
 * The DOM menu composes these same lines inside `ui.ts` (`showMenu` / `wishlistLine`); this is
 * that logic restated for the WeChat shell, kept side-by-side on purpose — extracting a shared
 * module would touch the DOM UI mid-flight, and the two menus' fates are intentionally coupled
 * only by their copy. When the screens settle, the duplication is a candidate for re-merging.
 *
 * Pure: save in, strings out. All numbers go through the same formatters as the DOM build.
 */

import { t } from '../core/i18n';
import { formatNumber, formatScore } from '../core/math';
import type { SaveData } from '../core/storage';
import { PROTOCOLS, PROTOCOL_MAP, SUPPLIES, SUPPLY_MAP, isSupplyId } from '../game/economy/catalog';
import { CAMPAIGN_LENGTH } from '../game/levels/generator';
import { starterName } from '../i18n/content';
import type { MenuModel } from '../ui/canvas/menu';

/** The menu footer's records line: the same segments, in the same order, as the DOM menu. */
export function recordsLine(save: SaveData): string {
  const records = save.records;
  const parts: string[] = [];
  if (records.bestCampaign > 0) {
    const bestEntry = records.history.find(
      (entry) => entry.mode === 'campaign' && entry.level === records.bestCampaign,
    );
    const boss = Math.floor(
      bestEntry && !bestEntry.won ? (records.bestCampaign - 1) / 5 : records.bestCampaign / 5,
    );
    parts.push(
      t('menu.recordCampaignDepth', { n: records.bestCampaign }) +
        (records.bestCampaign >= CAMPAIGN_LENGTH ? '' : t('menu.recordBossNote', { n: boss })),
    );
  }
  if (records.bestEndless > 0) parts.push(t('menu.recordEndlessDepth', { n: records.bestEndless }));
  if (records.bestScore > 0) parts.push(t('menu.recordBestScore', { n: formatScore(records.bestScore) }));
  if (records.wins > 0) parts.push(t('menu.recordWins', { n: records.wins }));
  if (records.runs > 0) parts.push(t('menu.recordRuns', { n: records.runs }));
  return parts.length > 0 ? parts.join(' · ') : t('menu.recordsEmpty');
}

/** The wishlist nudge for the menu, or null when there is nothing to nudge (same rule as DOM). */
export function wishlistLine(save: SaveData): string | null {
  const econ = save.economy;
  const wish = econ.wishlist;
  if (!wish) return null;
  const protocol = PROTOCOL_MAP[wish];
  const price = protocol?.price ?? (isSupplyId(wish) ? SUPPLY_MAP[wish].price : 0);
  if (!price || econ.protocols.includes(wish) || econ.supplies.includes(wish)) return null;
  const name = protocol ? starterName(protocol) : t(`shop.supply.${wish}.name`);
  return t('shop.wishLine', { name, n: Math.max(0, price - econ.stardust) });
}

/** Assembles the whole menu model: records, 星尘 line, wishlist nudge, shop badge. */
export function buildMenuModel(save: SaveData): MenuModel {
  const records = save.records;
  const econ = save.economy;
  const started = econ.lifetime > 0 || econ.stardust > 0 || records.runs > 0;
  // The badge marks something new to spend on: the unpaid first gift, or any affordable item.
  const affordable =
    PROTOCOLS.some((p) => !econ.protocols.includes(p.id) && econ.stardust >= p.price) ||
    SUPPLIES.some((s) => !econ.supplies.includes(s.id) && econ.stardust >= s.price);
  const badge = !(affordable || !econ.firstGift)
    ? null
    : econ.firstGift
      ? t('shop.menuBadge')
      : t('shop.giftBadge');
  return {
    recordsText: recordsLine(save),
    stardustText: started ? t('shop.stardustLine', { n: formatNumber(econ.stardust) }) : '',
    wishText: wishlistLine(save),
    badgeText: badge,
  };
}

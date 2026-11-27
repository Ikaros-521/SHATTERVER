import cauldron from './art/cauldron.webp';
import core from './art/core.webp';
import glowCauldron from './art/glow-cauldron.webp';
import glowHat from './art/glow-hat.webp';
import glowLantern from './art/glow-lantern.webp';
import glowRobe from './art/glow-robe.webp';
import glowSleeveL from './art/glow-sleeve.L.webp';
import glowSleeveR from './art/glow-sleeve.R.webp';
import hairL from './art/hair.L.webp';
import hairR from './art/hair.R.webp';
import hat from './art/hat.webp';
import head from './art/head.webp';
import lantern from './art/lantern.webp';
import robe from './art/robe.webp';
import sleeveL from './art/sleeve.L.webp';
import sleeveR from './art/sleeve.R.webp';
import type { BossArt } from '../layer';
import { vesperSheet } from './sheet';

/**
 * Vesper's pictures: her one illustration, cut into the layers she moves in (`layout.ts` says
 * where each lies) and the light each throws. They are WebP, half a megabyte together, and are
 * fetched when the game opens — long before anybody reaches her sector. They are part of the web
 * page's bundle only: the WeChat package has its own entry and never loads this page.
 */

/** Every picture of hers, by the name her sheet asks for. */
export const VESPER_PICTURES: Readonly<Record<string, string>> = {
  hat: hat,
  head: head,
  'hair.L': hairL,
  'hair.R': hairR,
  'sleeve.L': sleeveL,
  'sleeve.R': sleeveR,
  robe: robe,
  cauldron: cauldron,
  lantern: lantern,
  core: core,
  'glow-hat': glowHat,
  'glow-cauldron': glowCauldron,
  'glow-lantern': glowLantern,
  'glow-robe': glowRobe,
  'glow-sleeve.L': glowSleeveL,
  'glow-sleeve.R': glowSleeveR,
};

let art: ReturnType<typeof vesperSheet> = null;
let gaveUp = false;

/** Her sheet, once her pictures are in; null until then — she is not drawn, and the fight waits on nothing. */
export function vesperArt(scale: number): BossArt | null {
  return art ? { sheet: art, scale } : null;
}

/** Fetches her pictures and cuts them into her sheet. Asked for once, when the game opens. */
export async function loadVesperArt(): Promise<void> {
  if (art || gaveUp) return;
  const images = await loadVesper();
  art = vesperSheet(images);
  if (!art) gaveUp = true;
}

/** Her pictures once fetched and decoded, by name; a sheet goes without any that did not come. */
export type VesperImages = Readonly<Partial<Record<string, CanvasImageSource>>>;

/**
 * Fetches and decodes every picture of hers. A picture that will not come is left out rather than
 * failing the lot: the sheet is built from what there is.
 */
export async function loadVesper(): Promise<VesperImages> {
  const images: Record<string, CanvasImageSource> = {};
  await Promise.all(
    Object.entries(VESPER_PICTURES).map(async ([name, url]) => {
      const image = new Image();
      image.src = url;
      try {
        await image.decode();
        images[name] = image;
      } catch {
        // Left out: she is drawn without it, or not at all.
      }
    }),
  );
  return images;
}

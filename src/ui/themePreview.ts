import type { AudioDirector } from '../audio/director';
import { t } from '../core/i18n';
import type { SkinKind } from '../render/skins';
import { themePartId, type ThemeId } from '../render/themes/catalog';
import { byId, el } from './dom';
import { makeModal, type ModalHandle } from './modal';

/**
 * The shop's try-on for the looks shelf (「涂装」). While it is open, the demo scene behind the
 * shop wears the previewed outfit — the real background scene, paddle and ball painters, ambient
 * and trail particles — because the renderer dresses itself from the save every frame anyway.
 * Nothing is written and nothing is exchanged: the overlay hands the App a temporary outfit and
 * takes it back on the way out, however it closes.
 */

/** One slot per kind: the id to wear for the try-on, or null to keep whatever the save wears. */
export interface SkinOutfit {
  paddle: string | null;
  ball: string | null;
  bg: string | null;
}

/** A whole theme at once: what the set card previews. */
export function outfitForTheme(theme: ThemeId): SkinOutfit {
  return {
    paddle: themePartId(theme, 'paddle'),
    ball: themePartId(theme, 'ball'),
    bg: themePartId(theme, 'bg'),
  };
}

/** One part or one recolouring over whatever the save already wears: what a shelf card previews. */
export function outfitForPart(id: string, kind: SkinKind): SkinOutfit {
  const outfit: SkinOutfit = { paddle: null, ball: null, bg: null };
  outfit[kind] = id;
  return outfit;
}

/**
 * Builds and owns the try-on overlay. Constructed once by the UI; `openPreview` may be called any
 * number of times while the shop is up. A pill at the top names the look and carries the close
 * button; the rest of the screen is left to the demo scene, so the overlay's own backdrop is
 * barely there — and the shop screen underneath is hidden for the duration, lest its dim and
 * blur stand between the player and the very thing being previewed.
 */
export class ThemePreview {
  private readonly root: HTMLElement;
  private readonly eyebrow: HTMLElement;
  private readonly title: HTMLElement;
  private readonly closeBtn: HTMLButtonElement;
  private open = false;
  /** Tab stays inside the pill and the shop behind it cannot be triggered while the try-on is up. */
  private modal!: ModalHandle;
  /** Removes this overlay's own key handling when it closes. */
  private readonly onKey = (event: KeyboardEvent): void => {
    if (event.code === 'Escape') {
      event.preventDefault();
      this.close();
    }
  };

  constructor(
    private readonly audio: AudioDirector,
    /** Wears the try-on outfit on the live scene; null hands every slot back to the save. */
    private readonly onWear: (outfit: SkinOutfit | null) => void,
  ) {
    // Module load stays DOM-free (headless tests import this file); the tree is built here, once.
    this.eyebrow = el('div', { class: 'preview-eyebrow' });
    this.title = document.createElement('h2');
    this.title.className = 'preview-title';
    this.closeBtn = el('button', { class: 'btn btn-ghost btn-small', type: 'button' });
    this.closeBtn.addEventListener('click', () => this.close());
    this.root = el(
      'section',
      { class: 'screen theme-preview', hidden: true },
      el(
        'div',
        { class: 'preview-pill' },
        el('div', { class: 'preview-copy' }, this.eyebrow, this.title),
        this.closeBtn,
      ),
    );
    // The empty backdrop is the biggest close target: tapping the scene itself ends the try-on.
    this.root.addEventListener('click', (event) => {
      if (event.target === this.root) this.close();
    });
    byId('ui').append(this.root);
    this.modal = makeModal(this.root);
  }

  openPreview(title: string, outfit: SkinOutfit): void {
    if (this.open) return;
    this.open = true;
    this.title.textContent = title;
    this.relabel();
    this.root.hidden = false;
    // `visibility` keeps the shop's DOM and scroll exactly as they were while it steps aside.
    byId('screen-shop').classList.add('preview-under');
    this.onWear(outfit);
    this.modal.activate();
    document.addEventListener('keydown', this.onKey);
  }

  /** Re-reads the active locale's chrome while the try-on is up. */
  applyLanguage(): void {
    if (this.open) this.relabel();
  }

  private relabel(): void {
    this.eyebrow.textContent = t('shop.previewTitle');
    this.closeBtn.textContent = t('shop.previewClose');
  }

  private close(): void {
    if (!this.open) return;
    this.open = false;
    this.root.hidden = true;
    byId('screen-shop').classList.remove('preview-under');
    this.onWear(null);
    // After the shop is visible again, so the focus the modal hands back lands on it.
    this.modal.deactivate();
    document.removeEventListener('keydown', this.onKey);
    this.audio.ui('uiClick');
  }
}

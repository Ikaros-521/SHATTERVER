import type { AudioDirector } from '../audio/director';
import { dict, t } from '../core/i18n';
import { MAX_HP_BASE, OVERDRIVE_DURATION } from '../game/config';
import { MODIFIERS } from '../game/levels/definitions';
import { mutatorDesc, mutatorName } from '../i18n/content';
import type { TutorialPage } from '../i18n/zh';
import { byId, el, hexCss } from './dom';

/**
 * The first-run tutorial: a short slide deck over the main menu that explains the goal, the
 * controls, the shield bar and how it takes hits, buffs, debuffs (level mutators) and crystals.
 *
 * It is a plain overlay, not one of the UI's screens: it never joins `ScreenId`, manages its own
 * visibility, and reports one `onClose` when it leaves — however it leaves. Skipping and finishing
 * count the same, so `Settings.tutorialSeen` is written exactly once per open. The menu entry
 * (「新手说明」) reopens it at any time without re-writing the flag.
 *
 * Page copy comes from the active locale's dictionary, with the few hard numbers interpolated
 * from the tuning constants so the copy cannot drift from the simulation.
 */

/** The deck of the active language. Facts ride the `{maxHp}`/`{overdrive}` placeholders. */
function tutorialPages(): TutorialPage[] {
  return dict().tutorial.pages.map((page) => ({
    ...page,
    html: page.html
      .replace(/\{maxHp\}/g, String(MAX_HP_BASE))
      .replace(/\{overdrive\}/g, String(OVERDRIVE_DURATION)),
  }));
}

/** True on the very first launch of a fresh save. Veterans with runs on record are not interrupted. */
export function shouldAutoShow(settings: { tutorialSeen: boolean }, records: { runs: number }): boolean {
  return !settings.tutorialSeen && records.runs === 0;
}

/** The level-mutator tiles are built on demand: module load must stay DOM-free (headless tests import this file). */
function mutatorSection(): HTMLElement[] {
  return MODIFIERS.map((modifier) =>
    el(
      'div',
      { class: 'tut-mutator', style: `--c:${hexCss(modifier.color)}` },
      el('b', {}, mutatorName(modifier), el('span', { class: 'tut-mutator-en', text: modifier.en })),
      el('p', { text: mutatorDesc(modifier) }),
    ),
  );
}

/**
 * Builds and owns the tutorial overlay. Constructed once by the UI; `openTutorial` may be called
 * any number of times (first run, or the menu entry later).
 */
export class Tutorial {
  private readonly root: HTMLElement;
  private readonly eyebrow: HTMLElement;
  private readonly title: HTMLElement;
  private readonly body: HTMLElement;
  private readonly dots: HTMLElement;
  private readonly skip: HTMLButtonElement;
  private readonly prev: HTMLButtonElement;
  private readonly next: HTMLButtonElement;
  private page = 0;
  private open = false;
  /** Removes this overlay's own key handling when it closes. */
  private readonly onKey = (event: KeyboardEvent): void => {
    if (event.code === 'Escape') {
      event.preventDefault();
      this.close();
    } else if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') {
      event.preventDefault();
      this.goto(this.page + (event.code === 'ArrowRight' ? 1 : -1));
    }
  };

  constructor(
    private readonly audio: AudioDirector,
    /** Called once per open, on any exit path. The UI uses it to mark the tutorial as seen. */
    private readonly onClose: () => void,
  ) {
    // The overlay's buttons are not on any `data-action` route, so they carry their own click ticks;
    // their labels are (re)assigned in `goto`, which keeps a language switch to one call.
    this.skip = el('button', { class: 'btn btn-ghost btn-small tut-skip', type: 'button' });
    this.prev = el('button', { class: 'btn btn-ghost', type: 'button' });
    this.next = el('button', { class: 'btn', type: 'button' });
    this.prev.addEventListener('click', () => {
      this.audio.ui('uiClick');
      this.goto(this.page - 1);
    });
    this.next.addEventListener('click', () => {
      if (this.page >= tutorialPages().length - 1) this.close();
      else {
        this.audio.ui('uiClick');
        this.goto(this.page + 1);
      }
    });

    this.dots = el('div', { class: 'tut-dots', role: 'tablist', 'aria-label': '说明页' });
    this.body = el('div', { class: 'tut-body' });
    this.eyebrow = el('div', { class: 'eyebrow' });
    this.title = document.createElement('h2');

    this.root = el(
      'section',
      { class: 'screen tutorial', hidden: true },
      el(
        'div',
        { class: 'dialog dialog-tall tut-dialog' },
        el(
          'header',
          { class: 'dialog-head tut-head' },
          el('div', {}, this.eyebrow, this.title, el('p', { class: 'dialog-sub', 'data-tut-sub': '' })),
          this.skip,
        ),
        this.body,
        el(
          'footer',
          { class: 'dialog-foot tut-foot' },
          this.dots,
          el('div', { class: 'tut-nav' }, this.prev, this.next),
        ),
      ),
    );
    this.skip.addEventListener('click', () => this.close());
    this.dots.addEventListener('click', (event) => {
      const dot = (event.target as HTMLElement).closest<HTMLElement>('[data-page]');
      if (dot?.dataset.page) {
        this.audio.ui('uiClick');
        this.goto(Number(dot.dataset.page));
      }
    });
    byId('ui').append(this.root);
  }

  openTutorial(): void {
    if (this.open) return;
    this.open = true;
    this.goto(0);
    this.root.hidden = false;
    document.addEventListener('keydown', this.onKey);
  }

  /** Re-reads the active locale while the deck is visible. */
  applyLanguage(): void {
    if (this.open) this.goto(this.page);
  }

  private close(): void {
    if (!this.open) return;
    this.open = false;
    this.root.hidden = true;
    document.removeEventListener('keydown', this.onKey);
    this.audio.ui('uiClick');
    this.onClose();
  }

  private goto(page: number): void {
    const pages = tutorialPages();
    this.page = Math.max(0, Math.min(pages.length - 1, page));
    const current = pages[this.page];
    this.eyebrow.textContent = current.eyebrow;
    this.title.textContent = current.title;
    const sub = this.root.querySelector<HTMLElement>('[data-tut-sub]');
    if (sub) sub.textContent = t('tutorial.sub');
    this.skip.textContent = t('tutorial.skip');
    this.prev.textContent = t('tutorial.prev');
    this.next.textContent = this.page >= pages.length - 1 ? t('tutorial.start') : t('tutorial.next');
    this.dots.setAttribute('aria-label', t('tutorial.dotsLabel'));
    this.body.replaceChildren();
    this.body.insertAdjacentHTML('beforeend', current.html);
    if (current.mutators) this.body.append(el('div', { class: 'tut-grid' }, ...mutatorSection()));
    this.body.scrollTop = 0;

    this.prev.disabled = this.page === 0;
    this.dots.replaceChildren(
      ...pages.map((_, i) =>
        el('button', {
          class: `tut-dot${i === this.page ? ' on' : ''}`,
          type: 'button',
          'data-page': String(i),
          'aria-label': t('tutorial.pageAria', { n: i + 1 }),
        }),
      ),
    );
  }
}

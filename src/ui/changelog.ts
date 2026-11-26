import type { AudioDirector } from '../audio/director';
import { dict, t } from '../core/i18n';
import { APP_VERSION } from '../core/version';
import type { ChangelogEntry } from '../i18n/zh';
import { byId, el } from './dom';

/** True until the release notes of the running version have been shown on this device. */
export function changelogUnseen(settings: { changelogSeen: string }): boolean {
  return settings.changelogSeen !== APP_VERSION;
}

/** One release in the list: version, date and, for the release on top, the "latest" tag. */
function entryNode(entry: ChangelogEntry, tag: string | null): HTMLElement {
  return el(
    'article',
    { class: 'log-entry' },
    el(
      'header',
      { class: 'log-head' },
      el('span', { class: 'log-version', text: `v${entry.version}` }),
      el('time', { class: 'log-date', datetime: entry.date, text: entry.date }),
      tag ? el('span', { class: 'log-tag', text: tag }) : null,
    ),
    el('h3', { class: 'log-title', text: entry.title }),
    el('ul', { class: 'log-notes' }, ...entry.notes.map((note) => el('li', { html: note }))),
  );
}

/**
 * The release notes: a scrollable list of versions, newest first, over the main menu.
 *
 * Like the tutorial it is a plain overlay rather than one of the UI's screens: it never joins
 * `ScreenId`, manages its own visibility, and reports one `onClose` whenever it leaves — the
 * button or Esc. The UI opens it by itself after an update, which is what writes
 * `Settings.changelogSeen` through that same callback, and from the version link pinned to the
 * menu's corner at any time.
 */
export class Changelog {
  private readonly root: HTMLElement;
  private readonly eyebrow: HTMLElement;
  private readonly title: HTMLElement;
  private readonly sub: HTMLElement;
  private readonly list: HTMLElement;
  private readonly button: HTMLButtonElement;
  private shown = false;
  /** Runs once when the notes are dismissed: whatever was waiting behind them. */
  private after: (() => void) | null = null;
  /** Removes this overlay's own key handling when it closes. */
  private readonly onKey = (event: KeyboardEvent): void => {
    if (event.code !== 'Escape') return;
    event.preventDefault();
    this.close();
  };

  constructor(
    private readonly audio: AudioDirector,
    /** Called on any exit path. The UI uses it to mark this version's notes as seen. */
    private readonly onClose: () => void,
  ) {
    this.eyebrow = el('div', { class: 'eyebrow' });
    this.title = document.createElement('h2');
    this.sub = el('p', { class: 'dialog-sub' });
    this.list = el('div', { class: 'log-body' });
    // Not on any `data-action` route, so the button carries its own click tick in `close`.
    this.button = el('button', { class: 'btn', type: 'button' });
    this.button.addEventListener('click', () => this.close());
    this.root = el(
      'section',
      { class: 'screen changelog', hidden: true, role: 'dialog', 'aria-modal': 'true' },
      el(
        'div',
        { class: 'dialog dialog-tall log-dialog' },
        el('header', { class: 'dialog-head' }, this.eyebrow, this.title, this.sub),
        this.list,
        el('footer', { class: 'dialog-foot log-foot' }, this.button),
      ),
    );
    byId('ui').append(this.root);
  }

  /**
   * Shows the notes. `after`, if given, runs once they are dismissed and no earlier — the UI uses
   * it to hold the first-run tutorial behind them.
   */
  open(after?: () => void): void {
    // Already up: it keeps its own place in the list and its own `after`.
    if (this.shown) return;
    this.shown = true;
    this.after = after ?? null;
    this.root.hidden = false;
    this.render();
    document.addEventListener('keydown', this.onKey);
  }

  /** Re-reads the active locale while the notes are visible, keeping the reader's place. */
  applyLanguage(): void {
    if (!this.shown) return;
    const top = this.list.scrollTop;
    this.render();
    this.list.scrollTop = top;
  }

  private close(): void {
    if (!this.shown) return;
    this.shown = false;
    this.root.hidden = true;
    document.removeEventListener('keydown', this.onKey);
    this.audio.ui('uiClick');
    this.onClose();
    const after = this.after;
    this.after = null;
    after?.();
  }

  private render(): void {
    const copy = dict().changelog;
    this.eyebrow.textContent = t('changelog.eyebrow', { version: APP_VERSION });
    this.title.textContent = copy.title;
    this.sub.textContent = copy.sub;
    this.button.textContent = copy.close;
    // The newest entry is the running version (`tests/changelog.test.ts`), so it is the one tagged.
    this.list.replaceChildren(
      ...copy.versions.map((entry, index) => entryNode(entry, index === 0 ? copy.latest : null)),
    );
    this.list.scrollTop = 0;
  }
}

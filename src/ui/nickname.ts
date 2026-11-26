import type { AudioDirector } from '../audio/director';
import { t } from '../core/i18n';
import type { Leaderboard } from '../net/leaderboard';
import { NICKNAME_MAX, NICKNAME_MIN, checkNickname } from '../net/nickname';
import { byId, el } from './dom';

/**
 * True when the entry prompt should ask for a leaderboard nickname: there is a Chedda channel to
 * record scores on and the player has not picked a name yet. The B站 Toy channel never asks —
 * the platform is the identity provider there — and a build without cloud credentials has no
 * records to attribute, so it never asks either.
 */
export function shouldAskNickname(cloud: Leaderboard | null): boolean {
  return cloud !== null && cloud.kind === 'chedda' && cloud.nickname === '';
}

/**
 * The entry nickname prompt: asks for a leaderboard nickname the first time the menu is reached
 * without one, so finished runs are recorded under a name the player chose instead of a server
 * `Player_N` number.
 *
 * Like the tutorial and the release notes it is a plain overlay over the main menu — it never
 * joins `ScreenId` and manages its own visibility. Saving goes through the same `rename` route as
 * the leaderboard screen, which is also what persists the name under the cloud identity key, so
 * once a name is saved the prompt never appears again on this device. Skipping only dismisses it
 * for the moment: an unnamed player is asked again on the next entry to the menu, which is what
 * keeps the ask honest instead of one-time nagging that ends up never answered.
 */
export class NicknamePrompt {
  private readonly eyebrow: HTMLElement;
  private readonly title: HTMLElement;
  private readonly sub: HTMLElement;
  private readonly label: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly saveButton: HTMLButtonElement;
  private readonly skipButton: HTMLButtonElement;
  private readonly note: HTMLElement;
  private readonly root: HTMLElement;
  private shown = false;
  /** Guards one save at a time, exactly like the leaderboard screen's own field. */
  private busy = false;
  /** Removes this overlay's key handling when it closes. */
  private readonly onKey = (event: KeyboardEvent): void => {
    if (event.code !== 'Escape') return;
    event.preventDefault();
    this.close();
  };

  constructor(
    private readonly audio: AudioDirector,
    private readonly cloud: Leaderboard,
  ) {
    this.eyebrow = el('div', { class: 'eyebrow' });
    this.title = document.createElement('h2');
    this.sub = el('p', { class: 'dialog-sub' });
    this.label = el('span');
    this.input = el('input', {
      type: 'text',
      maxlength: String(NICKNAME_MAX),
      autocomplete: 'off',
      spellcheck: 'false',
    });
    this.saveButton = el('button', { class: 'btn btn-small', type: 'button' });
    this.skipButton = el('button', { class: 'btn btn-ghost btn-small', type: 'button' });
    // Not on any `data-action` route, so each button carries its own click tick, like the
    // tutorial's.
    this.saveButton.addEventListener('click', () => void this.save());
    this.skipButton.addEventListener('click', () => this.close());
    this.input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') void this.save();
    });
    // Live validation, so the player learns the rule before pressing the button.
    this.input.addEventListener('input', () => {
      const raw = this.input.value.trim();
      if (raw.length === 0) {
        this.setNote(t('cloud.noteRule', { min: NICKNAME_MIN, max: NICKNAME_MAX }), 'info');
        return;
      }
      const check = checkNickname(raw);
      this.setNote(
        check.ok ? t('cloud.noteOk', { name: check.value }) : check.message,
        check.ok ? 'ok' : 'warn',
      );
    });

    this.note = el('p', { class: 'setting-note', hidden: true });
    const row = el(
      'div',
      { class: 'cloud-name' },
      el('label', { class: 'cloud-name-field' }, this.label, this.input),
      this.saveButton,
    );
    this.root = el(
      'section',
      { class: 'screen nickname-ask', hidden: true, role: 'dialog', 'aria-modal': 'true' },
      el(
        'div',
        { class: 'dialog dialog-narrow' },
        el('header', { class: 'dialog-head' }, this.eyebrow, this.title, this.sub),
        row,
        this.note,
        el('footer', { class: 'dialog-foot' }, this.skipButton, this.saveButton),
      ),
    );
    byId('ui').append(this.root);
  }

  /** Shows the prompt over the menu; a no-op while it is already up. */
  open(): void {
    if (this.shown) return;
    this.shown = true;
    this.render();
    this.root.hidden = false;
    this.input.focus();
    document.addEventListener('keydown', this.onKey);
  }

  /** Re-reads the active locale while the prompt is visible. */
  applyLanguage(): void {
    if (!this.shown) return;
    this.render();
  }

  /** True while the prompt is on screen, so callers do not open it twice. */
  get showing(): boolean {
    return this.shown;
  }

  private close(): void {
    if (!this.shown) return;
    this.shown = false;
    this.root.hidden = true;
    document.removeEventListener('keydown', this.onKey);
    this.audio.ui('uiClick');
  }

  private render(): void {
    this.eyebrow.textContent = t('cloud.askEyebrow');
    this.title.textContent = t('cloud.askTitle');
    this.sub.textContent = t('cloud.askSub');
    this.saveButton.textContent = t('cloud.saveName');
    this.skipButton.textContent = t('cloud.askSkip');
    this.label.textContent = t('cloud.nicknameLabel');
    this.input.placeholder = t('cloud.nicknamePlaceholder');
    this.input.value = this.cloud.nickname;
  }

  private setNote(text: string, tone: 'ok' | 'warn' | 'info'): void {
    this.note.hidden = false;
    this.note.dataset.tone = tone;
    this.note.textContent = text;
  }

  /**
   * Saves through the channel's own rename route — the same server call and the same local
   * persistence the leaderboard screen uses, so the two entry points can never disagree about the
   * stored name. Success closes the prompt; a refusal keeps it open with the reason.
   */
  private async save(): Promise<void> {
    if (this.busy) return;
    const raw = this.input.value;
    const check = checkNickname(raw);
    if (!check.ok) {
      this.setNote(check.message, 'warn');
      this.audio.ui('deny');
      return;
    }
    this.busy = true;
    this.saveButton.disabled = true;
    this.setNote(t('cloud.saving'), 'info');
    const outcome = await this.cloud.rename(raw);
    this.busy = false;
    this.saveButton.disabled = false;
    if (!outcome.ok) {
      // The server is the authority on why the name was refused; show its message as-is.
      this.setNote(outcome.message, 'warn');
      this.audio.ui('deny');
      return;
    }
    this.setNote(t('cloud.askSaved', { name: outcome.nickname }), 'ok');
    this.audio.ui('pick', 2);
    this.close();
  }
}

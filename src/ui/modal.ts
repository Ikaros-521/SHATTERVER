/**
 * Modal behavior for the plain overlays the UI mounts beside its screens (tutorial, changelog).
 *
 * `aria-modal` alone does not stop Tab from reaching what is behind an overlay, and these
 * overlays are not screens: the menu they cover stays live in the DOM. While an overlay is open
 * this marks everything else in `#ui` `inert`, keeps Tab cycling inside the overlay, and puts
 * focus back where it was on the way out — a keyboard user can neither trigger a hidden menu
 * entry by tabbing into it nor lose their place when the overlay closes.
 */

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export interface ModalHandle {
  /** Call when the overlay becomes visible. */
  activate(): void;
  /** Call when it hides, on every exit path. */
  deactivate(): void;
}

export function makeModal(root: HTMLElement): ModalHandle {
  /** Where focus came from, so closing the overlay hands it back. */
  let restore: HTMLElement | null = null;
  /** The elements this handle set `inert`, so it never strips a flag it did not set. */
  let inerted: Element[] = [];

  const onKey = (event: KeyboardEvent): void => {
    if (event.key !== 'Tab') return;
    const focusable = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (node) => !node.hasAttribute('disabled'),
    );
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    const active = document.activeElement;
    // An activeElement outside the overlay (a race with a late render) is pulled back inside.
    if (event.shiftKey) {
      if (active === first || !root.contains(active)) {
        event.preventDefault();
        last.focus();
      }
    } else if (active === last || !root.contains(active)) {
      event.preventDefault();
      first.focus();
    }
  };

  return {
    activate(): void {
      restore = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const host = root.parentElement;
      inerted = host ? [...host.children].filter((child) => child !== root) : [];
      // The attribute form, not the `inert` property: tests run in a DOM-less Node and the
      // property is only reflected where the engine supports it, while the attribute is the
      // contract every `inert` implementation reads.
      for (const child of inerted) child.setAttribute('inert', '');
      root.addEventListener('keydown', onKey);
      root.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    },
    deactivate(): void {
      root.removeEventListener('keydown', onKey);
      for (const child of inerted) child.removeAttribute('inert');
      inerted = [];
      if (restore?.isConnected) restore.focus();
      restore = null;
    },
  };
}

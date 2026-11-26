/** Tiny DOM helpers. No framework: the UI is a handful of screens rebuilt from data when it changes. */

type AttrValue = string | number | boolean | EventListener | undefined;

/**
 * `el('button', { class: 'btn', onClick: fn, disabled: true }, 'label', child)`.
 * Keys starting with `on` are event listeners; `html` sets innerHTML; `text` sets textContent.
 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, AttrValue> = {},
  ...children: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'html') {
      node.innerHTML = String(value);
    } else if (key === 'text') {
      node.textContent = String(value);
    } else if (key === 'class') {
      node.className = String(value);
    } else if (value === true) {
      node.setAttribute(key, '');
    } else {
      node.setAttribute(key, String(value));
    }
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

/** Drops absent children, for DOM methods that do not accept null (e.g. `replaceChildren`). */
export function keep(...nodes: (Node | null | undefined | false)[]): Node[] {
  return nodes.filter((node): node is Node => node !== null && node !== undefined && node !== false);
}

/**
 * A score (`formatScore` output) whose digits may fold after a thousands separator and nowhere
 * else. A number carries no break opportunity of its own, so a score too long for its line would
 * leave the line altogether — or, with the break-anywhere fallback `.rank-score` carries, split a
 * digit group (`…283,3` / `17`). The `<wbr>`s offer the fold after each comma instead:
 * `141,754,153,283,` / `317`.
 */
export function scoreEl(formatted: string): HTMLElement {
  const span = el('span', { class: 'rank-score' });
  formatted.split(',').forEach((group, index) => {
    if (index > 0) span.append(',', el('wbr'));
    span.append(group);
  });
  return span;
}

export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Element #${id} is missing`);
  return node as T;
}

export function setText(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

export function setWidth(node: HTMLElement, fraction: number): void {
  const value = Math.max(0, Math.min(1, fraction)).toFixed(3);
  if (node.dataset.w !== value) {
    node.dataset.w = value;
    node.style.transform = `scaleX(${value})`;
  }
}

/** Runs a short Web Animation and removes it when done. Safe to spam: it cancels the previous one. */
export function pop(node: HTMLElement, scale = 1.3, duration = 150): void {
  node.getAnimations().forEach((animation) => animation.cancel());
  node.animate([{ transform: `scale(${scale})` }, { transform: 'scale(1)' }], {
    duration,
    easing: 'cubic-bezier(.2,.9,.3,1)',
  });
}

export function hexCss(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

/** 0xRRGGBB at an opacity, as a CSS `rgba()` colour. */
export function rgbaCss(hex: number, alpha: number): string {
  return `rgb(${(hex >> 16) & 255} ${(hex >> 8) & 255} ${hex & 255} / ${Math.min(1, Math.max(0, alpha))})`;
}

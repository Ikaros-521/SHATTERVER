import { BUFF_MAP, type BuffId } from '../game/buffs/defs';
import type { World } from '../game/world';
import { buffName } from '../i18n/content';
import { byId, el, hexCss } from './dom';
import { sigil } from './sigil';

interface Chip {
  node: HTMLElement;
  name: HTMLElement;
  time: HTMLElement;
  fill: HTMLElement;
  /** Seconds last written into the label. */
  shown: number;
}

/** This close to the end, a chip starts blinking: the buff is about to be taken back. */
const ENDING_AT = 2.5;

/**
 * The buff strip: one chip per temporary buff in force, each draining as its time runs out.
 *
 * Where it sits is CSS's decision, on a class it sets from the layout: with a margin beside the
 * arena it is a column of full chips under the stats panel; otherwise it folds down to a row of
 * icon-only pills in the dead strip under the paddle, where nothing is ever aimed.
 *
 * Like the rest of the HUD it only touches what changed: a chip's label is rewritten once a
 * second and its bar once a frame, nothing else.
 */
export class BuffBar {
  private readonly root = byId('buff-bar');
  private readonly chips = new Map<BuffId, Chip>();
  /** Buffs with a chip on screen, oldest first — the order they leave in. */
  private readonly shown: BuffId[] = [];

  /** True when there is room for the column in the margin; false for the folded row. */
  setInline(inline: boolean): void {
    this.root.classList.toggle('overlay', !inline);
  }

  /**
   * `shared`: the overdrive prompt is up. In the folded row it sits centred in the same strip
   * under the paddle, so the row keeps to the left of it; the rest of the time it has the strip.
   */
  setShared(shared: boolean): void {
    this.root.classList.toggle('shared', shared);
  }

  update(world: World): void {
    const running = world.buffs;
    if (running.length === 0) {
      if (this.chips.size > 0) this.reset();
      return;
    }
    this.root.hidden = false;

    for (let i = this.shown.length - 1; i >= 0; i--) {
      const id = this.shown[i];
      if (!id || running.some((buff) => buff.id === id)) continue;
      this.chips.get(id)?.node.remove();
      this.chips.delete(id);
      this.shown.splice(i, 1);
    }

    for (const buff of running) {
      let chip = this.chips.get(buff.id);
      if (!chip) {
        chip = this.mount(buff.id);
        this.chips.set(buff.id, chip);
        this.shown.push(buff.id);
      }
      // Re-read every frame: a language switch reaches the chips without a rebuild.
      const name = buffName(BUFF_MAP[buff.id]);
      if (chip.name.textContent !== name) {
        chip.name.textContent = name;
        chip.node.title = name;
      }
      const left = Math.max(0, Math.ceil(buff.t));
      if (chip.shown !== left) {
        chip.shown = left;
        chip.time.textContent = String(left);
      }
      chip.fill.style.transform = `scaleX(${Math.max(0, Math.min(1, buff.t / buff.max)).toFixed(3)})`;
      chip.node.classList.toggle('ending', buff.t <= ENDING_AT);
    }
  }

  reset(): void {
    this.root.replaceChildren();
    this.chips.clear();
    this.shown.length = 0;
    this.root.hidden = true;
  }

  private mount(id: BuffId): Chip {
    const def = BUFF_MAP[id];
    const color = def.color;
    const name = el('span', { class: 'buff-name' });
    const time = el('span', { class: 'buff-time' });
    const fill = el('i', { class: 'buff-left', 'aria-hidden': 'true' });
    const node = el(
      'div',
      {
        class: 'buff-chip',
        role: 'listitem',
        style: `--c:${hexCss(color)}`,
      },
      el('img', { src: sigil(`buff:${id}`, color), alt: '', draggable: 'false' }),
      name,
      time,
      fill,
    );
    this.root.append(node);
    return { node, name, time, fill, shown: -1 };
  }
}

import { BUFF_MAP, type BuffId } from './defs';

/**
 * The colour a buff is drawn in: its capsule, its feedback, its chip in the HUD.
 *
 * The elemental storm is every colour at once, so it gets white — the balls it moves are what
 * run through the rainbow.
 */
export function buffColor(id: BuffId): number {
  return id === 'storm' ? 0xffffff : BUFF_MAP[id].color;
}

/**
 * The starter roster sort: the pure function both the DOM screen and the canvas screen share.
 * Latin display names keep the locale-collator assertions independent of ICU's zh ordering.
 */
import { describe, expect, it } from 'vitest';
import {
  isStarterSort,
  sortStarters,
  STARTER_SORT_IDS,
  type Starter,
  type StarterSortId,
} from '../src/game/starters';

function starter(id: string, name: string): Starter {
  return { id, name, en: id.toUpperCase(), desc: '', color: 0, grants: {}, crystals: 0 };
}

const roster = [starter('a', 'Charlie'), starter('b', 'alpha'), starter('c', 'Beta'), starter('d', 'alpha')];

describe('sortStarters', () => {
  it('keeps the catalog order under the default sort, as a fresh copy', () => {
    const sorted = sortStarters(roster, 'default', {}, (s) => s.name);
    expect(sorted.map((s) => s.id)).toEqual(['a', 'b', 'c', 'd']);
    sorted.pop();
    expect(roster).toHaveLength(4);
  });

  it('lifts the most-opened protocols, ties keeping the catalog order', () => {
    const picks = { c: 9, b: 2 };
    const sorted = sortStarters(roster, 'frequent', picks, (s) => s.name);
    // c leads (9), then b (2), then the never-opened a and d in catalog order.
    expect(sorted.map((s) => s.id)).toEqual(['c', 'b', 'a', 'd']);
  });

  it('sorts by the localized name, equal names keeping the catalog order', () => {
    const sorted = sortStarters(roster, 'name', {}, (s) => s.name);
    expect(sorted.map((s) => s.id)).toEqual(['b', 'd', 'c', 'a']);
  });

  it('narrows only the three real sort ids', () => {
    const ids: StarterSortId[] = ['default', 'frequent', 'name'];
    expect(STARTER_SORT_IDS).toEqual(ids);
    for (const id of ids) expect(isStarterSort(id)).toBe(true);
    expect(isStarterSort('cheapest')).toBe(false);
    expect(isStarterSort(3)).toBe(false);
  });
});

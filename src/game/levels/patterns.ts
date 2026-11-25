import type { RNG } from '../../core/rng';

/** A lattice position. */
export interface Cell {
  col: number;
  row: number;
}

export const COLS = 12;

const fromAscii = (rows: readonly string[], col = 0, row = 0): Cell[] => {
  const out: Cell[] = [];
  rows.forEach((line, r) => {
    for (let c = 0; c < line.length; c++) if (line[c] === '#') out.push({ col: c + col, row: r + row });
  });
  return out;
};

const fill = (rows: number, test: (col: number, row: number) => boolean): Cell[] => {
  const out: Cell[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < COLS; c++) if (test(c, r)) out.push({ col: c, row: r });
  return out;
};

export const offsetCells = (cells: Cell[], col: number, row: number): Cell[] =>
  cells.map((c) => ({ col: c.col + col, row: c.row + row }));

export const maxRow = (cells: Cell[]): number => cells.reduce((m, c) => Math.max(m, c.row), -1);

export const solid = (rows: number): Cell[] => fill(rows, () => true);

export const checker = (rows: number): Cell[] => fill(rows, (c, r) => (c + r) % 2 === 0);

export const stripes = (rows: number): Cell[] => fill(rows, (c) => c % 3 !== 1);

/** Six-wide diagonal bands. */
export const diagonals = (rows: number): Cell[] => fill(rows, (c, r) => (c + r * 2) % COLS < 6);

/** Wide at the top, narrowing downwards. */
export const pyramid = (rows: number): Cell[] =>
  fill(rows, (c, r) => Math.abs(c - 5.5) <= 6 - (6 / rows) * r + 0.01);

/** Narrow at the top, widening downwards. */
export const funnel = (rows: number): Cell[] => fill(rows, (c, r) => Math.abs(c - 5.5) <= (6 / rows) * r + 1);

export const diamond = (rows: number): Cell[] => {
  const mid = (rows - 1) / 2;
  return fill(rows, (c, r) => Math.abs(c - 5.5) <= 6 * (1 - Math.abs(r - mid) / (mid + 1)) + 0.01);
};

export const cross = (rows: number): Cell[] =>
  fill(rows, (c, r) => Math.abs(c - 5.5) <= 1 || Math.abs(r - (rows - 1) / 2) <= 0.5);

export const frame = (rows: number): Cell[] =>
  fill(rows, (c, r) => r === 0 || r === rows - 1 || c === 0 || c === COLS - 1);

/** A two-brick-thick sine wave. */
export const wave = (rows: number): Cell[] => {
  const out: Cell[] = [];
  const half = (rows - 1) / 2;
  for (let c = 0; c < COLS; c++) {
    const base = Math.round(half + Math.sin((c / (COLS - 1)) * Math.PI * 2) * half);
    for (let k = 0; k < 2; k++) if (base + k < rows) out.push({ col: c, row: base + k });
  }
  return out;
};

export const blobs = (rows: number, density: number, rng: RNG): Cell[] =>
  fill(rows, () => rng.chance(density));

/** Pixel-art sprites. They read as "something" for the fraction of a second before they explode. */
export const SPRITES = {
  invader: [
    '..#.....#..',
    '...#...#...',
    '..#######..',
    '.##.###.##.',
    '###########',
    '#.#######.#',
    '#.#.....#.#',
    '...##.##...',
  ],
  skull: [
    '.########.',
    '##########',
    '##.####.##',
    '##.####.##',
    '##########',
    '#..####..#',
    '#.######.#',
    '..##..##..',
  ],
  heart: ['.##...##.', '####.####', '#########', '.#######.', '..#####..', '...###...', '....#....'],
  ship: [
    '.....#.....',
    '....###....',
    '...#####...',
    '..#######..',
    '.####.####.',
    '###########',
    '#.##...##.#',
    '#.........#',
  ],
  bot: [
    '..#######..',
    '.#..###..#.',
    '.#.#####.#.',
    '..##.#.##..',
    '..#######..',
    '.#.#...#.#.',
    '#..#...#..#',
    '#.........#',
  ],
} as const;

export type SpriteName = keyof typeof SPRITES;

export const sprite = (name: SpriteName): Cell[] => {
  const rows = SPRITES[name];
  // Centre sprites narrower than the lattice.
  return fromAscii(rows, Math.floor((COLS - rows[0].length) / 2), 0);
};

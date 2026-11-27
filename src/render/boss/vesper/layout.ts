/**
 * Where every picture of Vesper lies, in figure units about her neck — the origin of her
 * figure. Generated from her master art by the cut (`docs/boss/vesper.md` tells how); do not
 * edit by hand, edit the cut and run it again.
 */

/** [left, top, right, bottom] of each layer's picture, back to front. */
export const VESPER_LAYERS: Readonly<Record<string, readonly [number, number, number, number]>> = {
  robe: [-169.75, -11, 172.3333, 450.6667],
  hair_L: [-170.25, -38, -6.5, 348.6667],
  hair_R: [22, -1.5, 176.5833, 304.3333],
  sleeve_L: [-138, 4.25, -6.3333, 345.9167],
  sleeve_R: [26.5, 5, 144, 350.4167],
  head: [-46.25, -78.25, 65.8333, 93.8333],
  lantern: [88.5, -5.75, 166.8333, 90.0833],
  cauldron: [-166.5, -10.25, -91.5, 91.4167],
  hat: [-108.75, -143.5, 107.9167, 7.75],
};

/** The light each layer throws: its picture's box, about the same origin. */
export const VESPER_GLOWS: Readonly<Record<string, readonly [number, number, number, number]>> = {
  robe: [-191.4167, -32.6667, 194, 472.3333],
  sleeve_L: [-159.6667, -17.4167, 15.3333, 367.5833],
  sleeve_R: [4.8333, -16.6667, 165.6667, 372.0833],
  lantern: [54.3333, -39.9167, 201, 124.25],
  cauldron: [-195.6667, -39.4167, -62.3333, 120.5833],
  hat: [-132.9167, -167.6667, 132.0833, 31.9167],
};

/** Her star core: its picture's box, and where its middle hangs. */
export const VESPER_CORE = { box: [-16, -16, 16, 16], at: [-129, 46.5833] } as const;

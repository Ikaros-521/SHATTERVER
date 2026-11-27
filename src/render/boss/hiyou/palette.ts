/**
 * 樱之誓约·绯樱: sakura pink, pearl white and silver grey over a purple-pink core. 0xRRGGBB.
 *
 * One light for the whole figure, from the upper left: every shape's shader shades towards it,
 * so parts drawn by different painters still read as one body.
 */
export const HIYOU = {
  /** Hair, deepest at the root. */
  hair: 0xff9dca,
  /** The pale ends of the hair and the sheen across a lock. */
  hairLight: 0xffd2e6,
  /** Brows: deep enough to read over the fringe, which they are drawn on top of. */
  brow: 0xa8387a,
  skin: 0xffe6d8,
  blush: 0xff8fa6,
  iris: 0xbf4dff,
  /** Pearl white armour plate. */
  pearl: 0xf4eff9,
  /** Every other blade of the wings: a shade deeper than the plate, so the fan reads as blades. */
  blade: 0xc4cadf,
  /** Polished silver: collars, joints, ridges. */
  silver: 0xbcc1d3,
  /** Darker steel: struts and spars. */
  steel: 0x858ba6,
  /** The under-suit the plates hang on. */
  suit: 0x3b2b52,
  /** The socket the core sits in: darker still. */
  socket: 0x221834,
  /** Trim lines and the stones set in the armour. */
  trim: 0xff6fba,
  /** The core. */
  core: 0xdc5cff,
  /** Light: seams, feather tips, the halo. Pushed past white in the shader, so it blooms. */
  energy: 0xff5ad8,
  /** The inside of an open mouth. */
  mouth: 0x8a2648,
} as const;

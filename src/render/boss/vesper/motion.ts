import type { StageMotion } from '../stage/source';

/**
 * How 薇斯珀 moves and what light she throws, over her stage pictures: the one page of her
 * rendering that is hers and not the template's. Her pictures are whole drawings, so all that
 * moves is the whole of her — a slow breath, and a lean that follows her sway — and nothing is
 * moved against anything else.
 */
export const vesperMotion: StageMotion = {
  // She hangs in the air: the whole of her rises and settles, a little.
  bob: (time) => Math.sin(time * 1.3) * 1.2,
  // A breath: a hundredth of her height, in and out — too little to see as a change of size, enough
  // that she is not a sticker.
  move: (frame) => ({
    x: Math.sin(frame.time * 0.8 + 0.4) * 0.6,
    y: Math.sin(frame.time * 1.3) * 0.3,
  }),
  // Her lamp on the field about her, from the side it hangs on; brighter when she is angry.
  lights: (stage) => [
    {
      x: 96,
      y: 24,
      reach: 110,
      color: 0xffb347,
      alpha: 0.17 * (stage >= 4 ? 1.25 : 1),
      sharp: 0.3,
    },
  ],
  // She is a painting: a blow brightens her a little, it does not wash her out — she is struck
  // many times a second, and a whole picture lit by every blow is all light.
  flash: 0.14,
  // A change of picture is a moment: a breath of light as the new one settles.
  changeFlash: 0.45,
};

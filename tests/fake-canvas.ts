/**
 * A canvas that draws nothing and checks everything, for tests of drawing code that must run where
 * there is no canvas: every number it is handed is looked at, and a path the drawing cannot read all
 * the way is counted by `faults` in `render/boss/hiyou/draw/brush`.
 */
export function fakeCanvas(): { ctx: CanvasRenderingContext2D; bad: string[]; fills: () => number } {
  const bad: string[] = [];
  const gradient = {
    addColorStop: (at: number) => {
      if (!(at >= 0 && at <= 1)) bad.push(`colour stop at ${at}`);
    },
  };
  const numbered =
    (name: string) =>
    (...values: number[]): void => {
      // The last argument of arc() and ellipse() is a flag, not a place.
      // The first argument of drawImage() is the image; the last of arc() and ellipse() is a flag.
      if (
        !values.every(
          (value) => typeof value === 'object' || typeof value === 'boolean' || Number.isFinite(value),
        )
      )
        bad.push(`${name}(${values.join(', ')})`);
    };
  let fills = 0;
  const ctx: Record<string, unknown> = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineJoin: 'miter',
    lineCap: 'butt',
    globalAlpha: 1,
    createLinearGradient: (...values: number[]) => {
      numbered('createLinearGradient')(...values);
      return gradient;
    },
    createRadialGradient: (...values: number[]) => {
      numbered('createRadialGradient')(...values);
      return gradient;
    },
    fill: () => {
      fills++;
    },
  };
  for (const name of ['closePath', 'stroke', 'clip', 'save', 'restore']) ctx[name] = (): void => {};
  for (const name of [
    'beginPath',
    'moveTo',
    'lineTo',
    'quadraticCurveTo',
    'bezierCurveTo',
    'arc',
    'ellipse',
    'rect',
    'fillRect',
    'translate',
    'scale',
    'rotate',
    'setTransform',
    'drawImage',
  ]) {
    ctx[name] = numbered(name);
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, bad, fills: () => fills };
}

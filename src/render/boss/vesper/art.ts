import stage0 from './art/stage-0.webp';
import stage1 from './art/stage-1.webp';
import stage2 from './art/stage-2.webp';
import stage3 from './art/stage-3.webp';
import stage4 from './art/stage-4.webp';
import stage5 from './art/stage-5.webp';
import glow0 from './art/glow-0.webp';
import glow1 from './art/glow-1.webp';
import glow2 from './art/glow-2.webp';
import glow3 from './art/glow-3.webp';
import glow4 from './art/glow-4.webp';
import glow5 from './art/glow-5.webp';
import { loadStagePictures, type StagePicture } from '../stage/sheet';

/**
 * vesper's pictures: her stage sheet cut up (`layout.ts` says where each lies). They are fetched
 * when the game opens and are part of the web page's bundle only.
 */
const PICTURES: readonly (readonly [string, string | null])[] = [
  [stage0, glow0],
  [stage1, glow1],
  [stage2, glow2],
  [stage3, glow3],
  [stage4, glow4],
  [stage5, glow5],
];

/** Her pictures once fetched and decoded, a stage each; null where one did not come. */
export function loadVESPER(): Promise<readonly (StagePicture | null)[]> {
  return loadStagePictures(PICTURES);
}

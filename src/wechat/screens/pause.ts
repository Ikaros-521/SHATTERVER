/**
 * The pause screen: resume, or abandon the run. Walking away forfeits the run — no settlement,
 * no cloud submit — the same rule the DOM's 放弃本局 applies. Settings join once that screen is
 * ported. The card renders full-width with headroom: `CanvasUi.setTree` relayouts every root at
 * (0,0,width), so hand-positioned frames do not survive the install.
 */

import { t } from '../../core/i18n';
import type { TextMeasurer } from '../../ui/canvas/text';
import { uniformMeasurer } from '../../ui/canvas/text';
import { button, label, panel, spacer, type Widget } from '../../ui/canvas/widgets';

export interface PauseActions {
  resume(): void;
  abandon(): void;
}

export function pauseTree(
  actions: PauseActions,
  width: number,
  height: number,
  m: TextMeasurer = uniformMeasurer(1),
): Widget {
  void m;
  const pad = Math.max(18, Math.min(30, width * 0.06));
  return panel(
    [
      spacer(Math.round(height * 0.2)),
      label('PAUSED', { size: 11, color: 'accent', weight: '700', alpha: 0.85 }),
      label(t('pause.title'), { size: 26, weight: '900' }),
      spacer(16),
      button(t('pause.resume'), actions.resume, { variant: 'primary', size: 16, stretch: true }),
      spacer(4),
      button(t('pause.abandon'), actions.abandon, { variant: 'danger', size: 15, stretch: true }),
    ],
    { padding: pad, gap: 8, bg: false, stroke: false },
  );
}

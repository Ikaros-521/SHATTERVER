/**
 * The settings screen as a widget tree.
 *
 * Touch-first reductions from the DOM dialog: volumes become five-step buttons (no sliders —
 * the gesture layer would need a third drag idiom), language is a four-button row, and the seed
 * input and the performance probe stay DOM-only (a text keyboard is a later slice). Every change
 * goes through the shell, which persists to the save; language additionally flips the i18n
 * module state so every rebuild re-reads its strings. Volume/quality take effect on the audio
 * stack and the next run's effects respectively — the shell runs mute until audio lands.
 */

import { t, type Lang } from '../../core/i18n';
import { APP_VERSION } from '../../core/version';
import type { Settings } from '../../core/storage';
import type { QualityLevel } from '../../render/layout';
import type { SaveData } from '../../core/storage';
import type { TextMeasurer } from '../../ui/canvas/text';
import { uniformMeasurer } from '../../ui/canvas/text';
import {
  button,
  label,
  layoutWidget,
  panel,
  row,
  scroll,
  spacer,
  type ScrollWidget,
  type Widget,
} from '../../ui/canvas/widgets';

export interface SettingsActions {
  back(): void;
  /** Persists to the save (the shell also stores); the screen rebuilds afterwards. */
  update(patch: Partial<Settings>): void;
  setLanguage(lang: Lang): void;
}

const LANGS: { id: Lang; label: string }[] = [
  { id: 'zh', label: '中文' },
  { id: 'en', label: 'EN' },
  { id: 'ja', label: '日本語' },
  { id: 'ko', label: '한국어' },
];

const VOLUME_STEPS = [0, 0.25, 0.5, 0.75, 1];

/** Read per call: the labels are `t()` results and must follow a live language switch. */
function qualities(): { id: QualityLevel; label: string }[] {
  return [
    { id: 'low', label: t('settings.qualityLow') },
    { id: 'medium', label: t('settings.qualityMedium') },
    { id: 'high', label: t('settings.qualityHigh') },
  ];
}

/** The volume step a stored 0..1 value sits on (nearest step). */
export function volumeStep(value: number): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < VOLUME_STEPS.length; i++) {
    const dist = Math.abs((VOLUME_STEPS[i] as number) - value);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

export function settingsTree(
  save: SaveData,
  actions: SettingsActions,
  width: number,
  height: number,
  m: TextMeasurer = uniformMeasurer(1),
): Widget {
  const pad = Math.max(16, Math.min(26, width * 0.045));
  const s = save.settings;
  const children: Widget[] = [
    label('SETTINGS', { size: 11, color: 'accent', weight: '700', alpha: 0.85 }),
    label(t('settings.title'), { size: 26, weight: '900' }),
    spacer(8),
    captionRow(t('settings.language'), langsRow(s.language, actions)),
    captionRow(
      t('settings.music'),
      volumesRow(s.music, (v) => actions.update({ music: v })),
    ),
    captionRow(
      t('settings.sfx'),
      volumesRow(s.sfx, (v) => actions.update({ sfx: v })),
    ),
    captionRow(
      t('settings.shake'),
      toggleRow(s.shake, (v) => actions.update({ shake: v })),
    ),
    captionRow(
      t('settings.flashes'),
      toggleRow(s.flashes, (v) => actions.update({ flashes: v })),
    ),
    captionRow(t('settings.quality'), qualitiesRow(s.quality, actions)),
    spacer(10),
    label(`v${APP_VERSION}`, { size: 11, color: 'inkFaint' }),
  ];

  const build = (viewportH: number): Widget =>
    panel(
      [
        scroll(panel(children, { padding: 0, gap: 9, bg: false, stroke: false }), viewportH),
        spacer(6),
        button(t('common.back'), actions.back, { variant: 'ghost', size: 15, stretch: true }),
      ],
      { padding: pad, gap: 6, bg: false, stroke: false },
    );

  // Two-pass layout, same discipline as the other screens.
  const probe = build(height);
  layoutWidget(probe, 0, 0, width, m);
  const scroller = (probe as { children: Widget[] }).children[0] as ScrollWidget;
  const overhead = probe.h - scroller.viewportH;
  const root = build(Math.max(120, height - overhead));
  layoutWidget(root, 0, 0, width, m);
  return root;
}

/** A muted caption with its control row directly beneath. */
function captionRow(caption: string, control: Widget): Widget {
  return panel([label(caption, { size: 13, color: 'inkDim', weight: '700' }), control], {
    padding: 0,
    gap: 4,
    bg: false,
    stroke: false,
  });
}

function langsRow(active: Lang, actions: SettingsActions): Widget {
  return row(
    LANGS.map((lang) =>
      button(lang.label, () => actions.setLanguage(lang.id), {
        variant: active === lang.id ? 'primary' : 'ghost',
        size: 14,
        paddingH: 12,
      }),
    ),
    { gap: 8, align: 'start' },
  );
}

function volumesRow(value: number, set: (v: number) => void): Widget {
  const step = volumeStep(value);
  return row(
    VOLUME_STEPS.map((v, i) =>
      button(i === 0 ? '0' : String(i * 25), () => set(v), {
        variant: i === step ? 'primary' : 'ghost',
        size: 14,
        paddingH: 10,
      }),
    ),
    { gap: 8, align: 'start' },
  );
}

function toggleRow(value: boolean, set: (v: boolean) => void): Widget {
  // ON/OFF stay untranslated — the same arcade-capital convention as WIN and NEW.
  return row(
    [
      button(value ? 'ON' : 'OFF', () => set(!value), {
        variant: value ? 'primary' : 'ghost',
        size: 13,
        paddingH: 16,
      }),
    ],
    { gap: 8, align: 'start' },
  );
}

function qualitiesRow(active: QualityLevel, actions: SettingsActions): Widget {
  return row(
    qualities().map((quality) =>
      button(quality.label, () => actions.update({ quality: quality.id }), {
        variant: active === quality.id ? 'primary' : 'ghost',
        size: 13,
        paddingH: 12,
      }),
    ),
    { gap: 8, align: 'start' },
  );
}

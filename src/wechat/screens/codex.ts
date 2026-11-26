/**
 * The codex screen (强化图鉴) as a widget tree: four tabs over the same scroll body.
 *
 * Mirrors the DOM dialog: upgrades grouped by rarity (undiscovered ones marked), the reactions
 * with their element recipes, the buff capsules, and the how-to-play rules. Descriptions come
 * from the shared content readers, so a language switch re-renders them; the DOM's per-row
 * sigil images are deferred (the name + code + colour carry the identity at canvas fidelity).
 * Pure view — the shell owns the save and the tab state.
 */

import { t } from '../../core/i18n';
import { BUFFS } from '../../game/buffs/defs';
import { buffColor } from '../../game/buffs/present';
import { REACTIONS } from '../../game/levels/definitions';
import { UPGRADES } from '../../game/upgrades/defs';
import { RARITY_INFO, RARITY_ORDER, TAG_INFO, upgradeColor } from '../../game/upgrades/present';
import type { Rarity } from '../../game/upgrades/types';
import {
  buffDesc,
  buffName,
  reactionDesc,
  reactionName,
  reactionRecipe,
  rarityName,
  upgradeDescribe,
  upgradeName,
  upgradeNameById,
} from '../../i18n/content';
import { rgba } from '../../ui/canvas/theme';
import type { TextMeasurer } from '../../ui/canvas/text';
import { uniformMeasurer } from '../../ui/canvas/text';
import {
  button,
  label,
  layoutWidget,
  panel,
  paragraph,
  row,
  scroll,
  spacer,
  type ScrollWidget,
  type Widget,
} from '../../ui/canvas/widgets';

export type CodexTab = 'upgrades' | 'reactions' | 'buffs' | 'rules';

export interface CodexState {
  tab: CodexTab;
  /** Upgrade ids this save has ever been offered or taken (the save's `discovered`). */
  discovered: ReadonlySet<string>;
}

export interface CodexActions {
  back(): void;
  setTab(tab: CodexTab): void;
}

const TABS: { id: CodexTab; label: string }[] = [
  { id: 'upgrades', label: t('codex.tabUpgrades') },
  { id: 'reactions', label: t('codex.tabReactions') },
  { id: 'buffs', label: t('codex.tabBuffs') },
  { id: 'rules', label: t('codex.tabRules') },
];

export function codexTree(
  state: CodexState,
  actions: CodexActions,
  width: number,
  height: number,
  m: TextMeasurer = uniformMeasurer(1),
): Widget {
  const pad = Math.max(16, Math.min(26, width * 0.045));

  const children: Widget[] = [
    label('CODEX', { size: 11, color: 'accent', weight: '700', alpha: 0.85 }),
    label(t('codex.title'), { size: 26, weight: '900' }),
    label(progressLine(state), { size: 12, color: 'inkDim' }),
    spacer(6),
    row(
      TABS.map((tab) =>
        button(tab.label, () => actions.setTab(tab.id), {
          variant: state.tab === tab.id ? 'primary' : 'ghost',
          size: 13,
          paddingH: 12,
        }),
      ),
      { gap: 8, align: 'start' },
    ),
    spacer(4),
    ...tabBody(state),
  ];

  const build = (viewportH: number): Widget =>
    panel(
      [
        scroll(panel(children, { padding: 0, gap: 7, bg: false, stroke: false }), viewportH),
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

function progressLine(state: CodexState): string {
  switch (state.tab) {
    case 'upgrades':
      return t('codex.progressUpgrades', {
        n: state.discovered.size,
        total: UPGRADES.length,
      });
    case 'reactions':
      return t('codex.progressReactions');
    case 'buffs':
      return t('codex.progressBuffs');
    default:
      return t('codex.progressRules');
  }
}

function tabBody(state: CodexState): Widget[] {
  switch (state.tab) {
    case 'upgrades':
      return upgradeGroups(state);
    case 'reactions':
      return REACTIONS.map((reaction) => {
        const tint = rgba(reaction.color, 0.9);
        return panel(
          [
            entryHead(reactionName(reaction), reaction.en, null, tint),
            paragraph(reactionRecipe(reaction), { size: 12, colorOverride: tint }),
            paragraph(reactionDesc(reaction), { size: 13, color: 'inkDim' }),
          ],
          { padding: 12, gap: 3, bg: false, stroke: false },
        );
      });
    case 'buffs':
      return [
        label(`POWER-UPS · ${t('codex.tabBuffs')} × ${BUFFS.length}`, {
          size: 14,
          color: 'accent',
          weight: '700',
        }),
        ...BUFFS.map((def) => {
          const tint = rgba(buffColor(def.id), 0.9);
          return panel(
            [
              entryHead(
                buffName(def),
                def.code,
                def.duration > 0 ? t('codex.buffTimed', { n: def.duration }) : t('codex.buffInstant'),
                tint,
              ),
              paragraph(buffDesc(def), { size: 13, color: 'inkDim' }),
            ],
            { padding: 12, gap: 3, bg: false, stroke: false },
          );
        }),
      ];
    default:
      return rulesBody();
  }
}

/** Upgrades grouped by rarity, legendary side first — the DOM order. */
function upgradeGroups(state: CodexState): Widget[] {
  const groups: Widget[] = [];
  for (const rarity of [...RARITY_ORDER].reverse()) {
    const defs = UPGRADES.filter((def) => def.rarity === rarity);
    if (defs.length === 0) continue;
    const info = RARITY_INFO[rarity as Rarity];
    const tint = rgba(info.color, 0.9);
    groups.push(
      label(`${info.en} · ${rarityName(rarity)} × ${defs.length}`, {
        size: 14,
        colorOverride: tint,
        weight: '700',
      }),
    );
    for (const def of defs) {
      const color = upgradeColor(def.tags, def.rarity);
      const requires = def.requires
        ? Object.entries(def.requires)
            .map(([id, min]) => `${upgradeNameById(id) ?? id} Lv${min}`)
            .join('、')
        : '';
      groups.push(
        panel(
          [
            entryHead(
              upgradeName(def),
              def.code,
              def.maxLevel > 1 ? t('codex.maxLevel', { n: def.maxLevel }) : t('codex.unique'),
              tint,
              state.discovered.has(def.id) ? null : t('codex.undiscovered'),
            ),
            // `upgradeDescribe` is HTML for the DOM cards; the canvas draws plain text.
            paragraph(upgradeDescribe(def, 1).replace(/<[^>]+>/g, ''), { size: 13, color: 'inkDim' }),
            ...(requires
              ? [paragraph(t('codex.requires', { list: requires }), { size: 11, color: 'inkFaint' })]
              : []),
            label(def.tags.map((tag) => TAG_INFO[tag]?.name ?? tag).join(' · '), {
              size: 11,
              colorOverride: rgba(color, 0.85),
            }),
          ],
          { padding: 12, gap: 3, bg: false, stroke: false },
        ),
      );
    }
  }
  return groups;
}

/** Name headline + code + level note (+ optional undiscovered mark), tinted by the row colour. */
function entryHead(
  name: string,
  code: string,
  levelNote: string | null,
  tint: string,
  extra: string | null = null,
): Widget {
  const notes = [levelNote, extra].filter((note): note is string => note !== null);
  return row(
    [
      label(name, { size: 16, weight: '700', colorOverride: tint }),
      label(code, { size: 11, color: 'inkFaint' }),
      ...(notes.length > 0
        ? [label(notes.join(' · '), { size: 11, color: 'inkFaint', align: 'right' })]
        : []),
    ],
    { gap: 10, align: 'start' },
  );
}

/** The how-to-play rules: heading + body pairs, straight from the shared i18n keys. */
function rulesBody(): Widget[] {
  const sections: [string, string][] = [
    [t('codex.ruleTarget'), t('codex.ruleTargetBody')],
    [t('codex.ruleCatch'), t('codex.ruleCatchBody')],
    [t('codex.ruleBullets'), t('codex.ruleBulletsBody')],
    [t('codex.ruleOverdrive'), t('codex.ruleOverdriveBody')],
    [t('codex.ruleBuild'), t('codex.ruleBuildBody', { n: UPGRADES.length })],
    [t('codex.ruleBuffs'), t('codex.ruleBuffsBody')],
    [t('codex.ruleCrystals'), t('codex.ruleCrystalsBody')],
  ];
  return sections.map(([heading, body]) =>
    panel(
      [
        label(heading, { size: 15, color: 'accent', weight: '700' }),
        // The rule bodies carry <b>/<em> for the DOM; the canvas draws plain text.
        paragraph(body.replace(/<[^>]+>/g, ''), { size: 13, color: 'inkDim', lineHeight: 1.5 }),
      ],
      { padding: 12, gap: 4, bg: false, stroke: false },
    ),
  );
}

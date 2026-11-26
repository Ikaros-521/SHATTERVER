/**
 * The settings screen: rows, volume steps, toggle and language dispatch — the persistence itself
 * lives in the shell and is exercised there.
 */
import { describe, expect, it } from 'vitest';
import { defaultSave, type SaveData } from '../src/core/storage';
import { volumeStep } from '../src/wechat/screens/settings';
import { settingsTree, type SettingsActions } from '../src/wechat/screens/settings';
import { uniformMeasurer } from '../src/ui/canvas/text';
import { layoutWidget, type ButtonWidget, type Widget } from '../src/ui/canvas/widgets';

const m = uniformMeasurer(0.5);

function harness(save: SaveData = defaultSave()): {
  save: SaveData;
  acts: SettingsActions;
  patches: Partial<SaveData['settings']>[];
  langs: string[];
  tree: Widget;
  buttons(): ButtonWidget[];
} {
  const patches: Partial<SaveData['settings']>[] = [];
  const langs: string[] = [];
  const acts: SettingsActions = {
    back(): void {},
    update: (patch) => {
      patches.push(patch);
      Object.assign(save.settings, patch);
    },
    setLanguage: (lang) => {
      langs.push(lang);
      save.settings.language = lang;
    },
  };
  const tree = settingsTree(save, acts, 400, 800, m);
  const buttons = (): ButtonWidget[] => {
    const found: ButtonWidget[] = [];
    const walk = (w: Widget): void => {
      if (w.kind === 'button') found.push(w);
      if (w.kind === 'panel' || w.kind === 'row') w.children.forEach(walk);
      if (w.kind === 'scroll') walk(w.child);
    };
    walk(tree);
    return found;
  };
  return { save, acts, patches, langs, tree, buttons };
}

describe('volumeStep', () => {
  it('snaps to the nearest of the five steps', () => {
    expect(volumeStep(0)).toBe(0);
    expect(volumeStep(0.55)).toBe(2); // nearest 0.5
    expect(volumeStep(0.9)).toBe(4);
    expect(volumeStep(1)).toBe(4);
  });
});

describe('settingsTree', () => {
  it('shows the five volume steps with the current one highlighted', () => {
    const save = defaultSave();
    save.settings.music = 0.55; // sits on the 50 step
    const { buttons } = harness(save);
    // Both volume rows render these labels; the music row is the first five in order.
    const musicRow = buttons()
      .filter((b) => ['0', '25', '50', '75', '100'].includes(b.text))
      .slice(0, 5);
    expect(musicRow).toHaveLength(5);
    const active = musicRow.find((b) => b.variant === 'primary');
    expect(active?.text).toBe('50');
  });

  it('dispatches a volume tap as a settings patch', () => {
    const { buttons, patches } = harness();
    // Ambiguity between the music and sfx rows: tap the last '75' (sfx row renders after music).
    const all = buttons().filter((b) => b.text === '75');
    all[all.length - 1]?.onTap();
    expect(all.length).toBeGreaterThanOrEqual(2);
    expect(patches[patches.length - 1]).toEqual({ sfx: 0.75 });
  });

  it('toggles are ON/OFF in the arcade capital convention, dispatching the flip', () => {
    const save = defaultSave();
    save.settings.shake = true;
    const { buttons, patches } = harness(save);
    const shake = buttons().find((b) => b.text === 'ON');
    expect(shake).toBeDefined();
    shake?.onTap();
    expect(patches[0]).toEqual({ shake: false });
    // A flipped-off save shows OFF only after the rebuild the shell performs — new tree, new tap.
    save.settings.shake = false;
    const rebuilt = harness(save);
    const off = rebuilt.buttons().find((b) => b.text === 'OFF');
    expect(off).toBeDefined();
    off?.onTap();
    expect(rebuilt.patches[0]).toEqual({ shake: true });
  });

  it('dispatches language taps', () => {
    const { langs, buttons } = harness();
    buttons()
      .filter((b) => b.text === 'EN')
      .forEach((b) => b.onTap());
    expect(langs).toContain('en');
  });

  it('lays out without overflow at phone width', () => {
    const { tree } = harness();
    const height = layoutWidget(tree, 0, 0, 400, m);
    expect(height).toBeGreaterThan(200);
    expect(tree.w).toBe(400);
  });
});

/**
 * The menu tree and the gesture root, driven together: structure, action dispatch, tap/drag
 * disambiguation and the dirty-frame contract the texture uploader will depend on.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_THEME } from '../src/ui/canvas/theme';
import { CanvasUi } from '../src/ui/canvas/root';
import { menuTree, type MenuActions } from '../src/ui/canvas/menu';
import { uniformMeasurer } from '../src/ui/canvas/text';
import type { Surface } from '../src/ui/canvas/surface';
import {
  button,
  label,
  layoutWidget,
  panel,
  scroll,
  type ButtonWidget,
  type Widget,
} from '../src/ui/canvas/widgets';

const m = uniformMeasurer(0.5);

const fired: string[] = [];
const actions: MenuActions = {
  campaign: () => fired.push('campaign'),
  endless: () => fired.push('endless'),
  shop: () => fired.push('shop'),
  tutorial: () => fired.push('tutorial'),
  codex: () => fired.push('codex'),
  history: () => fired.push('history'),
  cloud: () => fired.push('cloud'),
  settings: () => fired.push('settings'),
};

const MODEL = {
  recordsText: '闯关最深 8 · 最高分 1,254,530',
  stardustText: '星尘 420',
  wishText: '心愿:轨道打击 · 还差 60',
  badgeText: '首礼',
};

function menu(width = 400, height = 800): Widget {
  return menuTree(actions, MODEL, width, height);
}

function buttons(root: Widget, found: ButtonWidget[] = []): ButtonWidget[] {
  const walk = (w: Widget): void => {
    if (w.kind === 'button') found.push(w);
    if (w.kind === 'panel' || w.kind === 'row') w.children.forEach(walk);
    if (w.kind === 'scroll') walk(w.child);
  };
  walk(root);
  return found;
}

beforeEach(() => {
  fired.length = 0;
});

describe('menuTree', () => {
  it('builds the eight entries plus a footer, and scrolls only the list', () => {
    const root = menu();
    expect(root.kind).toBe('panel');
    const [list, , footer] = (root as { children: Widget[] }).children;
    expect(list?.kind).toBe('scroll');
    expect(footer?.kind).toBe('panel');
    const all = buttons(root);
    expect(all).toHaveLength(8);
    // The shop entry carries the badge as its trailing note; the others carry their index.
    expect(all[2]?.trailing).toBe('首礼');
    expect(all[3]?.trailing).toBe('04');
    expect(all[0]?.sub).toBe('CAMPAIGN · 15 SECTORS');
  });

  it('hides the stardust line on a brand-new player', () => {
    const root = menuTree(actions, { ...MODEL, stardustText: '', wishText: null, badgeText: null }, 400, 800);
    const footer = (root as { children: Widget[] }).children[2] as { children: Widget[] };
    expect(footer.children).toHaveLength(1); // only the records line
  });

  it('dispatches each entry to its action', () => {
    const root = menu();
    const all = buttons(root);
    all.forEach((entry) => entry.onTap());
    expect(fired).toEqual([
      'campaign',
      'endless',
      'shop',
      'tutorial',
      'codex',
      'history',
      'cloud',
      'settings',
    ]);
  });
});

/** A recording surface standing in for CanvasSurface. */
function fakeSurface(width = 400, height = 800): { surface: Surface; clears: number; paints: number } {
  let clears = 0;
  let paints = 0;
  const surface: Surface = {
    width,
    height,
    clear: () => {
      clears++;
    },
    box: () => {
      paints++;
    },
    clip: (_x, _y, _w, _h, draw) => draw(),
    text: () => {
      paints++;
    },
    measure: (str, size) => m.measure(str, size),
  };
  return {
    surface,
    get clears(): number {
      return clears;
    },
    get paints(): number {
      return paints;
    },
  };
}

describe('CanvasUi', () => {
  function make(width = 400, height = 800): { ui: CanvasUi; s: ReturnType<typeof fakeSurface> } {
    const s = fakeSurface(width, height);
    const instance = new CanvasUi({ surface: s.surface, theme: DEFAULT_THEME });
    instance.setTree(menu(width, height));
    return { ui: instance, s };
  }

  it('paints only dirty frames', () => {
    const { ui, s } = make();
    expect(ui.frame()).toBe(true); // first frame after setTree
    expect(s.clears).toBe(1);
    expect(ui.frame()).toBe(false);
    expect(ui.frame()).toBe(false);
    expect(s.clears).toBe(1);
  });

  it('fires a button on tap at its laid-out position', () => {
    const { ui } = make();
    ui.frame();
    // A freshly built tree has zero frames; lay out a twin with the same data first.
    const twin = menu();
    layoutWidget(twin, 0, 0, 400, m);
    const campaign = buttons(twin)[0];
    ui.pointerDown((campaign.x ?? 0) + 2, (campaign.y ?? 0) + 2);
    ui.pointerUp((campaign.x ?? 0) + 2, (campaign.y ?? 0) + 2);
    expect(fired).toContain('campaign');
  });

  it('scrolls a drag instead of firing the button under it', () => {
    const { ui } = make();
    ui.frame();
    const twin = menu();
    layoutWidget(twin, 0, 0, 400, m);
    const campaign = buttons(twin)[0];
    const cx = (campaign.x ?? 0) + 2;
    const cy = (campaign.y ?? 0) + 2;
    ui.pointerDown(cx, cy);
    ui.pointerMove(cx, cy - 40); // far past TAP_SLOP: a drag
    ui.pointerUp(cx, cy - 40);
    expect(fired).toHaveLength(0); // the drag ate the tap
  });

  it('ignores taps on disabled buttons', () => {
    const s = fakeSurface();
    const instance = new CanvasUi({ surface: s.surface, theme: DEFAULT_THEME });
    const disabled = button('禁用', () => fired.push('nope'), { disabled: true, size: 12, paddingH: 8 });
    const root = panel([disabled], { padding: 10, gap: 0 });
    instance.setTree(root);
    instance.frame();
    instance.pointerDown(disabled.x + 2, disabled.y + 2);
    instance.pointerUp(disabled.x + 2, disabled.y + 2);
    expect(fired).not.toContain('nope');
  });

  it('marks dirty again when a drag moves the scroll offset', () => {
    const { ui, s } = make(400, 500); // short viewport → the list overflows → scrollable
    ui.frame();
    expect(s.clears).toBe(1);
    // Drag inside the scroll region.
    ui.pointerDown(200, 200);
    ui.pointerMove(200, 140);
    ui.pointerUp(200, 140);
    expect(ui.frame()).toBe(true);
    const scroller = ((ui as unknown as { tree: Widget }).tree as { children: Widget[] }).children[0] as {
      offset: number;
    };
    expect(scroller.offset).toBeGreaterThan(0);
  });

  it('clamps the scroll offset to the content height', () => {
    const s = fakeSurface();
    const instance = new CanvasUi({ surface: s.surface, theme: DEFAULT_THEME });
    const inner = panel(
      Array.from({ length: 6 }, () => label('占位', { size: 12 })),
      { padding: 10, gap: 6 },
    );
    const sc = scroll(inner, 100);
    instance.setTree(sc);
    instance.frame();
    instance.pointerDown(50, 50);
    instance.pointerMove(50, -100000);
    instance.pointerUp(50, -100000);
    expect(sc.offset).toBe(Math.max(0, sc.contentH - 100));
  });
});

describe('button with sub and trailing', () => {
  it('grows for the caption line and the trailing note', () => {
    const b = button('开始闯关', () => undefined, {
      size: 17,
      paddingH: 16,
      sub: 'CAMPAIGN · 15 SECTORS',
      trailing: '01',
    });
    layoutWidget(b, 0, 0, 300, m);
    expect(b.h).toBeGreaterThan(44); // two lines exceed the touch floor
    expect(b.w).toBeGreaterThan(17 * 0.5 * 4 + 32); // label + padding alone would be smaller
  });
});

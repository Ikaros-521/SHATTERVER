/**
 * The canvas UI's root: gesture handling, layout scheduling and frame painting.
 *
 * One instance owns the widget tree of the current screen. Screens rebuild their tree whenever
 * their data changes and hand it to {@link setTree}; the root lays it out, tracks whether
 * anything changed, and paints only dirty frames — the contract the texture uploader will rely
 * on (a clean frame needs no upload).
 *
 * Gestures distinguish taps from scroll drags by a small slop: a press that moves less than
 * {@link TAP_SLOP} px and lands on the same button fires it; anything wider becomes a scroll
 * gesture on the scroll region under the point.
 */

import { DEFAULT_THEME } from './theme';
import { rgba } from './theme';
import type { Surface } from './surface';
import type { Theme } from './theme';
import { drawWidget, hitTest, layoutWidget } from './widgets';
import type { ButtonWidget, ScrollWidget, Widget } from './widgets';

/** Movement past this many px turns a press into a drag. */
const TAP_SLOP = 6;

export interface CanvasUiDeps {
  surface: Surface;
  theme?: Theme;
  /** Px of top inset (notch / status bar); every tree lays out below it. */
  topInset?: number;
}

export class CanvasUi {
  private readonly surface: Surface;
  private readonly theme: Theme;
  private readonly topInset: number;
  private tree: Widget | null = null;
  private dirty = false;

  // Gesture state; meaningless between pointer-down/up pairs.
  private downX = 0;
  private downY = 0;
  private tracking = false;
  private dragging = false;
  private pressed: ButtonWidget | null = null;
  /** What the last `pointerDown` hit, for `__shell`-style automation probes. */
  lastProbe: { x: number; y: number; hit: string | null } | null = null;
  private scroller: ScrollWidget | null = null;
  private scrollStartOffset = 0;

  constructor(deps: CanvasUiDeps) {
    this.surface = deps.surface;
    this.theme = deps.theme ?? DEFAULT_THEME;
    this.topInset = Math.max(0, deps.topInset ?? 0);
  }

  /** Installs a rebuilt tree and lays it out across the surface's width. */
  setTree(tree: Widget): void {
    this.tree = tree;
    this.relayout();
  }

  /** The surface was resized (or the tree's data changed in a layout-visible way). */
  relayout(): void {
    if (this.tree) layoutWidget(this.tree, 0, this.topInset, this.surface.width, this.surface);
    this.dirty = true;
  }

  /** Forces the next frame to paint even if nothing else changed. */
  markDirty(): void {
    this.dirty = true;
  }

  /** Paints the frame when something changed; answers whether it drew. */
  frame(): boolean {
    if (!this.tree || !this.dirty) return false;
    this.surface.clear(rgba(this.theme.colors.bg, 1));
    drawWidget(this.tree, this.surface, this.theme);
    this.dirty = false;
    return true;
  }

  /** True when the last pointer sequence ended as a tap (kept for tests and telemetry). */
  get isTracking(): boolean {
    return this.tracking;
  }

  pointerDown(x: number, y: number): void {
    this.tracking = true;
    this.dragging = false;
    this.downX = x;
    this.downY = y;
    this.pressed = null;
    this.scroller = null;
    this.scrollStartOffset = 0;
    if (!this.tree) return;
    const hit = hitTest(this.tree, x, y);
    // Automation probe (the shell's `__shell.ui` reads it): what this press actually landed on.
    const target = hit as { kind: string; text?: string } | null;
    this.lastProbe = { x, y, hit: target ? `${target.kind}${target.text ? `:${target.text}` : ''}` : null };
    if (hit?.kind === 'button' && !hit.disabled) this.pressed = hit;
    // The deepest scroll region containing the point owns the drag, if it turns into one.
    const scrolls: ScrollWidget[] = [];
    this.forEachUnder(x, y, (widget) => {
      if (widget.kind === 'scroll') scrolls.push(widget);
    });
    const scroller = scrolls[scrolls.length - 1] ?? null;
    if (scroller) {
      this.scroller = scroller;
      this.scrollStartOffset = scroller.offset;
    }
  }

  pointerMove(x: number, y: number): void {
    if (!this.tracking) return;
    if (!this.dragging && Math.hypot(x - this.downX, y - this.downY) > TAP_SLOP) {
      this.dragging = true;
      this.pressed = null; // a drag never becomes a tap
    }
    if (this.dragging && this.scroller) {
      const max = Math.max(0, this.scroller.contentH - this.scroller.viewportH);
      const next = Math.min(max, Math.max(0, this.scrollStartOffset + (this.downY - y)));
      if (next !== this.scroller.offset) {
        this.scroller.offset = next;
        this.relayout();
      }
    }
  }

  pointerUp(x: number, y: number): void {
    const pressed = this.pressed;
    const wasDrag = this.dragging;
    this.tracking = false;
    this.dragging = false;
    this.pressed = null;
    this.scroller = null;
    if (!wasDrag && pressed && hitTest(this.tree as Widget, x, y) === pressed) pressed.onTap();
  }

  /** Visits every widget whose frame contains the point, outermost first. */
  private forEachUnder(x: number, y: number, visit: (widget: Widget) => void): void {
    const walk = (widget: Widget): void => {
      if (x < widget.x || x >= widget.x + widget.w || y < widget.y || y >= widget.y + widget.h) return;
      visit(widget);
      if (widget.kind === 'panel' || widget.kind === 'row') {
        for (const child of widget.children) walk(child);
      } else if (widget.kind === 'scroll') {
        walk(widget.child);
      }
    };
    if (this.tree) walk(this.tree);
  }
}

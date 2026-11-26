/**
 * The game world binding for the WeChat shell.
 *
 * The slice of `app.ts` that makes a run actually play: one `Session`, one `Renderer` on the
 * shared screen canvas, effects, the pointer→paddle mapping and the run lifecycle (drafts and
 * the finish timer). Everything the DOM App routes through its UI — banners, HUD frames, the
 * pause screen — is deferred here: drafts are auto-picked after a short beat (logged), and a
 * finished run reports once through {@link WorldCallbacks.onFinish} so the shell can return to
 * the menu. The real canvas screens replace these shims as they are ported.
 *
 * The shell owns the rAF; each {@link frame} call advances the simulation and renders the world
 * full-screen beneath where the UI texture would composite.
 */

import { clamp } from '../core/math';
import { randomSeed } from '../core/rng';
import type { SaveData } from '../core/storage';
import { ARENA_W } from '../game/config';
import { CHAPTERS } from '../game/levels/definitions';
import { difficultyOf, type DifficultyId } from '../game/difficulty';
import { Session } from '../game/session';
import type { Starter } from '../game/starters';
import type { RunMode } from '../game/run';
import type { UpgradeDef } from '../game/upgrades/types';
import { Fx, particleCapacity } from '../render/fx';
import { computeLayout, type Layout } from '../render/layout';
import { Renderer } from '../render/renderer';
import { drawScene, type SceneInfo } from '../render/scene';

export interface WorldCallbacks {
  /** The run is over (timer after the final phase); the shell should show the menu again. */
  onFinish(): void;
  /** A draft came up; `choose` picks the option the shell decided on. */
  onDraft(options: UpgradeDef[], choose: (id: string) => void): void;
}

const AUTO_DRAFT_DELAY = 0.6;
const FINISH_DELAY = 1.1;

export class WorldBinding {
  readonly session: Session;
  private readonly fx: Fx;
  private readonly renderer: Renderer;
  private layout: Layout;
  /** Filled in by `drawScene` every frame (danger/energy); the shell only owns the object. */
  private readonly info: SceneInfo = { danger: 0, energy: 0 };
  private resultsTimer = -1;
  private draftTimer = -1;
  private draftChoices: UpgradeDef[] = [];
  private finished = false;
  /** Unlisten hooks for the session/world wires, dropped on dispose. */
  private readonly wires: (() => void)[] = [];

  constructor(
    canvas: HTMLCanvasElement,
    save: SaveData,
    mode: RunMode,
    starter: Starter,
    difficultyId: DifficultyId,
    width: number,
    height: number,
    dpr: number,
    private readonly cb: WorldCallbacks,
  ) {
    this.session = new Session(mode, randomSeed(), {
      starter,
      difficulty: difficultyOf(difficultyId),
      supplies: save.economy.loadout,
    });
    const settings = save.settings;
    this.fx = new Fx(particleCapacity('high'), {
      shake: settings.shake,
      flashes: settings.flashes,
      quality: 'high',
    });
    this.layout = computeLayout(width, height, 'high', dpr, 1);
    this.renderer = new Renderer(canvas, { surfaces: 16384, lights: 46000, glyphs: 4096 });

    this.wires.push(
      this.fx.attach(this.session.world),
      this.session.events.on('draft', (info) => {
        this.draftChoices = info.options;
        this.draftTimer = AUTO_DRAFT_DELAY;
        this.cb.onDraft(info.options, (id) => this.session.choose(id));
      }),
      this.session.events.on('phase', ({ phase }) => {
        if (phase === 'over' || phase === 'won') this.resultsTimer = FINISH_DELAY;
      }),
    );
    this.session.start();
  }

  /** Advances the simulation and renders one frame. `dt` in seconds, clamped by the caller. */
  frame(dt: number, timeSeconds: number): void {
    if (this.finished) return;
    if (this.draftTimer > 0) {
      this.draftTimer -= dt;
      if (this.draftTimer <= 0 && this.draftChoices.length > 0) {
        // The auto-pilot pick until the draft screen is ported: first option, logged loudly.
        const pick = this.draftChoices[0] as UpgradeDef;
        console.log('auto-draft:', pick.id);
        this.session.choose(pick.id);
        this.draftChoices = [];
      }
    }
    if (this.resultsTimer > 0) {
      this.resultsTimer -= dt;
      if (this.resultsTimer <= 0) {
        this.finished = true;
        this.cb.onFinish();
        return;
      }
    }

    const world = this.session.world;
    const timeScale = this.fx.update(dt, world);
    if (this.session.phase !== 'draft') this.session.update(dt * timeScale);

    const chapter = CHAPTERS[world.level.chapter] ?? CHAPTERS[0];
    const view = this.fx.camera.view(this.layout);
    this.fx.resolveView(view);
    this.renderer.pen.reset();
    drawScene(this.renderer.pen, world, this.fx, chapter, timeSeconds, this.info);
    this.renderer.render({
      layout: this.layout,
      time: timeSeconds,
      palette: { a: chapter.bg[0], b: chapter.bg[1], c: chapter.bg[2], accent: chapter.accent },
      view,
      post: this.fx.post,
      info: this.info,
    });
  }

  /** Maps a pointer's CSS x through the arena rect onto the paddle (same math as the DOM App). */
  pointer(clientX: number): void {
    const x = ((clientX - this.layout.ax) / (this.layout.aw / ARENA_W)) | 0;
    this.session.world.input.x = clamp(x, 0, ARENA_W);
  }

  /** Drops the pointer so an interrupted gesture cannot keep steering the paddle. */
  releasePointer(): void {
    this.session.world.input.x = null;
  }

  dispose(): void {
    for (const wire of this.wires) wire();
    this.wires.length = 0;
  }
}

/**
 * The in-run HUD for the WeChat shell, painted straight onto the 2D UI canvas.
 *
 * The DOM build has a widget per value; here one function redraws the whole overlay when — and
 * only when — its content changed: {@link hudSignature} hashes every displayed value, the shell
 * compares it per frame and repaints-plus-uploads only on a difference. Score ticks on brick
 * hits (~10 Hz), not on frames, so the texture upload stays far below the continuous rate and
 * the CJK labels ride the 2D canvas for free.
 *
 * Visible content, top to bottom: shield pips, the sector code and its clear/boss progress, the
 * crystal count, the big score, the combo readout, the build strip (one rarity-tinted tile per
 * owned upgrade), the buff chips (codename + countdown + drain bar), the overdrive prompt, and
 * the pause button.
 */

import { t } from '../core/i18n';
import { formatNumber, formatScore } from '../core/math';
import { COMBO_TIME } from '../game/config';
import { COMBO_TIERS } from '../game/levels/definitions';
import { BUFF_MAP } from '../game/buffs/defs';
import { UPGRADE_MAP } from '../game/upgrades/defs';
import { RARITY_INFO } from '../game/upgrades/present';
import { bossName, comboTierLabel, levelName } from '../i18n/content';
import { rgba } from '../ui/canvas/theme';
import type { Session } from '../game/session';
import type { Run } from '../game/run';
import type { World } from '../game/world';

/** Everything the overlay draws, hashed into one comparable string. */
export function hudSignature(session: Session, dps: number): string {
  const world = session.world;
  const run = session.run;
  const boss = world.boss && !world.boss.dead ? world.boss : null;
  const tier = world.comboTier >= 0 ? COMBO_TIERS[world.comboTier] : null;
  return [
    world.hp,
    run.maxHp,
    world.level.code,
    boss
      ? `B${boss.def.id}${boss.phase}${Math.round((boss.hp / boss.maxHp) * 60)}`
      : Math.round((1 - world.brickCount() / Math.max(1, world.brickTotal)) * 100),
    formatNumber(run.crystals),
    formatScore(run.score),
    world.combo,
    tier?.cn ?? '-',
    Math.round((world.comboTimer / COMBO_TIME) * 20),
    world.energy >= 100 && !world.odActive && world.state === 'playing' ? 'ready' : '-',
    Math.round(dps),
    // The build strip (per owned upgrade) and the buff chips (per second of countdown).
    Object.entries(run.upgrades)
      .filter(([, lv]) => (lv ?? 0) > 0)
      .map(([id, lv]) => `${id}${lv}`)
      .join(','),
    world.buffs.map((buff) => `${buff.id}${Math.ceil(buff.t)}`).join(','),
  ].join('|');
}

/** The pause button's hit rectangle, in the overlay's CSS px space. */
export function pauseButtonRect(width: number): { x: number; y: number; w: number; h: number } {
  return { x: width - 56, y: 10, w: 46, h: 46 };
}

/**
 * Repaints the whole overlay (transparent background — the world shows through). Call when
 * {@link hudSignature} changed.
 */
export function drawHud(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  session: Session,
  dps: number,
  font: string,
): void {
  const world = session.world;
  const run = session.run;
  ctx.clearRect(0, 0, width, height);
  ctx.textBaseline = 'top';
  ctx.lineJoin = 'round';

  // ── top glass strip ──
  ctx.fillStyle = 'rgba(9, 13, 30, 0.82)';
  ctx.fillRect(0, 0, width, 96);

  // Shield pips.
  const pipW = 16;
  const pipGap = 5;
  for (let i = 0; i < run.maxHp; i++) {
    ctx.beginPath();
    ctx.arc(16 + pipW / 2 + i * (pipW + pipGap), 22, pipW / 2, 0, Math.PI * 2);
    if (i < world.hp) {
      ctx.fillStyle = world.hp <= 1 ? '#ff3d5a' : '#27e0ff';
      ctx.fill();
    } else {
      ctx.strokeStyle = 'rgba(39, 224, 255, 0.35)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  // Crystals on the right of row one.
  ctx.font = `700 15px ${font}`;
  ctx.textAlign = 'right';
  ctx.fillStyle = '#ffd24a';
  ctx.fillText(`◆ ${formatNumber(run.crystals)}`, width - 62, 14);
  drawPauseButton(ctx, width, font);

  // Row two: sector code + name, and the clear/boss progress line under them.
  const boss = world.boss && !world.boss.dead ? world.boss : null;
  ctx.textAlign = 'left';
  ctx.font = `700 14px ${font}`;
  ctx.fillStyle = '#eaf2ff';
  if (boss) {
    ctx.fillText(boss.def.id.toUpperCase(), 16, 44);
    ctx.font = `400 12px ${font}`;
    ctx.fillStyle = '#9fb0cf';
    ctx.fillText(bossName(boss.def), 16, 62);
    ctx.fillStyle = boss.enraged ? '#ff3d5a' : '#ffd24a';
    ctx.fillText(boss.enraged ? t('hud.enraged') : t('hud.phase', { n: boss.phase }), 110, 62);
  } else {
    ctx.fillText(world.level.code, 16, 44);
    ctx.font = `400 12px ${font}`;
    ctx.fillStyle = '#9fb0cf';
    ctx.fillText(levelName(world.level.chapter, world.level.name), 50, 46);
  }
  // Progress: brick clearance, or the boss's remaining health in the same slot.
  const progress = boss ? boss.hp / boss.maxHp : 1 - world.brickCount() / Math.max(1, world.brickTotal);
  ctx.fillStyle = 'rgba(39, 224, 255, 0.18)';
  ctx.fillRect(16, 78, width - 32, 6);
  ctx.fillStyle = boss ? '#ff9f2e' : '#27e0ff';
  ctx.fillRect(16, 78, (width - 32) * Math.max(0, Math.min(1, progress)), 6);

  // ── score + combo band ──
  ctx.font = `900 34px ${font}`;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#eaf2ff';
  ctx.fillText(formatScore(run.score), 16, 108);
  ctx.font = `400 12px ${font}`;
  ctx.fillStyle = '#66779c';
  ctx.fillText(`DPS ${formatNumber(dps)}`, 18, 148);

  const tier = world.comboTier >= 0 ? COMBO_TIERS[world.comboTier] : null;
  if (world.combo > 0) {
    const tierColor = tier ? `#${tier.color.toString(16).padStart(6, '0')}` : '#eaf2ff';
    ctx.textAlign = 'right';
    ctx.font = `900 26px ${font}`;
    ctx.fillStyle = tierColor;
    ctx.fillText(`×${world.combo}`, width - 16, 106);
    if (tier) {
      ctx.font = `700 12px ${font}`;
      ctx.fillText(`${tier.cn} · ${comboTierLabel(world.comboTier)}`, width - 16, 140);
    }
    // Combo decay bar, draining towards the next-tier window closing.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.fillRect(width - 136, 158, 120, 4);
    ctx.fillStyle = tierColor;
    ctx.fillRect(width - 136, 158, 120 * Math.max(0, Math.min(1, world.comboTimer / COMBO_TIME)), 4);
  }

  // ── build strip + buff chips (below the score, wrapping left to right) ──
  const chipsY = drawBuildStrip(ctx, width, run, font);
  drawBuffChips(ctx, width, world, chipsY, font);

  // ── overdrive prompt ──
  const ready = world.energy >= 100 && !world.odActive && world.state === 'playing';
  if (ready) {
    ctx.font = `700 15px ${font}`;
    ctx.textAlign = 'center';
    const text = t('hud.odReady');
    const w = ctx.measureText(text).width + 36;
    const x = width / 2 - w / 2;
    const y = height - 96;
    ctx.fillStyle = 'rgba(39, 224, 255, 0.2)';
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, 44, 22);
    else ctx.rect(x, y, w, 44);
    ctx.fill();
    ctx.strokeStyle = 'rgba(39, 224, 255, 0.9)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#eaf2ff';
    ctx.fillText(text, width / 2, y + 13);
  }
}

function drawPauseButton(ctx: CanvasRenderingContext2D, width: number, font: string): void {
  ctx.save();
  ctx.fillStyle = 'rgba(9, 13, 30, 0.82)';
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(width - 56, 10, 46, 46, 12);
  else ctx.rect(width - 56, 10, 46, 46);
  ctx.fill();
  ctx.strokeStyle = 'rgba(39, 224, 255, 0.5)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#eaf2ff';
  ctx.fillRect(width - 40, 24, 5, 18);
  ctx.fillRect(width - 30, 24, 5, 18);
  ctx.restore();
  void font;
}

const CHIP_H = 22;
const CHIP_STEP = 28;
const STRIP_X = 16;

/**
 * One rarity-tinted tile per owned upgrade — the canvas answer to the DOM build panel's icon
 * row. Tiles wrap like the DOM panel does; returns the y the next strip starts at.
 */
function drawBuildStrip(
  ctx: CanvasRenderingContext2D,
  width: number,
  run: Run,
  font: string,
): number {
  const owned = Object.entries(run.upgrades).filter(([, lv]) => (lv ?? 0) > 0);
  let x = STRIP_X;
  let y = 168;
  ctx.textAlign = 'left';
  if (owned.length === 0) {
    ctx.font = `400 11px ${font}`;
    ctx.fillStyle = 'rgba(102, 119, 156, 0.6)';
    ctx.fillText(t('hud.buildEmpty'), x, y + 5);
    return y + CHIP_STEP;
  }
  for (const [id, lv] of owned) {
    const def = UPGRADE_MAP[id];
    if (!def) continue;
    const tint = rgba(RARITY_INFO[def.rarity].color, 1);
    const code = (def.code || id).slice(0, 3);
    ctx.font = `700 10px ${font}`;
    const codeW = ctx.measureText(code).width;
    const levelText = (lv ?? 1) > 1 ? `×${lv}` : '';
    ctx.font = `700 9px ${font}`;
    const levelW = levelText ? ctx.measureText(levelText).width : 0;
    const w = 10 + codeW + (levelText ? 6 + levelW : 0) + 10;
    if (x + w > width - STRIP_X) {
      x = STRIP_X;
      y += CHIP_STEP;
    }
    drawChip(ctx, x, y, w, tint);
    ctx.fillStyle = '#eaf2ff';
    ctx.font = `700 10px ${font}`;
    ctx.fillText(code, x + 10, y + 6);
    if (levelText) {
      ctx.fillStyle = '#ffd24a';
      ctx.fillText(levelText, x + 10 + codeW + 6, y + 7);
    }
    x += w + 6;
  }
  return y + CHIP_STEP;
}

/** One chip per running temporary buff: codename, countdown in seconds, and a drain bar. */
function drawBuffChips(
  ctx: CanvasRenderingContext2D,
  width: number,
  world: World,
  y: number,
  font: string,
): void {
  let x = STRIP_X;
  ctx.textAlign = 'left';
  for (const buff of world.buffs) {
    const def = BUFF_MAP[buff.id];
    if (!def) continue;
    const tint = rgba(def.color, 1);
    const text = `${def.code} ${Math.ceil(buff.t)}`;
    ctx.font = `700 10px ${font}`;
    const w = 10 + ctx.measureText(text).width + 10;
    if (x + w > width - STRIP_X) {
      x = STRIP_X;
      y += CHIP_STEP;
    }
    drawChip(ctx, x, y, w, tint);
    ctx.fillStyle = '#eaf2ff';
    ctx.fillText(text, x + 10, y + 6);
    const frac = Math.max(0, Math.min(1, buff.t / Math.max(0.001, buff.max)));
    ctx.fillStyle = tint;
    ctx.fillRect(x + 1, y + CHIP_H - 3, (w - 2) * frac, 2);
    x += w + 6;
  }
}

/** Shared chip backing: dark glass with a tinted stroke, so tiles read over the world. */
function drawChip(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  tint: string,
): void {
  ctx.fillStyle = 'rgba(9, 13, 30, 0.72)';
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, CHIP_H, 7);
  else ctx.rect(x, y, w, CHIP_H);
  ctx.fill();
  ctx.strokeStyle = tint;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

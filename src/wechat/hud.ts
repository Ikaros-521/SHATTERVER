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
 * crystal count, the big score, the combo readout, the overdrive prompt, and the pause button.
 * The build/buff/stat panels are a later slice.
 */

import { t } from '../core/i18n';
import { formatNumber, formatScore } from '../core/math';
import { COMBO_TIME } from '../game/config';
import { COMBO_TIERS } from '../game/levels/definitions';
import { bossName, comboTierLabel, levelName } from '../i18n/content';
import type { Session } from '../game/session';

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

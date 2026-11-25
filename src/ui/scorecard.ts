import { cssHex, formatNumber, formatScore, formatTime } from '../core/math';
import type { RunMode } from '../game/run';
import { sigil } from './sigil';

/**
 * The shareable score card: a composed PNG of the run's final frame plus its numbers.
 *
 * Pure Canvas 2D — the live WebGL frame is passed in as a data URL (it must be captured in the
 * same task that rendered it), everything else is drawn from the run record. The look follows
 * the UI's language: clipped corners, letter-spaced eyebrows, one accent colour.
 */

const W = 1080;
const H = 1440;
const M = 64; // outer margin
const FONT =
  '"Bahnschrift", "DIN Alternate", "Segoe UI", "PingFang SC", "Microsoft YaHei UI", "Noto Sans SC", system-ui, sans-serif';

export interface BuildIcon {
  id: string;
  level: number;
  color: number;
  rarityColor: number;
}

export interface ScorecardData {
  won: boolean;
  mode: RunMode;
  /** Display code of the sector the run ended on, e.g. "2-3". */
  code: string;
  name: string;
  score: number;
  newRecord: boolean;
  /** 1-based score rank among this mode's stored runs. */
  rank: number;
  total: number;
  level: number;
  combo: number;
  damage: number;
  kills: number;
  time: number;
  date: number;
  seed: number;
  /** Chapter accent, drives the card's neon. */
  accent: number;
  build: BuildIcon[];
}

type Ctx2D = CanvasRenderingContext2D & { letterSpacing?: string };

function rgba(hex: number, alpha: number): string {
  const r = (hex >> 16) & 255;
  const g = (hex >> 8) & 255;
  const b = hex & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Clipped-corner rectangle, matching the UI's glass panels. */
function cutRect(ctx: Ctx2D, x: number, y: number, w: number, h: number, cut: number): void {
  ctx.beginPath();
  ctx.moveTo(x + cut, y);
  ctx.lineTo(x + w - cut, y);
  ctx.lineTo(x + w, y + cut);
  ctx.lineTo(x + w, y + h - cut);
  ctx.lineTo(x + w - cut, y + h);
  ctx.lineTo(x + cut, y + h);
  ctx.lineTo(x, y + h - cut);
  ctx.lineTo(x, y + cut);
  ctx.closePath();
}

/** Letter-spaced text, centred or aligned; falls back gracefully where the API is missing. */
function text(
  ctx: Ctx2D,
  str: string,
  x: number,
  y: number,
  options: {
    size: number;
    weight?: number;
    fill: string;
    align?: CanvasTextAlign;
    spacing?: number;
    glow?: string;
    glowBlur?: number;
  },
): void {
  ctx.font = `${options.weight ?? 400} ${options.size}px ${FONT}`;
  ctx.textAlign = options.align ?? 'left';
  ctx.textBaseline = 'alphabetic';
  if (options.spacing !== undefined) ctx.letterSpacing = `${options.spacing}px`;
  if (options.glow) {
    ctx.shadowColor = options.glow;
    ctx.shadowBlur = options.glowBlur ?? 24;
  }
  ctx.fillStyle = options.fill;
  ctx.fillText(str, x, y);
  ctx.shadowBlur = 0;
  if (options.spacing !== undefined) ctx.letterSpacing = '0px';
}

/** Loads an image, giving up after a moment rather than stalling the download forever. */
function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    const done = (value: HTMLImageElement | null): void => resolve(value);
    const timer = window.setTimeout(() => done(null), 1500);
    image.onload = () => {
      window.clearTimeout(timer);
      done(image);
    };
    image.onerror = () => {
      window.clearTimeout(timer);
      done(null);
    };
    image.src = url;
  });
}

/** Draws `source` across the card, cropping like CSS `background-size: cover`. */
function drawCover(ctx: Ctx2D, source: HTMLImageElement, darken: number): void {
  const scale = Math.max(W / source.width, H / source.height);
  const w = source.width * scale;
  const h = source.height * scale;
  ctx.save();
  ctx.filter = 'saturate(1.15)';
  ctx.drawImage(source, (W - w) / 2, (H - h) / 2, w, h);
  ctx.restore();
  ctx.fillStyle = `rgba(5,6,15,${darken})`;
  ctx.fillRect(0, 0, W, H);
}

function drawFallbackBackground(ctx: Ctx2D, accent: number): void {
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#080a1c');
  sky.addColorStop(0.55, '#05060f');
  sky.addColorStop(1, '#0a0d24');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  const halo = ctx.createRadialGradient(W / 2, H * 0.34, 40, W / 2, H * 0.34, 620);
  halo.addColorStop(0, rgba(accent, 0.16));
  halo.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, W, H);
}

function drawChrome(ctx: Ctx2D, accent: number, date: number, mode: RunMode): void {
  // Deepening veil: readable text over the game frame without hiding it.
  const veil = ctx.createLinearGradient(0, 0, 0, H);
  veil.addColorStop(0, 'rgba(5,6,15,0.42)');
  veil.addColorStop(0.42, 'rgba(5,6,15,0.72)');
  veil.addColorStop(1, 'rgba(5,6,15,0.94)');
  ctx.fillStyle = veil;
  ctx.fillRect(0, 0, W, H);

  // Neon frame with clipped corners.
  cutRect(ctx, 24, 24, W - 48, H - 48, 20);
  ctx.shadowColor = rgba(accent, 0.55);
  ctx.shadowBlur = 26;
  ctx.strokeStyle = rgba(accent, 0.85);
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.shadowBlur = 0;
  cutRect(ctx, 32, 32, W - 64, H - 64, 16);
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Header.
  text(ctx, 'RUN REPORT · 战绩报告', M, 128, {
    size: 21,
    weight: 700,
    fill: 'rgba(234,242,255,0.55)',
    spacing: 7,
  });
  text(ctx, '碎界', M, 226, {
    size: 82,
    weight: 900,
    fill: '#f2f7ff',
    glow: rgba(accent, 0.7),
    glowBlur: 34,
  });
  text(ctx, 'SHATTERVERSE', M + 216, 222, { size: 24, weight: 700, fill: cssHex(accent), spacing: 12 });

  const stamp = new Date(date);
  const pad = (value: number): string => String(value).padStart(2, '0');
  text(
    ctx,
    `${stamp.getFullYear()}.${pad(stamp.getMonth() + 1)}.${pad(stamp.getDate())} ${pad(stamp.getHours())}:${pad(stamp.getMinutes())}`,
    W - M,
    200,
    { size: 22, weight: 600, fill: 'rgba(234,242,255,0.6)', align: 'right', spacing: 3 },
  );
  text(ctx, mode === 'campaign' ? 'CAMPAIGN · 闯关模式' : 'ENDLESS · 无尽模式', W - M, 238, {
    size: 17,
    weight: 700,
    fill: 'rgba(234,242,255,0.4)',
    align: 'right',
    spacing: 4,
  });

  // Divider: faint rule with a short accent spark.
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(M, 268, W - 2 * M, 1);
  ctx.fillStyle = cssHex(accent);
  ctx.fillRect(M, 267, 140, 3);
}

function drawScore(ctx: Ctx2D, data: ScorecardData): void {
  const { accent } = data;
  text(ctx, '最终得分 · FINAL SCORE', M, 360, {
    size: 21,
    weight: 700,
    fill: 'rgba(234,242,255,0.5)',
    spacing: 7,
  });
  text(ctx, formatScore(data.score), M, 502, {
    size: 124,
    weight: 800,
    fill: '#f4f8ff',
    spacing: 2,
    glow: rgba(accent, 0.85),
    glowBlur: 46,
  });

  // Record badge, or the rank the run landed at.
  const label = data.newRecord ? '新纪录 NEW RECORD' : `历史第 ${data.rank} 名 · RANK #${data.rank}`;
  const color = data.newRecord ? 0xffd24a : accent;
  ctx.font = `700 21px ${FONT}`;
  const width = ctx.measureText(label).width + 48;
  const y = 544;
  cutRect(ctx, M, y, width, 44, 10);
  ctx.fillStyle = rgba(color, 0.14);
  ctx.fill();
  ctx.strokeStyle = rgba(color, 0.9);
  ctx.lineWidth = 1.5;
  ctx.stroke();
  text(ctx, label, M + 24, y + 30, { size: 21, weight: 800, fill: cssHex(color), spacing: 3 });
  if (data.total > 1 && !data.newRecord) {
    text(ctx, `本地 ${data.total} 局`, M + width + 18, y + 30, {
      size: 19,
      weight: 600,
      fill: 'rgba(234,242,255,0.45)',
      spacing: 2,
    });
  }

  const where = data.won ? '通关全部扇区' : `止步 ${data.code} ${data.name}`.trim();
  text(ctx, `${data.mode === 'campaign' ? '闯关模式' : '无尽模式'} · ${where} · SEED ${data.seed}`, M, 656, {
    size: 25,
    weight: 500,
    fill: 'rgba(234,242,255,0.62)',
    spacing: 2,
  });
}

function drawTiles(ctx: Ctx2D, data: ScorecardData): void {
  const tiles: [string, string][] = [
    ['抵达关卡', data.mode === 'campaign' ? data.code : `第 ${data.level} 关`],
    ['总伤害', formatNumber(data.damage)],
    ['最高连击', formatNumber(data.combo)],
    ['击碎砖块', formatNumber(data.kills)],
    ['存活时间', formatTime(data.time)],
    ['历史排名', data.total > 0 ? `第 ${data.rank} / ${data.total} 局` : '首次出击'],
  ];
  const tileW = (W - 2 * M - 2 * 24) / 3;
  const tileH = 118;
  tiles.forEach(([label, value], i) => {
    const x = M + (i % 3) * (tileW + 24);
    const y = 712 + Math.floor(i / 3) * (tileH + 22);
    cutRect(ctx, x, y, tileW, tileH, 12);
    ctx.fillStyle = 'rgba(255,255,255,0.045)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();
    text(ctx, label, x + 22, y + 40, { size: 17, weight: 700, fill: 'rgba(234,242,255,0.42)', spacing: 5 });
    text(ctx, value, x + 22, y + 90, { size: 34, weight: 800, fill: '#eaf2ff', spacing: 1 });
  });
}

async function drawBuild(ctx: Ctx2D, data: ScorecardData): Promise<void> {
  const y = 1054;
  text(ctx, 'FINAL BUILD · 最终构筑', M, y, {
    size: 21,
    weight: 700,
    fill: 'rgba(234,242,255,0.5)',
    spacing: 7,
  });

  const icons = data.build.slice(0, 12);
  const size = 64;
  const gap = 16;
  const images = await Promise.all(icons.map((icon) => loadImage(sigilUrl(icon))));
  icons.forEach((icon, i) => {
    const x = M + i * (size + gap);
    cutRect(ctx, x, y + 22, size, size, 10);
    ctx.fillStyle = rgba(icon.rarityColor, 0.08);
    ctx.fill();
    ctx.strokeStyle = rgba(icon.rarityColor, 0.65);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    const image = images[i];
    if (image) ctx.drawImage(image, x + 6, y + 28, size - 12, size - 12);
    // Level label under the tile, tinted by the upgrade's own colour.
    text(ctx, `Lv${icon.level}`, x + size / 2, y + size + 46, {
      size: 16,
      weight: 800,
      fill: rgba(icon.color, 0.85),
      align: 'center',
      spacing: 1,
    });
  });
  if (data.build.length > icons.length) {
    text(ctx, `+${data.build.length - icons.length}`, M + icons.length * (size + gap), y + size + 48, {
      size: 22,
      weight: 700,
      fill: 'rgba(234,242,255,0.5)',
      spacing: 2,
    });
  }
  if (icons.length === 0) {
    text(ctx, '白板开局 · 没有携带任何强化', M, y + size + 40, {
      size: 20,
      weight: 500,
      fill: 'rgba(234,242,255,0.35)',
      spacing: 3,
    });
  }
}

function drawFooter(ctx: Ctx2D, accent: number): void {
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.fillRect(M, 1320, W - 2 * M, 1);
  text(ctx, '越打越离谱 · ROGUELITE BREAKOUT', M, 1368, {
    size: 19,
    weight: 600,
    fill: 'rgba(234,242,255,0.4)',
    spacing: 5,
  });
  text(ctx, '碎界 SHATTERVERSE', W - M, 1368, {
    size: 19,
    weight: 800,
    fill: rgba(accent, 0.75),
    align: 'right',
    spacing: 4,
  });
}

function drawGrain(ctx: Ctx2D): void {
  // Static speckle plus hairline scanlines, echoing the game's post chain.
  ctx.globalAlpha = 0.05;
  for (let i = 0; i < 500; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? '#ffffff' : '#000000';
    ctx.fillRect(Math.random() * W, Math.random() * H, 2, 2);
  }
  ctx.globalAlpha = 0.025;
  ctx.fillStyle = '#000000';
  for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
  ctx.globalAlpha = 1;
}

/** The icon tile graphic, generated by the same cached sigil painter the UI uses. */
function sigilUrl(icon: BuildIcon): string {
  return sigil(icon.id, icon.color);
}

function fileName(data: ScorecardData): string {
  const stamp = new Date(data.date);
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `shatterverse_${data.mode}_${data.score}_${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}-${pad(stamp.getHours())}${pad(stamp.getMinutes())}.png`;
}

/** Composes the card into a PNG data URL. Returns null if anything failed. */
export async function composeScorecard(data: ScorecardData, frameUrl: string | null): Promise<string | null> {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d') as Ctx2D | null;
    if (!ctx) return null;

    const frame = frameUrl ? await loadImage(frameUrl) : null;
    if (frame) drawCover(ctx, frame, 0.32);
    else drawFallbackBackground(ctx, data.accent);

    drawChrome(ctx, data.accent, data.date, data.mode);
    drawScore(ctx, data);
    drawTiles(ctx, data);
    await drawBuild(ctx, data);
    drawFooter(ctx, data.accent);
    drawGrain(ctx);

    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

/** Composes the card and triggers a browser download. Returns false if anything failed. */
export async function saveScorecardPng(data: ScorecardData, frameUrl: string | null): Promise<boolean> {
  const url = await composeScorecard(data, frameUrl);
  if (!url) return false;
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName(data);
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  return true;
}

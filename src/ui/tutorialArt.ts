/**
 * Tutorial illustrations: hand-authored inline SVG scenes that mirror what the WebGL renderer
 * actually draws, using the same palette (scene.ts is the source of every color below). The deck
 * is shared by all locales — pages reference a scene by name — so translations stay text-only and
 * the pictures never drift from one language to another.
 *
 * Scenes are framed as mini screenshots (deep-space backdrop + rounded border) so a new player
 * reads them as "this is what the game looks like", not as abstract diagrams.
 */

const PADDLE = '#e6faff';
const GLOW = '#9ff3ff';
const ACCENT = '#27e0ff';
const DANGER = '#ff3d5a';
const BULLET = '#ff2fb0';
const MUZZLE = '#ff4df0';
const EYE = '#d9b0ff';
const GOLD = '#ffe14d';
const PIP = '#ff5c8a';
const WHITE = '#ffffff';
/** Chapter 1's brick palette, straight from levels/definitions.ts. */
const BRICKS = ['#27e0ff', '#ff2fb0', '#3d7bff', '#20f0c8'];

/** The backdrop every scene shares: the arena's deep base color inside a rounded frame. */
function arena(w: number, h: number): string {
  return `<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="10" fill="#050816" stroke="rgba(255,255,255,0.08)"/>`;
}

/** The paddle: bright slab with its in-game cyan underglow. */
function paddle(cx: number, top: number, w = 96, h = 13): string {
  return (
    `<rect x="${cx - w / 2 - 2}" y="${top + h}" width="${w + 4}" height="4" rx="2" fill="${GLOW}" opacity="0.35"/>` +
    `<rect x="${cx - w / 2}" y="${top}" width="${w}" height="${h}" rx="${h / 2}" fill="${PADDLE}"/>`
  );
}

/** A ball: white core with the layered accent halo the renderer paints. */
function ball(cx: number, cy: number, r = 6): string {
  return (
    `<circle cx="${cx}" cy="${cy}" r="${(r * 1.9).toFixed(1)}" fill="${ACCENT}" opacity="0.14"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${(r * 1.35).toFixed(1)}" fill="${ACCENT}" opacity="0.3"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${WHITE}"/>`
  );
}

/** A boss bullet: the magenta rotating diamond with its halo and white-hot center. */
function bullet(cx: number, cy: number, s = 5): string {
  const d = `transform="rotate(45 ${cx} ${cy})"`;
  return (
    `<rect x="${cx - s * 1.9}" y="${cy - s * 1.9}" width="${s * 3.8}" height="${s * 3.8}" ${d} fill="${BULLET}" opacity="0.18"/>` +
    `<rect x="${cx - s}" y="${cy - s}" width="${s * 2}" height="${s * 2}" rx="1.6" ${d} fill="${BULLET}"/>` +
    `<circle cx="${cx}" cy="${cy}" r="1.5" fill="${WHITE}" opacity="0.95"/>`
  );
}

/** One HUD shield pip (rotated square), lit or spent. */
function pip(cx: number, cy: number, on: boolean): string {
  const look = on
    ? `fill="${PIP}" stroke="#ffd6e2" stroke-width="1.4"`
    : `fill="rgba(255,92,138,0.08)" stroke="rgba(255,92,138,0.55)" stroke-width="1.4"`;
  return `<rect x="${cx - 5.5}" y="${cy - 5.5}" width="11" height="11" transform="rotate(45 ${cx} ${cy})" ${look}/>`;
}

/** A straight arrow with a solid triangular head. */
function arrow(x1: number, y1: number, x2: number, y2: number, color: string, w = 2.4): string {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const head = 8;
  const bx = x2 - Math.cos(a) * head;
  const by = y2 - Math.sin(a) * head;
  const px = Math.cos(a + Math.PI / 2) * head * 0.42;
  const py = Math.sin(a + Math.PI / 2) * head * 0.42;
  const point = (x: number, y: number): string => `${x.toFixed(1)},${y.toFixed(1)}`;
  return (
    `<line x1="${x1}" y1="${y1}" x2="${bx.toFixed(1)}" y2="${by.toFixed(1)}" stroke="${color}" stroke-width="${w}" stroke-linecap="round"/>` +
    `<polygon points="${point(x2, y2)} ${point(bx + px, by + py)} ${point(bx - px, by - py)}" fill="${color}"/>`
  );
}

/** A dashed hint path: where something travels. */
function dash(d: string, color: string, w = 2): string {
  return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-dasharray="5 5" stroke-linecap="round" opacity="0.7"/>`;
}

/** The renderer's four-armed impact spark. */
function spark(cx: number, cy: number, r: number, color: string, opacity = 0.9): string {
  return `<path d="M ${cx - r} ${cy} H ${cx + r} M ${cx} ${cy - r} V ${cy + r}" stroke="${color}" stroke-width="1.6" stroke-linecap="round" opacity="${opacity}"/>`;
}

/** A wall brick in the chapter palette; `dim` fades sinking bricks past the line. */
function brick(x: number, y: number, w: number, h: number, color: string, dim = false): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="${color}"${dim ? ' opacity="0.45"' : ''}/>`;
}

/**
 * 「挡板与球」: three mini panels — edge hit bends wide, center hit bounces straight, a dead-center
 * catch is the perfect catch and lights the ready ticks.
 */
function paddleScene(): string {
  const panelGap = `<line x1="120" y1="12" x2="120" y2="100" stroke="rgba(255,255,255,0.06)"/>`;
  const paddleY = 76;
  // Panel 1 — off-center hit on the left third: steep, sideways rebound.
  const p1 =
    paddle(62, paddleY) +
    dash('M 62 16 L 40 58', ACCENT) +
    arrow(34, 64, 12, 30, PADDLE) +
    ball(44, 26) +
    spark(34, 68, 5, WHITE, 0.7);
  // Panel 2 — hit near the middle: near-vertical rebound.
  const p2 =
    paddle(180, paddleY) + arrow(180, 64, 180, 32, PADDLE) + ball(180, 26) + spark(180, 68, 5, WHITE, 0.7);
  // Panel 3 — dead-center catch: spark burst + the yellow ready ticks above the paddle.
  const p3 =
    paddle(298, paddleY) +
    ball(298, 58) +
    spark(298, 70, 7, GOLD) +
    spark(288, 64, 4, GOLD, 0.7) +
    spark(308, 64, 4, GOLD, 0.7) +
    [290, 298, 306]
      .map((x) => `<rect x="${x - 1.6}" y="${paddleY - 10}" width="3.2" height="6" rx="1.6" fill="${GOLD}"/>`)
      .join('');
  return (
    `<svg viewBox="0 0 360 112" role="img" aria-hidden="true">` +
    arena(360, 112) +
    panelGap +
    p1 +
    p2 +
    p3 +
    `</svg>`
  );
}

/**
 * 「护盾与受损」: a slice of the arena — the wall up top, the red danger line with a brick sinking
 * past it, a turret brick shooting magenta diamonds, one intercepted by the paddle and one with its
 * red floor marker, and the shield pips losing one.
 */
function dangerScene(): string {
  // The staggered second row carries one brick fewer so it stays inside the frame.
  const row = (y: number, offset: number, count: number): string =>
    Array.from({ length: count }, (_, i) =>
      brick(8 + i * 44 + offset, y, 40, 14, BRICKS[i % BRICKS.length] as string),
    ).join('');
  // The turret: a darker brick with the magenta charge port underneath.
  const turretX = 8 + 4 * 44 + 20;
  const turret =
    `<rect x="${turretX - 20}" y="34" width="40" height="14" rx="4" fill="#16203c" stroke="rgba(255,79,240,0.5)"/>` +
    `<circle cx="${turretX}" cy="51" r="4.5" fill="${MUZZLE}" opacity="0.9"/>` +
    `<circle cx="${turretX}" cy="51" r="7.5" fill="${MUZZLE}" opacity="0.3"/>`;
  // One brick already past the line.
  const sunk = brick(96, 92, 40, 14, '#3d7bff', true) + arrow(76, 88, 76, 104, DANGER, 2);
  const dangerLine =
    `<line x1="6" y1="76" x2="354" y2="76" stroke="${DANGER}" stroke-width="5" opacity="0.18"/>` +
    `<line x1="6" y1="76" x2="354" y2="76" stroke="${DANGER}" stroke-width="1.6" stroke-dasharray="10 6" opacity="0.9"/>`;
  // Two bullets: one about to be intercepted, one slipping past with its floor marker.
  const shot =
    dash(`M ${turretX} 56 L ${turretX} 86`, BULLET, 1.6) +
    bullet(turretX, 94, 5) +
    spark(turretX, 100, 5, GLOW) +
    dash('M 120 56 L 116 76', BULLET, 1.6) +
    bullet(116, 84, 4.5) +
    `<line x1="108" y1="126" x2="124" y2="126" stroke="${DANGER}" stroke-width="2.5" stroke-linecap="round" opacity="${0.85}"/>`;
  // HUD pips, bottom-left: three lit, one just spent.
  const pips = [16, 32, 48, 64].map((x, i) => pip(x, 112, i < 3)).join('');
  return (
    `<svg viewBox="0 0 360 132" role="img" aria-hidden="true">` +
    arena(360, 132) +
    row(14, 0, 8) +
    row(34, 22, 7) +
    turret +
    dangerLine +
    sunk +
    shot +
    paddle(204, 100) +
    pips +
    `<text x="84" y="116" fill="${DANGER}" font-size="11" font-weight="700" font-family="inherit">−1</text>` +
    `</svg>`
  );
}

/**
 * 「关卡变异与阻碍」: left — the annihilation brick's purple void maw swallowing a ball; right — an
 * enraged BOSS spraying a denser barrage with floor markers.
 */
function threatScene(): string {
  const divider = `<line x1="180" y1="12" x2="180" y2="100" stroke="rgba(255,255,255,0.06)"/>`;
  // Eraser: dark body, glowing void eye, one ball being pulled in, one ball safe far away.
  const eraser =
    `<rect x="56" y="52" width="64" height="22" rx="5" fill="#0a0d1c" stroke="rgba(217,176,255,0.5)"/>` +
    `<circle cx="88" cy="63" r="13" fill="${EYE}" opacity="0.2"/>` +
    `<circle cx="88" cy="63" r="8.5" fill="${EYE}" opacity="0.5"/>` +
    `<circle cx="88" cy="63" r="5" fill="${EYE}"/>` +
    dash('M 134 22 Q 112 34 96 56', EYE) +
    ball(128, 28) +
    spark(104, 48, 5, WHITE, 0.8) +
    dash('M 20 64 Q 30 34 44 22', ACCENT) +
    ball(30, 66);
  // Enraged boss: big slab, bright core, heat halo, dense bullet spray with floor markers.
  const boss =
    `<ellipse cx="270" cy="46" rx="58" ry="22" fill="#ff5a1a" opacity="0.18"/>` +
    `<rect x="228" y="32" width="84" height="26" rx="6" fill="#ff7a2f" stroke="${DANGER}" stroke-width="1.6" opacity="0.95"/>` +
    `<rect x="264" y="38" width="12" height="12" rx="2" transform="rotate(45 270 44)" fill="${GOLD}"/>` +
    spark(234, 28, 5, GOLD, 0.8) +
    spark(306, 28, 5, GOLD, 0.8);
  const spray = [244, 270, 296]
    .map(
      (x) =>
        dash(`M ${x} 60 L ${x - 4} 84`, BULLET, 1.6) +
        bullet(x - 5, 92, 4.5) +
        `<line x1="${x - 13}" y1="106" x2="${x + 3}" y2="106" stroke="${DANGER}" stroke-width="2.5" stroke-linecap="round" opacity="0.85"/>`,
    )
    .join('');
  return (
    `<svg viewBox="0 0 360 112" role="img" aria-hidden="true">` +
    arena(360, 112) +
    divider +
    eraser +
    boss +
    spray +
    `</svg>`
  );
}

/** Every illustration the tutorial can reference, by page name. */
export const TUTORIAL_ART: Record<string, string> = {
  paddle: paddleScene(),
  danger: dangerScene(),
  threats: threatScene(),
};

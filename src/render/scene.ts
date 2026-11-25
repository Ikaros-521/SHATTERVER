import { TAU, clamp, easeOutCubic } from '../core/math';
import { AEGIS_Y, ARENA_H, ARENA_W, DANGER_BAND, DANGER_Y, PADDLE_H, WALL } from '../game/config';
import type { Brick } from '../game/entities';
import { BUFF_MAP, type BuffId } from '../game/buffs/defs';
import type { ChapterDef } from '../game/levels/definitions';
import type { World } from '../game/world';
import type { Pen } from './batch';
import {
  FLAG_BURN,
  FLAG_BOSS,
  FLAG_CLOAK,
  FLAG_CORE,
  FLAG_ELITE,
  FLAG_FROST,
  FLAG_METAL,
} from './shaders/instances';
import type { Fx } from './fx';
import { PK_RING, PK_SHARD, PK_STREAK } from './particles';

export interface SceneInfo {
  /** 0..1: how close the brick field is to the danger line. */
  danger: number;
  /** 0..1: intensity of the "crowd is going wild" state, driven by combo and overdrive. */
  energy: number;
}

function hash(n: number): number {
  let x = Math.floor(n * 374761393) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177) >>> 0;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

/** A slow sweep around the wheel. Every ball shares the colour of the frame, so the swarm reads as one thing. */
function rainbow(time: number): number {
  const h = (time * 0.22) % 1;
  const x = 1 - Math.abs(((h * 6) % 2) - 1);
  const [r, g, b] =
    h < 1 / 6
      ? [1, x, 0]
      : h < 2 / 6
        ? [x, 1, 0]
        : h < 3 / 6
          ? [0, 1, x]
          : h < 4 / 6
            ? [0, x, 1]
            : h < 5 / 6
              ? [x, 0, 1]
              : [1, 0, x];
  return (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255);
}

/** Temporary buffs that move the ball, most telling first. */
const BALL_TINTS: readonly BuffId[] = ['storm', 'ghost', 'giant', 'rage', 'homing', 'turbo', 'deadeye'];

/**
 * Colour of a ball's glow: whatever temporary buff is carrying it, otherwise the flashiest
 * element the build owns.
 */
function ballTint(world: World, accent: number, time: number): number {
  for (const id of BALL_TINTS) {
    if (world.hasBuff(id)) return id === 'storm' ? rainbow(time) : BUFF_MAP[id].color;
  }
  const s = world.live;
  if (s.voidChance > 0 || s.singularity) return 0xb06bff;
  if (s.fire > 0 || s.solarDps > 0) return 0xff8a3d;
  if (s.frost > 0) return 0x9be8ff;
  if (s.shock > 0) return 0xffe14d;
  return accent;
}

function brickFlags(brick: Brick): number {
  let flags = 0;
  if (brick.frostT > 0) flags |= FLAG_FROST;
  if (brick.burnT > 0) flags |= FLAG_BURN;
  if (brick.cloaked) flags |= FLAG_CLOAK;
  if (brick.boss) flags |= FLAG_BOSS;
  if (brick.bossRole === 'core') flags |= FLAG_CORE;
  if (brick.type === 'gold' || brick.type === 'armored' || brick.type === 'elite') flags |= FLAG_METAL;
  if (brick.type === 'elite') flags |= FLAG_ELITE;
  return flags;
}

function drawArena(pen: Pen, accent: number, info: SceneInfo, time: number, active: boolean): void {
  const pulse = 0.5 + 0.5 * Math.sin(time * 2.2);
  const cx = ARENA_W / 2;
  const cy = ARENA_H / 2;

  // Frame: a wide haze, a crisp line, and corner brackets.
  pen.stroke(
    cx,
    cy,
    cx + 11,
    cy + 11,
    accent,
    8,
    (active ? 0.2 : 0.12) + 0.1 * info.energy + 0.05 * pulse,
    28,
  );
  pen.stroke(cx, cy, cx + 11, cy + 11, accent, 1.8, 0.95, 28);
  const arm = 52;
  const inset = 22;
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const x = cx + sx * (cx - inset);
      const y = cy + sy * (cy - inset);
      pen.stroke(x + (sx * arm) / 2, y, arm / 2, 1.2, 0xffffff, 1.4, 0.85, 1.2);
      pen.stroke(x, y + (sy * arm) / 2, 1.2, arm / 2, 0xffffff, 1.4, 0.85, 1.2);
    }
  }

  // Danger line: brightens and starts blinking as the field closes in.
  const blink = info.danger > 0.6 ? 0.6 + 0.4 * Math.sin(time * 16) : 1;
  const alpha = (0.3 + 0.6 * info.danger) * blink;
  pen.light(cx, DANGER_Y, cx - WALL, 7, 0xff3d5a, 0.2 + 0.45 * info.danger, 0.25);
  pen.stroke(cx, DANGER_Y, cx - WALL, 1, 0xff3d5a, 1.4, alpha, 0);
}

function drawBricks(pen: Pen, world: World, time: number): void {
  const pulse = 0.5 + 0.5 * Math.sin(time * 6);
  for (const brick of world.bricks) {
    if (brick.dead) continue;
    const scale = brick.scale;
    const turret = brick.type === 'turret' || brick.bossRole === 'turret';
    const eraser = brick.type === 'eraser';
    const halo =
      brick.type === 'explosive'
        ? 0.4 + 0.35 * pulse
        : eraser
          ? 0.45 + 0.3 * pulse
          : turret
            ? 0.3
            : brick.type === 'elite'
              ? 0.4
              : 0;
    pen.surface(
      brick.x + brick.kx,
      brick.y + brick.ky,
      (brick.w / 2) * scale,
      (brick.h / 2) * scale,
      brick.color,
      {
        hp: brick.hp / brick.maxHp,
        flash: brick.flash,
        flags: brickFlags(brick),
        radius: brick.boss ? 9 : 5,
        halo,
      },
    );
    // A turret's muzzle: a dark port that lights up just before it fires.
    if (turret && !brick.cloaked) {
      const charge = clamp(1 - brick.shootCd / 0.5, 0, 1);
      pen.surface(brick.x, brick.y + 3, 9, 3.2, 0x05060f, { radius: 1.6, halo: 0 });
      pen.disc(brick.x, brick.y + 3, 5, 0xff4df0, 0.35 + 0.65 * charge, 0.6);
    }
    // An eraser's maw: a dark void eye that warns the player what this brick does.
    if (eraser) {
      pen.surface(brick.x, brick.y, 11, 5, 0x05060f, { radius: 2.4, halo: 0 });
      pen.disc(brick.x, brick.y, 3.4 + 0.9 * pulse, 0xd9b0ff, 0.5 + 0.4 * pulse, 0.7);
    }
  }
}

function drawPaddle(pen: Pen, world: World, accent: number, time: number): void {
  const p = world.paddle;
  // The live block, so the paddle draws its buffs too: the emitters of a laser capsule, its magnet.
  const s = world.live;
  const squash = p.squash;
  const hw = p.halfW * (1 + 0.1 * squash);
  const hh = (PADDLE_H / 2) * (1 - 0.3 * squash);
  const ready = world.energy >= 100 && !world.odActive;
  const flicker = 0.5 + 0.5 * Math.sin(time * 22);

  // Thruster wash underneath.
  pen.light(p.x, p.y + 8, hw * 1.3, 22 + 6 * flicker, accent, 0.5 + p.flash * 0.6, 0.3);
  pen.surface(p.x, p.y, hw, hh, world.odActive ? 0xc8fbff : 0xe6faff, {
    radius: hh,
    flash: p.flash,
    halo: 0.4 + (ready ? 0.5 * flicker : 0),
  });
  // A capsule that stretched the paddle leaves its colour running along the edges.
  if (world.hasBuff('wide'))
    pen.stroke(p.x, p.y, hw + 3, hh + 3, BUFF_MAP.wide.color, 2, 0.55 + 0.3 * flicker, hh + 3);

  // The overdrive meter lives inside the paddle: it fills left to right with hot light. It is read
  // against the window's full length, so a Critical Mass extension moves the goalposts with it.
  const charge = world.odActive ? clamp(1 - world.odT / world.odMax, 0, 1) : world.energy / 100;
  if (charge > 0.01) {
    const width = hw * charge;
    const color = world.odActive ? 0xffffff : ready ? 0x9ff3ff : accent;
    pen.light(p.x - hw + width, p.y, Math.max(width, 2), 2.6, color, 0.95, 0.9, 0, 1);
  }

  // Laser emitters ride on top of the paddle.
  for (let i = 0; i < s.laserLevel; i++) {
    const x = s.laserLevel === 1 ? p.x : p.x + ((i / (s.laserLevel - 1)) * 2 - 1) * hw * 0.7;
    pen.surface(x, p.y - hh - 3, 3.2, 5, 0xffe14d, { radius: 1.6, halo: 0.5 });
  }

  if (s.magnetRadius > 0) {
    const r = s.magnetRadius / 2 + 30;
    pen.stroke(p.x, p.y - r * 0.55 - hh, hw + 34, r * 0.55, 0x9ff3ff, 1.2, 0.1 + 0.05 * flicker, r * 0.7);
  }
}

function drawBalls(pen: Pen, world: World, fx: Fx, tint: number, time: number): void {
  const s = world.live;
  const intro = world.state === 'intro';
  const phasing = world.hasBuff('ghost');

  for (const ball of world.balls) {
    if (!ball.alive) continue;
    const r = ball.radius;
    const alpha = (ball.ghost ? 0.42 : 1) * (ball.child ? clamp(ball.ttl / 0.6, 0, 1) : 1);
    // Twins of a Split keep the buff's cyan; everything else is tinted by what is carrying it.
    const color = ball.clone
      ? 0x4dd8ff
      : ball.child
        ? 0x7dffe0
        : ball.ghost
          ? 0xb06bff
          : ball.emp > 0
            ? 0xffd24a
            : tint;
    if (alpha <= 0.01) continue;

    if (ball.docked) {
      pen.light(ball.x, ball.y, r * 2.3, r * 2.3, color, 0.45 * alpha + 0.2 * Math.sin(time * 10), 0.6);
      pen.disc(ball.x, ball.y, r * 1.05, 0xffffff, 0.95 * alpha, 0.9);
      continue;
    }

    // Comet tail: a continuous, tapering ribbon. One soft ellipse is stretched between every pair of
    // trail samples, so the tail stays smooth however far the ball travels in a frame.
    const trail = fx.trailOf(ball.id);
    if (trail) {
      const samples = trail.length / 2;
      for (let i = samples - 1; i > 0; i--) {
        const ax = trail[i * 2] ?? 0;
        const ay = trail[i * 2 + 1] ?? 0;
        const bx = trail[(i - 1) * 2] ?? ax;
        const by = trail[(i - 1) * 2 + 1] ?? ay;
        const k = (i - 0.5) / samples; // 0 at the ball, 1 at the tail's end
        const size = r * (1.0 + 1.5 * k);
        const dx = bx - ax;
        const dy = by - ay;
        const length = Math.hypot(dx, dy);
        pen.light(
          (ax + bx) / 2,
          (ay + by) / 2,
          length / 2 + size,
          size,
          color,
          alpha * (1 - k) * (1 - k),
          0.3,
          Math.atan2(dy, dx),
        );
      }
    }

    const speed = Math.hypot(ball.vx, ball.vy);
    const rot = Math.atan2(ball.vy, ball.vx);
    // Speed stretch along the motion, and a flatten against whatever was just bounced off.
    const motion = clamp((speed - 700) / 3200, 0, 0.4);
    const squash = ball.squash;
    const rx = r * (1 + motion) * (1 - 0.3 * squash);
    const ry = (r * (1 + 0.5 * squash)) / (1 + 0.15 * motion);
    const banked = 1 + 0.6 * clamp(ball.momentum / 3, 0, 1);

    // A ring marks what is temporary: a Split twin, or a real ball while it is phasing.
    if (ball.clone)
      pen.ring(ball.x, ball.y, r * 1.7 + 1.2 * Math.sin(time * 13 + ball.id), 1.6, color, 0.75 * alpha);
    else if (phasing && !ball.child) pen.ring(ball.x, ball.y, r * 1.45, 1.8, 0xe6d0ff, 0.7 * alpha);

    // Balls are the protagonists: a wide halo, a saturated bloom and a hot white core.
    pen.light(ball.x, ball.y, rx * 5.4 * banked, ry * 5.4 * banked, color, 0.3 * alpha, 0.12, rot);
    pen.light(ball.x, ball.y, rx * 2.8 * banked, ry * 2.8 * banked, color, 0.95 * alpha, 0.45, rot);
    pen.light(ball.x, ball.y, rx * 1.75, ry * 1.75, [1.9, 1.9, 2.1], alpha, 0.8, rot);
    pen.light(ball.x, ball.y, rx * 1.3, ry * 1.3, [3.4, 3.4, 3.6], alpha, 0.96, rot);

    if (s.solarDps > 0 && !ball.ghost) {
      pen.disc(ball.x, ball.y, s.solarRadius, 0xff6b1a, 0.16, 0.1);
      pen.ring(ball.x, ball.y, s.solarRadius, 3, 0xff8a3d, 0.07 + 0.04 * Math.sin(time * 13));
    }
  }

  // Launch fan: shows where the volley will go during the countdown.
  if (intro) {
    const p = world.paddle;
    const count = Math.max(1, world.balls.length);
    const shown = Math.min(count, 9);
    const alpha = 0.2 + 0.2 * Math.sin(time * 9);
    for (let i = 0; i < shown; i++) {
      const angle = shown === 1 ? -Math.PI / 2 : -Math.PI / 2 + ((i / (shown - 1)) * 2 - 1) * 0.95;
      const reach = 150 + 30 * Math.sin(time * 5 + i);
      pen.beam(p.x, p.y, p.x + Math.cos(angle) * reach, p.y + Math.sin(angle) * reach, 1.6, tint, alpha, 0);
    }
  }
}

function drawHazards(pen: Pen, world: World, time: number): void {
  const pulse = 0.5 + 0.5 * Math.sin(time * 14);

  // Shrapnel: white needles.
  for (const shard of world.shards) {
    if (shard.dead) continue;
    const angle = Math.atan2(shard.vy, shard.vx);
    pen.light(shard.x, shard.y, 10, 2.2, [2.4, 2.4, 2.6], 0.9, 0.8, angle);
  }

  for (const pickup of world.pickups) {
    if (pickup.dead) continue;
    if (pickup.kind === 'crystal') {
      pen.light(pickup.x, pickup.y, 18, 18, 0xffd23c, 0.45, 0.5);
      pen.surface(pickup.x, pickup.y, 6, 6, 0xffd23c, { rot: time * 4, radius: 1.5, halo: 0.5 });
    } else if (pickup.kind === 'heart') {
      pen.light(pickup.x, pickup.y, 22, 22, 0xff5c8a, 0.5, 0.5);
      pen.surface(pickup.x, pickup.y, 7.5, 7.5, 0xff5c8a, { radius: 7.5, halo: 0.5 });
      pen.disc(pickup.x - 2.4, pickup.y - 2.6, 2.2, 0xffffff, 0.9, 0.9);
    } else {
      // A capsule: a bright pill in its buff's colour, turning over inside a ring that breathes.
      const color = BUFF_MAP[pickup.buff ?? 'overcharge'].color;
      const spin = time * 2.6 + pickup.id;
      pen.light(pickup.x, pickup.y, 34, 34, color, 0.5, 0.5);
      pen.surface(pickup.x, pickup.y, 10.5, 6.5, color, { rot: spin, radius: 6.5, halo: 0.7 });
      pen.surface(pickup.x, pickup.y, 4.2, 4.2, 0xffffff, { rot: -spin * 0.7, radius: 1.5 });
      pen.ring(pickup.x, pickup.y, 17 + 3 * Math.sin(time * 5 + pickup.id), 1.6, color, 0.8);
    }
  }

  for (const bullet of world.bullets) {
    if (bullet.dead) continue;
    // Landing marker on the floor line: tells the player exactly where to be.
    if (bullet.vy > 0 && bullet.y > ARENA_H * 0.45) {
      const urgency = clamp((bullet.y - ARENA_H * 0.45) / (ARENA_H * 0.4), 0, 1);
      pen.stroke(
        bullet.x,
        ARENA_H - 9,
        16,
        2.5,
        0xff3d5a,
        1.5,
        0.25 + 0.6 * urgency * (0.6 + 0.4 * pulse),
        2.5,
      );
    }
    pen.surface(bullet.x, bullet.y, 7, 7, 0xff2fb0, { rot: Math.PI / 4, radius: 1.6, halo: 0.6 });
    pen.light(bullet.x, bullet.y, 12, 12, [2.4, 0.5, 2.8], 0.85, 0.6);
    const angle = Math.atan2(bullet.vy, bullet.vx);
    pen.light(bullet.x - bullet.vx * 0.035, bullet.y - bullet.vy * 0.035, 18, 4, 0xff2fb0, 0.4, 0.3, angle);
  }
}

/** The Aegis: a live wire under the paddle that bullets die on, for as long as the buff stands. */
function drawAegis(pen: Pen, time: number): void {
  const color = BUFF_MAP.aegis.color;
  const pulse = 0.5 + 0.5 * Math.sin(time * 6);
  const span = ARENA_W - WALL * 2;
  pen.light(ARENA_W / 2, AEGIS_Y, span / 2, 18, color, 0.2 + 0.08 * pulse, 0.35);
  pen.stroke(ARENA_W / 2, AEGIS_Y, span / 2, 1, color, 2.2, 0.7 + 0.25 * pulse, 0);
  for (let i = 0; i <= 12; i++)
    pen.light(WALL + (i * span) / 12, AEGIS_Y, 2.4, 7 + 3 * pulse, color, 0.8, 0.6);
}

function drawZones(pen: Pen, world: World, time: number): void {
  // Fire pools left by Meltdown.
  for (const pool of world.pools) {
    if (pool.dead) continue;
    const fade = clamp(pool.life / 0.5, 0, 1);
    const flicker = 0.85 + 0.15 * Math.sin(time * 31 + pool.x);
    pen.light(pool.x, pool.y, pool.r * flicker, pool.r * 0.82 * flicker, 0xff5a1a, 0.3 * fade, 0.2);
    pen.ring(pool.x, pool.y, pool.r * 0.8, 5, 0xffc93c, 0.5 * fade);
  }

  // Black holes: a photon ring, a violet haze, and a disc that subtracts light from everything behind it.
  for (const hole of world.holes) {
    if (hole.dead) continue;
    const grow = Math.min(1, (1 - hole.life / hole.maxLife) * 5);
    const r = hole.r * (0.3 + 0.7 * grow);
    pen.light(hole.x, hole.y, r * 2.8, r * 2.8, 0xb06bff, 0.3, 0.2);
    pen.light(hole.x, hole.y, r * 1.05, r * 1.05, [-1.3, -1.3, -1.3], 1, 0.92);
    pen.ring(hole.x, hole.y, r * (1.22 + 0.1 * Math.sin(time * 9)), 6, 0xe6d0ff, 0.95);
    pen.ring(hole.x, hole.y, r * (1.55 + 0.18 * Math.sin(time * 9 + 2)), 3, 0xb06bff, 0.7);
  }

  if (world.singularity && world.state === 'playing') {
    const pos = world.singularityPos();
    pen.light(pos.x, pos.y, 78, 78, 0xd9a6ff, 0.35, 0.2);
    pen.light(pos.x, pos.y, 24, 24, [-1.2, -1.2, -1.2], 1, 0.95);
    pen.ring(pos.x, pos.y, 40 + 5 * Math.sin(time * 7), 3.5, 0xffffff, 0.9);
    pen.ring(pos.x, pos.y, 62 + 8 * Math.sin(time * 7 + 1.5), 2.5, 0xb06bff, 0.7);
    pen.light(pos.x, pos.y, 9, 9, [3.4, 2.6, 3.6], 1, 0.9);
  }
}

/** Electricity: a polyline that re-jitters 25 times a second, so it crackles. */
function drawBolt(
  pen: Pen,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: number,
  alpha: number,
  seed: number,
  time: number,
): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  if (len < 1) return;
  const segments = clamp(Math.floor(len / 36), 3, 12);
  const nx = -dy / len;
  const ny = dx / len;
  const phase = seed + Math.floor(time * 25) * 13.7;
  let px = x0;
  let py = y0;
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    const taper = Math.sin(t * Math.PI);
    const offset = i === segments ? 0 : (hash(phase + i * 7.31) * 2 - 1) * 28 * taper;
    const qx = x0 + dx * t + nx * offset;
    const qy = y0 + dy * t + ny * offset;
    pen.beam(px, py, qx, qy, 2.2, [2.3, 2.2, 1.5], alpha, 2.2);
    pen.beam(px, py, qx, qy, 7, color, alpha * 0.32, 0);
    px = qx;
    py = qy;
  }
}

function drawTransients(pen: Pen, fx: Fx, time: number): void {
  for (const beam of fx.beams) {
    const t = clamp(beam.life / beam.maxLife, 0, 1);
    const width = beam.width * (0.55 + 0.45 * t);
    if (beam.width > 20) {
      // Orbital lance: a column of light spanning the arena.
      pen.light(beam.x0, ARENA_H / 2, width, ARENA_H / 2, beam.color, 0.5 * t, 0.15);
      pen.beam(beam.x0, 0, beam.x0, ARENA_H, 7, [3.2, 2.9, 1.7], t, 2.2);
    } else {
      pen.beam(beam.x0, beam.y0, beam.x1, beam.y1, width, beam.color, t, 1.6);
    }
  }
  for (const bolt of fx.bolts) {
    drawBolt(
      pen,
      bolt.x0,
      bolt.y0,
      bolt.x1,
      bolt.y1,
      bolt.color,
      clamp(bolt.life / 0.17, 0, 1),
      bolt.seed,
      time,
    );
  }
}

function drawParticles(pen: Pen, fx: Fx): void {
  for (const p of fx.particles.pool) {
    if (!p.alive) continue;
    const t = p.life / p.maxLife;
    switch (p.kind) {
      case PK_SHARD: {
        // Fragments shrink and darken as they expire.
        const size = p.size * (0.45 + 0.55 * t);
        const shade = 0.45 + 0.55 * t;
        const r = Math.round(clamp(p.r * shade, 0, 1) * 255);
        const g = Math.round(clamp(p.g * shade, 0, 1) * 255);
        const b = Math.round(clamp(p.b * shade, 0, 1) * 255);
        pen.surface(p.x, p.y, size * 0.5, size * 0.22, (r << 16) | (g << 8) | b, {
          rot: p.rot,
          radius: 1.2,
          alpha: Math.min(1, t * 4),
          halo: 0,
        });
        break;
      }
      case PK_RING: {
        const radius = Math.max(p.size + (p.sizeEnd - p.size) * (1 - t), 0.5);
        // Big rings cover far more pixels than small ones, so they are dimmer per pixel: same energy, same screen.
        const glow = clamp(2.4 - radius / 260, 0.8, 2.4);
        pen.ring(
          p.x,
          p.y,
          radius,
          2.5 + 4 * t,
          [p.r * glow, p.g * glow, p.b * glow],
          p.alpha * Math.pow(t, 0.6),
        );
        break;
      }
      case PK_STREAK: {
        const speed = Math.hypot(p.vx, p.vy);
        const length = clamp(speed * 0.035, p.size, 30);
        pen.light(
          p.x,
          p.y,
          length,
          p.size * (0.4 + 0.6 * t),
          [p.r * p.intensity, p.g * p.intensity, p.b * p.intensity],
          p.alpha * t,
          0.55,
          Math.atan2(p.vy, p.vx),
        );
        break;
      }
      default: {
        const size = p.size + (p.sizeEnd - p.size) * (1 - t);
        pen.light(
          p.x,
          p.y,
          size,
          size,
          [p.r * p.intensity, p.g * p.intensity, p.b * p.intensity],
          p.alpha * t * t,
          0.3 + 0.5 * (1 - t),
        );
      }
    }
  }

  for (const flare of fx.flares) {
    const t = clamp(flare.life / flare.maxLife, 0, 1);
    const radius = flare.r1 + (flare.r0 - flare.r1) * t;
    const [r, g, b] = flare.color;
    pen.light(
      flare.x,
      flare.y,
      radius,
      radius,
      [r * flare.intensity, g * flare.intensity, b * flare.intensity],
      0.6 * t,
      0.25,
    );
  }
}

function drawPopups(pen: Pen, fx: Fx): void {
  for (const p of fx.popups) {
    const t = p.life / p.maxLife;
    const pop = Math.min(1, p.age / 0.09);
    const scale = p.crit ? 1.9 - 0.9 * easeOutCubic(pop) : 1.4 - 0.4 * pop;
    const alpha = t < 0.3 ? t / 0.3 : 1;
    if (p.crit) pen.light(p.x, p.y, 58, 30, [1, 0.8, 0.3], 0.26 * alpha, 0.2);
    pen.label(
      p.text,
      p.x,
      p.y,
      p.size * scale,
      p.crit ? [1.7, 1.36, 0.42] : [1.05, 1.05, 1.1],
      alpha,
      p.crit ? -0.06 : 0,
    );
  }
}

/** An icy halo and a pair of orbiting "hands" while time is stopped. */
function drawTimeStop(pen: Pen, time: number): void {
  const cx = ARENA_W / 2;
  const cy = ARENA_H / 2 - 40;
  pen.stroke(cx, ARENA_H / 2, cx + 14, ARENA_H / 2 + 14, 0x9be8ff, 5, 0.5, 30);
  pen.ring(cx, cy, 300, 1.6, 0xcfe6ff, 0.5);
  pen.ring(cx, cy, 190, 1.2, 0xcfe6ff, 0.35);
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * TAU + time * 0.15;
    const radius = i % 3 === 0 ? 6 : 3.5;
    pen.light(cx + Math.cos(angle) * 300, cy + Math.sin(angle) * 300, radius, radius, 0xffffff, 0.8, 0.6);
  }
}

/**
 * Turns a world's state plus the FX layer's transients into draw instances.
 *
 * Order matters within each blend mode: surfaces first (painted over by later ones), then all
 * the additive light in back-to-front layers, then text on top of everything.
 */
export function drawScene(
  pen: Pen,
  world: World | null,
  fx: Fx,
  chapter: ChapterDef,
  time: number,
  out: SceneInfo,
): void {
  const accent = chapter.accent;
  fx.accent = accent;

  if (!world) {
    drawParticles(pen, fx);
    return;
  }

  let lowest = 0;
  for (const brick of world.bricks) {
    if (!brick.dead && brick.y + brick.h / 2 > lowest) lowest = brick.y + brick.h / 2;
  }
  out.danger = world.boss ? 0 : clamp(1 - (DANGER_Y - lowest) / DANGER_BAND, 0, 1);
  out.energy = clamp(world.combo / 400, 0, 1) * 0.7 + (world.odActive ? 0.6 : 0);

  const playing = world.state === 'playing' || world.state === 'intro' || world.state === 'clearing';
  const tint = ballTint(world, accent, time);

  drawArena(pen, accent, out, time, playing);

  // ── surfaces (alpha blended) ──
  drawBricks(pen, world, time);
  if (world.state !== 'dead') drawPaddle(pen, world, accent, time);

  // ── light (additive) ──
  drawZones(pen, world, time);
  drawTransients(pen, fx, time);
  if (world.live.aegis && world.state !== 'dead') drawAegis(pen, time);
  drawBalls(pen, world, fx, tint, time);
  drawHazards(pen, world, time);
  drawParticles(pen, fx);
  if (world.timeStop > 0) drawTimeStop(pen, time);

  // ── text ──
  drawPopups(pen, fx);
}

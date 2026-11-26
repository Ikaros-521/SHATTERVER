import type { BuildStats } from '../upgrades/stats';
import type { ActiveBuff } from './defs';

/** Size and damage of the balls while 「球体巨化」 lasts. */
export const GIANT_RADIUS = 2.2;
export const GIANT_DAMAGE = 1.6;
/** Paddle width while 「延展挡板」 lasts. */
export const WIDE_PADDLE = 1.8;
export const LASER_BUFF_BEAMS = 3;
export const MAGNET_BUFF_RANGE = 300;
/** Homing turn rate (rad/s) of 「制导蜂群」: about a maxed Guidance. */
export const HOMING_BUFF_TURN = 7;
/** Guidance charges 「制导蜂群」 loads per paddle return: above any Guidance core level. */
export const SEEKER_CHARGES = 6;
/** Damage banked per pierce while 「幽灵穿透」 lasts, and the cap it banks towards. */
export const GHOST_PIERCE_BONUS = 0.2;
export const GHOST_MOMENTUM_MAX = 3;
export const RAGE_DAMAGE = 2;
export const TURBO_SPEED = 1.4;
export const TURBO_DAMAGE = 1.4;
export const GOLD_MULT = 2;
/** The blast a brick's death leaves while 「全域爆破」 lasts, as a fraction of attack power. */
export const BLAST_DAMAGE = 1.2;
export const BLAST_RADIUS = 110;
export const STORM_FREEZE_CHANCE = 0.35;

/**
 * Folds the active buffs — and the build's resonance with them — into a copy of `base`.
 *
 * Pure: the build's own block is never written to, so a buff expiring is just "read `base`
 * again". Everything downstream (damage, physics, drawing) reads the result through
 * `world.live` and needs no knowledge of which buffs exist.
 */
export function withBuffs(base: BuildStats, buffs: readonly ActiveBuff[]): BuildStats {
  const s = { ...base };
  // Adrenaline keys off any buff at all being active. Instant ones never enter the list, so they
  // boost nothing.
  let damage = 1 + base.buffDamage;
  let speed = 1 + base.buffSpeed;
  let radius = 1;
  let paddle = 1;

  for (const { id } of buffs) {
    switch (id) {
      case 'giant':
        radius *= GIANT_RADIUS;
        damage *= GIANT_DAMAGE;
        break;
      case 'turbo':
        speed *= TURBO_SPEED;
        damage *= TURBO_DAMAGE;
        break;
      case 'rage':
        damage *= RAGE_DAMAGE;
        break;
      case 'wide':
        paddle *= WIDE_PADDLE;
        break;
      case 'laser':
        s.laserLevel += LASER_BUFF_BEAMS;
        break;
      case 'magnet':
        s.magnetRadius = Math.max(s.magnetRadius, MAGNET_BUFF_RANGE);
        break;
      case 'ghost':
        s.pierceChance = 1;
        s.pierceBonus = Math.max(s.pierceBonus, GHOST_PIERCE_BONUS);
        s.momentumMax = Math.max(s.momentumMax, GHOST_MOMENTUM_MAX);
        break;
      case 'homing':
        s.homing = Math.max(s.homing, HOMING_BUFF_TURN);
        s.guidedCharges = Math.max(s.guidedCharges, SEEKER_CHARGES);
        break;
      case 'aegis':
        s.aegis = true;
        break;
      case 'gold':
        s.crystalChance = 1;
        s.crystalMult *= GOLD_MULT;
        break;
      case 'deadeye':
        s.critChance = 1;
        break;
      case 'blast':
        s.explosionDamage = Math.max(s.explosionDamage, BLAST_DAMAGE);
        s.explosionRadius = Math.max(s.explosionRadius, BLAST_RADIUS);
        break;
      case 'storm':
        s.fire = Math.max(s.fire, 1);
        s.frost = Math.max(s.frost, 1);
        s.shock = Math.max(s.shock, 1);
        s.poison = Math.max(s.poison, 1);
        s.freezeChance = Math.max(s.freezeChance, STORM_FREEZE_CHANCE);
        break;
      default:
        break; // split and timestop are handled by the world; instant buffs never get here.
    }
  }

  s.damageMult *= damage;
  s.ballSpeed *= speed;
  s.ballRadius *= radius;
  s.paddleWidth *= paddle;
  return s;
}

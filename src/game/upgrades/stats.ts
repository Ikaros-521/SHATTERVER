import { UPGRADES } from './defs';

/**
 * The whole build folded into one flat block of numbers.
 *
 * It is a pure function of (owned upgrades, levels cleared): the simulation reads it, never writes it,
 * and it is recomputed only when the build changes.
 */
export interface BuildStats {
  // --- balls ---
  ballCount: number;
  ballRadius: number;
  ballSpeed: number;
  /** Chance that a ball passes through a brick instead of bouncing. */
  pierceChance: number;
  /** Damage banked per pierce (Phantom Lance). */
  pierceBonus: number;
  /** Homing turn rate in rad/s. */
  homing: number;
  /** Chance for a killed brick to split off a child ball. */
  splitChance: number;
  splitChildren: boolean;
  /** Damage ratio of mirror ghost balls; 0 disables them. */
  ghostRatio: number;
  momentumPerHit: number;
  momentumMax: number;
  // --- damage ---
  damageMult: number;
  critChance: number;
  critMult: number;
  comboDamagePer10: number;
  echoChance: number;
  echoDamage: number;
  echoDelay: number;
  /** Execute threshold: bricks below this fraction of HP die instantly to ball hits. */
  reaperRatio: number;
  // --- elements (levels) ---
  fire: number;
  frost: number;
  shock: number;
  poison: number;
  voidChance: number;
  /** Burn DPS per fire level, as a fraction of attack power. */
  burnRatio: number;
  freezeChance: number;
  shockChains: number;
  shockDamage: number;
  poisonRatio: number;
  // --- explosions ---
  /** Explosion damage per kill as a fraction of attack power; 0 disables player explosions. */
  explosionDamage: number;
  explosionRadius: number;
  explosionRadiusMult: number;
  /** Explosions triggered by explosions — the screen-clearing chain. */
  explosionChain: boolean;
  firePool: boolean;
  supernova: number;
  shatterCount: number;
  shatterDamage: number;
  iceBurst: boolean;
  // --- zones ---
  solarDps: number;
  solarRadius: number;
  holeDurationMult: number;
  holeRadiusMult: number;
  holeDamageMult: number;
  singularity: boolean;
  singularityDamageMult: number;
  // --- paddle ---
  paddleWidth: number;
  magnetRadius: number;
  empowerBonus: number;
  empowerDuration: number;
  laserLevel: number;
  orbitalCount: number;
  orbitalDamage: number;
  // --- time ---
  timeStopInterval: number;
  timeStopDuration: number;
  // --- meta ---
  luck: number;
  crystalMult: number;
  growthPerLevel: number;
  maxHpBonus: number;
  odDurationMult: number;
  odDamageBonus: number;
}

export function defaultStats(): BuildStats {
  return {
    // Four balls from the first second: the screen should never be empty.
    ballCount: 4,
    ballRadius: 1,
    ballSpeed: 1,
    pierceChance: 0,
    pierceBonus: 0,
    homing: 0,
    splitChance: 0,
    splitChildren: false,
    ghostRatio: 0,
    momentumPerHit: 0,
    momentumMax: 0,

    damageMult: 1,
    critChance: 0.05,
    critMult: 2,
    comboDamagePer10: 0,
    echoChance: 0,
    echoDamage: 0.6,
    echoDelay: 0.25,
    reaperRatio: 0,

    fire: 0,
    frost: 0,
    shock: 0,
    poison: 0,
    voidChance: 0,
    burnRatio: 0.45,
    freezeChance: 0,
    shockChains: 0,
    shockDamage: 0.45,
    poisonRatio: 0,

    explosionDamage: 0,
    explosionRadius: 0,
    explosionRadiusMult: 1,
    explosionChain: false,
    firePool: false,
    supernova: 0,
    shatterCount: 0,
    shatterDamage: 0.3,
    iceBurst: false,

    solarDps: 0,
    solarRadius: 80,
    holeDurationMult: 1,
    holeRadiusMult: 1,
    holeDamageMult: 1,
    singularity: false,
    singularityDamageMult: 1,

    paddleWidth: 1,
    magnetRadius: 0,
    empowerBonus: 0,
    empowerDuration: 3,
    laserLevel: 0,
    orbitalCount: 0,
    orbitalDamage: 3,

    timeStopInterval: 0,
    timeStopDuration: 0,

    luck: 0,
    crystalMult: 1,
    growthPerLevel: 0,
    maxHpBonus: 0,
    odDurationMult: 1,
    odDamageBonus: 1,
  };
}

/** Folds every owned upgrade into one stat block. Pure and deterministic. */
export function computeStats(levels: Record<string, number>, levelsCleared: number): BuildStats {
  const stats = defaultStats();
  for (const def of UPGRADES) {
    const level = levels[def.id] ?? 0;
    if (level > 0) def.apply(stats, Math.min(level, def.maxLevel));
  }
  stats.damageMult += stats.growthPerLevel * levelsCleared;
  return stats;
}

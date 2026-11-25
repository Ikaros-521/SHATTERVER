import { describe, expect, it } from 'vitest';
import { CAMPAIGN_LENGTH } from '../src/game/levels/generator';
import { Session } from '../src/game/session';
import { UPGRADES, UPGRADE_MAP } from '../src/game/upgrades/defs';
import { sensible, simulate } from './sim';

const DT = 1 / 60;

/** Plays a session until `predicate` holds or `seconds` pass. Drafts are resolved by taking the first option. */
function play(session: Session, predicate: () => boolean, seconds: number): number {
  let t = 0;
  while (!predicate() && t < seconds) {
    if (session.phase === 'draft') session.choose(session.draft[0]?.id ?? '');
    session.update(DT);
    t += DT;
  }
  return t;
}

/** Drains the player's lives, respecting invulnerability frames. */
function killPlayer(session: Session): void {
  const world = session.world;
  while (world.state === 'playing') {
    world.damagePlayer(1);
    if (world.state === 'playing') play(session, () => false, 1.0);
  }
}

describe('session: setup', () => {
  it('opens at level 1 unless told otherwise', () => {
    expect(new Session('campaign', 1).world.level.index).toBe(1);
    expect(new Session('endless', 1, { level: 7 }).world.level.index).toBe(7);
    expect(new Session('endless', 1, { level: 0 }).world.level.index).toBe(1);
  });

  it('applies the starter before the first level opens', () => {
    const session = new Session('campaign', 1, {
      starter: { id: 't', name: '', en: '', desc: '', color: 0, grants: { multiball: 2 }, crystals: 60 },
    });
    // Ball count is read when the world is built, so the starter has to be in place by then.
    expect(session.world.balls).toHaveLength(4 + 2);
    expect(session.run.crystals).toBe(60);
  });

  it('grant() adds levels, clamps at the cap and rejects unknown ids', () => {
    const session = new Session('endless', 1);
    expect(session.grant('fire', 2)).toBe(true);
    expect(session.grant('fire', 99)).toBe(true);
    expect(session.run.upgrades.fire).toBe(UPGRADE_MAP.fire?.maxLevel);
    expect(session.run.stats.fire).toBe(UPGRADE_MAP.fire?.maxLevel);
    expect(session.grant('not-an-upgrade')).toBe(false);
    expect(session.grant('fire', 0)).toBe(false);
  });

  it('derives identical levels and drafts from a seed', () => {
    const a = new Session('campaign', 4242, { bot: true });
    const b = new Session('campaign', 4242, { bot: true });
    expect(a.world.level).toEqual(b.world.level);
    play(a, () => a.phase === 'draft', 120);
    play(b, () => b.phase === 'draft', 120);
    expect(a.draft.map((d) => d.id)).toEqual(b.draft.map((d) => d.id));
  });
});

describe('session: flow', () => {
  it('stops the world at a draft and will not advance without a choice', () => {
    const session = new Session('campaign', 3, { bot: true });
    play(session, () => session.phase === 'draft', 120);
    expect(session.phase).toBe('draft');
    expect(session.draft).toHaveLength(3);

    const time = session.world.time;
    const level = session.run.level;
    session.update(10);
    expect(session.world.time).toBe(time);
    expect(session.run.level).toBe(level);

    // Only an offered upgrade is accepted.
    const notOffered = UPGRADES.find((u) => !session.draft.includes(u));
    expect(notOffered).toBeDefined();
    expect(session.choose(notOffered?.id ?? '')).toBe(false);
    expect(session.phase).toBe('draft');

    expect(session.choose(session.draft[0]?.id ?? '')).toBe(true);
    expect(session.phase).toBe('playing');
    expect(session.run.level).toBe(level + 1);
  });

  it('charges crystals for a reroll and pays for a skip', () => {
    const session = new Session('campaign', 5, { bot: true });
    play(session, () => session.phase === 'draft', 120);
    session.run.crystals = 0;
    const cost = session.rerollCost;
    expect(session.reroll()).toBe(false);
    expect(session.draft).toHaveLength(3);

    session.run.crystals = cost;
    expect(session.reroll()).toBe(true);
    expect(session.run.crystals).toBe(0);
    expect(session.rerollCost).toBe(cost + 12);

    session.run.crystals = 0;
    expect(session.skip()).toBe(true);
    expect(session.run.crystals).toBe(session.skipReward);
    expect(session.phase).toBe('playing');
  });

  it('counts the level a run dies in, exactly once', () => {
    const session = new Session('campaign', 2, { bot: true });
    play(session, () => session.world.killed >= 3, 60);
    expect(session.world.killed).toBeGreaterThanOrEqual(3);

    // Balls keep breaking bricks while the lives drain, so read the level's totals once it is over.
    killPlayer(session);
    expect(session.world.state).toBe('dying');
    const killed = session.world.killed;
    const damage = session.world.totalDamage;
    play(session, () => session.phase === 'over', 10);

    expect(session.phase).toBe('over');
    expect(session.run.hp).toBe(0);
    // The level in progress is folded into the run totals — and not twice.
    expect(session.run.kills).toBe(killed);
    expect(session.run.totalDamage).toBe(damage);
    expect(session.run.damageTaken).toBe(session.run.maxHp);
  });
});

describe('session: a full campaign', () => {
  it('can be won, and folds each cleared level exactly once', () => {
    let won = simulate({ seed: 0, policy: sensible });
    for (let seed = 1; seed <= 8 && !won.won; seed++) won = simulate({ seed, policy: sensible });
    expect(won.won, 'the campaign should be beatable within the first few seeds').toBe(true);

    const run = won.session.run;
    expect(run.levelsCleared).toBe(CAMPAIGN_LENGTH);
    expect(run.history).toHaveLength(CAMPAIGN_LENGTH);
    expect(run.history.map((record) => record.level)).toEqual(
      Array.from({ length: CAMPAIGN_LENGTH }, (_, i) => i + 1),
    );
    expect(run.kills).toBe(run.history.reduce((sum, record) => sum + record.killed, 0));
    expect(run.totalDamage).toBeGreaterThan(0);
    expect(run.maxCombo).toBe(Math.max(...run.history.map((record) => record.maxCombo)));
    expect(run.hp).toBeGreaterThan(0);
  }, 120_000);
});

describe('session: helpers', () => {
  it('autoPick takes the rarest option, for the attract-mode demo', () => {
    const session = new Session('campaign', 9, { bot: true });
    play(session, () => session.phase === 'draft', 120);
    const order = ['common', 'rare', 'epic', 'legendary', 'mythic'];
    const expected = [...session.draft].sort((a, b) => order.indexOf(b.rarity) - order.indexOf(a.rarity))[0];
    session.autoPick();
    expect(session.run.upgrades[expected?.id ?? '']).toBe(1);
  });

  it('rerolling a draft never changes the layout of the next level', () => {
    // Levels come from their own stream, so a seed's geography does not depend on how it was played.
    const plain = new Session('campaign', 31, { bot: true });
    const rerolled = new Session('campaign', 31, { bot: true });
    play(plain, () => plain.phase === 'draft', 120);
    play(rerolled, () => rerolled.phase === 'draft', 120);
    expect(rerolled.draft.map((d) => d.id)).toEqual(plain.draft.map((d) => d.id));

    rerolled.run.crystals = 10_000;
    expect(rerolled.reroll()).toBe(true);
    expect(plain.choose(plain.draft[0]?.id ?? '')).toBe(true);
    expect(rerolled.choose(rerolled.draft[0]?.id ?? '')).toBe(true);

    expect(rerolled.run.level).toBe(plain.run.level);
    expect(rerolled.world.level).toEqual(plain.world.level);
  });
});

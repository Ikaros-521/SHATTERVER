/**
 * The gain systems the WeChat shell was reported to lack, pinned at the shared-core level:
 * carried supplies touch the run at construction, a draft pick moves the live stats, and the
 * HUD's content hash tracks both the build strip and the buff chips (per countdown second), so
 * the overlay repaints when a capsule lands or a card is picked. The shell's start-run
 * bookkeeping (trial merge + spend, run count) needs a GL context and is verified in the
 * browser harness instead.
 */
import { describe, expect, it } from 'vitest';
import { MAX_HP_BASE } from '../src/game/config';
import { SUPPLY_CRYSTALS } from '../src/game/economy/catalog';
import { Session } from '../src/game/session';
import { hudSignature } from '../src/wechat/hud';

describe('gain systems (shared core, WeChat parity)', () => {
  it('carried supplies touch the run at construction: cache crystals, spare shield', () => {
    const session = new Session('endless', 12345, { supplies: ['cache', 'spare'] });
    expect(session.run.crystals).toBe(SUPPLY_CRYSTALS);
    expect(session.run.bonusHp).toBe(1);
    expect(session.run.maxHp).toBe(MAX_HP_BASE + 1);
  });

  it('a draft pick lands in the build and moves the stats (persistent upgrades are live)', () => {
    // The head-start supply holds the run in an opening draft, no level clearing needed.
    const session = new Session('endless', 777, { supplies: ['headstart'] });
    session.start();
    expect(session.phase).toBe('draft');
    const id = session.draft[0]!.id;
    const damageBefore = session.run.stats.damageMult;
    expect(session.choose(id)).toBe(true);
    expect(session.run.upgrades[id]).toBe(1);
    expect(session.phase).toBe('playing'); // the pick closed the draft; sector one is live
    // The chosen card is a real modifier: the stat block moved (whichever stat it touches).
    const sig = JSON.stringify(session.run.stats);
    const plain = new Session('endless', 777, { supplies: ['headstart'] });
    plain.start();
    plain.skip(); // a skipped opening pick also closes the draft, with no upgrade gained
    expect(sig).not.toBe(JSON.stringify(plain.run.stats));
    expect(plain.run.upgrades[id]).toBeUndefined();
    expect(session.run.stats.damageMult).toBeGreaterThanOrEqual(damageBefore);
  });

  it('hudSignature tracks the build strip and the buff chips', () => {
    const session = new Session('endless', 777, { supplies: ['headstart'] });
    session.start();
    const empty = hudSignature(session, 0);
    session.choose(session.draft[0]!.id); // closes the draft, sector one opens in intro
    expect(hudSignature(session, 0)).not.toBe(empty); // the build segment moved

    // The intro beat must pass before the level is 'playing' and buffs can land.
    session.update(1.5);
    const noBuffs = hudSignature(session, 0);
    expect(session.world.activateBuff('wide')).toBe(true);
    const withBuff = hudSignature(session, 0);
    expect(withBuff).not.toBe(noBuffs);
    // The chip's countdown ticks per whole second, so the hash follows the drain.
    const secs = Math.ceil(session.world.buffs[0]!.t);
    session.update(1.1);
    expect(Math.ceil(session.world.buffs[0]!.t)).toBeLessThan(secs);
    expect(hudSignature(session, 0)).not.toBe(withBuff);
  });

  it('hudSignature follows a wave sector from wave to wave', () => {
    const session = new Session('endless', 9, { level: 21, bot: true });
    const first = hudSignature(session, 0);
    session.update(1.5); // the launch countdown
    // Shatter the whole wall at once; the next wave opens once the clear has played out.
    for (const brick of session.world.bricks) {
      if (!brick.dead) session.world.killBrick(brick, HIT);
    }
    for (let i = 0; i < 180 && session.world.level.wave === 1; i++) session.update(1 / 60);
    expect(session.world.level.wave, 'the next wave opened').toBe(2);
    expect(hudSignature(session, 0)).not.toBe(first);
  });
});

/** A plain ball hit, for tests that only need a brick to fall. */
const HIT = {
  x: 0,
  y: 0,
  power: 1,
  source: 'ball',
  ball: null,
  crit: false,
  explosion: false,
} as const;

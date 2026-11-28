import { describe, expect, it } from 'vitest';
import { RNG } from '../src/core/rng';
import { Session } from '../src/game/session';
import { sensible, summarize } from './sim';

/**
 * The tenth level's boss through whole campaigns, bot-played with the builds a player really has
 * there. She was given 912 blows once — three times the last boss's, for a boss five levels
 * earlier — and took the bot three and a half minutes a fight. This keeps her where she was set
 * instead: about a minute, and her last stand thrown exactly once.
 *
 * The bot catches and blocks almost perfectly but cannot aim at her, so its figures bound a sharp
 * player from below; what they must not do is drift. The numbers are the sensible drafter's, seed
 * by seed, at a fixed step — they do not move unless the fight or the builds do.
 */

const DT = 1 / 60;
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const LEVEL = 10;

interface Fight {
  /** Seconds the tenth level took, where she was beaten. */
  time: number;
  cleared: boolean;
  /** Balls in play as the level opened: the base four, or more where the build split them. */
  balls: number;
  /** Her eight-shot volleys: the one burst, thrown the moment her last phase opens. */
  bursts: number;
}

/** Plays a campaign from the first level until the tenth is won, lost or never reached. */
function fightAtTen(seed: number): Fight {
  const session = new Session('campaign', seed, { bot: true, characterBoss: true });
  const rng = new RNG(seed ^ 0x5eed);
  session.events.on('draft', () => {
    const pick = sensible(session.draft, session.run.upgrades, rng);
    if (pick) session.choose(pick.id);
    else session.skip();
  });
  const out: Fight = { time: 0, cleared: false, balls: 0, bursts: 0 };
  // Bullets are id'd as they are spawned, ever upwards within a level: the ones id'd past the
  // last frame's top are new since (the world drops spent ones from the middle).
  let top = 0;
  let opened = false;
  for (let frames = 0; session.phase === 'playing' && frames * DT < 2400; frames++) {
    session.update(DT);
    const world = session.world;
    if (world.level.index === LEVEL && world.state === 'playing') {
      if (!opened) {
        opened = true;
        out.balls = world.balls.length;
        top = 0;
      }
      const fresh = world.bullets.filter((bullet) => bullet.id > top);
      for (const bullet of fresh) top = Math.max(top, bullet.id);
      // The shots of one frame that are neither her stars nor her orb: a volley's.
      if (fresh.filter((bullet) => !bullet.visual && !bullet.big).length >= 6) out.bursts++;
    }
    // Cleared: the run has written the level into its history and opened the next.
    if (session.run.history.some((entry) => entry.level === LEVEL)) break;
  }
  const record = session.run.history.find((entry) => entry.level === LEVEL);
  if (record) {
    out.time = record.time;
    out.cleared = true;
  }
  return out;
}

let fought: Fight[] | null = null;
/** The twelve fights, played once however many times they are asked for. */
const fights = (): Fight[] => (fought ??= SEEDS.map(fightAtTen));
const each = (): [number, Fight][] => SEEDS.map((seed, at) => [seed, fights()[at]!]);

describe("the tenth level's boss, through campaigns", () => {
  it('is beaten by every build the bot brings her, inside two minutes', () => {
    for (const [seed, fight] of each()) {
      expect(fight.cleared, `seed ${seed}: beaten`).toBe(true);
      expect(fight.time, `seed ${seed}: seconds`).toBeLessThan(120);
    }
  });

  it('takes about a minute to a four-ball build — the common one — and about half that to more', () => {
    const four = fights()
      .filter((fight) => fight.balls <= 5)
      .map((fight) => fight.time);
    // Most seeds draft no extra ball by the tenth level: the base build is the one to tune for.
    expect(four.length).toBeGreaterThanOrEqual(6);
    expect(summarize(four).median, 'four balls, median').toBeGreaterThan(35);
    expect(summarize(four).median, 'four balls, median').toBeLessThan(85);
    const more = fights()
      .filter((fight) => fight.balls > 5)
      .map((fight) => fight.time);
    if (more.length > 0) expect(summarize(more).median, 'more balls, median').toBeLessThan(60);
  });

  it('throws her one burst a fight — the last stand happens, and happens once', () => {
    for (const [seed, fight] of each()) expect(fight.bursts, `seed ${seed}: bursts`).toBe(1);
  });
});

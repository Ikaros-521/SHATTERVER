/**
 * What happens to a finished run's data: records, 星尘 settlement, the stored run entry and its
 * local rank.
 *
 * This is game rule, not UI — the DOM App and the WeChat shell both call
 * {@link settleFinishedRun} so the two platforms cannot drift on what a run pays. It mutates the
 * save in place (records, economy, history) and stores it, exactly the write sequence the DOM
 * App's `finishRun` used to perform inline.
 *
 * A run only scores when the caller says so (`scoring`): the debug/deep-start sessions record
 * nothing and pay nothing. A fixed-seed save earns no 星尘 — the run replays the same good
 * outcome forever — while records still count.
 */

import { FIRST_GIFT, FIRST_USE_REWARD, applyDailyHalving, dayKey, runCoins } from './economy/coins';
import { advanceDaily, doubleFirstRun, rollDaily } from './economy/dailies';
import { SWIFT_SECONDS, settleMilestones } from './economy/milestones';
import { addRunRecord, runRank, storeSave } from '../core/storage';
import type { EconomyPayout, RunRecord, SaveData } from '../core/storage';
import type { Session } from './session';

export interface FinishedRun {
  /** Null when the run does not score: nothing is recorded, ranked or submitted. */
  record: RunRecord | null;
  /** Which records this run set (`level` / `score`), for the results screen's notes. */
  fresh: string[];
  payout: EconomyPayout | null;
  /** The run's place in this save's same-mode history, or null when it does not rank. */
  rank: { rank: number; total: number } | null;
}

/** Settles a finished run into the save and stores it. Call once, when the run ends. */
export function settleFinishedRun(
  save: SaveData,
  session: Session,
  won: boolean,
  scoring: boolean,
  starterId: string | null,
): FinishedRun {
  const run = session.run;
  if (!scoring) return { record: null, fresh: [], payout: null, rank: null };

  const records = save.records;
  const fresh: string[] = [];
  // A loss on level N "reached" N; a win cleared the last level.
  const reached = won ? run.level : run.levelsCleared + 1;
  const best = run.mode === 'campaign' ? 'bestCampaign' : 'bestEndless';
  if (reached > records[best]) {
    records[best] = reached;
    fresh.push('level');
  }
  const score = Math.round(run.score);
  if (score > records.bestScore) {
    records.bestScore = score;
    fresh.push('score');
  }
  if (won) records.wins++;
  records.bricks += run.kills;
  // The run's 星尘 settles here, after the records absorbed this run: a milestone this run
  // just earned has to pay on this very results screen.
  const payout = settleEconomy(save, session, won, starterId);
  // Local leaderboard: every scoring run lands in the history, and its rank is what the
  // results screen and share card quote.
  const world = session.world;
  const record: RunRecord = {
    mode: run.mode,
    difficulty: run.difficulty,
    score,
    level: reached,
    code: run.mode === 'campaign' ? world.level.code : String(run.level),
    // A character boss's level is recorded under her name, not the lattice def's it took over.
    name: world.character?.def.name ?? world.level.name,
    combo: run.maxCombo,
    damage: Math.round(run.totalDamage),
    kills: run.kills,
    time: run.time,
    won,
    date: Date.now(),
    seed: run.seed,
    build: { ...run.upgrades },
  };
  addRunRecord(records, record);
  storeSave(save);
  const sameMode = records.history.filter((entry) => entry.mode === run.mode);
  return {
    record,
    fresh,
    payout,
    rank: { rank: runRank(sameMode, score), total: sameMode.length },
  };
}

/**
 * Settles the finished run's 星尘 payout: the run share through the daily soft cap, then the
 * one-time rewards — the first-run gift, first uses of upgrade kinds, newly reached milestones
 * and the day's missions. The day's first scoring run doubles its share before the cap; mission
 * rewards bypass the cap like every other one-time reward. Run aggregates fold in before the
 * milestones settle, so a difficulty first-cleared on this very run pays on this very run. The
 * balance and the lifetime total move together at the end. Fixed-seed runs pay nothing.
 */
function settleEconomy(
  save: SaveData,
  session: Session,
  won: boolean,
  starterId: string | null,
): EconomyPayout | null {
  const econ = save.economy;
  const run = session.run;
  // A fixed seed replays the same good run forever: it earns no stardust (the weekly seeded
  // challenge, when it comes, will carry its own exemption).
  if (save.settings.seed.trim()) return null;
  const score = Math.round(run.score);
  const campaignWon = won && run.mode === 'campaign';
  const earned = runCoins(run.time, score, campaignWon);
  const date = dayKey();
  if (econ.dailyDate !== date) {
    econ.dailyDate = date;
    econ.dailyRunCoins = 0;
  }
  // The daily loop re-arms on the same day key as the soft cap: a date change re-draws the
  // missions, zeroes their progress and re-arms the first-run double.
  rollDaily(econ, date);
  // The day's first scoring run has its run share doubled, before the cap — the doubled value
  // is what counts against the room. One-time rewards below never pass through this.
  const share = doubleFirstRun(econ, earned.total);
  const runPaid = applyDailyHalving(share, econ.dailyRunCoins);
  econ.dailyRunCoins += runPaid;

  econ.bestCombo = Math.max(econ.bestCombo, run.maxCombo);
  if (campaignWon) {
    const tier = run.difficulty;
    econ.winsByDifficulty[tier] = (econ.winsByDifficulty[tier] ?? 0) + 1;
    if (starterId) econ.winsByStarter[starterId] = (econ.winsByStarter[starterId] ?? 0) + 1;
  }
  econ.counters.perfects += run.perfects;
  econ.counters.capsules += run.capsules;
  econ.counters.overdrives += run.overdrives;
  econ.counters.reactions += run.reactionTriggers;
  econ.counters.bosses += run.bosses;
  for (const level of run.history) {
    if (level.damageTaken <= 0) econ.counters.flawless++;
    if (level.time > 0 && level.time < SWIFT_SECONDS) econ.counters.swift++;
  }
  let firstUse = 0;
  for (const [id, level] of Object.entries(run.upgrades)) {
    if (level > 0 && !econ.firstUsed[id]) {
      econ.firstUsed[id] = true;
      firstUse += FIRST_USE_REWARD;
    }
  }
  let gift = 0;
  if (!econ.firstGift) {
    econ.firstGift = true;
    gift = FIRST_GIFT;
  }
  const settled = settleMilestones(save.records, econ);
  // Daily missions fold after the counters and settle like milestones: no claim step, and the
  // reward bypasses the soft cap — one-time by nature, capped by the daily reset itself.
  const daily = advanceDaily(econ, run, won);
  const total = runPaid + gift + firstUse + settled.reward + daily.missionReward;
  econ.stardust += total;
  econ.lifetime += total;
  return {
    earned: share,
    runPaid,
    halved: runPaid < share,
    gift,
    firstUse,
    milestones: settled.reward,
    milestoneCount: settled.earned.length,
    missions: daily.missionReward,
    total,
  };
}

/**
 * The shared run settlement (`game/finish.ts`) and the results screen built from it.
 *
 * The settlement test drives a real `Session` object but fakes its aggregates by writing the
 * run's fields directly — the settlement reads the run, it does not simulate it.
 */
import { describe, expect, it } from 'vitest';
import { t } from '../src/core/i18n';
import { randomSeed } from '../src/core/rng';
import { defaultSave, runRank } from '../src/core/storage';
import { Session } from '../src/game/session';
import { settleFinishedRun } from '../src/game/finish';
import { resultsTree } from '../src/wechat/screens/results';
import { uniformMeasurer } from '../src/ui/canvas/text';
import type { ButtonWidget, Widget } from '../src/ui/canvas/widgets';

const m = uniformMeasurer(0.5);

/** A session far enough into an endless run to have aggregates to settle. */
function session(): Session {
  const s = new Session('endless', randomSeed(), {});
  s.start();
  s.run.score = 1_254_530;
  s.run.levelsCleared = 9;
  s.run.level = 10;
  s.run.maxCombo = 64;
  s.run.totalDamage = 480_000;
  s.run.kills = 620;
  s.run.time = 540;
  s.run.perfects = 3;
  s.run.capsules = 5;
  s.run.overdrives = 2;
  s.run.reactionTriggers = 4;
  s.run.bosses = 1;
  return s;
}

describe('settleFinishedRun', () => {
  it('records the run, counts records fresh and stores the save', () => {
    const save = defaultSave();
    // The run counter moves at the start of a scoring run (the DOM App's startRun), not here.
    save.records.runs = 1;
    const s = session();
    const result = settleFinishedRun(save, s, false, true, 'blank');
    expect(result.record).not.toBeNull();
    expect(result.record?.level).toBe(10); // levelsCleared 9 + 1 on a loss
    expect(result.fresh).toContain('level');
    expect(result.fresh).toContain('score');
    expect(save.records.runs).toBe(1); // settlement does not double-count the started run
    expect(save.records.bestEndless).toBe(10);
    expect(save.records.bestScore).toBe(1_254_530);
    expect(save.records.history).toHaveLength(1);
    expect(result.rank).toEqual({ rank: 1, total: 1 });
    // 星尘: first-run gift pays on the first scored run.
    expect(result.payout?.gift).toBeGreaterThan(0);
    expect(save.economy.stardust).toBe(result.payout?.total ?? 0);
    expect(save.economy.firstGift).toBe(true);
  });

  it('pays nothing on an unscored run and records nothing', () => {
    const save = defaultSave();
    const s = session();
    const result = settleFinishedRun(save, s, false, false, null);
    expect(result.record).toBeNull();
    expect(result.payout).toBeNull();
    expect(save.records.runs).toBe(0);
    expect(save.records.history).toHaveLength(0);
    expect(save.economy.firstGift).toBe(false);
  });

  it('pays no 星尘 on a fixed-seed save while records still count', () => {
    const save = defaultSave();
    save.settings.seed = '12345';
    const s = session();
    const result = settleFinishedRun(save, s, true, true, null);
    expect(result.payout).toBeNull();
    expect(save.records.wins).toBe(1);
    expect(result.record?.won).toBe(true);
    expect(result.record?.level).toBe(10); // a win at level 10 reaches 10
  });

  it('ranks against the same-mode history, competition style', () => {
    const save = defaultSave();
    const first = settleFinishedRun(save, session(), false, true, null);
    const second = settleFinishedRun(save, session(), false, true, null);
    expect(first.rank?.rank).toBe(1);
    expect(second.rank?.rank).toBe(1); // the newer run scored higher (fresh random run)
    expect(second.rank?.total).toBe(2);
    // And the rank helper agrees with the stored history.
    const history = save.records.history;
    expect(runRank(history, history[0]?.score ?? 0)).toBe(1);
  });
});

describe('resultsTree', () => {
  const acts = {
    retry(): void {},
    menu(): void {},
  };

  function tree(model: Parameters<typeof resultsTree>[0]): Widget {
    return resultsTree(model, acts, 400, m);
  }

  it('shows outcome, score, tiles and both buttons on a scored run', () => {
    const save = defaultSave();
    const s = session();
    const result = settleFinishedRun(save, s, false, true, 'blank');
    const texts: string[] = [];
    const btns: ButtonWidget[] = [];
    const walk = (w: Widget): void => {
      if (w.kind === 'label') texts.push(w.text);
      if (w.kind === 'button') btns.push(w);
      if (w.kind === 'panel' || w.kind === 'row') w.children.forEach(walk);
      if (w.kind === 'scroll') walk(w.child);
    };
    walk(tree({ won: false, ...result, uploadLine: t('net.uploaded'), uploadOk: true }));
    expect(texts).toContain(t('over.titleLost'));
    expect(texts).toContain(t('over.newRecord'));
    expect(texts).toContain(t('over.tileScore'));
    expect(texts).toContain(t('over.tileTime'));
    expect(texts).toContain(t('net.uploaded'));
    expect(btns.map((b) => b.text)).toEqual([t('over.retry'), t('over.backToMenu')]);
  });

  it('reduces to the outcome headline on an unscored run', () => {
    const texts: string[] = [];
    const walk = (w: Widget): void => {
      if (w.kind === 'label') texts.push(w.text);
      if (w.kind === 'panel' || w.kind === 'row') w.children.forEach(walk);
      if (w.kind === 'scroll') walk(w.child);
    };
    walk(
      tree({
        won: false,
        record: null,
        fresh: [],
        rank: null,
        payout: null,
        uploadLine: null,
        uploadOk: false,
      }),
    );
    expect(texts).toContain(t('over.titleLost'));
    expect(texts.some((line) => line.includes(t('over.tileScore')))).toBe(false);
  });
});

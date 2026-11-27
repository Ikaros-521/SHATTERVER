import { describe, expect, it } from 'vitest';
import { en } from '../src/i18n/en';
import { ja } from '../src/i18n/ja';
import { ko } from '../src/i18n/ko';
import { zh } from '../src/i18n/zh';
import { MAX_HP_BASE } from '../src/game/config';
import { Session, type SessionEvents } from '../src/game/session';
import type { Starter } from '../src/game/starters';
import { dependentsBrokenBy } from '../src/game/upgrades/draft';
import { UPGRADES, UPGRADE_MAP } from '../src/game/upgrades/defs';
import { computeStats } from '../src/game/upgrades/stats';

/**
 * Discarding a level off an owned upgrade at a draft (`Session.discard`): what it removes, what
 * it refuses, and what it does to the cards already on the table.
 */

const DT = 1 / 60;

/** A protocol-shaped starter with the given grants, for builds a test wants in place from sector one. */
function starter(grants: Starter['grants']): Starter {
  return { id: 't', name: '', en: '', desc: '', color: 0, grants, crystals: 0 };
}

/** A run held in its opening draft (the head-start supply), so no sector has to be played. */
function introDraft(grants: Starter['grants'] = {}): Session {
  const session = new Session('campaign', 1, { starter: starter(grants), supplies: ['headstart'] });
  session.start();
  expect(session.phase).toBe('draft');
  return session;
}

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

/** A draft reached the ordinary way: the bot clears sector one. */
function firstDraft(grants: Starter['grants'] = {}): Session {
  const session = new Session('campaign', 3, { bot: true, starter: starter(grants) });
  play(session, () => session.phase === 'draft', 120);
  expect(session.phase).toBe('draft');
  return session;
}

/** Every `discard` event a session emits from here on. */
function watch(session: Session): SessionEvents['discard'][] {
  const seen: SessionEvents['discard'][] = [];
  session.events.on('discard', (event) => seen.push(event));
  return seen;
}

describe('dependentsBrokenBy', () => {
  it('lists the owned upgrades a drop would strip of their prerequisite', () => {
    // 爆裂核心 2 → 1: 连锁反应 stands at `requires: explosive 1` and keeps it; 熔毁核心 wants 2.
    expect(
      dependentsBrokenBy('explosive', { explosive: 2, chainreaction: 1, meltdown: 1, power: 1 }, 1).map(
        (d) => d.id,
      ),
    ).toEqual(['meltdown']);
    // Full removal breaks everything that requires the id at all.
    expect(
      dependentsBrokenBy('explosive', { explosive: 2, chainreaction: 1, meltdown: 1, power: 1 }, 0).map(
        (d) => d.id,
      ),
    ).toEqual(['chainreaction', 'meltdown']);
    // Not owned, so not holding anything back; a requirement on some other id neither.
    expect(dependentsBrokenBy('explosive', { explosive: 1 }, 0)).toEqual([]);
    expect(dependentsBrokenBy('fire', { fire: 1, plague: 1 }, 0)).toEqual([]);
  });

  it('covers every prerequisite pair the pool defines', () => {
    for (const def of UPGRADES) {
      for (const id of Object.keys(def.requires ?? {})) {
        expect(
          dependentsBrokenBy(id, { [def.id]: 1 }, 0).map((d) => d.id),
          `${def.id} requires ${id}`,
        ).toEqual([def.id]);
      }
    }
  });

  it('counts a dependent whatever level it asks for', () => {
    // `meltdown` wants 爆裂核心 2; a build holding it at 1 (a grant, or a debug hook) is still broken by the removal.
    expect(dependentsBrokenBy('explosive', { explosive: 1, meltdown: 1 }, 0).map((d) => d.id)).toEqual([
      'meltdown',
    ]);
  });
});

describe('session: discard', () => {
  it('drops one level and rebuilds the stats from what is left', () => {
    const session = introDraft({ multiball: 2, speed: 3, shield: 1 });
    const seen = watch(session);
    expect(session.run.stats.ballCount).toBe(4 + 2);

    expect(session.discard('multiball')).toBe(true);
    expect(session.run.upgrades).toEqual({ multiball: 1, speed: 3, shield: 1 });
    expect(session.run.stats).toEqual(computeStats({ multiball: 1, speed: 3, shield: 1 }, 0));
    expect(seen).toEqual([{ def: UPGRADE_MAP.multiball, level: 2 }]);
    // The draft is still open: a discard never spends the pick.
    expect(session.phase).toBe('draft');
    expect(session.introPicks).toBe(1);
  });

  it('removes the upgrade once its last level goes', () => {
    const session = introDraft({ multiball: 2 });
    expect(session.discard('multiball')).toBe(true);
    expect(session.discard('multiball')).toBe(true);
    expect(session.run.upgrades).toEqual({});
    expect(session.run.stats.ballCount).toBe(4);
  });

  it('is free, and leaves the reroll counter alone', () => {
    const session = firstDraft({ power: 2 });
    const crystals = session.run.crystals;
    const rerollCost = session.rerollCost;
    expect(session.discard('power')).toBe(true);
    expect(session.run.crystals).toBe(crystals);
    expect(session.rerolls).toBe(0);
    expect(session.rerollCost).toBe(rerollCost);
    expect(session.skipReward).toBe(Math.round(20 * session.run.stats.crystalMult));
  });

  it('refuses what the build does not hold, unknown ids, and anything outside a draft', () => {
    const session = introDraft({ power: 2 });
    const seen = watch(session);

    expect(session.discard('fire')).toBe(false);
    expect(session.discard('not-an-upgrade')).toBe(false);
    expect(seen).toEqual([]);
    expect(session.run.upgrades).toEqual({ power: 2 });

    session.skip();
    expect(session.phase).toBe('playing');
    expect(session.discard('power')).toBe(false);
    expect(session.run.upgrades.power).toBe(2);
    expect(seen).toEqual([]);
  });

  it('can empty the build back to its bare stats, one level at a time', () => {
    const session = introDraft({ multiball: 2, speed: 1, shield: 1 });
    for (const id of Object.keys(session.run.upgrades)) {
      while ((session.run.upgrades[id] ?? 0) > 0) expect(session.discard(id), `${id}`).toBe(true);
    }
    expect(session.run.upgrades).toEqual({});
    expect(session.run.stats).toEqual(computeStats({}, 0));
    expect(session.run.maxHp).toBe(MAX_HP_BASE);
  });

  it('lets the next sector be opened on the reduced build', () => {
    const session = firstDraft({ multiball: 2 });
    expect(session.discard('multiball')).toBe(true);
    session.skip();
    expect(session.phase).toBe('playing');
    // Ball count is read when a world is built, so the new sector opens with five balls, not six.
    expect(session.world.balls).toHaveLength(4 + 1);
  });

  it('works on the opening draft too, before sector one opens', () => {
    const session = introDraft({ multiball: 2 });
    expect(session.discard('multiball')).toBe(true);
    expect(session.choose(session.draft[0]?.id ?? '')).toBe(true);
    expect(session.phase).toBe('playing');
    expect(session.world.balls).toHaveLength(4 + 1);
  });

  it('changes neither the geography of the next sector nor the cards already drawn', () => {
    // Levels come from their own stream, and a discard draws nothing: only the build moves.
    const plain = firstDraft({ power: 2 });
    const trimmed = firstDraft({ power: 2 });
    expect(trimmed.discard('power')).toBe(true);
    expect(trimmed.draft).toEqual(plain.draft);

    plain.skip();
    trimmed.skip();
    expect(trimmed.world.level).toEqual(plain.world.level);
  });

  it('clamps the lives in hand when the shield cap drops with the level', () => {
    const session = introDraft({ shield: 2 });
    expect(session.run.maxHp).toBe(MAX_HP_BASE + 2);

    session.run.hp = 3;
    expect(session.discard('shield')).toBe(true);
    expect(session.run.maxHp).toBe(MAX_HP_BASE + 1);
    expect(session.run.hp).toBe(3);

    // A hand above the new cap is cut down to it.
    const full = introDraft({ shield: 2 });
    expect(full.discard('shield')).toBe(true);
    expect(full.run.maxHp).toBe(MAX_HP_BASE + 1);
    expect(full.run.hp).toBe(MAX_HP_BASE + 1);
  });
});

describe('session: discard and prerequisites', () => {
  it('holds back a level that an owned upgrade stands on', () => {
    // 连锁反应 needs 爆裂核心 1; the second level may go, the first may not.
    const session = introDraft({ explosive: 2, chainreaction: 1, power: 1 });
    const seen = watch(session);

    expect(session.discard('explosive')).toBe(true);
    expect(session.run.upgrades.explosive).toBe(1);
    expect(session.run.stats.explosionChain).toBe(true);
    expect(seen).toEqual([{ def: UPGRADE_MAP.explosive, level: 2 }]);

    expect(session.discard('explosive')).toBe(false);
    expect(session.run.upgrades.explosive).toBe(1);
    expect(session.run.stats.explosionChain).toBe(true);
    expect(seen).toHaveLength(1);

    // Everything else is still free to go.
    expect(session.discard('power')).toBe(true);
  });

  it('releases the last level once the dependent is gone', () => {
    const session = introDraft({ explosive: 2, chainreaction: 1, meltdown: 1 });
    // 熔毁核心 needs 爆裂核心 2: even one level off is refused until it goes.
    expect(session.discard('explosive')).toBe(false);
    expect(session.discard('meltdown')).toBe(true);
    expect(session.discard('explosive')).toBe(true);
    expect(session.discard('explosive')).toBe(false);
    expect(session.discard('chainreaction')).toBe(true);
    expect(session.discard('explosive')).toBe(true);
    expect(session.run.upgrades).toEqual({});
  });

  it('takes the cards that needed the level off the table, and leaves the rest', () => {
    const session = introDraft({ fire: 1 });
    session.draft = [UPGRADE_MAP.wildfire!, UPGRADE_MAP.power!, UPGRADE_MAP.crit!];

    // The removal breaks 野火's prerequisite, so the card leaves with the level.
    expect(session.discard('fire')).toBe(true);
    expect(session.draft.map((def) => def.id)).toEqual(['power', 'crit']);
    // A card that left cannot be picked any more.
    expect(session.choose('wildfire')).toBe(false);
    expect(session.phase).toBe('draft');
    expect(session.choose('power')).toBe(true);
  });

  it('leaves offered cards alone while their prerequisite still stands', () => {
    // 野火 needs 烈焰附魔 1; a drop from 2 to 1 keeps it satisfied, so the card stays.
    const session = introDraft({ fire: 2 });
    session.draft = [UPGRADE_MAP.wildfire!, UPGRADE_MAP.power!];
    expect(session.discard('fire')).toBe(true);
    expect(session.draft.map((def) => def.id)).toEqual(['wildfire', 'power']);
  });

  it('leaves a card of the discarded upgrade itself on the table, to be taken again', () => {
    const session = introDraft({ power: 2 });
    session.draft = [UPGRADE_MAP.power!, UPGRADE_MAP.crit!];
    expect(session.discard('power')).toBe(true);
    expect(session.draft.map((def) => def.id)).toEqual(['power', 'crit']);
    expect(session.choose('power')).toBe(true);
    expect(session.run.upgrades.power).toBe(2);
  });
});

describe('discard copy stays inside the platform review vocabulary', () => {
  // The tutorial test's pattern, applied to the draft namespace the discard copy lives in. The
  // release scanner rejects a bundle over single characters, so every locale is checked.
  const BANNED =
    /死|杀|血|毒|疫|瘟|处决|邪魔|0MB|极致|最强|顶级|第一|唯一|绝对|免安装|抽卡|计费|入账|钱包|充值|付费|收费|到账|提现|内购|购买|抽奖|开箱|钻石|赌博|色情|约炮/;
  const BANNED_LATIN =
    /\b(KILLER|WEAPON|DEATH|BOMB|GAMBLE|GAMBLING|CASINO|PORN|LOOT|GACHA|REVIVE|LETHAL|PURCHASE|PAID|PAYS|BUY|WALLET)\b/i;

  const hits: string[] = [];
  const walk = (value: unknown, path: string): void => {
    if (typeof value === 'string') {
      if (BANNED.test(value)) hits.push(`${path}: ${value}`);
      else if (BANNED_LATIN.test(value)) hits.push(`${path}: ${value}`);
    } else if (value && typeof value === 'object') {
      for (const [key, entry] of Object.entries(value)) walk(entry, `${path}.${key}`);
    }
  };

  it('the draft namespace is clean in all four locales', () => {
    walk(zh.draft, 'zh.draft');
    walk(en.draft, 'en.draft');
    walk(ja.draft, 'ja.draft');
    walk(ko.draft, 'ko.draft');
    expect(hits).toEqual([]);
  });

  it('every discard key is filled in, with the names it interpolates', () => {
    for (const [name, locale] of Object.entries({ zh, en, ja, ko })) {
      const draft = locale.draft;
      expect(draft.buildHint.trim(), `${name}: buildHint`).not.toBe('');
      expect(draft.buildToggle.trim(), `${name}: buildToggle`).not.toBe('');
      expect(draft.discardAsk.trim(), `${name}: discardAsk`).not.toBe('');
      expect(draft.discardAsk, `${name}: discardAsk`).toContain('{name}');
      expect(draft.discardAskLower, `${name}: discardAskLower`).toContain('{name}');
      expect(draft.discardAskLower, `${name}: discardAskLower`).toContain('{lv}');
      expect(draft.discardAskLower, `${name}: discardAskLower`).toContain('{next}');
      expect(draft.discardAskDeps.trim(), `${name}: discardAskDeps`).not.toBe('');
      expect(draft.discardAskDeps, `${name}: discardAskDeps`).toContain('{deps}');
      expect(draft.discardConfirm.trim(), `${name}: discardConfirm`).not.toBe('');
      expect(draft.discardCancel.trim(), `${name}: discardCancel`).not.toBe('');
      expect(draft.discardBack.trim(), `${name}: discardBack`).not.toBe('');
      expect(draft.discardLocked, `${name}: discardLocked`).toContain('{name}');
      expect(draft.discardLocked, `${name}: discardLocked`).toContain('{deps}');
      // Nothing left to interpolate once `t()` is done with it.
      const filled = [
        locale.draft.discardAsk,
        locale.draft.discardAskLower,
        locale.draft.discardAskDeps,
        locale.draft.discardLocked,
      ].map((text) => text.replace(/\{\w+\}/g, 'x'));
      for (const text of filled) expect(text, `${name}`).not.toMatch(/\{|\}/);
    }
  });
});

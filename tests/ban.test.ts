import { describe, expect, it } from 'vitest';
import { en } from '../src/i18n/en';
import { ja } from '../src/i18n/ja';
import { ko } from '../src/i18n/ko';
import { zh } from '../src/i18n/zh';
import { BAN_COST_BASE, BAN_COST_ESCALATION } from '../src/game/config';
import { Session, type SessionEvents } from '../src/game/session';
import type { Starter } from '../src/game/starters';
import { UPGRADE_MAP } from '../src/game/upgrades/defs';

/**
 * Banning an offered card off the run's draft pool (`Session.ban`): what it costs, what it
 * refuses, and the promise the whole feature rests on — a banned card never deals again.
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

/** A run held in an opening draft of `picks` self-picks, the way a shop protocol grants them. */
function protocolDraft(picks: number): Session {
  const protocol = { ...starter({}), introPicks: picks } as Starter;
  const session = new Session('campaign', 5, { starter: protocol });
  session.start();
  expect(session.phase).toBe('draft');
  expect(session.introPicks).toBe(picks);
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

/** Every `ban` event a session emits from here on. */
function watchBan(session: Session): SessionEvents['ban'][] {
  const seen: SessionEvents['ban'][] = [];
  session.events.on('ban', (event) => seen.push(event));
  return seen;
}

describe('session: ban', () => {
  it('takes one offered card off the table for its price, and spends no pick', () => {
    const session = introDraft();
    session.run.crystals = 1000;
    session.draft = [UPGRADE_MAP.power!, UPGRADE_MAP.crit!, UPGRADE_MAP.fire!];
    const seen = watchBan(session);

    expect(session.banCost(UPGRADE_MAP.power!)).toBe(BAN_COST_BASE.common);
    expect(session.ban('power')).toBe(true);
    expect(session.run.crystals).toBe(1000 - BAN_COST_BASE.common);
    expect(session.draft.map((def) => def.id)).toEqual(['crit', 'fire']);
    expect([...session.bans]).toEqual(['power']);
    expect(seen).toEqual([{ def: UPGRADE_MAP.power, cost: BAN_COST_BASE.common }]);
    // The pick itself still stands: the player chooses among what remains.
    expect(session.phase).toBe('draft');
    expect(session.introPicks).toBe(1);
    expect(session.choose('crit')).toBe(true);
    expect(session.phase).toBe('playing');
  });

  it('charges a rising price as the run bans more', () => {
    const session = introDraft();
    session.run.crystals = 100000;
    session.draft = [UPGRADE_MAP.power!, UPGRADE_MAP.crit!, UPGRADE_MAP.fire!];

    expect(session.ban('power')).toBe(true);
    // The second ban pays 稀有's base plus one escalation step; the third pays two.
    expect(session.banCost(UPGRADE_MAP.crit!)).toBe(BAN_COST_BASE.rare + BAN_COST_ESCALATION);
    expect(session.ban('crit')).toBe(true);
    expect(session.banCost(UPGRADE_MAP.fire!)).toBe(BAN_COST_BASE.rare + 2 * BAN_COST_ESCALATION);
    expect(session.run.crystals).toBe(
      100000 - BAN_COST_BASE.common - (BAN_COST_BASE.rare + BAN_COST_ESCALATION),
    );
    expect(session.bans.length).toBe(2);
  });

  it('refuses a card it cannot pay for, a table down to its last card, and anything outside a draft', () => {
    const session = introDraft();
    session.run.crystals = 10;
    session.draft = [UPGRADE_MAP.power!, UPGRADE_MAP.crit!, UPGRADE_MAP.fire!];
    const seen = watchBan(session);

    expect(session.ban('power')).toBe(false);
    expect(session.run.crystals).toBe(10);
    expect(session.draft).toHaveLength(3);
    expect(seen).toEqual([]);

    session.run.crystals = 100000;
    expect(session.ban('power')).toBe(true);
    expect(session.ban('crit')).toBe(true);
    // One card left: banning it would leave the pick nowhere to land.
    expect(session.ban('fire')).toBe(false);
    expect(session.draft.map((def) => def.id)).toEqual(['fire']);

    session.skip();
    expect(session.phase).toBe('playing');
    expect(session.ban('fire')).toBe(false);
    expect(seen).toHaveLength(2);
  });

  it('refuses cards that are not on the table, and unknown ids', () => {
    const session = firstDraft();
    session.run.crystals = 100000;
    expect(session.ban('wildfire')).toBe(false);
    expect(session.ban('not-an-upgrade')).toBe(false);
    expect(session.bans.length).toBe(0);
  });

  it('leaves the reroll counter and the reroll price alone', () => {
    const session = firstDraft();
    session.run.crystals = 100000;
    session.draft = [UPGRADE_MAP.power!, UPGRADE_MAP.crit!, UPGRADE_MAP.fire!];
    const rerollCost = session.rerollCost;
    expect(session.ban('power')).toBe(true);
    expect(session.rerolls).toBe(0);
    expect(session.rerollCost).toBe(rerollCost);
  });
});

describe('a banned card never deals again', () => {
  it('stays off the table through rerolls, the next sector, and every draft after', () => {
    const session = firstDraft();
    session.run.crystals = 1000000;
    session.draft = [UPGRADE_MAP.power!, UPGRADE_MAP.crit!, UPGRADE_MAP.fire!];
    expect(session.ban('power')).toBe(true);

    // Thirty fresh tables: the banned id is excluded from every one of them.
    for (let i = 0; i < 30; i++) {
      expect(session.reroll(), `reroll ${i}`).toBe(true);
      expect(session.draft.map((def) => def.id)).not.toContain('power');
    }

    // And the promise holds past the draft the ban was made in: play on, draft again.
    session.choose(session.draft[0]!.id);
    play(session, () => session.phase === 'draft', 120);
    expect(session.phase).toBe('draft');
    expect(session.draft.map((def) => def.id)).not.toContain('power');
    expect([...session.bans]).toEqual(['power']);
  });

  it('starves the payoffs of a banned prerequisite out of the pool', () => {
    // 野火 stands on 烈焰附魔 1; with 烈焰附魔 banned it can never meet its `requires` again.
    const session = firstDraft();
    session.run.crystals = 1000000;
    session.draft = [UPGRADE_MAP.fire!, UPGRADE_MAP.crit!, UPGRADE_MAP.power!];
    expect(session.ban('fire')).toBe(true);
    for (let i = 0; i < 30; i++) {
      expect(session.reroll(), `reroll ${i}`).toBe(true);
      const ids = session.draft.map((def) => def.id);
      expect(ids).not.toContain('fire');
      expect(ids).not.toContain('wildfire');
    }
  });

  it('bans made on an opening draft carry into its follow-up picks', () => {
    const session = protocolDraft(2);
    session.run.crystals = 100000;
    session.draft = [UPGRADE_MAP.power!, UPGRADE_MAP.crit!, UPGRADE_MAP.fire!];
    expect(session.ban('power')).toBe(true);
    // The pick opens the next self-pick: it excludes what is owned now, and what is banned.
    expect(session.choose('crit')).toBe(true);
    expect(session.phase).toBe('draft');
    const ids = session.draft.map((def) => def.id);
    expect(ids).not.toContain('power');
    expect(ids).not.toContain('crit');
  });
});

describe('ban copy stays inside the platform review vocabulary', () => {
  // The tutorial test's pattern, applied to the draft namespace the ban copy lives in. The
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

  it('every ban key is filled in', () => {
    for (const [name, locale] of Object.entries({ zh, en, ja, ko })) {
      const draft = locale.draft;
      expect(draft.ban.trim(), `${name}: ban`).not.toBe('');
      expect(draft.banHint.trim(), `${name}: banHint`).not.toBe('');
      expect(draft.banConfirm.trim(), `${name}: banConfirm`).not.toBe('');
      expect(draft.banCancel.trim(), `${name}: banCancel`).not.toBe('');
    }
  });
});

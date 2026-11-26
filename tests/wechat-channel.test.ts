/**
 * The WeChat leaderboard channel: fake cloud + injected storage, same recipe as
 * `toychannel.test.ts`. The i18n keys are asserted through `t()` rather than literal strings, so
 * the tests hold in every language.
 */
import { describe, expect, it } from 'vitest';
import { t } from '../src/core/i18n';
import type { RunRecord } from '../src/core/storage';
import {
  WX_NICKNAME_MAX,
  WeChatChannel,
  checkWeChatNickname,
  coerceBoardView,
  isWeChatRuntime,
  type StoredIdentity,
} from '../src/net/wechatchannel';

function record(over: Partial<RunRecord> = {}): RunRecord {
  return {
    mode: 'campaign',
    difficulty: 'standard',
    score: 1234,
    level: 5,
    code: '1-5',
    name: 'SECTOR',
    combo: 7,
    damage: 900,
    kills: 50,
    time: 120,
    won: false,
    date: 1,
    seed: 1,
    build: {},
    ...over,
  };
}

/** The cloud function with every answer overridable, recording what the channel asked of it. */
class FakeCloud {
  calls: { action: string; data: Record<string, unknown> }[] = [];
  /** A thrown error means the transport died (offline). */
  dead = false;
  submit: Record<string, unknown> = { ok: true, rank: 4, total: 120 };
  list: Record<string, unknown> = {
    ok: true,
    entries: [
      { rank: 1, nickname: '阿碎', score: 5000, streak: 9 },
      { rank: 2, nickname: '上分选手', score: 4800, streak: 0 },
    ],
    total: 42,
  };
  myRank: Record<string, unknown> = { ok: true, ranked: true, rank: 4, score: 1234, total: 120 };
  rename: Record<string, unknown> = { ok: true, nickname: '改名' };

  async call(action: string, data: Record<string, unknown>): Promise<unknown> {
    this.calls.push({ action, data });
    if (this.dead) throw new Error('offline');
    if (action === 'submit') return this.submit;
    if (action === 'list') return this.list;
    if (action === 'myRank') return this.myRank;
    return this.rename;
  }

  asked(action: string): { action: string; data: Record<string, unknown> } | undefined {
    return this.calls.find((entry) => entry.action === action);
  }
}

interface Harness {
  fake: FakeCloud;
  channel: WeChatChannel;
  /** Every identity document the channel wrote, in order. */
  written: StoredIdentity[];
}

/**
 * Builds a channel over a fake cloud. `read` is the stored identity nickname; a non-null read
 * comes back as "named but pending" — the state of a player who typed a name and has not scored
 * since. Pass `scored` to restore a player whose name the server already accepted.
 */
function make(read: string | null = null, now = (): number => 1000, scored = false): Harness {
  const fake = new FakeCloud();
  const written: StoredIdentity[] = [];
  const stored: StoredIdentity | null = read === null ? null : { nickname: read, pending: !scored };
  const channel = new WeChatChannel({
    call: (action, data) => fake.call(action, data),
    readIdentity: () => stored,
    writeIdentity: (identity) => written.push(identity),
    now,
  });
  return { fake, channel, written };
}

describe('isWeChatRuntime', () => {
  it('is false where there is no wx global (plain Node)', () => {
    // `typeof` is the only safe probe; this is also the guard that keeps the web build honest.
    expect(isWeChatRuntime()).toBe(false);
  });
});

describe('checkWeChatNickname', () => {
  it('accepts a Chinese name — the point of this channel owning identity', () => {
    expect(checkWeChatNickname('碎界玩家')).toEqual({ ok: true, value: '碎界玩家' });
  });

  it('rejects empty and out-of-bounds names', () => {
    expect(checkWeChatNickname('')).toEqual({ ok: false, message: t('net.nickEmpty') });
    expect(checkWeChatNickname('碎').ok).toBe(false);
    expect(checkWeChatNickname('碎'.repeat(WX_NICKNAME_MAX + 1)).ok).toBe(false);
  });

  it('rejects blocked and reserved names through the shared rules', () => {
    expect(checkWeChatNickname('fuck')).toEqual({ ok: false, message: t('net.nickBlocked') });
    expect(checkWeChatNickname('admin')).toEqual({ ok: false, message: t('net.nickReserved') });
  });
});

describe('finishRun', () => {
  it('submits once, carrying the stored nickname on the first scored run', async () => {
    const { fake, channel } = make('碎界玩家');
    const outcome = await channel.finishRun(record());
    expect(outcome.ok).toBe(true);
    expect(fake.calls).toHaveLength(1);
    const asked = fake.asked('submit');
    expect(asked?.data).toMatchObject({
      score: 1234,
      streak: 7,
      mode: 'campaign',
      difficulty: 'standard',
      nickname: '碎界玩家',
    });
    expect(outcome.message).toBe(t('net.uploadedRank', { rank: 4, total: 120 }));
    expect(outcome.rank).toEqual({ rank: 4, total: 120 });
    // The name has been consumed: later submits no longer carry it.
    expect(channel.nicknamePending).toBe(false);
    await channel.finishRun(record());
    expect(fake.calls[1].data.nickname).toBeUndefined();
  });

  it('lands on the abyss board only for abyss runs', async () => {
    const { channel } = make();
    const standard = await channel.finishRun(record());
    expect(standard.boards).not.toContain('diff-abyss');
    const abyss = await channel.finishRun(record({ difficulty: 'abyss' }));
    expect(abyss.boards).toContain('diff-abyss');
  });

  it('declines a zero score without calling the cloud', async () => {
    const { fake, channel } = make();
    const outcome = await channel.finishRun(record({ score: 0 }));
    expect(outcome.ok).toBe(false);
    expect(outcome.message).toBe(t('net.scoreZero'));
    expect(fake.calls).toHaveLength(0);
  });

  it('words server refusals through the shared i18n keys', async () => {
    const { fake, channel } = make();
    fake.submit = { ok: false, reason: 'rate-limited' };
    const limited = await channel.finishRun(record());
    expect(limited).toMatchObject({ ok: false, message: t('net.scoreRateLimited') });

    fake.submit = { ok: false, reason: 'invalid' };
    expect((await channel.finishRun(record())).message).toBe(t('net.scoreRejected'));
  });

  it('survives a dead transport as an ordinary failure', async () => {
    const { fake, channel } = make();
    fake.dead = true;
    const outcome = await channel.finishRun(record());
    expect(outcome.ok).toBe(false);
    expect(outcome.message).toBe(t('net.scoreOffline'));
  });
});

describe('rename', () => {
  it('holds a new player name locally — it rides the first submit', async () => {
    const { fake, channel, written } = make(null);
    const outcome = await channel.rename('新名字');
    expect(outcome).toMatchObject({
      ok: true,
      nickname: '新名字',
      pending: true,
      message: t('net.renamePending', { name: '新名字' }),
    });
    expect(written).toEqual([{ nickname: '新名字', pending: true }]);
    expect(fake.calls).toHaveLength(0);
  });

  it('rejects a blocked name before anything is stored or sent', async () => {
    const { fake, channel, written } = make();
    const outcome = await channel.rename('fuck');
    expect(outcome).toMatchObject({ ok: false, message: t('net.nickBlocked') });
    expect(written).toHaveLength(0);
    expect(fake.calls).toHaveLength(0);
  });

  it('rewrites the server documents once a score already exists', async () => {
    const { fake, channel } = make('旧名');
    await channel.finishRun(record()); // scored now
    fake.rename = { ok: true, nickname: '改名' };
    const outcome = await channel.rename('改名');
    expect(outcome).toMatchObject({
      ok: true,
      nickname: '改名',
      pending: false,
      message: t('net.renameApplied', { name: '改名' }),
    });
    expect(fake.asked('rename')?.data.nickname).toBe('改名');
  });

  it('rolls the local name back when the server refuses the rewrite', async () => {
    const { fake, channel } = make('旧名');
    await channel.finishRun(record());
    fake.rename = { ok: false, reason: 'rate-limited' };
    const outcome = await channel.rename('新名');
    expect(outcome).toMatchObject({ ok: false, nickname: '旧名', message: t('net.renameRateLimited') });
    expect(channel.nickname).toBe('旧名');
  });
});

describe('board', () => {
  it('maps the shared tab ids onto boards and windows', async () => {
    const { fake, channel } = make();
    await channel.board('weekly');
    expect(fake.asked('list')?.data).toMatchObject({ board: 'overall', window: 'week' });
    await channel.board('diff-abyss');
    expect(fake.calls[1].data).toMatchObject({ board: 'abyss', window: 'all' });
  });

  it('answers null for unknown tabs without calling the cloud', async () => {
    const { fake, channel } = make();
    expect(await channel.board('cb-global')).toBeNull();
    expect(fake.calls).toHaveLength(0);
  });

  it('coerces host entries and serves them from the 30-second cache', async () => {
    let tick = 1000;
    const { fake, channel } = make(null, (): number => tick);
    const view = await channel.board('mode-endless');
    expect(view?.entries[0]).toMatchObject({ rank: 1, nickname: '阿碎', score: 5000, streak: 9 });
    expect(view?.totalEntries).toBe(42);

    tick += 10_000;
    await channel.board('mode-endless');
    expect(fake.asked('list')).toBe(fake.calls[fake.calls.length - 1]); // no second call

    tick += 31_000;
    await channel.board('mode-endless');
    expect(fake.calls.filter((entry) => entry.action === 'list')).toHaveLength(2);
  });

  it('degrades to null on a failed read, never an exception', async () => {
    const { fake, channel } = make();
    fake.dead = true;
    expect(await channel.board('all-time')).toBeNull();
  });
});

describe('myRank', () => {
  it('maps an unplaced answer to null', async () => {
    const { fake, channel } = make();
    fake.myRank = { ok: true, ranked: false, rank: 0, score: 0, total: 0 };
    expect(await channel.myRank()).toBeNull();
  });

  it('caches the rank and re-reads after invalidate', async () => {
    const { fake } = make();
    let tick = 1000;
    const cached = new WeChatChannel({
      call: (action, data) => fake.call(action, data),
      readIdentity: () => null,
      writeIdentity: () => undefined,
      now: (): number => tick,
    });
    const rank = await cached.myRank();
    expect(rank).toEqual({ rank: 4, score: 1234, streak: 0, totalPlayers: 120 });

    tick += 10_000;
    await cached.myRank();
    expect(fake.calls.filter((entry) => entry.action === 'myRank')).toHaveLength(1);

    cached.invalidate();
    tick += 1000;
    await cached.myRank();
    expect(fake.calls.filter((entry) => entry.action === 'myRank')).toHaveLength(2);
  });
});

describe('coerceBoardView', () => {
  it('rejects payloads that are not shaped like a listing', () => {
    expect(coerceBoardView('all-time', null)).toBeNull();
    expect(coerceBoardView('all-time', { ok: true })).toBeNull();
    expect(coerceBoardView('all-time', { entries: 'nope' })).toBeNull();
    expect(coerceBoardView('all-time', { entries: [null, 3, { nickname: 'x', score: 1 }] })).toMatchObject({
      scoreboardId: 'all-time',
      entries: [{ nickname: 'x', score: 1 }],
    });
  });
});

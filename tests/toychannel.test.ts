import { describe, expect, it } from 'vitest';
import { getLang, setLang, t } from '../src/core/i18n';
import type { RunRecord } from '../src/core/storage';
import type { BoardView, CbResult } from '../src/net/cheddaboards';
import { ToyChannel } from '../src/net/toychannel';
import type { ToyLike, ToyProfile } from '../src/net/toy';

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

/** An SDK with every answer overridable, recording what the channel asked of it. */
class FakeSdk implements ToyLike {
  submits: { board?: number; score: number }[] = [];
  lists: { board?: number; period?: string; limit?: number }[] = [];
  profiles = 0;
  submitError: unknown = null;
  rankListError: unknown = null;
  rank: { ranked: boolean; rank: number; score: number } = { ranked: true, rank: 3, score: 1234 };
  profile: ToyProfile | null = { nickname: '阿碎' };

  async isSupport(ability: string): Promise<boolean> {
    return ability === 'getUserProfile' ? this.profile !== null : true;
  }
  async submitScore(req: { board?: number; score: number }): Promise<{ score: number }> {
    if (this.submitError) throw this.submitError;
    this.submits.push(req);
    return { score: req.score };
  }
  async getRankList(req?: { board?: number; period?: 'all' | 'week' | 'day'; limit?: number }) {
    if (this.rankListError) throw this.rankListError;
    this.lists.push(req ?? {});
    return [{ rank: 1, score: 99, nickname: '上分选手' }];
  }
  async getMyRank() {
    return this.rank;
  }
  async getUserProfile(): Promise<ToyProfile> {
    this.profiles++;
    if (!this.profile) throw { type: 'user_denied' };
    return this.profile;
  }
}

const NOW = 1_000_000;

function channel(sdk: FakeSdk, chedda?: { view: BoardView | null }): ToyChannel {
  return new ToyChannel({
    sdk: () => Promise.resolve(sdk),
    ...(chedda
      ? {
          chedda: {
            getBoard: (): Promise<CbResult<BoardView>> =>
              Promise.resolve(
                chedda.view
                  ? { ok: true as const, data: chedda.view }
                  : { ok: false as const, error: 'network', status: 0, kind: 'network' as const },
              ),
          },
        }
      : {}),
    now: () => NOW,
  });
}

describe('ToyChannel.finishRun', () => {
  it('submits the fan-out slot and the matching mode slot', async () => {
    const sdk = new FakeSdk();
    const outcome = await channel(sdk).finishRun(record({ mode: 'campaign' }));
    expect(outcome.ok).toBe(true);
    expect(sdk.submits.map((submit) => submit.board)).toEqual([1, 3]);
    expect(outcome.boards).toEqual(['all-time', 'weekly', 'daily', 'mode-campaign']);
  });

  it('adds the abyss slot only for abyss runs', async () => {
    const sdk = new FakeSdk();
    const outcome = await channel(sdk).finishRun(record({ mode: 'endless', difficulty: 'abyss' }));
    expect(sdk.submits.map((submit) => submit.board)).toEqual([1, 2, 4]);
    expect(outcome.boards).toEqual(['all-time', 'weekly', 'daily', 'mode-endless', 'diff-abyss']);
  });

  it('reports the Toy rank when the player is placed', async () => {
    const outcome = await channel(new FakeSdk()).finishRun(record());
    expect(outcome.message).toContain(t('cloud.myRank', { rank: 3 }));
    expect(outcome.message).toContain(t('net.uploaded'));
    expect(outcome.rank).toEqual({ rank: 3, total: 0 });
  });

  it('uploads calmly when the rank answer is a broken shape', async () => {
    const sdk = new FakeSdk();
    // Host data passes through raw by design, so the channel may receive anything.
    const broken = sdk as unknown as { getMyRank(): Promise<unknown> };
    broken.getMyRank = () => Promise.resolve({ ranked: 'yes', rank: '3' });
    const outcome = await channel(sdk).finishRun(record());
    expect(outcome.ok).toBe(true);
    expect(outcome.rank).toBeUndefined();
    expect(outcome.message).toBe(t('net.uploaded'));
    const nullShape = new FakeSdk() as unknown as { getMyRank(): Promise<unknown> };
    nullShape.getMyRank = () => Promise.resolve(null);
    const mine = await channel(nullShape as FakeSdk).myRank();
    expect(mine).toBeNull();
  });

  it('speaks the active language when the platform is unavailable', async () => {
    const previous = getLang();
    setLang('en');
    try {
      const outcome = await new ToyChannel({ sdk: () => Promise.resolve(null) }).finishRun(record());
      expect(outcome.message).toBe(t('net.toyUnavailable'));
      expect(outcome.message).toContain('Bilibili component is unavailable');
    } finally {
      setLang(previous);
    }
  });

  it('skips a scoreless run without touching the SDK', async () => {
    const sdk = new FakeSdk();
    const outcome = await channel(sdk).finishRun(record({ score: 0 }));
    expect(outcome.ok).toBe(false);
    expect(sdk.submits).toHaveLength(0);
  });

  it('explains a login refusal and does not spend quota on the extra slots', async () => {
    const sdk = new FakeSdk();
    sdk.submitError = { type: 'not_logged_in' };
    const outcome = await channel(sdk).finishRun(record());
    expect(outcome.ok).toBe(false);
    expect(outcome.message).toContain('登录');
    expect(sdk.submits).toHaveLength(0);
  });

  it('stays calm when the SDK never loaded', async () => {
    const dead = new ToyChannel({ sdk: () => Promise.resolve(null) });
    const outcome = await dead.finishRun(record());
    expect(outcome.ok).toBe(false);
    expect(outcome.message).toContain('B站组件不可用');
  });
});

describe('ToyChannel boards', () => {
  it('maps the fan-out tabs onto board 1 periods', async () => {
    const sdk = new FakeSdk();
    const board = await channel(sdk).board('weekly');
    expect(sdk.lists[0]).toEqual({ board: 1, period: 'week', limit: 100 });
    expect(board?.entries[0]).toEqual({ rank: 1, nickname: '上分选手', score: 99, streak: 0 });
  });

  it('reuses a fresh read instead of spending quota again', async () => {
    const sdk = new FakeSdk();
    const board = channel(sdk);
    await board.board('daily');
    await board.board('daily');
    expect(sdk.lists).toHaveLength(1);
    board.invalidate();
    await board.board('daily');
    expect(sdk.lists).toHaveLength(2);
  });

  it('mirrors the Chedda global board read-only', async () => {
    const sdk = new FakeSdk();
    const view: BoardView = {
      scoreboardId: 'all-time',
      entries: [{ rank: 1, nickname: 'Ace', score: 9, streak: 0 }],
    };
    const board = await channel(sdk, { view }).board('cb-global');
    expect(board?.entries[0].nickname).toBe('Ace');
    expect(sdk.lists).toHaveLength(0); // The mirror never touches the Toy SDK.
    const failed = await channel(new FakeSdk(), { view: null }).board('cb-global');
    expect(failed).toBeNull();
  });

  it('returns null for a board the SDK cannot serve', async () => {
    const sdk = new FakeSdk();
    sdk.rankListError = { code: 307044 };
    expect(await channel(sdk).board('all-time')).toBeNull();
  });

  it('treats a rank list that is not an array as unreadable, not as a crash', async () => {
    const sdk = new FakeSdk() as unknown as { getRankList(): Promise<unknown> };
    sdk.getRankList = () => Promise.resolve(null);
    expect(await channel(sdk as FakeSdk).board('weekly')).toBeNull();
    sdk.getRankList = () => Promise.resolve({ entries: [] });
    expect(await channel(sdk as FakeSdk).board('daily')).toBeNull();
  });

  it('lists every tab the screen should show, in order', async () => {
    const ids = (await channel(new FakeSdk()).knownBoards()).map((board) => board.scoreboardId);
    expect(ids).toEqual(['all-time', 'weekly', 'daily', 'mode-endless', 'mode-campaign', 'diff-abyss']);
  });

  it('lists the global mirror only when a Chedda client was handed in', async () => {
    const view: BoardView = { scoreboardId: 'all-time', entries: [] };
    const ids = (await channel(new FakeSdk(), { view }).knownBoards()).map((board) => board.scoreboardId);
    // The platform package omits the client, so the tab simply does not exist there.
    expect(ids).toEqual([
      'all-time',
      'weekly',
      'daily',
      'mode-endless',
      'mode-campaign',
      'diff-abyss',
      'cb-global',
    ]);
  });
});

describe('ToyChannel identity', () => {
  it('fetches the B站 nickname once per session', async () => {
    const sdk = new FakeSdk();
    const board = channel(sdk);
    expect(await board.loadNickname()).toBe('阿碎');
    expect(await board.loadNickname()).toBe('阿碎');
    expect(sdk.profiles).toBe(1);
    expect(board.nickname).toBe('阿碎');
  });

  it('resolves to no nickname when the platform refuses', async () => {
    const sdk = new FakeSdk();
    sdk.profile = null;
    expect(await channel(sdk).loadNickname()).toBeNull();
  });

  it('declines renames instead of pretending to apply them', async () => {
    const outcome = await channel(new FakeSdk()).rename('newname');
    expect(outcome.ok).toBe(false);
    expect(outcome.message).toContain('B站昵称');
  });

  it('asks for my rank only when the SDK is present', async () => {
    const mine = await channel(new FakeSdk()).myRank();
    expect(mine).toEqual({ rank: 3, score: 1234, streak: 0, totalPlayers: 0 });
    const unranked = new FakeSdk();
    unranked.rank = { ranked: false, rank: 0, score: 0 };
    expect(await channel(unranked).myRank()).toBeNull();
    const dead = new ToyChannel({ sdk: () => Promise.resolve(null) });
    expect(await dead.myRank()).toBeNull();
  });

  it('stays a no-op around run lifecycle, which the platform does not need', () => {
    const board = channel(new FakeSdk());
    expect(() => board.beginRun()).not.toThrow();
    expect(() => board.abandonRun()).not.toThrow();
    expect(board.nicknamePending).toBe(false);
    expect(board.playerId).toBe('toy');
  });
});

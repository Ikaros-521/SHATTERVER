import { describe, expect, it } from 'vitest';
import type { RunRecord } from '../src/core/storage';
import type {
  BoardInfo,
  BoardView,
  CbResult,
  CloudApi,
  GameInfo,
  PlayerProfile,
  PlayerRank,
  SubmitInput,
} from '../src/net/cheddaboards';
import { CATEGORY_BOARDS, Cloud } from '../src/net/cloud';

const PLAYER = 'dev_1730000000_1a2b3c4d';

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

/** Everything the cloud service can ask of the API, with every answer overridable per test. */
class FakeApi implements CloudApi {
  submits: SubmitInput[] = [];
  renames: string[] = [];
  ended: string[] = [];
  starts = 0;
  boardReads = 0;

  boards: BoardInfo[] = [
    { scoreboardId: 'all-time', name: 'All Time' },
    { scoreboardId: 'weekly', name: 'Weekly' },
    { scoreboardId: 'daily', name: 'Daily' },
  ];
  /** Board ids a submit should be told do not exist. */
  missing = new Set<string>();
  failFanout = false;
  rank: PlayerRank | null = { rank: 4, score: 1234, streak: 7, totalPlayers: 10 };
  /** The name the server says it will use; defaults to what was asked for. */
  appliedName: string | null = null;
  pendingResponse = false;
  profileName = '';
  timeValidationEnabled = false;

  getGame(): Promise<CbResult<GameInfo>> {
    return Promise.resolve({
      ok: true,
      data: {
        gameId: 'shatterver',
        timeValidationEnabled: this.timeValidationEnabled,
        totalPlayers: 10,
        totalPlays: 20,
        scoreboards: this.boards,
      },
    });
  }

  getBoard(scoreboardId: string): Promise<CbResult<BoardView>> {
    this.boardReads++;
    return Promise.resolve({
      ok: true,
      data: { scoreboardId, entries: [{ rank: 1, nickname: 'Ace', score: 9, streak: 0 }] },
    });
  }

  getProfile(): Promise<CbResult<PlayerProfile>> {
    return Promise.resolve({
      ok: true,
      data: { nickname: this.profileName, gameProfile: { score: 1234, streak: 7 } },
    });
  }

  myRank(): Promise<CbResult<PlayerRank>> {
    return Promise.resolve(
      this.rank
        ? { ok: true, data: this.rank }
        : { ok: false, error: 'no profile', status: 404, kind: 'bad-input' },
    );
  }

  setNickname(_playerId: string, nickname: string): Promise<CbResult<PlayerProfile>> {
    this.renames.push(nickname);
    return Promise.resolve({
      ok: true,
      data: { nickname: this.appliedName ?? nickname, gameProfile: null, pending: this.pendingResponse },
    });
  }

  startPlaySession(): Promise<CbResult<{ ok: string }>> {
    this.starts++;
    return Promise.resolve({ ok: true, data: { ok: 'token-1' } });
  }

  endPlaySession(token: string): Promise<CbResult<{ message?: string }>> {
    this.ended.push(token);
    return Promise.resolve({ ok: true, data: {} });
  }

  submitScore(input: SubmitInput): Promise<CbResult<{ message?: string }>> {
    this.submits.push(input);
    if (input.scoreboardId && this.missing.has(input.scoreboardId)) {
      return Promise.resolve({
        ok: false,
        error: `Scoreboard '${input.scoreboardId}' not found for this game.`,
        status: 404,
        kind: 'missing-board',
        board: input.scoreboardId,
      });
    }
    if (!input.scoreboardId && this.failFanout) {
      return Promise.resolve({ ok: false, error: 'network', status: 0, kind: 'network' });
    }
    return Promise.resolve({ ok: true, data: { message: 'ok' } });
  }
}

function service(api: FakeApi, extra: Partial<ConstructorParameters<typeof Cloud>[0]> = {}): Cloud {
  return new Cloud({
    client: api,
    playerId: PLAYER,
    nickname: 'Ace',
    scored: true,
    ...extra,
  });
}

describe('submitting a run', () => {
  it('sends one fan-out submit, and never a nickname with it', async () => {
    const api = new FakeApi();
    const outcome = await service(api).finishRun(record());

    expect(api.submits).toHaveLength(1);
    expect(api.submits[0]).toMatchObject({ playerId: PLAYER, score: 1234, streak: 7 });
    expect(api.submits[0]).not.toHaveProperty('nickname');
    expect(api.submits[0]).not.toHaveProperty('scoreboardId');
    expect(outcome.ok).toBe(true);
    expect(outcome.boards).toEqual(['all-time', 'weekly', 'daily']);
    expect(outcome.rank).toEqual({ rank: 4, total: 10 });
    expect(outcome.message).toContain('全球第 4');
  });

  it('adds the mode and difficulty boards once the console has created them', async () => {
    const api = new FakeApi();
    api.boards = [
      ...api.boards,
      { scoreboardId: CATEGORY_BOARDS.mode.campaign, name: 'Campaign' },
      { scoreboardId: CATEGORY_BOARDS.difficulty.hard, name: 'Hard' },
    ];
    const outcome = await service(api).finishRun(record({ difficulty: 'hard' }));

    const targeted = api.submits.filter((submit) => submit.scoreboardId);
    expect(targeted.map((submit) => submit.scoreboardId).sort()).toEqual(
      [CATEGORY_BOARDS.difficulty.hard, CATEGORY_BOARDS.mode.campaign].sort(),
    );
    expect(outcome.boards).toHaveLength(5);
  });

  it('skips a category board the console has not created, instead of retrying it', async () => {
    const api = new FakeApi();
    api.boards = [...api.boards, { scoreboardId: CATEGORY_BOARDS.mode.endless, name: 'Endless' }];
    const cloud = service(api);

    const first = await cloud.finishRun(record({ mode: 'endless', difficulty: 'abyss' }));
    expect(first.ok).toBe(true);
    // Only the mode board exists; the difficulty board was never addressed at all.
    expect(api.submits.map((submit) => submit.scoreboardId)).toEqual([
      undefined,
      CATEGORY_BOARDS.mode.endless,
    ]);

    // A board the server turns out not to have is remembered, not asked for again.
    api.missing.add(CATEGORY_BOARDS.mode.endless);
    const second = await cloud.finishRun(record({ mode: 'endless' }));
    expect(second.ok).toBe(true);
    expect(api.submits.filter((submit) => submit.scoreboardId === CATEGORY_BOARDS.mode.endless)).toHaveLength(
      2,
    );

    // Third run: the missing board is skipped outright — no request, no 404.
    const third = await cloud.finishRun(record({ mode: 'endless' }));
    expect(third.ok).toBe(true);
    expect(api.submits.filter((submit) => submit.scoreboardId === CATEGORY_BOARDS.mode.endless)).toHaveLength(
      2,
    );
  });

  it('reports a failed submit as a local-only run, never as an error', async () => {
    const api = new FakeApi();
    api.failFanout = true;
    const outcome = await service(api).finishRun(record());

    expect(outcome.ok).toBe(false);
    expect(outcome.message).toContain('本地');
    expect(outcome.boards).toEqual([]);
  });

  it('does not submit a run that scored nothing', async () => {
    const api = new FakeApi();
    const outcome = await service(api).finishRun(record({ score: 0 }));
    expect(api.submits).toHaveLength(0);
    expect(outcome.ok).toBe(false);
  });
});

describe('play sessions', () => {
  it('opens a session when the run starts, passes the token, then closes it', async () => {
    const api = new FakeApi();
    const cloud = service(api);
    cloud.beginRun();
    await cloud.finishRun(record());

    expect(api.starts).toBe(1);
    expect(api.submits.every((submit) => submit.playSessionToken === 'token-1')).toBe(true);
    expect(api.ended).toEqual(['token-1']);
  });

  it('closes the session of an abandoned run without submitting anything', async () => {
    const api = new FakeApi();
    const cloud = service(api);
    cloud.beginRun();
    // Let the start settle, then walk away.
    await Promise.resolve();
    await Promise.resolve();
    cloud.abandonRun();
    expect(api.submits).toHaveLength(0);
    expect(api.ended).toEqual(['token-1']);
  });
});

describe('nicknames', () => {
  it('refuses a name locally, before spending a request on it', async () => {
    const api = new FakeApi();
    const outcome = await service(api).rename('测试昵称');
    expect(outcome.ok).toBe(false);
    expect(outcome.message).toContain('英文字母');
    expect(api.renames).toHaveLength(0);
  });

  it('stores the name the server actually applied, not what was typed', async () => {
    const api = new FakeApi();
    api.appliedName = 'Chedz_1';
    const cloud = service(api);
    const outcome = await cloud.rename('Chedz');

    expect(outcome.ok).toBe(true);
    expect(outcome.nickname).toBe('Chedz_1');
    expect(cloud.nickname).toBe('Chedz_1');
  });

  it('keeps a chosen name pending until the first score', async () => {
    const api = new FakeApi();
    api.pendingResponse = true;
    const cloud = service(api, { scored: false, nickname: '', pending: false });
    const outcome = await cloud.rename('Ace');

    expect(outcome.pending).toBe(true);
    expect(cloud.nicknamePending).toBe(true);
    expect(outcome.message).toContain('第一次提交');
  });

  it('re-sends a pending name that was taken while the profile did not exist', async () => {
    const api = new FakeApi();
    api.pendingResponse = true;
    const cloud = service(api, { scored: false, nickname: '', pending: false });
    await cloud.rename('Ace');

    // The first submit creates the profile — as Player_1234, because `Ace` was taken meanwhile.
    api.profileName = 'Player_1234';
    api.pendingResponse = false;
    api.appliedName = 'Ace_1';
    await cloud.finishRun(record());
    // reconcileNickname runs detached; let it finish.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(api.renames).toEqual(['Ace', 'Ace']);
    expect(cloud.nickname).toBe('Ace_1');
    expect(cloud.nicknamePending).toBe(false);
  });
});

describe('reads', () => {
  it('reuses a board read for 30 seconds', async () => {
    const api = new FakeApi();
    let clock = 0;
    const cloud = service(api, { now: () => clock });

    await cloud.board('all-time');
    await cloud.board('all-time');
    expect(api.boardReads).toBe(1);

    clock += 31_000;
    await cloud.board('all-time');
    expect(api.boardReads).toBe(2);
  });

  it('asks for no rank before a score has ever been accepted', async () => {
    const api = new FakeApi();
    const cloud = service(api, { scored: false });
    expect(await cloud.myRank()).toBeNull();
  });
});

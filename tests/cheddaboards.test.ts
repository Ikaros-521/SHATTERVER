import { describe, expect, it } from 'vitest';
import { CheddaBoards, type SubmitInput } from '../src/net/cheddaboards';

const CONFIG = { gameId: 'shatterver', apiKey: 'cb_test_key', base: 'https://api.test' };

interface Call {
  url: string;
  init: RequestInit;
}

/** A fetch stand-in that answers with one JSON envelope and records what it was asked. */
function stub(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): { calls: Call[]; fetch: typeof fetch } {
  const calls: Call[] = [];
  const impl = async (url: string, init: RequestInit): Promise<Response> => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers });
  };
  return { calls, fetch: impl as unknown as typeof fetch };
}

describe('requests', () => {
  it('sends the game id and key on every call, and the game id again in the body', async () => {
    const { calls, fetch } = stub({ ok: true, data: { message: 'ok' } });
    const client = new CheddaBoards(CONFIG, fetch);
    const input: SubmitInput = { playerId: 'dev_1_abcdef12', score: 100, streak: 3 };
    await client.submitScore(input);

    const call = calls[0]!;
    const headers = call.init.headers as Record<string, string>;
    expect(headers['X-Game-ID']).toBe('shatterver');
    expect(headers['X-API-Key']).toBe('cb_test_key');
    expect(headers['Content-Type']).toBe('application/json');
    expect(call.init.method).toBe('POST');
    expect(call.url).toBe('https://api.test/scores');
    expect(JSON.parse(String(call.init.body))).toMatchObject({
      playerId: 'dev_1_abcdef12',
      gameId: 'shatterver',
      score: 100,
      streak: 3,
    });
  });

  it('puts board reads on the documented path with the limit as a query', async () => {
    const { calls, fetch } = stub({ ok: true, data: { entries: [] } });
    await new CheddaBoards(CONFIG, fetch).getBoard('all-time', 10);
    expect(calls[0]!.url).toBe('https://api.test/games/shatterver/scoreboards/all-time?limit=10');
  });

  it('encodes ids instead of pasting them into the path', async () => {
    const { calls, fetch } = stub({ ok: true, data: {} });
    await new CheddaBoards(CONFIG, fetch).getProfile('dev_1_a/b');
    expect(calls[0]!.url).toBe('https://api.test/players/dev_1_a%2Fb/profile');
  });
});

describe('failures', () => {
  it('turns a rejected nickname into a typed failure', async () => {
    const { fetch } = stub({ ok: false, error: 'Nickname must be at least 3 characters' }, 400);
    const result = await new CheddaBoards(CONFIG, fetch).setNickname('dev_1_abcdef12', 'ab');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('nickname');
      expect(result.status).toBe(400);
    }
  });

  it('names the board that does not exist', async () => {
    const { fetch } = stub({ ok: false, error: "Scoreboard 'diff-abyss' not found for this game." }, 404);
    const result = await new CheddaBoards(CONFIG, fetch).submitScore({
      playerId: 'dev_1_abcdef12',
      score: 1,
      streak: 0,
      scoreboardId: 'diff-abyss',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('missing-board');
      expect(result.board).toBe('diff-abyss');
    }
  });

  it('keeps a validation rejection apart from a bad request', async () => {
    const { fetch } = stub({ ok: false, error: 'rejected by game validation rules' }, 400);
    const result = await new CheddaBoards(CONFIG, fetch).submitScore({
      playerId: 'dev_1_abcdef12',
      score: 9e9,
      streak: 0,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('rejected');
  });

  it('reads Retry-After off a 429', async () => {
    const { fetch } = stub({ ok: false, error: 'Too many requests' }, 429, { 'Retry-After': '30' });
    const result = await new CheddaBoards(CONFIG, fetch).getGame();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('rate-limited');
      expect(result.retryAfter).toBe(30);
    }
  });

  it('reports a dead network without throwing', async () => {
    const dead = (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    const result = await new CheddaBoards(CONFIG, dead).getGame();
    expect(result).toEqual({ ok: false, error: 'network', status: 0, kind: 'network' });
  });

  it('reports a timeout separately from a dead network', async () => {
    const dead = (async () => {
      throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    }) as unknown as typeof fetch;
    const result = await new CheddaBoards(CONFIG, dead).getGame();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('timeout');
  });

  it('survives a body that is not the API envelope', async () => {
    const gateway = (async () =>
      new Response('<html>502 Bad Gateway</html>', { status: 502 })) as unknown as typeof fetch;
    const result = await new CheddaBoards(CONFIG, gateway).getGame();
    expect(result.ok).toBe(false);
    // A gateway error page is still a server failure, not a parse accident.
    if (!result.ok) expect(result.kind).toBe('server');
  });
});

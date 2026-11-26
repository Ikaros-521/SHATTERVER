import { describe, expect, it, vi } from 'vitest';
import {
  TOY_SDK_SRC,
  ToyBoards,
  clampToyScore,
  classifyToyError,
  isToyEnvironment,
  loadToySdk,
  type ToyLike,
  type ToyProfile,
} from '../src/net/toy';

describe('isToyEnvironment', () => {
  // What the game sees inside a real Toy: the shell on bilibili.com frames the package from a
  // package host, with no referrer, so the package's own address is the only evidence.
  const pkg = { hostname: 'www.bilibilitoy.com', pathname: '/toy/AvH7meolWcHU0v7D/index.html' };
  it('is true inside a Toy package on bilibilitoy.com', () => {
    expect(isToyEnvironment(pkg)).toBe(true);
    expect(
      isToyEnvironment({
        hostname: 'www.bilibilitoy.com',
        pathname: '/toy/AvH7meolWcHU0v7D/59024141719552-v12615/index.html',
      }),
    ).toBe(true);
  });
  it('is true inside a Toy package on the other package hosts', () => {
    expect(isToyEnvironment({ hostname: 'www.bebox.net', pathname: '/toy/x/index.html' })).toBe(true);
    expect(isToyEnvironment({ hostname: 'uat-www.bebox.net', pathname: '/toy/x/' })).toBe(true);
    expect(isToyEnvironment({ hostname: 'pre-www.bebox.net', pathname: '/toy/x/' })).toBe(true);
  });
  it('does not care about the path or the hostname case on a package host', () => {
    expect(isToyEnvironment({ ...pkg, pathname: '/' })).toBe(true);
    expect(isToyEnvironment({ ...pkg, hostname: 'WWW.BILIBILITOY.COM' })).toBe(true);
  });
  it('is true on a bilibili.com Toy page path', () => {
    expect(isToyEnvironment({ hostname: 'www.bilibili.com', pathname: '/toy/shatterver/index.html' })).toBe(
      true,
    );
  });
  it('is true on the Toy root', () => {
    expect(isToyEnvironment({ hostname: 'www.bilibili.com', pathname: '/toy/' })).toBe(true);
  });
  it('is false on Bilibili pages outside /toy', () => {
    expect(isToyEnvironment({ hostname: 'www.bilibili.com', pathname: '/video/BV1xx' })).toBe(false);
    expect(isToyEnvironment({ hostname: 'www.bilibili.com', pathname: '/' })).toBe(false);
  });
  it('is false on other hosts, whatever the path', () => {
    expect(isToyEnvironment({ hostname: 'ikaros-521.github.io', pathname: '/SHATTERVER/toy/' })).toBe(false);
    expect(isToyEnvironment({ hostname: 'localhost', pathname: '/toy/' })).toBe(false);
    expect(isToyEnvironment({ hostname: 'fakebilibili.com', pathname: '/toy/' })).toBe(false);
  });
  it('matches the package hosts exactly, not by suffix', () => {
    expect(isToyEnvironment({ hostname: 'fakebilibilitoy.com', pathname: '/toy/' })).toBe(false);
    expect(isToyEnvironment({ hostname: 'www.bebox.net.example.com', pathname: '/toy/' })).toBe(false);
  });
  it('accepts Bilibili subdomains', () => {
    expect(isToyEnvironment({ hostname: 'm.bilibili.com', pathname: '/toy/x/' })).toBe(true);
  });
});

describe('clampToyScore', () => {
  // Every campaign run a bot finishes, and capped standard endless until about level 27, is stored
  // as scored.
  const AS_SCORED_UP_TO = 16_000_000;

  it('stores a score that fits exactly as the game awarded it', () => {
    expect(clampToyScore(1234.6)).toBe(1235);
    expect(clampToyScore(13_300_000)).toBe(13_300_000);
    expect(clampToyScore(AS_SCORED_UP_TO - 0.4)).toBe(AS_SCORED_UP_TO);
  });
  it('never leaves the platform range, whatever it is handed', () => {
    const inputs = [-5, 0, NaN, 1, 99_000_000, 1e30, 1e60, 1e100, 1e300, Infinity];
    for (const input of inputs) {
      const value = clampToyScore(input);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(16_777_215);
    }
    expect(clampToyScore(-5)).toBe(0);
    expect(clampToyScore(NaN)).toBe(0);
  });
  it('keeps deep runs in strict order instead of clamping them into one tie', () => {
    // Roughly the score of an endless run at levels 22, 25, 30, 50, 100, 200 and 400.
    const ladder = [1.7e7, 6e7, 3e8, 4e11, 6e18, 4e32, 6e59];
    const mapped = ladder.map((score) => clampToyScore(score));
    for (let i = 1; i < mapped.length; i++) expect(mapped[i]!).toBeGreaterThan(mapped[i - 1]!);
    expect(mapped[0]).toBeGreaterThan(AS_SCORED_UP_TO);
    expect(mapped[mapped.length - 1]).toBeLessThan(16_777_215);
  });
  it('tells apart two deep runs a tenth of a percent apart, all the way up', () => {
    for (const score of [2e7, 1e9, 1e20, 1e40, 1e60, 1e90]) {
      expect(clampToyScore(score * 1.001)).toBeGreaterThan(clampToyScore(score));
    }
  });
  it('shares the ceiling only beyond the depth the log segment is sized for', () => {
    expect(clampToyScore(1e100)).toBe(16_777_215);
    expect(clampToyScore(1e300)).toBe(16_777_215);
  });
});

describe('classifyToyError', () => {
  it('recognises the shared rate limit by code', () => {
    const failure = classifyToyError({ code: 307044, message: '请求过于频繁' });
    expect(failure.kind).toBe('rate-limited');
  });
  it('recognises login problems', () => {
    expect(classifyToyError({ type: 'not_logged_in' }).kind).toBe('not-logged-in');
    expect(classifyToyError({ message: '请先登录' }).kind).toBe('not-logged-in');
  });
  it('maps unsupported and invalid params', () => {
    expect(classifyToyError({ type: 'unsupported' }).kind).toBe('unsupported');
    expect(classifyToyError({ type: 'invalid_param', message: 'bad' }).kind).toBe('invalid');
  });
  it('falls back to a plain error with the message preserved', () => {
    const failure = classifyToyError(new Error('boom'));
    expect(failure.kind).toBe('error');
    expect(failure.error).toBe('boom');
  });
});

/** An SDK that answers everything, with each answer overridable per test. */
class FakeSdk implements ToyLike {
  submits: { board?: number; score: number }[] = [];
  submitError: unknown = null;
  rankListError: unknown = null;
  rank: { ranked: boolean; rank: number; score: number } = { ranked: true, rank: 3, score: 1200 };
  profile: ToyProfile | null = { nickname: '阿碎', avatar: '//a.png' };
  supportProfile = true;

  async isSupport(ability: string): Promise<boolean> {
    return ability === 'getUserProfile' ? this.supportProfile : true;
  }
  async submitScore(req: { board?: number; score: number }): Promise<{ score: number }> {
    if (this.submitError) throw this.submitError;
    this.submits.push(req);
    return { score: req.score };
  }
  async getRankList() {
    if (this.rankListError) throw this.rankListError;
    return [
      { rank: 1, score: 99, nickname: '上分选手', avatar: '//b.png' },
      { rank: 2, score: 50, nickname: 'Player_2' },
    ];
  }
  async getMyRank() {
    return this.rank;
  }
  async getUserProfile(): Promise<ToyProfile> {
    if (!this.profile) throw { type: 'user_denied' };
    return this.profile;
  }
}

describe('ToyBoards', () => {
  it('submits the mapped score to the requested board', async () => {
    const sdk = new FakeSdk();
    const client = new ToyBoards(sdk);
    // A score that fits goes up exactly as it was scored.
    expect((await client.submit(2, 12_345.6)).ok).toBe(true);
    // A deep endless run lands inside the platform range, not on its ceiling.
    expect((await client.submit(1, 6e59)).ok).toBe(true);
    const deep = sdk.submits[1]!.score;
    expect(deep).toBeGreaterThan(16_000_000);
    expect(deep).toBeLessThan(16_777_215);
    expect(sdk.submits[0]).toEqual({ board: 2, score: 12_346 });
  });
  it('turns a rejected submit into a typed failure', async () => {
    const sdk = new FakeSdk();
    sdk.submitError = { type: 'not_logged_in' };
    const result = await new ToyBoards(sdk).submit(1, 10);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('not-logged-in');
  });
  it('gives up on a call the SDK never answers', async () => {
    const sdk = new FakeSdk();
    // The host's request layer takes null = no timeout, so the call budget is applied here.
    sdk.submitScore = () => new Promise<{ score: number }>(() => {});
    vi.useFakeTimers();
    try {
      const pending = new ToyBoards(sdk).submit(1, 10);
      const settled = expect(pending).resolves.toEqual({ ok: false, kind: 'error', error: 'timeout' });
      await vi.advanceTimersByTimeAsync(8_000);
      await settled;
    } finally {
      vi.useRealTimers();
    }
  });
  it('reads a rank list verbatim', async () => {
    const result = await new ToyBoards(new FakeSdk()).rankList(1, 'week', 20);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data[0].nickname).toBe('上分选手');
  });
  it('asks for the profile only when the platform supports it', async () => {
    const sdk = new FakeSdk();
    sdk.supportProfile = false;
    const none = await new ToyBoards(sdk).profile();
    expect(none).toEqual({ ok: true, data: null });
    const some = await new ToyBoards(new FakeSdk()).profile();
    expect(some).toEqual({ ok: true, data: { nickname: '阿碎', avatar: '//a.png' } });
  });
  it('treats a profile refusal as empty, not as an error', async () => {
    const sdk = new FakeSdk();
    sdk.profile = null;
    const result = await new ToyBoards(sdk).profile();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('error');
  });
});

describe('loadToySdk', () => {
  /** A document whose injected tags can be removed again, recording what was detached. */
  function removableDoc(toy?: ToyLike): {
    doc: Document;
    head: HTMLScriptElement[];
    removed: HTMLScriptElement[];
  } {
    const head: HTMLScriptElement[] = [];
    const removed: HTMLScriptElement[] = [];
    const doc = {
      defaultView: { toy },
      createElement: () =>
        ({
          parentNode: {
            removeChild: (node: HTMLScriptElement): HTMLScriptElement => {
              removed.push(node);
              return node;
            },
          },
        }) as HTMLScriptElement,
      head: { appendChild: (node: HTMLScriptElement) => head.push(node) },
    } as unknown as Document;
    return { doc, head, removed };
  }

  /** A document with a scriptable head, so no real injection ever happens in tests. */
  function fakeDoc(toy?: ToyLike): { doc: Document; head: HTMLScriptElement[] } {
    const head: HTMLScriptElement[] = [];
    const doc = {
      defaultView: { toy },
      createElement: () => ({}) as HTMLScriptElement,
      head: { appendChild: (node: HTMLScriptElement) => head.push(node) },
    } as unknown as Document;
    return { doc, head };
  }

  it('resolves an already-present SDK without injecting anything', async () => {
    const sdk = new FakeSdk();
    const { doc, head } = fakeDoc(sdk);
    await expect(loadToySdk(doc)).resolves.toBe(sdk);
    expect(head).toHaveLength(0);
  });

  it('injects the platform script and resolves window.toy once it loads', async () => {
    const { doc, head } = fakeDoc();
    const pending = loadToySdk(doc);
    expect(head).toHaveLength(1);
    expect(head[0].src).toBe(TOY_SDK_SRC);
    const sdk = new FakeSdk();
    (doc.defaultView as { toy?: ToyLike }).toy = sdk;
    head[0].onload?.(new Event('load'));
    await expect(pending).resolves.toBe(sdk);
  });

  it('resolves null when the script fails, and lets a later call retry', async () => {
    const { doc, head } = fakeDoc();
    const first = loadToySdk(doc);
    head[0].onerror?.(new Event('error'));
    await expect(first).resolves.toBeNull();
    const second = loadToySdk(doc);
    expect(head).toHaveLength(2);
    head[1].onload?.(new Event('load'));
    await expect(second).resolves.toBeNull();
  });

  it('shares one injection between concurrent callers', async () => {
    const { doc, head } = fakeDoc();
    const a = loadToySdk(doc);
    const b = loadToySdk(doc);
    expect(head).toHaveLength(1);
    head[0].onerror?.(new Event('error'));
    await expect(a).resolves.toBeNull();
    await expect(b).resolves.toBeNull();
  });

  it('gives up on a silent load, removes the dead tag, and lets a later call retry', async () => {
    const { doc, head, removed } = removableDoc();
    vi.useFakeTimers();
    try {
      const pending = loadToySdk(doc);
      expect(head).toHaveLength(1);
      // Neither onload nor onerror ever fires: the load must still end within its budget.
      const settled = expect(pending).resolves.toBeNull();
      await vi.advanceTimersByTimeAsync(10_000);
      await settled;
      expect(removed).toHaveLength(1);

      // The failed injection reset itself: the next call injects fresh instead of piling tags up.
      const retry = loadToySdk(doc);
      expect(head).toHaveLength(2);
      const sdk = new FakeSdk();
      (doc.defaultView as { toy?: ToyLike }).toy = sdk;
      head[1].onload?.(new Event('load'));
      await expect(retry).resolves.toBe(sdk);
    } finally {
      vi.useRealTimers();
    }
  });

  it('removes the tag on a load error too', async () => {
    const { doc, head, removed } = removableDoc();
    const pending = loadToySdk(doc);
    head[0].onerror?.(new Event('error'));
    await expect(pending).resolves.toBeNull();
    expect(removed).toHaveLength(1);
  });
});

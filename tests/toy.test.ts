import { describe, expect, it } from 'vitest';
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
  const inside = { hostname: 'www.bilibili.com', pathname: '/toy/shatterver/index.html' };
  it('is true on a Toy page path', () => {
    expect(isToyEnvironment(inside)).toBe(true);
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
    expect(isToyEnvironment({ hostname: 'fakebilibili.com', pathname: '/toy/' })).toBe(false);
  });
  it('accepts Bilibili subdomains', () => {
    expect(isToyEnvironment({ hostname: 'm.bilibili.com', pathname: '/toy/x/' })).toBe(true);
  });
});

describe('clampToyScore', () => {
  it('rounds to the platform integer', () => {
    expect(clampToyScore(1234.6)).toBe(1235);
  });
  it('caps at the documented ceiling', () => {
    expect(clampToyScore(99_000_000)).toBe(16_777_215);
  });
  it('never goes below zero', () => {
    expect(clampToyScore(-5)).toBe(0);
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
  it('submits a clamped score to the requested board', async () => {
    const sdk = new FakeSdk();
    const client = new ToyBoards(sdk);
    const result = await client.submit(2, 99_000_000.7);
    expect(result.ok).toBe(true);
    expect(sdk.submits).toEqual([{ board: 2, score: 16_777_215 }]);
  });
  it('turns a rejected submit into a typed failure', async () => {
    const sdk = new FakeSdk();
    sdk.submitError = { type: 'not_logged_in' };
    const result = await new ToyBoards(sdk).submit(1, 10);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('not-logged-in');
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
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRouteJsonChat = vi.fn();

vi.mock('../../../src/server/llm/structured', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/server/llm/structured')>();
  return { ...actual, routeJsonChat: mockRouteJsonChat };
});

function makeCtx() {
  const emitted: Array<[string, unknown]> = [];
  return {
    emit: vi.fn(async (kind: string, payload: unknown) => {
      emitted.push([kind, payload]);
      return { id: 1, sessionId: 1, kind, payload, ts: new Date() };
    }),
    userInput: vi.fn(),
    log: { append: vi.fn() },
    llm: {} as never,
    _emitted: emitted,
  };
}

const claim = {
  span: {
    sectionId: 'intro',
    charStart: 0,
    charEnd: 30,
    text: 'Claude reduces token costs substantially',
  },
  claimType: 'statistic' as const,
  checkWorthiness: 'high' as const,
};

const matchingSource = {
  id: 1,
  url: 'https://example.com/article',
  title: 'Token costs',
  summary: 'Claude reduces token costs through prompt caching substantially',
  rawExcerpt: 'According to benchmarks, Claude reduces token costs substantially in production.',
};

const nonMatchingSource = {
  id: 2,
  url: 'https://example.com/other',
  title: 'Unrelated',
  summary: 'Something completely different about cats',
  rawExcerpt: 'Cats are popular pets worldwide.',
};

beforeEach(() => vi.clearAllMocks());

describe('verifyClaim stage', () => {
  it('returns cached:true and evidence from source when overlap >= 2 tokens', async () => {
    const { verifyClaim } = await import('../../../src/server/pipeline/stages/verify-claim');
    const ctx = makeCtx();
    const result = await verifyClaim.run({ claim, acceptedSources: [matchingSource] }, ctx);

    expect(result.cached).toBe(true);
    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0].sourceId).toBe(1);
    expect(result.evidence[0].url).toBe(matchingSource.url);
    expect(mockRouteJsonChat).not.toHaveBeenCalled();
  });

  it('emits task_completed with cached:true when cache hit', async () => {
    const { verifyClaim } = await import('../../../src/server/pipeline/stages/verify-claim');
    const ctx = makeCtx();
    await verifyClaim.run({ claim, acceptedSources: [matchingSource] }, ctx);

    const completed = ctx._emitted.find(([k]) => k === 'task_completed');
    expect(completed![1]).toMatchObject({ cached: true });
  });

  it('calls routeJsonChat when no source matches claim', async () => {
    mockRouteJsonChat.mockResolvedValue({
      result: {
        evidence: [
          { url: 'https://x.test', snippet: 'Evidence here.', supports: true },
          { url: 'https://y.test', snippet: 'More evidence.', supports: false },
        ],
      },
      modelUsed: 'claude-sonnet',
      modelClass: 'search' as const,
      promptTokens: 100,
      completionTokens: 200,
      latencyMs: 500,
    });

    const { verifyClaim } = await import('../../../src/server/pipeline/stages/verify-claim');
    const ctx = makeCtx();
    const result = await verifyClaim.run({ claim, acceptedSources: [nonMatchingSource] }, ctx);

    expect(result.cached).toBe(false);
    expect(result.evidence).toHaveLength(2);
    expect(result.evidence[0].sourceId).toBeNull();
    expect(result.evidence[1].sourceId).toBeNull();
    expect(mockRouteJsonChat).toHaveBeenCalledTimes(1);
  });

  it('emits task_completed with cached:false on search path', async () => {
    mockRouteJsonChat.mockResolvedValue({
      result: { evidence: [{ url: 'https://x.test', snippet: 'Evidence.', supports: true }] },
      modelUsed: 'claude-sonnet',
      modelClass: 'search' as const,
      promptTokens: 50,
      completionTokens: 100,
      latencyMs: 300,
    });

    const { verifyClaim } = await import('../../../src/server/pipeline/stages/verify-claim');
    const ctx = makeCtx();
    await verifyClaim.run({ claim, acceptedSources: [] }, ctx);

    const completed = ctx._emitted.find(([k]) => k === 'task_completed');
    expect(completed![1]).toMatchObject({ cached: false, count: 1 });
  });

  it('emits task_started then task_completed in both paths', async () => {
    mockRouteJsonChat.mockResolvedValue({
      result: { evidence: [] },
      modelUsed: 'claude-sonnet',
      modelClass: 'search' as const,
      promptTokens: 10,
      completionTokens: 10,
      latencyMs: 100,
    });
    const { verifyClaim } = await import('../../../src/server/pipeline/stages/verify-claim');
    const ctx = makeCtx();
    await verifyClaim.run({ claim, acceptedSources: [] }, ctx);
    expect(ctx._emitted.map(([k]) => k)).toEqual(['task_started', 'task_completed']);
  });
});

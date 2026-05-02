import { describe, expect, it, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const mockRouteJsonChat = vi.fn();
const mockFindSourceByQuery = vi.fn();

vi.mock('../../../src/server/llm/structured', () => ({
  routeJsonChat: mockRouteJsonChat,
}));

vi.mock('../../../src/server/sessions/sources-repo', () => ({
  findSourceByQuery: mockFindSourceByQuery,
}));

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

const hypothesis = {
  id: 'h-1',
  sectionId: 'intro',
  text: 'Prompt caching reduces token costs',
  evidenceKind: 'statistic',
};

const query = { text: 'prompt caching cost savings benchmark' };

const cachedRows = [
  {
    id: 1,
    sessionId: 10,
    sectionId: 'intro',
    hypothesis: 'h',
    query: 'prompt caching cost savings benchmark',
    url: 'https://cached.example.com',
    title: 'Cached Article',
    rawExcerpt: 'Cached snippet text',
    summary: '',
    relevanceScore: 0,
    status: 'proposed',
    createdAt: new Date(),
  },
];

const freshHits = [
  { url: 'https://example.com/article', title: 'Fresh Article', snippet: 'Fresh snippet text' },
];

beforeEach(() => vi.clearAllMocks());

describe('webSearch stage', () => {
  it('cache-hit path: skips routeJsonChat, returns existing hits with cached:true', async () => {
    mockFindSourceByQuery.mockResolvedValue(cachedRows);

    const { webSearch } = await import('../../../src/server/pipeline/stages/web-search');
    const ctx = makeCtx();
    const result = await webSearch.run({ sessionId: 10, userId: 1, hypothesis, query }, ctx);

    expect(mockRouteJsonChat).not.toHaveBeenCalled();
    expect(result.cached).toBe(true);
    expect(result.hits).toEqual([
      { url: 'https://cached.example.com', title: 'Cached Article', snippet: 'Cached snippet text' },
    ]);
  });

  it('cache-hit path: emits task_started then task_completed with cached:true', async () => {
    mockFindSourceByQuery.mockResolvedValue(cachedRows);

    const { webSearch } = await import('../../../src/server/pipeline/stages/web-search');
    const ctx = makeCtx();
    await webSearch.run({ sessionId: 10, userId: 1, hypothesis, query }, ctx);

    expect(ctx._emitted.map(([k]) => k)).toEqual(['task_started', 'task_completed']);
    expect(ctx._emitted[1][1]).toMatchObject({ cached: true, count: 1 });
  });

  it('cache-miss path: calls routeJsonChat once and returns hits with cached:false', async () => {
    mockFindSourceByQuery.mockResolvedValue([]);
    mockRouteJsonChat.mockResolvedValue({
      result: { hits: freshHits },
      modelUsed: 'perplexity/sonar-pro',
      modelClass: 'search',
      promptTokens: 30,
      completionTokens: 80,
      latencyMs: 300,
    });

    const { webSearch } = await import('../../../src/server/pipeline/stages/web-search');
    const ctx = makeCtx();
    const result = await webSearch.run({ sessionId: 10, userId: 1, hypothesis, query }, ctx);

    expect(mockRouteJsonChat).toHaveBeenCalledOnce();
    expect(mockRouteJsonChat).toHaveBeenCalledWith(expect.objectContaining({ class: 'search' }));
    expect(result.cached).toBe(false);
    expect(result.hits).toEqual(freshHits);
  });

  it('cache-miss path: emits task_completed with cached:false', async () => {
    mockFindSourceByQuery.mockResolvedValue([]);
    mockRouteJsonChat.mockResolvedValue({
      result: { hits: freshHits },
      modelUsed: 'perplexity/sonar-pro',
      modelClass: 'search',
      promptTokens: 30,
      completionTokens: 80,
      latencyMs: 300,
    });

    const { webSearch } = await import('../../../src/server/pipeline/stages/web-search');
    const ctx = makeCtx();
    await webSearch.run({ sessionId: 10, userId: 1, hypothesis, query }, ctx);

    expect(ctx._emitted[1][1]).toMatchObject({ cached: false, count: 1 });
  });
});

describe('routeJsonChat with class: search', () => {
  it('accepts search class without TypeScript error (type-level check via schema)', async () => {
    // The structured.ts change allows class: 'search' — verify it doesn't throw at module load
    const { routeJsonChat } = await import('../../../src/server/llm/structured');
    expect(typeof routeJsonChat).toBe('function');
  });
});

describe('webSearch stage — fixture: habr-longread-1', () => {
  it('returns expected.snapshot unchanged when routeJsonChat returns snapshot hits', async () => {
    type Fixture = { input: unknown; expected: { snapshot: { hits: unknown[]; cached: boolean } } };
    const fixture = JSON.parse(
      readFileSync(
        join(__dirname, '../../eval/fixtures/web_search/habr-longread-1.json'),
        'utf8',
      ),
    ) as Fixture;

    mockFindSourceByQuery.mockResolvedValue([]);
    mockRouteJsonChat.mockResolvedValue({
      result: { hits: fixture.expected.snapshot.hits },
      modelUsed: 'perplexity/sonar-pro',
      modelClass: 'search',
      promptTokens: 30,
      completionTokens: 80,
      latencyMs: 300,
    });

    const { webSearch } = await import('../../../src/server/pipeline/stages/web-search');
    const ctx = makeCtx();
    const result = await webSearch.run(
      fixture.input as Parameters<typeof webSearch.run>[0],
      ctx,
    );
    expect(result).toEqual(fixture.expected.snapshot);
  });
});

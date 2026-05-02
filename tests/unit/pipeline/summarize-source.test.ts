import { describe, expect, it, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const mockRouteJsonChat = vi.fn();

vi.mock('../../../src/server/llm/structured', () => ({
  routeJsonChat: mockRouteJsonChat,
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
  text: 'Prompt caching reduces token costs by 50%',
  evidenceKind: 'statistic',
};

const query = { text: 'prompt caching cost savings' };

const hit = {
  url: 'https://example.com/article',
  title: 'LLM Caching Benchmarks',
  snippet: 'Our tests show 50% reduction in token costs with caching enabled.',
};

beforeEach(() => vi.clearAllMocks());

describe('summarizeSource stage', () => {
  it('emits task_started and task_completed in order, returns summary', async () => {
    mockRouteJsonChat.mockResolvedValue({
      result: { summary: 'Source confirms 50% cost reduction.', relevanceScore: 73 },
      modelUsed: 'claude-haiku',
      modelClass: 'fast',
      promptTokens: 20,
      completionTokens: 15,
      latencyMs: 60,
    });

    const { summarizeSource } = await import(
      '../../../src/server/pipeline/stages/summarize-source'
    );
    const ctx = makeCtx();
    const result = await summarizeSource.run({ hypothesis, query, hit }, ctx);

    expect(result).toEqual({ summary: 'Source confirms 50% cost reduction.', relevanceScore: 73 });
    expect(ctx._emitted.map(([k]) => k)).toEqual(['task_started', 'task_completed']);
    expect(ctx._emitted[1][1]).toMatchObject({ relevanceScore: 73 });
  });

  it('calls routeJsonChat with class fast', async () => {
    mockRouteJsonChat.mockResolvedValue({
      result: { summary: 'Relevant.', relevanceScore: 60 },
      modelUsed: 'claude-haiku',
      modelClass: 'fast',
      promptTokens: 10,
      completionTokens: 8,
      latencyMs: 40,
    });

    const { summarizeSource } = await import(
      '../../../src/server/pipeline/stages/summarize-source'
    );
    const ctx = makeCtx();
    await summarizeSource.run({ hypothesis, query, hit }, ctx);

    expect(mockRouteJsonChat).toHaveBeenCalledWith(expect.objectContaining({ class: 'fast' }));
  });

  it('outputSchema rejects relevanceScore above 100', async () => {
    const { summarizeSource } = await import(
      '../../../src/server/pipeline/stages/summarize-source'
    );
    expect(
      summarizeSource.outputSchema.safeParse({ summary: 'ok', relevanceScore: 150 }).success,
    ).toBe(false);
  });
});

describe('summarizeSource stage — fixture: habr-longread-1', () => {
  it('returns expected.snapshot unchanged when routeJsonChat returns it', async () => {
    type Fixture = { input: unknown; expected: { snapshot: unknown } };
    const fixture = JSON.parse(
      readFileSync(
        join(__dirname, '../../eval/fixtures/summarize_source/habr-longread-1.json'),
        'utf8',
      ),
    ) as Fixture;

    mockRouteJsonChat.mockResolvedValue({
      result: fixture.expected.snapshot,
      modelUsed: 'claude-haiku',
      modelClass: 'fast',
      promptTokens: 20,
      completionTokens: 15,
      latencyMs: 60,
    });

    const { summarizeSource } = await import(
      '../../../src/server/pipeline/stages/summarize-source'
    );
    const ctx = makeCtx();
    const result = await summarizeSource.run(
      fixture.input as Parameters<typeof summarizeSource.run>[0],
      ctx,
    );
    expect(result).toEqual(fixture.expected.snapshot);
  });
});

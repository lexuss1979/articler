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

beforeEach(() => vi.clearAllMocks());

describe('formulateQueries stage', () => {
  it('emits task_started and task_completed in order, returns queries', async () => {
    mockRouteJsonChat.mockResolvedValue({
      result: { queries: [{ text: 'prompt caching cost savings' }, { text: 'LLM token caching benchmark' }] },
      modelUsed: 'claude-haiku',
      modelClass: 'fast',
      promptTokens: 15,
      completionTokens: 20,
      latencyMs: 80,
    });

    const { formulateQueries } = await import(
      '../../../src/server/pipeline/stages/formulate-queries'
    );
    const ctx = makeCtx();
    const result = await formulateQueries.run({ hypothesis }, ctx);

    expect(result.queries).toHaveLength(2);
    expect(result.queries[0].text).toBe('prompt caching cost savings');
    expect(ctx._emitted.map(([k]) => k)).toEqual(['task_started', 'task_completed']);
    expect(ctx._emitted[1][1]).toMatchObject({ count: 2 });
  });

  it('calls routeJsonChat with class fast', async () => {
    mockRouteJsonChat.mockResolvedValue({
      result: { queries: [{ text: 'test query' }] },
      modelUsed: 'claude-haiku',
      modelClass: 'fast',
      promptTokens: 10,
      completionTokens: 10,
      latencyMs: 50,
    });

    const { formulateQueries } = await import(
      '../../../src/server/pipeline/stages/formulate-queries'
    );
    const ctx = makeCtx();
    await formulateQueries.run({ hypothesis }, ctx);

    expect(mockRouteJsonChat).toHaveBeenCalledWith(expect.objectContaining({ class: 'fast' }));
  });

  it('outputSchema rejects zero queries (min:1 constraint)', async () => {
    const { formulateQueries } = await import(
      '../../../src/server/pipeline/stages/formulate-queries'
    );
    expect(formulateQueries.outputSchema.safeParse({ queries: [] }).success).toBe(false);
  });
});

describe('formulateQueries stage — fixture: habr-longread-1', () => {
  it('returns expected.snapshot unchanged when routeJsonChat returns it', async () => {
    type Fixture = { input: unknown; expected: { snapshot: unknown } };
    const fixture = JSON.parse(
      readFileSync(
        join(__dirname, '../../eval/fixtures/formulate_queries/habr-longread-1.json'),
        'utf8',
      ),
    ) as Fixture;

    mockRouteJsonChat.mockResolvedValue({
      result: fixture.expected.snapshot,
      modelUsed: 'claude-haiku',
      modelClass: 'fast',
      promptTokens: 10,
      completionTokens: 10,
      latencyMs: 60,
    });

    const { formulateQueries } = await import(
      '../../../src/server/pipeline/stages/formulate-queries'
    );
    const ctx = makeCtx();
    const result = await formulateQueries.run(
      fixture.input as Parameters<typeof formulateQueries.run>[0],
      ctx,
    );
    expect(result).toEqual(fixture.expected.snapshot);
  });
});

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

const profile = {
  id: 1,
  userId: 1,
  name: 'Habr longread',
  format: 'long_read',
  style: 'Technical',
  audience: 'Software engineers',
  targetVolumeMin: 2000,
  targetVolumeMax: 4000,
  markupRules: {},
  extraPrompt: '',
  createdAt: new Date(),
};

function makeJsonChatResult(payload: unknown) {
  return {
    result: payload,
    modelUsed: 'claude-haiku',
    modelClass: 'fast' as const,
    promptTokens: 50,
    completionTokens: 30,
    latencyMs: 200,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('stockKeywords stage', () => {
  it('returns the routeJsonChat result and emits start/complete', async () => {
    mockRouteJsonChat.mockResolvedValue(
      makeJsonChatResult({ keywords: ['cache', 'memory', 'data'] }),
    );
    const { stockKeywords } = await import(
      '../../../src/server/pipeline/stages/stock-keywords'
    );
    const ctx = makeCtx();
    const result = await stockKeywords.run(
      { profile, slot: { brief: 'Cache hit diagram', kind: 'inline' } },
      ctx,
    );
    expect(result).toEqual({ keywords: ['cache', 'memory', 'data'] });
    expect(ctx._emitted.map(([k]) => k)).toEqual(['task_started', 'task_completed']);
    expect(ctx._emitted[0][1]).toMatchObject({ stage: 'stock_keywords' });
  });

  it('passes class fast to routeJsonChat', async () => {
    mockRouteJsonChat.mockResolvedValue(makeJsonChatResult({ keywords: ['k'] }));
    const { stockKeywords } = await import(
      '../../../src/server/pipeline/stages/stock-keywords'
    );
    await stockKeywords.run(
      { profile, slot: { brief: 'b', kind: 'hero' } },
      makeCtx(),
    );
    expect(mockRouteJsonChat.mock.calls[0][0]).toMatchObject({ class: 'fast' });
  });

  it('forwards slot brief into the user prompt', async () => {
    mockRouteJsonChat.mockResolvedValue(makeJsonChatResult({ keywords: ['k'] }));
    const { stockKeywords } = await import(
      '../../../src/server/pipeline/stages/stock-keywords'
    );
    await stockKeywords.run(
      { profile, slot: { brief: 'unique-brief-token', kind: 'hero' } },
      makeCtx(),
    );
    const callArgs = mockRouteJsonChat.mock.calls[0][0] as { user: string };
    expect(callArgs.user).toContain('unique-brief-token');
  });
});

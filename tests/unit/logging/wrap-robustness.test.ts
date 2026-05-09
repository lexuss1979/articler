import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  appendRunLog: vi.fn().mockResolvedValue({ path: '/tmp/fake/robust.jsonl' }),
  insertReturning: vi.fn(),
  insertValues: vi.fn(),
  insert: vi.fn(),
  emitEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../src/server/logging/jsonl', () => ({
  appendRunLog: mocks.appendRunLog,
}));

vi.mock('../../../src/server/db/client', () => {
  mocks.insertValues.mockReturnValue({ returning: mocks.insertReturning });
  mocks.insert.mockReturnValue({ values: mocks.insertValues });
  return { db: { insert: mocks.insert } };
});

vi.mock('../../../src/server/llm/budget-guard', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/server/llm/budget-guard')>();
  return {
    ...actual,
    assertBudget: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('../../../src/server/events/bus', () => ({
  emitEvent: mocks.emitEvent,
}));

afterEach(() => {
  vi.clearAllMocks();
  mocks.appendRunLog.mockResolvedValue({ path: '/tmp/fake/robust.jsonl' });
  mocks.insertValues.mockReturnValue({ returning: mocks.insertReturning });
  mocks.insert.mockReturnValue({ values: mocks.insertValues });
});

const FAKE_RESULT = {
  content: 'hi',
  modelUsed: 'anthropic/claude-opus-4.7',
  modelClass: 'smart' as const,
  promptTokens: 100,
  completionTokens: 50,
  latencyMs: 200,
  cost: 0.01,
};

describe('wrapWithLogging — db.insert failure does not mask successful LLM call', () => {
  it('resolves with the LLM result and runId=-1 when db.insert throws', async () => {
    mocks.insertReturning.mockRejectedValue(new Error('connection refused'));
    const { wrapWithLogging } = await import('../../../src/server/logging/wrap');

    const result = await wrapWithLogging({
      stage: 'test',
      task: 'insert-fails',
      userId: 1,
      call: async () => FAKE_RESULT,
      request: {},
    });

    expect(result.runId).toBe(-1);
    expect(result.content).toBe('hi');
    expect(result.cost).toBe(0.01);
  });

  it('appends a runs_insert_failed JSONL line when db.insert throws', async () => {
    mocks.insertReturning.mockRejectedValue(new Error('FK violation'));
    const { wrapWithLogging } = await import('../../../src/server/logging/wrap');

    await wrapWithLogging({
      stage: 'test',
      task: 'fk-fail',
      userId: 1,
      sessionId: 99,
      call: async () => FAKE_RESULT,
      request: {},
    });

    const errorEntries = mocks.appendRunLog.mock.calls
      .map((c) => c[0] as Record<string, unknown>)
      .filter((entry) => entry.error_kind === 'runs_insert_failed');
    expect(errorEntries).toHaveLength(1);
    expect(errorEntries[0]).toMatchObject({
      stage: 'test',
      task: 'fk-fail',
      user_id: 1,
      session_id: 99,
      error: true,
      error_kind: 'runs_insert_failed',
      cost_usd: 0.01,
    });
    expect(errorEntries[0]!.error_message).toContain('FK violation');
  });

  it('still emits cost_updated when db.insert throws and sessionId is set', async () => {
    mocks.insertReturning.mockRejectedValue(new Error('boom'));
    const { wrapWithLogging } = await import('../../../src/server/logging/wrap');

    await wrapWithLogging({
      stage: 'test',
      task: 'still-emit',
      userId: 1,
      sessionId: 7,
      call: async () => FAKE_RESULT,
      request: {},
    });

    expect(mocks.emitEvent).toHaveBeenCalledOnce();
    const [, kind] = mocks.emitEvent.mock.calls[0] as [number, string, unknown];
    expect(kind).toBe('cost_updated');
  });
});

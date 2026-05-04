import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  appendRunLog: vi.fn().mockResolvedValue({ path: '/tmp/fake/blocked.jsonl' }),
  assertBudget: vi.fn(),
  emitEvent: vi.fn().mockResolvedValue(undefined),
  insert: vi.fn(),
}));

vi.mock('../../../src/server/logging/jsonl', () => ({
  appendRunLog: mocks.appendRunLog,
}));

vi.mock('../../../src/server/db/client', () => ({
  db: { insert: mocks.insert },
}));

vi.mock('../../../src/server/llm/budget-guard', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/server/llm/budget-guard')>();
  return {
    ...actual,
    assertBudget: mocks.assertBudget,
  };
});

vi.mock('../../../src/server/events/bus', () => ({
  emitEvent: mocks.emitEvent,
}));

afterEach(() => vi.clearAllMocks());

const FAKE_RESULT = {
  content: 'unused',
  modelUsed: 'anthropic/claude-opus-4.7',
  modelClass: 'smart' as const,
  promptTokens: 0,
  completionTokens: 0,
  latencyMs: 0,
};

describe('wrapWithLogging — budget enforcement', () => {
  it('writes a budget_blocked JSONL line, emits the bus event, skips db.insert, and rethrows', async () => {
    const { BudgetExceededError } = await import('../../../src/server/llm/budget-guard');
    mocks.assertBudget.mockRejectedValueOnce(new BudgetExceededError('session', 0.6, 0.5));
    const call = vi.fn();

    const { wrapWithLogging } = await import('../../../src/server/logging/wrap');

    await expect(
      wrapWithLogging({
        stage: 'draft_section',
        task: 'sec-1',
        userId: 7,
        sessionId: 42,
        call,
        request: { messages: ['x'] },
      }),
    ).rejects.toBeInstanceOf(BudgetExceededError);

    expect(call).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();

    expect(mocks.appendRunLog).toHaveBeenCalledOnce();
    const [entry] = mocks.appendRunLog.mock.calls[0] as [Record<string, unknown>];
    expect(entry).toMatchObject({
      stage: 'draft_section',
      task: 'sec-1',
      user_id: 7,
      session_id: 42,
      error: true,
      error_kind: 'budget_blocked',
      scope: 'session',
      spent: 0.6,
      cap: 0.5,
    });
    expect(entry).not.toHaveProperty('response');

    expect(mocks.emitEvent).toHaveBeenCalledOnce();
    const [emittedSessionId, emittedKind, emittedPayload] = mocks.emitEvent.mock.calls[0] as [
      number,
      string,
      Record<string, unknown>,
    ];
    expect(emittedSessionId).toBe(42);
    expect(emittedKind).toBe('budget_blocked');
    expect(emittedPayload).toEqual({ scope: 'session', spent: 0.6, cap: 0.5 });
  });

  it('does not emit a bus event when sessionId is missing', async () => {
    const { BudgetExceededError } = await import('../../../src/server/llm/budget-guard');
    mocks.assertBudget.mockRejectedValueOnce(new BudgetExceededError('user', 12, 10));
    const call = vi.fn();

    const { wrapWithLogging } = await import('../../../src/server/logging/wrap');

    await expect(
      wrapWithLogging({
        stage: 'plan',
        task: 'p1',
        userId: 7,
        call,
        request: {},
      }),
    ).rejects.toBeInstanceOf(BudgetExceededError);

    expect(mocks.appendRunLog).toHaveBeenCalledOnce();
    expect(mocks.emitEvent).not.toHaveBeenCalled();
  });

  it('passes through non-budget errors from assertBudget without logging or emitting', async () => {
    mocks.assertBudget.mockRejectedValueOnce(new Error('db down'));
    const call = vi.fn();

    const { wrapWithLogging } = await import('../../../src/server/logging/wrap');

    await expect(
      wrapWithLogging({
        stage: 'plan',
        task: 'p1',
        userId: 7,
        sessionId: 42,
        call,
        request: {},
      }),
    ).rejects.toThrow('db down');

    expect(call).not.toHaveBeenCalled();
    expect(mocks.appendRunLog).not.toHaveBeenCalled();
    expect(mocks.emitEvent).not.toHaveBeenCalled();
  });

  it('proceeds normally when assertBudget resolves (guard is non-intrusive)', async () => {
    mocks.assertBudget.mockResolvedValueOnce(undefined);
    const insertReturning = vi.fn().mockResolvedValue([{ id: 99 }]);
    const insertValues = vi.fn().mockReturnValue({ returning: insertReturning });
    mocks.insert.mockReturnValue({ values: insertValues });
    const call = vi.fn().mockResolvedValue(FAKE_RESULT);

    const { wrapWithLogging } = await import('../../../src/server/logging/wrap');

    const result = await wrapWithLogging({
      stage: 'plan',
      task: 'p1',
      userId: 7,
      sessionId: 42,
      call,
      request: {},
    });

    expect(result.runId).toBe(99);
    expect(call).toHaveBeenCalledOnce();
    expect(mocks.insert).toHaveBeenCalledOnce();
    expect(mocks.emitEvent).toHaveBeenCalledOnce();
    const [, kind] = mocks.emitEvent.mock.calls[0] as [number, string, unknown];
    expect(kind).toBe('cost_updated');
  });
});

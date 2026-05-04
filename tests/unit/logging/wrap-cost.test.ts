import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  appendRunLog: vi.fn().mockResolvedValue({ path: '/tmp/fake/cost.jsonl' }),
  insertReturning: vi.fn().mockResolvedValue([{ id: 1 }]),
  insertValues: vi.fn(),
  insert: vi.fn(),
  costFor: vi.fn().mockReturnValue(99.99),
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
  emitEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../src/server/llm/pricing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/server/llm/pricing')>();
  return {
    ...actual,
    costFor: mocks.costFor,
  };
});

afterEach(() => {
  vi.clearAllMocks();
  mocks.appendRunLog.mockResolvedValue({ path: '/tmp/fake/cost.jsonl' });
  mocks.insertReturning.mockResolvedValue([{ id: 1 }]);
  mocks.insertValues.mockReturnValue({ returning: mocks.insertReturning });
  mocks.insert.mockReturnValue({ values: mocks.insertValues });
  mocks.costFor.mockReturnValue(99.99);
});

const BASE_RESULT = {
  content: 'hi',
  modelUsed: 'anthropic/claude-opus-4.7',
  modelClass: 'smart' as const,
  promptTokens: 100,
  completionTokens: 50,
  latencyMs: 200,
};

describe('wrapWithLogging — cost source precedence', () => {
  it('uses result.cost when present and does NOT call costFor', async () => {
    const { wrapWithLogging } = await import('../../../src/server/logging/wrap');

    await wrapWithLogging({
      stage: 'test',
      task: 'authoritative',
      call: async () => ({ ...BASE_RESULT, cost: 0.0231 }),
      request: {},
    });

    expect(mocks.costFor).not.toHaveBeenCalled();

    const [entry] = mocks.appendRunLog.mock.calls[0] as [Record<string, unknown>];
    expect(entry.cost_usd).toBe(0.0231);

    const [row] = mocks.insertValues.mock.calls[0] as [Record<string, unknown>];
    expect(row.costUsd).toBe(String(0.0231));
  });

  it('treats result.cost = 0 as authoritative (free model) — does NOT fall back', async () => {
    const { wrapWithLogging } = await import('../../../src/server/logging/wrap');

    await wrapWithLogging({
      stage: 'test',
      task: 'free-model',
      call: async () => ({ ...BASE_RESULT, cost: 0 }),
      request: {},
    });

    expect(mocks.costFor).not.toHaveBeenCalled();

    const [entry] = mocks.appendRunLog.mock.calls[0] as [Record<string, unknown>];
    expect(entry.cost_usd).toBe(0);

    const [row] = mocks.insertValues.mock.calls[0] as [Record<string, unknown>];
    expect(row.costUsd).toBe('0');
  });

  it('falls back to costFor when result.cost is undefined', async () => {
    const { wrapWithLogging } = await import('../../../src/server/logging/wrap');

    await wrapWithLogging({
      stage: 'test',
      task: 'fallback',
      call: async () => BASE_RESULT,
      request: {},
    });

    expect(mocks.costFor).toHaveBeenCalledOnce();
    const [model, prompt, completion] = mocks.costFor.mock.calls[0] as [string, number, number];
    expect(model).toBe('anthropic/claude-opus-4.7');
    expect(prompt).toBe(100);
    expect(completion).toBe(50);

    const [entry] = mocks.appendRunLog.mock.calls[0] as [Record<string, unknown>];
    expect(entry.cost_usd).toBe(99.99);
  });
});

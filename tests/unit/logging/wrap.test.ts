import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../../../src/server/logging/jsonl', () => ({
  appendRunLog: vi.fn().mockResolvedValue({ path: '/tmp/fake/2026-05-01.jsonl' }),
}));

vi.mock('../../../src/server/db/client', () => {
  const insertReturning = vi.fn().mockResolvedValue([{ id: 42 }]);
  const insertValues = vi.fn().mockReturnValue({ returning: insertReturning });
  const insert = vi.fn().mockReturnValue({ values: insertValues });
  return { db: { insert } };
});

afterEach(() => {
  vi.clearAllMocks();
});

const FAKE_RESULT = {
  content: 'hello',
  modelUsed: 'anthropic/claude-opus-4.7',
  modelClass: 'smart' as const,
  promptTokens: 100,
  completionTokens: 50,
  latencyMs: 300,
};

describe('wrapWithLogging', () => {
  it('calls appendRunLog with expected fields on success', async () => {
    const { wrapWithLogging } = await import('../../../src/server/logging/wrap');
    const { appendRunLog } = await import('../../../src/server/logging/jsonl');

    await wrapWithLogging({
      stage: 'build_plan',
      task: 'plan_v1',
      userId: 7,
      sessionId: 3,
      call: async () => FAKE_RESULT,
      request: { messages: [] },
    });

    expect(appendRunLog).toHaveBeenCalledOnce();
    const [entry] = (appendRunLog as ReturnType<typeof vi.fn>).mock.calls[0] as [
      Record<string, unknown>,
    ];
    expect(entry.stage).toBe('build_plan');
    expect(entry.task).toBe('plan_v1');
    expect(entry.model_class).toBe('smart');
    expect(entry.model).toBe('anthropic/claude-opus-4.7');
    expect(entry.user_id).toBe(7);
    expect(entry.session_id).toBe(3);
    expect(typeof entry.cost_usd).toBe('number');
    expect(entry.request).toBeDefined();
    expect(entry.response).toBeDefined();
  });

  it('calls db.insert with the thin row (no request/response) and payload_path', async () => {
    const { wrapWithLogging } = await import('../../../src/server/logging/wrap');
    const { db } = await import('../../../src/server/db/client');

    await wrapWithLogging({
      stage: 'build_plan',
      task: 'plan_v1',
      userId: 7,
      call: async () => FAKE_RESULT,
      request: { messages: [] },
    });

    expect(db.insert).toHaveBeenCalledOnce();
    const valuesSpy = (db.insert as ReturnType<typeof vi.fn>).mock.results[0].value.values;
    const [row] = (valuesSpy as ReturnType<typeof vi.fn>).mock.calls[0] as [
      Record<string, unknown>,
    ];
    expect(row.stage).toBe('build_plan');
    expect(row.payloadPath).toBe('/tmp/fake/2026-05-01.jsonl');
    expect(row).not.toHaveProperty('request');
    expect(row).not.toHaveProperty('response');
  });

  it('returns the original result enriched with runId', async () => {
    const { wrapWithLogging } = await import('../../../src/server/logging/wrap');

    const result = await wrapWithLogging({
      stage: 'test',
      task: 'x',
      call: async () => FAKE_RESULT,
      request: {},
    });

    expect(result.runId).toBe(42);
    expect(result.content).toBe('hello');
  });

  it('writes an error JSONL line and rethrows on failure without inserting a runs row', async () => {
    const { wrapWithLogging } = await import('../../../src/server/logging/wrap');
    const { appendRunLog } = await import('../../../src/server/logging/jsonl');
    const { db } = await import('../../../src/server/db/client');

    await expect(
      wrapWithLogging({
        stage: 'test',
        task: 'fail',
        call: async () => {
          throw new Error('model exploded');
        },
        request: {},
      }),
    ).rejects.toThrow('model exploded');

    expect(appendRunLog).toHaveBeenCalledOnce();
    const [entry] = (appendRunLog as ReturnType<typeof vi.fn>).mock.calls[0] as [
      Record<string, unknown>,
    ];
    expect(entry.error).toBe(true);
    expect(entry.error_message).toBe('model exploded');
    expect(db.insert).not.toHaveBeenCalled();
  });
});

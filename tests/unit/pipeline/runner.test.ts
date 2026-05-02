import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const getSessionFn = vi.fn();
  const updateSessionStateFn = vi.fn();
  const emitEventFn = vi.fn();
  const appendRunLogFn = vi.fn();
  return { getSessionFn, updateSessionStateFn, emitEventFn, appendRunLogFn };
});

vi.mock('../../../src/server/sessions/repo', () => ({
  getSession: mocks.getSessionFn,
  updateSessionState: mocks.updateSessionStateFn,
}));

vi.mock('../../../src/server/events/bus', () => ({
  emitEvent: mocks.emitEventFn,
}));

vi.mock('../../../src/server/logging/jsonl', () => ({
  appendRunLog: mocks.appendRunLogFn,
}));

afterEach(() => vi.clearAllMocks());

describe('startRunner + resolveUserInput', () => {
  it('parks on awaiting_user and advances to done after resolveUserInput', async () => {
    mocks.getSessionFn.mockResolvedValue({ id: 10, userId: 1, state: 'briefing' });
    mocks.updateSessionStateFn.mockResolvedValue({ id: 10, state: 'done' });
    mocks.emitEventFn.mockResolvedValue({});
    mocks.appendRunLogFn.mockResolvedValue({ path: '/tmp/test.jsonl' });

    const { startRunner, resolveUserInput } = await import(
      '../../../src/server/pipeline/runner'
    );

    let awaitingUserResolveFn: (() => void) | undefined;
    const awaitingUserEmitted = new Promise<void>((resolve) => {
      awaitingUserResolveFn = resolve;
    });

    mocks.emitEventFn.mockImplementation(
      async (_sessionId: number, kind: string, payload: unknown) => {
        if (kind === 'awaiting_user') awaitingUserResolveFn?.();
        return { id: 1, sessionId: _sessionId, kind, payload, ts: new Date() };
      },
    );

    const runnerPromise = startRunner(10, 1);

    await awaitingUserEmitted;

    const advanced = resolveUserInput(10, { text: 'hello' });
    expect(advanced).toBe(true);

    await runnerPromise;

    const emitCalls = mocks.emitEventFn.mock.calls as [number, string, unknown][];
    const kinds = emitCalls.map(([, kind]) => kind);
    expect(kinds).toContain('awaiting_user');
    expect(kinds).toContain('state_changed');

    const stateChangedCall = emitCalls.find(([, kind]) => kind === 'state_changed');
    expect(stateChangedCall?.[2]).toMatchObject({ state: 'done' });

    expect(mocks.updateSessionStateFn).toHaveBeenCalledWith(1, 10, 'done');
  });

  it('resolveUserInput returns false when no pending input exists', async () => {
    const { resolveUserInput } = await import('../../../src/server/pipeline/runner');
    expect(resolveUserInput(9999, { text: 'anything' })).toBe(false);
  });

  it('does nothing when session not found', async () => {
    mocks.getSessionFn.mockResolvedValue(null);
    const { startRunner } = await import('../../../src/server/pipeline/runner');
    await startRunner(999, 1);
    expect(mocks.emitEventFn).not.toHaveBeenCalled();
  });
});

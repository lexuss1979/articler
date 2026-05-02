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

describe('startRunner', () => {
  it('emits agent_message and transitions to done for planning state', async () => {
    mocks.getSessionFn.mockResolvedValue({ id: 10, userId: 1, state: 'planning' });
    mocks.updateSessionStateFn.mockResolvedValue({ id: 10, state: 'done' });
    mocks.emitEventFn.mockResolvedValue({});

    const { startRunner } = await import('../../../src/server/pipeline/runner');
    await startRunner(10, 1);

    const emitCalls = mocks.emitEventFn.mock.calls as [number, string, unknown][];
    const kinds = emitCalls.map(([, kind]) => kind);
    expect(kinds).toContain('agent_message');
    expect(kinds).toContain('state_changed');
    expect(mocks.updateSessionStateFn).toHaveBeenCalledWith(1, 10, 'done');
  });

  it('does nothing when session not found', async () => {
    mocks.getSessionFn.mockResolvedValue(null);
    const { startRunner } = await import('../../../src/server/pipeline/runner');
    await startRunner(999, 1);
    expect(mocks.emitEventFn).not.toHaveBeenCalled();
  });

  it('does nothing for an unregistered state', async () => {
    mocks.getSessionFn.mockResolvedValue({ id: 10, userId: 1, state: 'research' });
    mocks.emitEventFn.mockResolvedValue({});
    const { startRunner } = await import('../../../src/server/pipeline/runner');
    await startRunner(10, 1);
    expect(mocks.emitEventFn).not.toHaveBeenCalled();
    expect(mocks.updateSessionStateFn).not.toHaveBeenCalled();
  });
});

describe('resolveUserInput', () => {
  it('returns false when no pending input exists', async () => {
    const { resolveUserInput } = await import('../../../src/server/pipeline/runner');
    expect(resolveUserInput(9999, { text: 'anything' })).toBe(false);
  });
});

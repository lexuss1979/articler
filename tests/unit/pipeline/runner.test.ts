import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSessionFn: vi.fn(),
  updateSessionStateFn: vi.fn(),
  emitEventFn: vi.fn(),
  appendRunLogFn: vi.fn(),
}));

vi.mock('../../../src/server/sessions/repo', () => ({
  getSession: mocks.getSessionFn,
  updateSessionState: mocks.updateSessionStateFn,
  updateSessionPlan: vi.fn(),
}));

vi.mock('../../../src/server/profiles/repo', () => ({
  getProfile: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../../src/server/events/bus', () => ({
  emitEvent: mocks.emitEventFn,
}));

vi.mock('../../../src/server/logging/jsonl', () => ({
  appendRunLog: mocks.appendRunLogFn,
}));

vi.mock('../../../src/server/llm/router', () => ({
  routeChat: vi.fn(),
  routeSearch: vi.fn(),
  routeImage: vi.fn(),
}));

vi.mock('../../../src/server/pipeline/stages/clarify-brief', () => ({
  clarifyBrief: { run: vi.fn() },
}));

vi.mock('../../../src/server/pipeline/stages/propose-angles', () => ({
  proposeAngles: { run: vi.fn() },
}));

vi.mock('../../../src/server/pipeline/stages/build-plan', () => ({
  buildPlan: { run: vi.fn() },
}));

afterEach(() => vi.clearAllMocks());

describe('startRunner', () => {
  it('does nothing when session not found', async () => {
    mocks.getSessionFn.mockResolvedValue(null);
    const { startRunner } = await import('../../../src/server/pipeline/runner');
    await startRunner(999, 1);
    expect(mocks.emitEventFn).not.toHaveBeenCalled();
  });

  it('does nothing for an unregistered state', async () => {
    mocks.getSessionFn.mockResolvedValue({ id: 11, userId: 1, state: 'done', brief: null, profileId: 1 });
    mocks.emitEventFn.mockResolvedValue({});
    const { startRunner } = await import('../../../src/server/pipeline/runner');
    await startRunner(11, 1);
    expect(mocks.emitEventFn).not.toHaveBeenCalled();
    expect(mocks.updateSessionStateFn).not.toHaveBeenCalled();
  });

  it('emits agent_message and returns early when planning session has null brief', async () => {
    mocks.getSessionFn.mockResolvedValue({ id: 10, userId: 1, state: 'planning', brief: null, profileId: 1 });
    mocks.emitEventFn.mockResolvedValue({});

    const { startRunner } = await import('../../../src/server/pipeline/runner');
    await startRunner(10, 1);

    const emitCalls = mocks.emitEventFn.mock.calls as [number, string, unknown][];
    expect(emitCalls.some(([, k]) => k === 'agent_message')).toBe(true);
    expect(mocks.updateSessionStateFn).not.toHaveBeenCalled();
  });
});

describe('resolveUserInput', () => {
  it('returns false when no pending input exists', async () => {
    const { resolveUserInput } = await import('../../../src/server/pipeline/runner');
    expect(resolveUserInput(9999, { text: 'anything' })).toBe(false);
  });
});

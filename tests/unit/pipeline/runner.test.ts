import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSessionFn: vi.fn(),
  updateSessionStateFn: vi.fn(),
  emitEventFn: vi.fn(),
  appendRunLogFn: vi.fn(),
  dispatchBatchQueue: vi.fn().mockResolvedValue(undefined),
  BudgetExceededError: class BudgetExceededError extends Error {
    constructor(public scope: string, public spent: number, public cap: number) {
      super('budget exceeded');
      this.name = 'BudgetExceededError';
    }
  },
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
  clarifyBrief: { name: 'clarify_brief', run: vi.fn() },
}));

vi.mock('../../../src/server/pipeline/stages/propose-angles', () => ({
  proposeAngles: { name: 'propose_angles', run: vi.fn() },
}));

vi.mock('../../../src/server/pipeline/stages/build-plan', () => ({
  buildPlan: { name: 'build_plan', run: vi.fn() },
}));

vi.mock('../../../src/server/profiles/profile-assertions-repo', () => ({
  listAssertions: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../../src/server/pipeline/run-classify-answers', () => ({
  runClassifyAnswers: vi.fn().mockResolvedValue({ applied: 0, skipped: 0, droppedAsTopicBound: 0 }),
}));

vi.mock('../../../src/server/llm/budget-guard', () => ({
  BudgetExceededError: mocks.BudgetExceededError,
  assertBudget: vi.fn(),
}));

vi.mock('../../../src/server/batches/dispatcher', () => ({
  dispatchBatchQueue: mocks.dispatchBatchQueue,
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

  it('resolves cleanly without emitting events or transitioning state for queued session', async () => {
    mocks.getSessionFn.mockResolvedValue({ id: 20, userId: 1, state: 'queued', brief: null, profileId: 1 });
    mocks.emitEventFn.mockResolvedValue({});
    const { startRunner } = await import('../../../src/server/pipeline/runner');
    await startRunner(20, 1);
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

  it('runs stage.run inside an LLMContext set to {userId, sessionId, stage, task}', async () => {
    mocks.getSessionFn.mockResolvedValue({
      id: 42,
      userId: 7,
      state: 'planning',
      brief: { topic: 'x', goal: '', notes: '', sourceArticles: [] },
      profileId: 1,
    });
    mocks.emitEventFn.mockResolvedValue({});

    const profileMod = await import('../../../src/server/profiles/repo');
    vi.mocked(profileMod.getProfile).mockResolvedValue({
      id: 1,
      userId: 7,
      name: 'p',
      format: 'long_read',
      style: 's',
      audience: 'a',
      targetVolumeMin: 100,
      targetVolumeMax: 200,
      markupRules: {},
      extraPrompt: '',
      lightResearchSources: 1,
      lightMaxWords: 800,
      createdAt: new Date(),
    });

    const ctxMod = await import('../../../src/server/llm/context');
    let captured: ReturnType<typeof ctxMod.getLLMContext>;

    const stageMod = await import('../../../src/server/pipeline/stages/clarify-brief');
    vi.mocked(stageMod.clarifyBrief.run).mockImplementation(async () => {
      captured = ctxMod.getLLMContext();
      return { questions: [] };
    });

    const anglesMod = await import('../../../src/server/pipeline/stages/propose-angles');
    const sentinel = new Error('STOP_AFTER_CLARIFY');
    vi.mocked(anglesMod.proposeAngles.run).mockRejectedValue(sentinel);

    const { startRunner } = await import('../../../src/server/pipeline/runner');
    await expect(startRunner(42, 7)).rejects.toBe(sentinel);

    expect(captured).toEqual({
      userId: 7,
      sessionId: 42,
      stage: 'clarify_brief',
      task: 'clarify_brief',
    });
  });

  const validProfile = {
    id: 1, userId: 5, name: 'p', format: 'long_read', style: 's', audience: 'a',
    targetVolumeMin: 100, targetVolumeMax: 200, markupRules: {}, extraPrompt: '',
    lightResearchSources: 1, lightMaxWords: 800, createdAt: new Date(),
  };

  it('catches BudgetExceededError, marks session failed, resolves without rethrow, calls dispatchBatchQueue', async () => {
    mocks.getSessionFn.mockResolvedValue({
      id: 50, userId: 5, state: 'planning',
      brief: { topic: 't', goal: '', notes: '', sourceArticles: [] },
      profileId: 1,
    });
    mocks.emitEventFn.mockResolvedValue({});
    mocks.updateSessionStateFn.mockResolvedValue(null);
    mocks.dispatchBatchQueue.mockResolvedValue(undefined);

    const profileMod = await import('../../../src/server/profiles/repo');
    vi.mocked(profileMod.getProfile).mockResolvedValue(validProfile);

    const assertionsMod = await import('../../../src/server/profiles/profile-assertions-repo');
    vi.mocked(assertionsMod.listAssertions).mockRejectedValue(
      new mocks.BudgetExceededError('user', 1, 1),
    );

    const { startRunner } = await import('../../../src/server/pipeline/runner');
    await startRunner(50, 5);

    expect(mocks.updateSessionStateFn).toHaveBeenCalledWith(5, 50, 'failed');
    expect(mocks.emitEventFn).toHaveBeenCalledWith(50, 'state_changed', {
      state: 'failed',
      reason: 'budget_exceeded',
    });
    expect(mocks.dispatchBatchQueue).toHaveBeenCalledWith(5);
  });

  it('rethrows generic errors and still calls dispatchBatchQueue in finally', async () => {
    mocks.getSessionFn.mockResolvedValue({
      id: 51, userId: 5, state: 'planning',
      brief: { topic: 't', goal: '', notes: '', sourceArticles: [] },
      profileId: 1,
    });
    mocks.emitEventFn.mockResolvedValue({});
    mocks.dispatchBatchQueue.mockResolvedValue(undefined);

    const profileMod = await import('../../../src/server/profiles/repo');
    vi.mocked(profileMod.getProfile).mockResolvedValue(validProfile);

    const assertionsMod = await import('../../../src/server/profiles/profile-assertions-repo');
    const genericError = new Error('generic failure');
    vi.mocked(assertionsMod.listAssertions).mockRejectedValue(genericError);

    const { startRunner } = await import('../../../src/server/pipeline/runner');
    await expect(startRunner(51, 5)).rejects.toBe(genericError);
    expect(mocks.dispatchBatchQueue).toHaveBeenCalledWith(5);
  });

  it('calls dispatchBatchQueue in finally on happy-path resolution', async () => {
    mocks.getSessionFn.mockResolvedValue({
      id: 52, userId: 5, state: 'done', brief: null, profileId: 1,
    });
    mocks.dispatchBatchQueue.mockResolvedValue(undefined);

    const { startRunner } = await import('../../../src/server/pipeline/runner');
    await startRunner(52, 5);

    expect(mocks.dispatchBatchQueue).toHaveBeenCalledWith(5);
  });
});

describe('resolveUserInput', () => {
  it('returns false when no pending input exists', async () => {
    const { resolveUserInput } = await import('../../../src/server/pipeline/runner');
    expect(resolveUserInput(9999, { text: 'anything' })).toBe(false);
  });
});

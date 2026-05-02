import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSessionFn: vi.fn(),
  getProfileFn: vi.fn(),
  updateSessionPlanFn: vi.fn(),
  updateSessionStateFn: vi.fn(),
  emitEventFn: vi.fn(),
  appendRunLogFn: vi.fn(),
  clarifyBriefRun: vi.fn(),
  proposeAnglesRun: vi.fn(),
  buildPlanRun: vi.fn(),
}));

vi.mock('../../../src/server/sessions/repo', () => ({
  getSession: mocks.getSessionFn,
  updateSessionPlan: mocks.updateSessionPlanFn,
  updateSessionState: mocks.updateSessionStateFn,
}));

vi.mock('../../../src/server/profiles/repo', () => ({
  getProfile: mocks.getProfileFn,
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
  clarifyBrief: { run: mocks.clarifyBriefRun },
}));

vi.mock('../../../src/server/pipeline/stages/propose-angles', () => ({
  proposeAngles: { run: mocks.proposeAnglesRun },
}));

vi.mock('../../../src/server/pipeline/stages/build-plan', () => ({
  buildPlan: { run: mocks.buildPlanRun },
}));

afterEach(() => vi.clearAllMocks());

const validBrief = { topic: 'Prompt caching', goal: '', notes: '', sourceArticles: [] };

const profile = {
  id: 1,
  userId: 1,
  name: 'Habr',
  format: 'long_read',
  style: 'Technical',
  audience: 'Engineers',
  targetVolumeMin: 2000,
  targetVolumeMax: 4000,
  markupRules: {},
  extraPrompt: '',
  createdAt: new Date(),
};

const angles = [
  { title: 'Deep Dive', methodology: 'deep_dive', rationale: 'Depth.' },
  { title: 'How-To', methodology: 'how_to', rationale: 'Actionable.' },
];

const plan = {
  thesis: 'Caching saves cost.',
  targetTakeaway: 'Know when to cache.',
  sections: [
    { id: 's1', title: 'Intro', intent: 'Hook.', expectedLength: 300, keyPoints: ['k1'] },
    { id: 's2', title: 'Deep Dive', intent: 'Explain.', expectedLength: 700, keyPoints: ['k2'] },
  ],
};

describe('startRunner — planning state', () => {
  it('drives the full planning flow with clarifications and emits expected events', async () => {
    mocks.getSessionFn.mockResolvedValue({
      id: 10,
      userId: 1,
      state: 'planning',
      brief: validBrief,
      profileId: 1,
    });
    mocks.getProfileFn.mockResolvedValue(profile);
    mocks.updateSessionPlanFn.mockResolvedValue({});
    mocks.updateSessionStateFn.mockResolvedValue({});
    mocks.appendRunLogFn.mockResolvedValue({ path: '/tmp/test.jsonl' });

    mocks.clarifyBriefRun.mockResolvedValue({ questions: ['Who is this for?'] });
    mocks.proposeAnglesRun.mockResolvedValue({ angles });
    mocks.buildPlanRun.mockResolvedValue(plan);

    const emittedEvents: Array<[string, unknown]> = [];
    mocks.emitEventFn.mockImplementation(
      async (_sid: number, kind: string, payload: unknown) => {
        emittedEvents.push([kind, payload]);
        return { id: emittedEvents.length, sessionId: _sid, kind, payload, ts: new Date() };
      },
    );

    const { startRunner, resolveUserInput } = await import(
      '../../../src/server/pipeline/runner'
    );

    const runnerPromise = startRunner(10, 1);

    // Wait for the first awaiting_user (clarify)
    await waitForEvent(emittedEvents, 'awaiting_user');
    expect(resolveUserInput(10, { answers: ['Senior engineers'] })).toBe(true);

    // Wait for the second awaiting_user (angle_choice)
    await waitForEvent(emittedEvents, 'awaiting_user', 1);
    expect(resolveUserInput(10, { index: 0 })).toBe(true);

    // Wait for the third awaiting_user (plan_lock)
    await waitForEvent(emittedEvents, 'awaiting_user', 2);
    expect(resolveUserInput(10, { action: 'lock' })).toBe(true);

    await runnerPromise;

    const kinds = emittedEvents.map(([k]) => k);
    expect(kinds).toContain('artifact_updated');
    expect(kinds).toContain('state_changed');

    const stateChanged = emittedEvents.find(([k]) => k === 'state_changed');
    expect(stateChanged?.[1]).toMatchObject({ state: 'research' });

    expect(mocks.updateSessionPlanFn).toHaveBeenCalledWith(1, 10, plan);
    expect(mocks.updateSessionStateFn).toHaveBeenCalledWith(1, 10, 'research');
  });

  it('skips clarification park when questions array is empty', async () => {
    mocks.getSessionFn.mockResolvedValue({
      id: 11,
      userId: 1,
      state: 'planning',
      brief: validBrief,
      profileId: 1,
    });
    mocks.getProfileFn.mockResolvedValue(profile);
    mocks.updateSessionPlanFn.mockResolvedValue({});
    mocks.updateSessionStateFn.mockResolvedValue({});
    mocks.appendRunLogFn.mockResolvedValue({ path: '/tmp/test.jsonl' });

    mocks.clarifyBriefRun.mockResolvedValue({ questions: [] });
    mocks.proposeAnglesRun.mockResolvedValue({ angles });
    mocks.buildPlanRun.mockResolvedValue(plan);

    const emittedEvents: Array<[string, unknown]> = [];
    mocks.emitEventFn.mockImplementation(async (_sid: number, kind: string, payload: unknown) => {
      emittedEvents.push([kind, payload]);
      return { id: emittedEvents.length, sessionId: _sid, kind, payload, ts: new Date() };
    });

    const { startRunner, resolveUserInput } = await import(
      '../../../src/server/pipeline/runner'
    );

    const runnerPromise = startRunner(11, 1);

    // First awaiting_user should be angle_choice, not clarify
    await waitForEvent(emittedEvents, 'awaiting_user');
    const awaitingPayload = emittedEvents.find(([k]) => k === 'awaiting_user')?.[1] as { prompt: string };
    expect(awaitingPayload.prompt).toBe('angle_choice');
    expect(resolveUserInput(11, { index: 1 })).toBe(true);

    await waitForEvent(emittedEvents, 'awaiting_user', 1);
    expect(resolveUserInput(11, { action: 'lock' })).toBe(true);

    await runnerPromise;
    expect(mocks.updateSessionStateFn).toHaveBeenCalledWith(1, 11, 'research');
  });

  it('emits agent_message and returns early when brief is missing', async () => {
    mocks.getSessionFn.mockResolvedValue({
      id: 12,
      userId: 1,
      state: 'planning',
      brief: null,
      profileId: 1,
    });
    mocks.emitEventFn.mockResolvedValue({});

    const { startRunner } = await import('../../../src/server/pipeline/runner');
    await startRunner(12, 1);

    const emitCalls = mocks.emitEventFn.mock.calls as [number, string, unknown][];
    expect(emitCalls.some(([, k]) => k === 'agent_message')).toBe(true);
    expect(mocks.clarifyBriefRun).not.toHaveBeenCalled();
  });
});

function waitForEvent(
  events: Array<[string, unknown]>,
  kind: string,
  afterIndex = 0,
): Promise<void> {
  return new Promise((resolve) => {
    const check = () => {
      const occurrences = events.filter(([k]) => k === kind).length;
      if (occurrences > afterIndex) {
        resolve();
      } else {
        setTimeout(check, 5);
      }
    };
    check();
  });
}

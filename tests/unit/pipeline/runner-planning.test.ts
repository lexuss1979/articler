import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  listAssertionsFn: vi.fn(),
  runClassifyAnswersFn: vi.fn(),
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

vi.mock('../../../src/server/profiles/profile-assertions-repo', () => ({
  listAssertions: mocks.listAssertionsFn,
}));

vi.mock('../../../src/server/pipeline/run-classify-answers', () => ({
  runClassifyAnswers: mocks.runClassifyAnswersFn,
}));

beforeEach(() => {
  mocks.listAssertionsFn.mockResolvedValue([]);
  mocks.runClassifyAnswersFn.mockResolvedValue({ applied: 0, skipped: 0 });
});

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
  lightResearchSources: 1,
  lightMaxWords: 800,
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
    mocks.getSessionFn
      .mockResolvedValueOnce({ id: 10, userId: 1, state: 'planning', brief: validBrief, profileId: 1 })
      .mockResolvedValue({ id: 10, userId: 1, state: 'research', plan: null, profileId: 1 });
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
    mocks.getSessionFn
      .mockResolvedValueOnce({ id: 11, userId: 1, state: 'planning', brief: validBrief, profileId: 1 })
      .mockResolvedValue({ id: 11, userId: 1, state: 'research', plan: null, profileId: 1 });
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

  it('passes knownAssertions from listAssertions to clarifyBrief.run', async () => {
    const assertion = { key: 'tone_formal', category: 'tone', assertion: 'Uses formal tone.', confidence: 0.9, evidenceCount: 5 };
    mocks.listAssertionsFn.mockResolvedValue([assertion]);
    mocks.getSessionFn
      .mockResolvedValueOnce({ id: 13, userId: 1, state: 'planning', brief: validBrief, profileId: 1 })
      .mockResolvedValue({ id: 13, userId: 1, state: 'research', plan: null, profileId: 1 });
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

    const { startRunner, resolveUserInput } = await import('../../../src/server/pipeline/runner');
    const runnerPromise = startRunner(13, 1);

    await waitForEvent(emittedEvents, 'awaiting_user');
    expect(resolveUserInput(13, { index: 0 })).toBe(true);
    await waitForEvent(emittedEvents, 'awaiting_user', 1);
    expect(resolveUserInput(13, { action: 'lock' })).toBe(true);
    await runnerPromise;

    const callInput = mocks.clarifyBriefRun.mock.calls[0][0] as { knownAssertions: unknown[] };
    expect(callInput.knownAssertions).toContainEqual(expect.objectContaining({ key: 'tone_formal', confidence: 0.9 }));
  });

  it('calls runClassifyAnswers with collected qa when clarifications exist', async () => {
    mocks.getSessionFn
      .mockResolvedValueOnce({ id: 14, userId: 1, state: 'planning', brief: validBrief, profileId: 1 })
      .mockResolvedValue({ id: 14, userId: 1, state: 'research', plan: null, profileId: 1 });
    mocks.getProfileFn.mockResolvedValue(profile);
    mocks.updateSessionPlanFn.mockResolvedValue({});
    mocks.updateSessionStateFn.mockResolvedValue({});
    mocks.appendRunLogFn.mockResolvedValue({ path: '/tmp/test.jsonl' });
    mocks.clarifyBriefRun.mockResolvedValue({ questions: [{ question: 'Who is the audience?' }] });
    mocks.proposeAnglesRun.mockResolvedValue({ angles });
    mocks.buildPlanRun.mockResolvedValue(plan);

    const emittedEvents: Array<[string, unknown]> = [];
    mocks.emitEventFn.mockImplementation(async (_sid: number, kind: string, payload: unknown) => {
      emittedEvents.push([kind, payload]);
      return { id: emittedEvents.length, sessionId: _sid, kind, payload, ts: new Date() };
    });

    const { startRunner, resolveUserInput } = await import('../../../src/server/pipeline/runner');
    const runnerPromise = startRunner(14, 1);

    await waitForEvent(emittedEvents, 'awaiting_user');
    expect(resolveUserInput(14, { answers: ['Senior engineers'] })).toBe(true);
    await waitForEvent(emittedEvents, 'awaiting_user', 1);
    expect(resolveUserInput(14, { index: 0 })).toBe(true);
    await waitForEvent(emittedEvents, 'awaiting_user', 2);
    expect(resolveUserInput(14, { action: 'lock' })).toBe(true);
    await runnerPromise;

    expect(mocks.runClassifyAnswersFn).toHaveBeenCalledOnce();
    expect(mocks.runClassifyAnswersFn.mock.calls[0][0]).toMatchObject({
      qa: [{ question: 'Who is the audience?', answer: 'Senior engineers' }],
    });
  });

  it('does not call runClassifyAnswers when questions array is empty', async () => {
    mocks.getSessionFn
      .mockResolvedValueOnce({ id: 15, userId: 1, state: 'planning', brief: validBrief, profileId: 1 })
      .mockResolvedValue({ id: 15, userId: 1, state: 'research', plan: null, profileId: 1 });
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

    const { startRunner, resolveUserInput } = await import('../../../src/server/pipeline/runner');
    const runnerPromise = startRunner(15, 1);

    await waitForEvent(emittedEvents, 'awaiting_user');
    expect(resolveUserInput(15, { index: 0 })).toBe(true);
    await waitForEvent(emittedEvents, 'awaiting_user', 1);
    expect(resolveUserInput(15, { action: 'lock' })).toBe(true);
    await runnerPromise;

    expect(mocks.runClassifyAnswersFn).not.toHaveBeenCalled();
    expect(mocks.proposeAnglesRun).toHaveBeenCalled();
  });

  it('does not rethrow when runClassifyAnswers rejects and still calls proposeAngles', async () => {
    mocks.getSessionFn
      .mockResolvedValueOnce({ id: 16, userId: 1, state: 'planning', brief: validBrief, profileId: 1 })
      .mockResolvedValue({ id: 16, userId: 1, state: 'research', plan: null, profileId: 1 });
    mocks.getProfileFn.mockResolvedValue(profile);
    mocks.updateSessionPlanFn.mockResolvedValue({});
    mocks.updateSessionStateFn.mockResolvedValue({});
    mocks.appendRunLogFn.mockResolvedValue({ path: '/tmp/test.jsonl' });
    mocks.clarifyBriefRun.mockResolvedValue({ questions: [{ question: 'What tone?' }] });
    mocks.runClassifyAnswersFn.mockRejectedValue(new Error('enrichment boom'));
    mocks.proposeAnglesRun.mockResolvedValue({ angles });
    mocks.buildPlanRun.mockResolvedValue(plan);

    const emittedEvents: Array<[string, unknown]> = [];
    mocks.emitEventFn.mockImplementation(async (_sid: number, kind: string, payload: unknown) => {
      emittedEvents.push([kind, payload]);
      return { id: emittedEvents.length, sessionId: _sid, kind, payload, ts: new Date() };
    });

    const { startRunner, resolveUserInput } = await import('../../../src/server/pipeline/runner');
    const runnerPromise = startRunner(16, 1);

    await waitForEvent(emittedEvents, 'awaiting_user');
    expect(resolveUserInput(16, { answers: ['Casual'] })).toBe(true);
    await waitForEvent(emittedEvents, 'awaiting_user', 1);
    expect(resolveUserInput(16, { index: 0 })).toBe(true);
    await waitForEvent(emittedEvents, 'awaiting_user', 2);
    expect(resolveUserInput(16, { action: 'lock' })).toBe(true);

    await expect(runnerPromise).resolves.toBeUndefined();
    expect(mocks.proposeAnglesRun).toHaveBeenCalled();
  });
});

describe('startRunner — planning state (light mode)', () => {
  it('auto-picks recommendedIndex without angle_choice or plan_lock gates', async () => {
    mocks.getSessionFn
      .mockResolvedValueOnce({ id: 20, userId: 1, state: 'planning', brief: validBrief, profileId: 1, mode: 'light' })
      .mockResolvedValue({ id: 20, userId: 1, state: 'research', plan: null, profileId: 1, mode: 'light' });
    mocks.getProfileFn.mockResolvedValue(profile);
    mocks.updateSessionPlanFn.mockResolvedValue({});
    mocks.updateSessionStateFn.mockResolvedValue({});
    mocks.appendRunLogFn.mockResolvedValue({ path: '/tmp/test.jsonl' });

    mocks.clarifyBriefRun.mockResolvedValue({ questions: [] });
    mocks.proposeAnglesRun.mockResolvedValue({ angles, recommendedIndex: 1, recommendationReason: 'More actionable.' });
    mocks.buildPlanRun.mockResolvedValue(plan);

    const emittedEvents: Array<[string, unknown]> = [];
    mocks.emitEventFn.mockImplementation(async (_sid: number, kind: string, payload: unknown) => {
      emittedEvents.push([kind, payload]);
      return { id: emittedEvents.length, sessionId: _sid, kind, payload, ts: new Date() };
    });

    const { startRunner } = await import('../../../src/server/pipeline/runner');
    await startRunner(20, 1);

    expect(emittedEvents.some(([k]) => k === 'awaiting_user')).toBe(false);
    expect(mocks.updateSessionStateFn).toHaveBeenCalledWith(1, 20, 'research');
    const buildPlanCall = mocks.buildPlanRun.mock.calls[0][0] as { angle: (typeof angles)[number] };
    expect(buildPlanCall.angle).toEqual(angles[1]);
  });

  it('emits artifact_updated for angles with recommendedIndex and recommendationReason', async () => {
    mocks.getSessionFn
      .mockResolvedValueOnce({ id: 21, userId: 1, state: 'planning', brief: validBrief, profileId: 1, mode: 'light' })
      .mockResolvedValue({ id: 21, userId: 1, state: 'research', plan: null, profileId: 1, mode: 'light' });
    mocks.getProfileFn.mockResolvedValue(profile);
    mocks.updateSessionPlanFn.mockResolvedValue({});
    mocks.updateSessionStateFn.mockResolvedValue({});
    mocks.appendRunLogFn.mockResolvedValue({ path: '/tmp/test.jsonl' });

    mocks.clarifyBriefRun.mockResolvedValue({ questions: [] });
    mocks.proposeAnglesRun.mockResolvedValue({ angles, recommendedIndex: 0, recommendationReason: 'Best choice.' });
    mocks.buildPlanRun.mockResolvedValue(plan);

    const emittedEvents: Array<[string, unknown]> = [];
    mocks.emitEventFn.mockImplementation(async (_sid: number, kind: string, payload: unknown) => {
      emittedEvents.push([kind, payload]);
      return { id: emittedEvents.length, sessionId: _sid, kind, payload, ts: new Date() };
    });

    const { startRunner } = await import('../../../src/server/pipeline/runner');
    await startRunner(21, 1);

    const anglesEvent = emittedEvents.find(
      ([k, p]) => k === 'artifact_updated' && (p as { kind: string }).kind === 'angles',
    );
    expect(anglesEvent).toBeDefined();
    expect(anglesEvent![1]).toMatchObject({
      kind: 'angles',
      angles,
      recommendedIndex: 0,
      recommendationReason: 'Best choice.',
    });
  });

  it('still gates on clarify userInput when questions exist, then auto-completes without further gates', async () => {
    mocks.getSessionFn
      .mockResolvedValueOnce({ id: 22, userId: 1, state: 'planning', brief: validBrief, profileId: 1, mode: 'light' })
      .mockResolvedValue({ id: 22, userId: 1, state: 'research', plan: null, profileId: 1, mode: 'light' });
    mocks.getProfileFn.mockResolvedValue(profile);
    mocks.updateSessionPlanFn.mockResolvedValue({});
    mocks.updateSessionStateFn.mockResolvedValue({});
    mocks.appendRunLogFn.mockResolvedValue({ path: '/tmp/test.jsonl' });

    mocks.clarifyBriefRun.mockResolvedValue({ questions: [{ question: 'Who is this for?' }] });
    mocks.proposeAnglesRun.mockResolvedValue({ angles, recommendedIndex: 0, recommendationReason: 'Broad.' });
    mocks.buildPlanRun.mockResolvedValue(plan);

    const emittedEvents: Array<[string, unknown]> = [];
    mocks.emitEventFn.mockImplementation(async (_sid: number, kind: string, payload: unknown) => {
      emittedEvents.push([kind, payload]);
      return { id: emittedEvents.length, sessionId: _sid, kind, payload, ts: new Date() };
    });

    const { startRunner, resolveUserInput } = await import('../../../src/server/pipeline/runner');
    const runnerPromise = startRunner(22, 1);

    // Only one awaiting_user: clarify
    await waitForEvent(emittedEvents, 'awaiting_user');
    const clarifyEvent = emittedEvents.find(([k]) => k === 'awaiting_user');
    expect((clarifyEvent![1] as { prompt: string }).prompt).toBe('clarify');
    expect(resolveUserInput(22, { answers: ['Developers'] })).toBe(true);

    await runnerPromise;

    const awaitingCount = emittedEvents.filter(([k]) => k === 'awaiting_user').length;
    expect(awaitingCount).toBe(1);
    expect(mocks.updateSessionStateFn).toHaveBeenCalledWith(1, 22, 'research');
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

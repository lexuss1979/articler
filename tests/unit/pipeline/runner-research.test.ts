import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSessionFn: vi.fn(),
  getProfileFn: vi.fn(),
  updateSessionStateFn: vi.fn(),
  emitEventFn: vi.fn(),
  appendRunLogFn: vi.fn(),
  insertSourceFn: vi.fn(),
  planSearchHypothesesRunFn: vi.fn(),
  formulateQueriesRunFn: vi.fn(),
  webSearchRunFn: vi.fn(),
  summarizeSourceRunFn: vi.fn(),
}));

vi.mock('../../../src/server/sessions/repo', () => ({
  getSession: mocks.getSessionFn,
  updateSessionState: mocks.updateSessionStateFn,
  updateSessionPlan: vi.fn(),
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

vi.mock('../../../src/server/sessions/sources-repo', () => ({
  insertSource: mocks.insertSourceFn,
  findSourceByQuery: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../../src/server/pipeline/stages/plan-search-hypotheses', () => ({
  planSearchHypotheses: { run: mocks.planSearchHypothesesRunFn },
}));

vi.mock('../../../src/server/pipeline/stages/formulate-queries', () => ({
  formulateQueries: { run: mocks.formulateQueriesRunFn },
}));

vi.mock('../../../src/server/pipeline/stages/web-search', () => ({
  webSearch: { run: mocks.webSearchRunFn },
}));

vi.mock('../../../src/server/pipeline/stages/summarize-source', () => ({
  summarizeSource: { run: mocks.summarizeSourceRunFn },
}));

// No-op mocks for planning stages (runner imports them)
vi.mock('../../../src/server/pipeline/stages/clarify-brief', () => ({
  clarifyBrief: { run: vi.fn() },
}));
vi.mock('../../../src/server/pipeline/stages/propose-angles', () => ({
  proposeAngles: { run: vi.fn() },
}));
vi.mock('../../../src/server/pipeline/stages/build-plan', () => ({
  buildPlan: { run: vi.fn() },
}));

const plan = {
  thesis: 'Prompt caching reduces costs.',
  targetTakeaway: 'Implement caching.',
  sections: [
    { id: 'intro', title: 'Intro', intent: 'Set context', expectedLength: 400, keyPoints: ['caching'] },
    { id: 'benchmarks', title: 'Benchmarks', intent: 'Show data', expectedLength: 600, keyPoints: ['cost'] },
  ],
};

const profile = {
  id: 1, userId: 1, name: 'Blog', format: 'long_read', style: 'Technical', audience: 'Engineers',
  targetVolumeMin: 1000, targetVolumeMax: 2000, markupRules: {}, extraPrompt: '', createdAt: new Date(),
};

const hypothesis = { id: 'h-1', sectionId: 'intro', text: 'Caching cuts costs 50%', evidenceKind: 'statistic' };
const query = { text: 'prompt caching benchmark' };
const hit1 = { url: 'https://a.example.com', title: 'Article A', snippet: 'Snippet A' };
const hit2 = { url: 'https://b.example.com', title: 'Article B', snippet: 'Snippet B' };

afterEach(() => vi.clearAllMocks());

describe('startRunner — research state', () => {
  it('aborts with agent_message when session.plan is invalid', async () => {
    mocks.getSessionFn.mockResolvedValue({ id: 10, userId: 1, state: 'research', plan: null, profileId: 1 });
    mocks.emitEventFn.mockResolvedValue({ id: 1, sessionId: 10, kind: 'agent_message', payload: {}, ts: new Date() });

    const { startRunner } = await import('../../../src/server/pipeline/runner');
    await startRunner(10, 1);

    const kinds = (mocks.emitEventFn.mock.calls as [number, string, unknown][]).map(([, k]) => k);
    expect(kinds).toContain('agent_message');
    expect(mocks.planSearchHypothesesRunFn).not.toHaveBeenCalled();
  });

  it('inserts source for each hit and emits artifact_updated in correct order', async () => {
    mocks.getSessionFn.mockResolvedValue({ id: 10, userId: 1, state: 'research', plan, profileId: 1 });
    mocks.getProfileFn.mockResolvedValue(profile);
    mocks.emitEventFn.mockResolvedValue({ id: 1, sessionId: 10, kind: '', payload: {}, ts: new Date() });
    mocks.updateSessionStateFn.mockResolvedValue({ id: 10, state: 'drafting' });

    mocks.planSearchHypothesesRunFn.mockResolvedValue({ hypotheses: [hypothesis] });
    mocks.formulateQueriesRunFn.mockResolvedValue({ queries: [query] });
    mocks.webSearchRunFn.mockResolvedValue({ hits: [hit1, hit2], cached: false });
    mocks.summarizeSourceRunFn
      .mockResolvedValueOnce({ summary: 'Summary A', relevanceScore: 80 })
      .mockResolvedValueOnce({ summary: 'Summary B', relevanceScore: 60 });
    mocks.insertSourceFn
      .mockResolvedValueOnce({ id: 1, url: hit1.url })
      .mockResolvedValueOnce({ id: 2, url: hit2.url });

    const { startRunner, resolveUserInput } = await import('../../../src/server/pipeline/runner');

    // Start runner without awaiting — it will park at research_done
    const runnerPromise = startRunner(10, 1);

    // Wait until the runner parks (awaiting_user emitted)
    await vi.waitFor(() => {
      const calls = mocks.emitEventFn.mock.calls as [number, string, unknown][];
      expect(calls.some(([, k]) => k === 'awaiting_user')).toBe(true);
    });

    // Unpark the runner
    resolveUserInput(10, { action: 'finish' });

    await runnerPromise;

    // insertSource called twice (once per hit)
    expect(mocks.insertSourceFn).toHaveBeenCalledTimes(2);
    expect(mocks.insertSourceFn).toHaveBeenCalledWith(
      1, 10,
      expect.objectContaining({ url: hit1.url, summary: 'Summary A', relevanceScore: 80 }),
    );
    expect(mocks.insertSourceFn).toHaveBeenCalledWith(
      1, 10,
      expect.objectContaining({ url: hit2.url, summary: 'Summary B', relevanceScore: 60 }),
    );

    // artifact_updated events: hypotheses, source (x2)
    const artifactCalls = (mocks.emitEventFn.mock.calls as [number, string, unknown][])
      .filter(([, k]) => k === 'artifact_updated')
      .map(([, , p]) => (p as { kind: string }).kind);
    expect(artifactCalls).toEqual(['hypotheses', 'source', 'source']);

    // state transitions to drafting
    expect(mocks.updateSessionStateFn).toHaveBeenCalledWith(1, 10, 'drafting');
    const stateChangedCalls = (mocks.emitEventFn.mock.calls as [number, string, unknown][])
      .filter(([, k]) => k === 'state_changed');
    expect(stateChangedCalls[0]?.[2]).toMatchObject({ state: 'drafting' });
  });
});

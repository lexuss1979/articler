import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSessionFn: vi.fn(),
  getProfileFn: vi.fn(),
  updateSessionStateFn: vi.fn(),
  updateSessionDraftFn: vi.fn(),
  emitEventFn: vi.fn(),
  appendRunLogFn: vi.fn(),
  insertSourceFn: vi.fn(),
  listSessionSourcesFn: vi.fn(),
  upsertSectionDraftFn: vi.fn(),
  planSearchHypothesesRunFn: vi.fn(),
  formulateQueriesRunFn: vi.fn(),
  webSearchRunFn: vi.fn(),
  summarizeSourceRunFn: vi.fn(),
  draftSectionRunFn: vi.fn(),
}));

vi.mock('../../../src/server/sessions/repo', () => ({
  getSession: mocks.getSessionFn,
  updateSessionState: mocks.updateSessionStateFn,
  updateSessionPlan: vi.fn(),
  updateSessionDraft: mocks.updateSessionDraftFn,
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
  listSessionSources: mocks.listSessionSourcesFn,
  findSourceByQuery: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../../src/server/sessions/section-drafts-repo', () => ({
  upsertSectionDraft: mocks.upsertSectionDraftFn,
  listSectionDrafts: vi.fn().mockResolvedValue([]),
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

vi.mock('../../../src/server/pipeline/stages/draft-section', () => ({
  draftSection: { run: mocks.draftSectionRunFn },
}));

// No-op mocks for planning stages
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

const brief = { topic: 'Prompt caching', goal: '', notes: '', sourceArticles: [] };

const profile = {
  id: 1, userId: 1, name: 'Blog', format: 'long_read', style: 'Technical', audience: 'Engineers',
  targetVolumeMin: 1000, targetVolumeMax: 2000, markupRules: {}, extraPrompt: '', createdAt: new Date(),
};

const hypothesis = { id: 'h-1', sectionId: 'intro', text: 'Caching cuts costs 50%', evidenceKind: 'statistic' };
const query = { text: 'prompt caching benchmark' };
const hit1 = { url: 'https://a.example.com', title: 'Article A', snippet: 'Snippet A' };
const hit2 = { url: 'https://b.example.com', title: 'Article B', snippet: 'Snippet B' };

const researchSession = { id: 10, userId: 1, state: 'research', plan, brief, profileId: 1, mode: 'write' };
const draftingSession = { id: 10, userId: 1, state: 'drafting', plan, brief, profileId: 1, mode: 'write' };

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
    // research → drafting (recursive) → review (recursive, parks for review_done) → null (stop)
    const reviewSession = { id: 10, userId: 1, state: 'review', plan, brief, profileId: 1, mode: 'write' };
    mocks.getSessionFn
      .mockResolvedValueOnce(researchSession)
      .mockResolvedValueOnce(draftingSession)
      .mockResolvedValueOnce(reviewSession)
      .mockResolvedValue(null);
    mocks.getProfileFn.mockResolvedValue(profile);
    mocks.emitEventFn.mockResolvedValue({ id: 1, sessionId: 10, kind: '', payload: {}, ts: new Date() });
    mocks.updateSessionStateFn.mockResolvedValue({ id: 10, state: 'drafting' });
    mocks.updateSessionDraftFn.mockResolvedValue({});
    mocks.upsertSectionDraftFn.mockResolvedValue({});
    mocks.listSessionSourcesFn.mockResolvedValue([]);

    mocks.planSearchHypothesesRunFn.mockResolvedValue({ hypotheses: [hypothesis] });
    mocks.formulateQueriesRunFn.mockResolvedValue({ queries: [query] });
    mocks.webSearchRunFn.mockResolvedValue({ hits: [hit1, hit2], cached: false });
    mocks.summarizeSourceRunFn
      .mockResolvedValueOnce({ summary: 'Summary A', relevanceScore: 80 })
      .mockResolvedValueOnce({ summary: 'Summary B', relevanceScore: 60 });
    mocks.insertSourceFn
      .mockResolvedValueOnce({ id: 1, url: hit1.url })
      .mockResolvedValueOnce({ id: 2, url: hit2.url });
    mocks.draftSectionRunFn.mockResolvedValue({ contentMd: '## Section\n\nContent.' });

    const { startRunner, resolveUserInput } = await import('../../../src/server/pipeline/runner');

    // Start runner without awaiting — it will park at research_done, then draft_done
    const runnerPromise = startRunner(10, 1);

    // Wait until the runner parks at research_done
    await vi.waitFor(() => {
      const calls = mocks.emitEventFn.mock.calls as [number, string, unknown][];
      expect(calls.some(([, k, p]) => k === 'awaiting_user' && (p as { prompt: string }).prompt === 'research_done')).toBe(true);
    }, { timeout: 3000 });

    // Unpark research_done → runner transitions to drafting and parks at draft_done
    resolveUserInput(10, { action: 'finish' });

    // Wait until parks at draft_done
    await vi.waitFor(() => {
      const calls = mocks.emitEventFn.mock.calls as [number, string, unknown][];
      expect(calls.some(([, k, p]) => k === 'awaiting_user' && (p as { prompt: string }).prompt === 'draft_done')).toBe(true);
    }, { timeout: 3000 });

    // Unpark draft_done → runner transitions to review and parks at review_done
    resolveUserInput(10, { action: 'finish' });

    // Wait until parks at review_done
    await vi.waitFor(() => {
      const calls = mocks.emitEventFn.mock.calls as [number, string, unknown][];
      expect(calls.some(([, k, p]) => k === 'awaiting_user' && (p as { prompt: string }).prompt === 'review_done')).toBe(true);
    }, { timeout: 3000 });

    // Unpark review_done
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

    // artifact_updated: hypotheses + 2 sources
    const artifactCalls = (mocks.emitEventFn.mock.calls as [number, string, unknown][])
      .filter(([, k]) => k === 'artifact_updated')
      .map(([, , p]) => (p as { kind: string }).kind);
    expect(artifactCalls).toContain('hypotheses');
    expect(artifactCalls.filter((k) => k === 'source')).toHaveLength(2);

    // state transitions to drafting then review
    expect(mocks.updateSessionStateFn).toHaveBeenCalledWith(1, 10, 'drafting');
    expect(mocks.updateSessionStateFn).toHaveBeenCalledWith(1, 10, 'review');
  });
});

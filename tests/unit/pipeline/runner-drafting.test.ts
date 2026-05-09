import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSessionFn: vi.fn(),
  getProfileFn: vi.fn(),
  updateSessionStateFn: vi.fn(),
  updateSessionDraftFn: vi.fn(),
  emitEventFn: vi.fn(),
  appendRunLogFn: vi.fn(),
  listSessionSourcesFn: vi.fn(),
  upsertSectionDraftFn: vi.fn(),
  draftSectionRunFn: vi.fn(),
  draftFullRunFn: vi.fn(),
}));

vi.mock('../../../src/server/sessions/repo', () => ({
  getSession: mocks.getSessionFn,
  updateSessionState: mocks.updateSessionStateFn,
  updateSessionDraft: mocks.updateSessionDraftFn,
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
  insertSource: vi.fn(),
  findSourceByQuery: vi.fn().mockResolvedValue([]),
  listSessionSources: mocks.listSessionSourcesFn,
}));

vi.mock('../../../src/server/sessions/section-drafts-repo', () => ({
  upsertSectionDraft: mocks.upsertSectionDraftFn,
  listSectionDrafts: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../../src/server/pipeline/stages/draft-section', () => ({
  draftSection: { run: mocks.draftSectionRunFn },
}));

vi.mock('../../../src/server/pipeline/stages/draft-full', () => ({
  draftFull: { run: mocks.draftFullRunFn },
}));

// No-op mocks for stages imported by runner but not used in drafting path
vi.mock('../../../src/server/pipeline/stages/clarify-brief', () => ({
  clarifyBrief: { run: vi.fn() },
}));
vi.mock('../../../src/server/pipeline/stages/propose-angles', () => ({
  proposeAngles: { run: vi.fn() },
}));
vi.mock('../../../src/server/pipeline/stages/build-plan', () => ({
  buildPlan: { run: vi.fn() },
}));
vi.mock('../../../src/server/pipeline/stages/plan-search-hypotheses', () => ({
  planSearchHypotheses: { run: vi.fn() },
}));
vi.mock('../../../src/server/pipeline/stages/formulate-queries', () => ({
  formulateQueries: { run: vi.fn() },
}));
vi.mock('../../../src/server/pipeline/stages/web-search', () => ({
  webSearch: { run: vi.fn() },
}));
vi.mock('../../../src/server/pipeline/stages/summarize-source', () => ({
  summarizeSource: { run: vi.fn() },
}));

const plan = {
  thesis: 'Rust is fast.',
  targetTakeaway: 'Use Rust.',
  sections: [
    { id: 'intro', title: 'Introduction', intent: 'Hook', expectedLength: 300, keyPoints: ['fast'] },
    { id: 'perf', title: 'Performance', intent: 'Show data', expectedLength: 500, keyPoints: ['benchmarks'] },
  ],
};

const brief = { topic: 'Rust', goal: '', notes: '', sourceArticles: [] };

const profile = {
  id: 1, userId: 1, name: 'Blog', format: 'long_read', style: 'technical', audience: 'engineers',
  targetVolumeMin: 1000, targetVolumeMax: 3000, markupRules: {}, extraPrompt: '', lightResearchSources: 1, lightMaxWords: 800, createdAt: new Date(),
};

const acceptedSource = {
  id: 1, sessionId: 10, sectionId: 'intro', hypothesis: 'h', query: 'q',
  url: 'https://example.com', title: 'Example', rawExcerpt: 'excerpt',
  summary: 'Good source.', relevanceScore: 80, status: 'accepted', createdAt: new Date(),
};

afterEach(() => vi.clearAllMocks());

describe('startRunner — drafting state', () => {
  it('drafts each section in order, prevSections accumulates correctly', async () => {
    mocks.getSessionFn
      .mockResolvedValueOnce({ id: 10, userId: 1, state: 'drafting', plan, brief, profileId: 1, mode: 'new' })
      .mockResolvedValueOnce(null); // recursive startRunner after transitioning to review should be a no-op
    mocks.getProfileFn.mockResolvedValue(profile);
    mocks.emitEventFn.mockResolvedValue({ id: 1, sessionId: 10, kind: '', payload: {}, ts: new Date() });
    mocks.updateSessionStateFn.mockResolvedValue({ id: 10 });
    mocks.updateSessionDraftFn.mockResolvedValue({ id: 10 });
    mocks.upsertSectionDraftFn.mockResolvedValue({ id: 1 });
    mocks.listSessionSourcesFn.mockResolvedValue([acceptedSource]);

    mocks.draftSectionRunFn
      .mockResolvedValueOnce({ contentMd: '## Intro\nContent one.' })
      .mockResolvedValueOnce({ contentMd: '## Perf\nContent two.' });

    const { startRunner, resolveUserInput } = await import('../../../src/server/pipeline/runner');

    const runnerPromise = startRunner(10, 1);

    await vi.waitFor(() => {
      const calls = mocks.emitEventFn.mock.calls as [number, string, unknown][];
      expect(calls.some(([, k]) => k === 'awaiting_user')).toBe(true);
    });

    resolveUserInput(10, { action: 'finish' });
    await runnerPromise;

    // draftSection.run called twice in section order
    expect(mocks.draftSectionRunFn).toHaveBeenCalledTimes(2);
    const firstCall = mocks.draftSectionRunFn.mock.calls[0][0] as { section: { id: string }; prevSections: unknown[] };
    const secondCall = mocks.draftSectionRunFn.mock.calls[1][0] as {
      section: { id: string };
      prevSections: Array<{ id: string; contentMd: string }>;
    };
    expect(firstCall.section.id).toBe('intro');
    expect(secondCall.section.id).toBe('perf');

    // Second call received first section's contentMd in prevSections
    expect(secondCall.prevSections).toEqual([{ id: 'intro', contentMd: '## Intro\nContent one.' }]);

    // upsertSectionDraft called twice
    expect(mocks.upsertSectionDraftFn).toHaveBeenCalledTimes(2);
    expect(mocks.upsertSectionDraftFn).toHaveBeenCalledWith(1, 10, 'intro', '## Intro\nContent one.');
    expect(mocks.upsertSectionDraftFn).toHaveBeenCalledWith(1, 10, 'perf', '## Perf\nContent two.');

    // artifact_updated section_draft events emitted in section order
    const sectionDraftEvents = (mocks.emitEventFn.mock.calls as [number, string, unknown][])
      .filter(([, k]) => k === 'artifact_updated')
      .map(([, , p]) => p as { kind: string; sectionId: string });
    const sectionDraftArtifacts = sectionDraftEvents.filter((p) => p.kind === 'section_draft');
    expect(sectionDraftArtifacts.map((p) => p.sectionId)).toEqual(['intro', 'perf']);

    // state transitions to review
    expect(mocks.updateSessionStateFn).toHaveBeenCalledWith(1, 10, 'review');
    const stateChangedCalls = (mocks.emitEventFn.mock.calls as [number, string, unknown][])
      .filter(([, k]) => k === 'state_changed');
    expect(stateChangedCalls.at(-1)?.[2]).toMatchObject({ state: 'review' });
  });

  it('passes rewriteSourceArticles from brief when mode is rewrite', async () => {
    const sourceArticles = [{ url: 'https://original.com', content: 'Original content.' }];
    mocks.getSessionFn
      .mockResolvedValueOnce({ id: 10, userId: 1, state: 'drafting', plan, brief: { ...brief, sourceArticles }, profileId: 1, mode: 'rewrite' })
      .mockResolvedValueOnce(null);
    mocks.getProfileFn.mockResolvedValue(profile);
    mocks.emitEventFn.mockResolvedValue({ id: 1, sessionId: 10, kind: '', payload: {}, ts: new Date() });
    mocks.updateSessionStateFn.mockResolvedValue({ id: 10 });
    mocks.updateSessionDraftFn.mockResolvedValue({ id: 10 });
    mocks.upsertSectionDraftFn.mockResolvedValue({ id: 1 });
    mocks.listSessionSourcesFn.mockResolvedValue([]);

    mocks.draftSectionRunFn.mockResolvedValue({ contentMd: '## Section\nContent.' });

    const { startRunner, resolveUserInput } = await import('../../../src/server/pipeline/runner');

    const runnerPromise = startRunner(10, 1);

    await vi.waitFor(() => {
      const calls = mocks.emitEventFn.mock.calls as [number, string, unknown][];
      expect(calls.some(([, k]) => k === 'awaiting_user')).toBe(true);
    });

    resolveUserInput(10, { action: 'finish' });
    await runnerPromise;

    const firstCall = mocks.draftSectionRunFn.mock.calls[0][0] as {
      rewriteSourceArticles: typeof sourceArticles;
    };
    expect(firstCall.rewriteSourceArticles).toEqual(sourceArticles);
  });

  it('aborts with agent_message when plan is invalid', async () => {
    mocks.getSessionFn.mockResolvedValue({
      id: 10, userId: 1, state: 'drafting', plan: null, brief, profileId: 1, mode: 'new',
    });
    mocks.emitEventFn.mockResolvedValue({ id: 1, sessionId: 10, kind: '', payload: {}, ts: new Date() });

    const { startRunner } = await import('../../../src/server/pipeline/runner');
    await startRunner(10, 1);

    const kinds = (mocks.emitEventFn.mock.calls as [number, string, unknown][]).map(([, k]) => k);
    expect(kinds).toContain('agent_message');
    expect(mocks.draftSectionRunFn).not.toHaveBeenCalled();
  });
});

describe('startRunner — drafting state (light mode)', () => {
  it('calls draftFull with lightMaxWords and skips section-by-section loop', async () => {
    mocks.getSessionFn
      .mockResolvedValueOnce({ id: 20, userId: 1, state: 'drafting', plan, brief, profileId: 1, mode: 'light' })
      .mockResolvedValue(null);
    mocks.getProfileFn.mockResolvedValue(profile);
    mocks.emitEventFn.mockResolvedValue({ id: 1, sessionId: 20, kind: '', payload: {}, ts: new Date() });
    mocks.updateSessionStateFn.mockResolvedValue({ id: 20 });
    mocks.updateSessionDraftFn.mockResolvedValue({ id: 20 });
    mocks.listSessionSourcesFn.mockResolvedValue([]);
    mocks.appendRunLogFn.mockResolvedValue({ path: '/tmp/test.jsonl' });

    mocks.draftFullRunFn.mockResolvedValue({ contentMd: '## Article\n\nContent.', wordCount: 700 });

    const { startRunner } = await import('../../../src/server/pipeline/runner');
    await startRunner(20, 1);

    expect(mocks.draftFullRunFn).toHaveBeenCalledOnce();
    const callArg = mocks.draftFullRunFn.mock.calls[0][0] as { lightMaxWords: number };
    expect(callArg.lightMaxWords).toBe(profile.lightMaxWords);
    expect(mocks.draftSectionRunFn).not.toHaveBeenCalled();
    expect(mocks.upsertSectionDraftFn).not.toHaveBeenCalled();
    expect(mocks.updateSessionDraftFn).toHaveBeenCalledWith(1, 20, '## Article\n\nContent.');
    expect(mocks.updateSessionStateFn).toHaveBeenCalledWith(1, 20, 'review');

    const emitted = (mocks.emitEventFn.mock.calls as [number, string, unknown][]);
    const fullDraftEvent = emitted.find(([, k, p]) => k === 'artifact_updated' && (p as { kind: string }).kind === 'full_draft');
    expect(fullDraftEvent).toBeDefined();
    expect(fullDraftEvent![2]).toMatchObject({ kind: 'full_draft', contentMd: '## Article\n\nContent.', wordCount: 700 });
  });

  it('never requests draft_done userInput in light mode', async () => {
    mocks.getSessionFn
      .mockResolvedValueOnce({ id: 21, userId: 1, state: 'drafting', plan, brief, profileId: 1, mode: 'light' })
      .mockResolvedValue(null);
    mocks.getProfileFn.mockResolvedValue(profile);
    mocks.emitEventFn.mockResolvedValue({ id: 1, sessionId: 21, kind: '', payload: {}, ts: new Date() });
    mocks.updateSessionStateFn.mockResolvedValue({ id: 21 });
    mocks.updateSessionDraftFn.mockResolvedValue({ id: 21 });
    mocks.listSessionSourcesFn.mockResolvedValue([]);
    mocks.appendRunLogFn.mockResolvedValue({ path: '/tmp/test.jsonl' });

    mocks.draftFullRunFn.mockResolvedValue({ contentMd: 'Draft content.', wordCount: 500 });

    const { startRunner } = await import('../../../src/server/pipeline/runner');
    await startRunner(21, 1);

    const emitted = (mocks.emitEventFn.mock.calls as [number, string, unknown][]);
    const draftDoneEvent = emitted.find(
      ([, k, p]) => k === 'awaiting_user' && (p as { prompt: string }).prompt === 'draft_done',
    );
    expect(draftDoneEvent).toBeUndefined();
  });
});

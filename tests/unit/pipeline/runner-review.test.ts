import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSessionFn: vi.fn(),
  updateSessionStateFn: vi.fn(),
  updateSessionDraftFn: vi.fn(),
  updateSessionDraftPreReviewFn: vi.fn(),
  emitEventFn: vi.fn(),
  appendRunLogFn: vi.fn(),
  runAutoReviewFn: vi.fn(),
}));

vi.mock('../../../src/server/sessions/repo', () => ({
  getSession: mocks.getSessionFn,
  updateSessionState: mocks.updateSessionStateFn,
  updateSessionPlan: vi.fn(),
  updateSessionDraft: mocks.updateSessionDraftFn,
  updateSessionDraftPreReview: mocks.updateSessionDraftPreReviewFn,
}));

vi.mock('../../../src/server/pipeline/run-auto-review', () => ({
  runAutoReview: mocks.runAutoReviewFn,
}));

vi.mock('../../../src/server/profiles/repo', () => ({
  getProfile: vi.fn(),
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
  listSessionSources: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../../src/server/sessions/section-drafts-repo', () => ({
  upsertSectionDraft: vi.fn(),
  listSectionDrafts: vi.fn().mockResolvedValue([]),
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
vi.mock('../../../src/server/pipeline/stages/draft-section', () => ({
  draftSection: { run: vi.fn() },
}));

function makeReviewSession() {
  return { id: 10, userId: 1, state: 'review', plan: null, brief: null, profileId: 1, mode: 'new' };
}

afterEach(() => vi.clearAllMocks());

describe('startRunner — review state', () => {
  it('emits awaiting_user with prompt review_done when entering review state', async () => {
    mocks.getSessionFn
      .mockResolvedValueOnce(makeReviewSession())
      .mockResolvedValue(null);
    mocks.emitEventFn.mockResolvedValue({ id: 1, sessionId: 10, kind: '', payload: {}, ts: new Date() });
    mocks.updateSessionStateFn.mockResolvedValue({ id: 10 });

    const { startRunner, resolveUserInput } = await import('../../../src/server/pipeline/runner');

    const runnerPromise = startRunner(10, 1);

    await vi.waitFor(() => {
      const calls = mocks.emitEventFn.mock.calls as [number, string, unknown][];
      expect(calls.some(([, k, p]) => k === 'awaiting_user' && (p as { prompt: string }).prompt === 'review_done')).toBe(true);
    });

    resolveUserInput(10, { action: 'finish' });
    await runnerPromise;
  });

  it('transitions to decoration and emits state_changed after resolving review_done', async () => {
    mocks.getSessionFn
      .mockResolvedValueOnce(makeReviewSession())
      .mockResolvedValue(null);
    mocks.emitEventFn.mockResolvedValue({ id: 1, sessionId: 10, kind: '', payload: {}, ts: new Date() });
    mocks.updateSessionStateFn.mockResolvedValue({ id: 10 });

    const { startRunner, resolveUserInput } = await import('../../../src/server/pipeline/runner');

    const runnerPromise = startRunner(10, 1);

    await vi.waitFor(() => {
      const calls = mocks.emitEventFn.mock.calls as [number, string, unknown][];
      expect(calls.some(([, k]) => k === 'awaiting_user')).toBe(true);
    });

    resolveUserInput(10, { action: 'finish' });
    await runnerPromise;

    expect(mocks.updateSessionStateFn).toHaveBeenCalledWith(1, 10, 'decoration');
    const stateChangedCalls = (mocks.emitEventFn.mock.calls as [number, string, unknown][])
      .filter(([, k]) => k === 'state_changed');
    expect(stateChangedCalls.at(-1)?.[2]).toMatchObject({ state: 'decoration' });
  });

  it('light mode: snapshots draft, calls auto-review, persists revision, emits events, advances to done', async () => {
    const lightSession = {
      id: 99, userId: 1, state: 'review', plan: null, brief: null, profileId: 1,
      mode: 'light', draftMd: 'original', draftMdPreReview: null,
    };
    mocks.getSessionFn.mockResolvedValue(lightSession);
    mocks.emitEventFn.mockResolvedValue({ id: 1, sessionId: 99, kind: '', payload: {}, ts: new Date() });
    mocks.updateSessionStateFn.mockResolvedValue({ id: 99 });
    mocks.updateSessionDraftFn.mockResolvedValue({ id: 99 });
    mocks.updateSessionDraftPreReviewFn.mockResolvedValue({ id: 99 });
    mocks.runAutoReviewFn.mockResolvedValue({
      ok: true, revisedMd: 'revised', changeCount: 1, changes: [],
    });

    const { startRunner } = await import('../../../src/server/pipeline/runner');
    await startRunner(99, 1);

    expect(mocks.updateSessionDraftPreReviewFn).toHaveBeenCalledWith(1, 99, 'original');
    expect(mocks.updateSessionDraftFn).toHaveBeenCalledWith(1, 99, 'revised');

    const emitted = mocks.emitEventFn.mock.calls as [number, string, unknown][];
    expect(emitted.some(([, k, p]) => k === 'artifact_updated' && (p as Record<string, unknown>).kind === 'auto_review_applied' && (p as Record<string, unknown>).changeCount === 1)).toBe(true);
    expect(mocks.updateSessionStateFn).toHaveBeenCalledWith(1, 99, 'done');
    expect(emitted.some(([, k, p]) => k === 'state_changed' && (p as Record<string, unknown>).state === 'done')).toBe(true);
    expect(emitted.every(([, k]) => k !== 'awaiting_user')).toBe(true);
  });

  it('light mode: skips snapshot if draftMdPreReview is already set', async () => {
    const lightSession = {
      id: 99, userId: 1, state: 'review', plan: null, brief: null, profileId: 1,
      mode: 'light', draftMd: 'draft', draftMdPreReview: 'already_set',
    };
    mocks.getSessionFn.mockResolvedValue(lightSession);
    mocks.emitEventFn.mockResolvedValue({ id: 1, sessionId: 99, kind: '', payload: {}, ts: new Date() });
    mocks.updateSessionStateFn.mockResolvedValue({ id: 99 });
    mocks.updateSessionDraftFn.mockResolvedValue({ id: 99 });
    mocks.runAutoReviewFn.mockResolvedValue({
      ok: true, revisedMd: 'revised', changeCount: 0, changes: [],
    });

    const { startRunner } = await import('../../../src/server/pipeline/runner');
    await startRunner(99, 1);

    expect(mocks.updateSessionDraftPreReviewFn).not.toHaveBeenCalled();
  });

  it('light mode: emits agent_message with error:true and does not advance state when auto-review fails', async () => {
    const lightSession = {
      id: 99, userId: 1, state: 'review', plan: null, brief: null, profileId: 1,
      mode: 'light', draftMd: 'draft', draftMdPreReview: null,
    };
    mocks.getSessionFn.mockResolvedValue(lightSession);
    mocks.emitEventFn.mockResolvedValue({ id: 1, sessionId: 99, kind: '', payload: {}, ts: new Date() });
    mocks.updateSessionDraftPreReviewFn.mockResolvedValue({ id: 99 });
    mocks.runAutoReviewFn.mockResolvedValue({ ok: false, error: 'no_draft' });

    const { startRunner } = await import('../../../src/server/pipeline/runner');
    await startRunner(99, 1);

    const emitted = mocks.emitEventFn.mock.calls as [number, string, unknown][];
    expect(emitted.some(([, k, p]) => k === 'agent_message' && (p as Record<string, unknown>).error === true)).toBe(true);
    expect(mocks.updateSessionStateFn).not.toHaveBeenCalled();
  });

  it('chains into a recursive startRunner so the decoration park activates immediately', async () => {
    mocks.getSessionFn
      .mockResolvedValueOnce(makeReviewSession())
      .mockResolvedValue(null);
    mocks.emitEventFn.mockResolvedValue({ id: 1, sessionId: 10, kind: '', payload: {}, ts: new Date() });
    mocks.updateSessionStateFn.mockResolvedValue({ id: 10 });

    const { startRunner, resolveUserInput } = await import('../../../src/server/pipeline/runner');

    const runnerPromise = startRunner(10, 1);

    await vi.waitFor(() => {
      const calls = mocks.emitEventFn.mock.calls as [number, string, unknown][];
      expect(calls.some(([, k]) => k === 'awaiting_user')).toBe(true);
    });

    resolveUserInput(10, { action: 'finish' });
    await runnerPromise;

    expect(mocks.getSessionFn).toHaveBeenCalledTimes(2);
  });
});

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
  updateSessionDraft: vi.fn(),
}));

vi.mock('../../../src/server/profiles/repo', () => ({ getProfile: vi.fn() }));
vi.mock('../../../src/server/events/bus', () => ({ emitEvent: mocks.emitEventFn }));
vi.mock('../../../src/server/logging/jsonl', () => ({ appendRunLog: mocks.appendRunLogFn }));
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
vi.mock('../../../src/server/pipeline/stages/web-search', () => ({ webSearch: { run: vi.fn() } }));
vi.mock('../../../src/server/pipeline/stages/summarize-source', () => ({
  summarizeSource: { run: vi.fn() },
}));
vi.mock('../../../src/server/pipeline/stages/draft-section', () => ({
  draftSection: { run: vi.fn() },
}));

function makeExportSession() {
  return {
    id: 10,
    userId: 1,
    state: 'export',
    plan: null,
    brief: null,
    profileId: 1,
    mode: 'new',
  };
}

afterEach(() => vi.clearAllMocks());

describe('startRunner — export state', () => {
  it('emits awaiting_user with prompt export_done when entering export state', async () => {
    mocks.getSessionFn
      .mockResolvedValueOnce(makeExportSession())
      .mockResolvedValue(null);
    mocks.emitEventFn.mockResolvedValue({
      id: 1,
      sessionId: 10,
      kind: '',
      payload: {},
      ts: new Date(),
    });
    mocks.updateSessionStateFn.mockResolvedValue({ id: 10 });

    const { startRunner, resolveUserInput } = await import(
      '../../../src/server/pipeline/runner'
    );

    const runnerPromise = startRunner(10, 1);

    await vi.waitFor(() => {
      const calls = mocks.emitEventFn.mock.calls as [number, string, unknown][];
      expect(
        calls.some(
          ([, k, p]) =>
            k === 'awaiting_user' && (p as { prompt: string }).prompt === 'export_done',
        ),
      ).toBe(true);
    });

    resolveUserInput(10, { action: 'finish' });
    await runnerPromise;
  });

  it('transitions to done and emits state_changed after resolving export_done', async () => {
    mocks.getSessionFn
      .mockResolvedValueOnce(makeExportSession())
      .mockResolvedValue(null);
    mocks.emitEventFn.mockResolvedValue({
      id: 1,
      sessionId: 10,
      kind: '',
      payload: {},
      ts: new Date(),
    });
    mocks.updateSessionStateFn.mockResolvedValue({ id: 10 });

    const { startRunner, resolveUserInput } = await import(
      '../../../src/server/pipeline/runner'
    );

    const runnerPromise = startRunner(10, 1);

    await vi.waitFor(() => {
      const calls = mocks.emitEventFn.mock.calls as [number, string, unknown][];
      expect(calls.some(([, k]) => k === 'awaiting_user')).toBe(true);
    });

    resolveUserInput(10, { action: 'finish' });
    await runnerPromise;

    expect(mocks.updateSessionStateFn).toHaveBeenCalledWith(1, 10, 'done');
    const stateChangedCalls = (
      mocks.emitEventFn.mock.calls as [number, string, unknown][]
    ).filter(([, k]) => k === 'state_changed');
    expect(stateChangedCalls.at(-1)?.[2]).toMatchObject({ state: 'done' });
  });

  it('returns immediately without any userInput or state advance when mode is light', async () => {
    mocks.getSessionFn.mockResolvedValue({ id: 99, userId: 1, state: 'export', plan: null, brief: null, profileId: 1, mode: 'light' });
    mocks.emitEventFn.mockResolvedValue({ id: 1, sessionId: 99, kind: '', payload: {}, ts: new Date() });

    const { startRunner } = await import('../../../src/server/pipeline/runner');
    await startRunner(99, 1);

    const calls = mocks.emitEventFn.mock.calls as [number, string, unknown][];
    expect(calls.every(([, k]) => k !== 'awaiting_user')).toBe(true);
    expect(mocks.updateSessionStateFn).not.toHaveBeenCalled();
  });

  it('does not chain into a recursive startRunner ("done" is terminal)', async () => {
    mocks.getSessionFn
      .mockResolvedValueOnce(makeExportSession())
      .mockResolvedValue(null);
    mocks.emitEventFn.mockResolvedValue({
      id: 1,
      sessionId: 10,
      kind: '',
      payload: {},
      ts: new Date(),
    });
    mocks.updateSessionStateFn.mockResolvedValue({ id: 10 });

    const { startRunner, resolveUserInput } = await import(
      '../../../src/server/pipeline/runner'
    );

    const runnerPromise = startRunner(10, 1);

    await vi.waitFor(() => {
      const calls = mocks.emitEventFn.mock.calls as [number, string, unknown][];
      expect(calls.some(([, k]) => k === 'awaiting_user')).toBe(true);
    });

    resolveUserInput(10, { action: 'finish' });
    await runnerPromise;

    expect(mocks.getSessionFn).toHaveBeenCalledTimes(1);
  });
});

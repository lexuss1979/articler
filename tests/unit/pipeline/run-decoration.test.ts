import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getProfile: vi.fn(),
  listSectionDrafts: vi.fn(),
  appendDecorationRound: vi.fn(),
  emitEvent: vi.fn(),
  proposeDecorationRun: vi.fn(),
}));

vi.mock('../../../src/server/sessions/repo', () => ({ getSession: mocks.getSession }));
vi.mock('../../../src/server/profiles/repo', () => ({ getProfile: mocks.getProfile }));
vi.mock('../../../src/server/sessions/section-drafts-repo', () => ({
  listSectionDrafts: mocks.listSectionDrafts,
}));
vi.mock('../../../src/server/sessions/decoration-repo', () => ({
  appendDecorationRound: mocks.appendDecorationRound,
}));
vi.mock('../../../src/server/events/bus', () => ({ emitEvent: mocks.emitEvent }));
vi.mock('../../../src/server/pipeline/stages/propose-decoration', () => ({
  proposeDecoration: { run: mocks.proposeDecorationRun },
}));

const validPlan = {
  thesis: 'thesis',
  targetTakeaway: 'takeaway',
  sections: [
    { id: 'intro', title: 'Intro', intent: 'open', keyPoints: ['k'], expectedLength: 100 },
    { id: 'body', title: 'Body', intent: 'detail', keyPoints: ['k'], expectedLength: 500 },
  ],
};

const validProfile = { id: 7, userId: 1, name: 'P' };

const validSession = {
  id: 10,
  userId: 1,
  profileId: 7,
  plan: validPlan,
  draftMd: '# draft',
};

afterEach(() => vi.clearAllMocks());

describe('runDecoration', () => {
  it('returns session_invalid when session missing', async () => {
    mocks.getSession.mockResolvedValue(null);
    const { runDecoration } = await import('../../../src/server/pipeline/run-decoration');
    expect(await runDecoration({ sessionId: 10, userId: 1 })).toEqual({
      ok: false,
      error: 'session_invalid',
    });
  });

  it('returns session_invalid when plan is malformed', async () => {
    mocks.getSession.mockResolvedValue({ ...validSession, plan: { broken: true } });
    const { runDecoration } = await import('../../../src/server/pipeline/run-decoration');
    expect(await runDecoration({ sessionId: 10, userId: 1 })).toEqual({
      ok: false,
      error: 'session_invalid',
    });
  });

  it('returns session_invalid when profile missing', async () => {
    mocks.getSession.mockResolvedValue(validSession);
    mocks.getProfile.mockResolvedValue(null);
    const { runDecoration } = await import('../../../src/server/pipeline/run-decoration');
    expect(await runDecoration({ sessionId: 10, userId: 1 })).toEqual({
      ok: false,
      error: 'session_invalid',
    });
  });

  it('short-circuits to no_draft before calling the stage', async () => {
    mocks.getSession.mockResolvedValue({ ...validSession, draftMd: null });
    mocks.getProfile.mockResolvedValue(validProfile);
    const { runDecoration } = await import('../../../src/server/pipeline/run-decoration');
    expect(await runDecoration({ sessionId: 10, userId: 1 })).toEqual({
      ok: false,
      error: 'no_draft',
    });
    expect(mocks.proposeDecorationRun).not.toHaveBeenCalled();
    expect(mocks.appendDecorationRound).not.toHaveBeenCalled();
  });

  it('returns session_invalid when appendDecorationRound returns null', async () => {
    mocks.getSession.mockResolvedValue(validSession);
    mocks.getProfile.mockResolvedValue(validProfile);
    mocks.listSectionDrafts.mockResolvedValue([]);
    mocks.proposeDecorationRun.mockResolvedValue({ suggestions: [] });
    mocks.appendDecorationRound.mockResolvedValue(null);
    const { runDecoration } = await import('../../../src/server/pipeline/run-decoration');
    expect(await runDecoration({ sessionId: 10, userId: 1 })).toEqual({
      ok: false,
      error: 'session_invalid',
    });
  });

  it('emits decoration_suggestion per suggestion then decoration_round, returns ok', async () => {
    const persistedSuggestions = [
      {
        id: 's_r_1_0',
        kind: 'pull_quote',
        sectionId: 'intro',
        paragraphIndex: 0,
        contentMd: '> A',
        rationale: 'Hook',
        status: 'proposed',
      },
      {
        id: 's_r_1_1',
        kind: 'callout',
        sectionId: 'body',
        paragraphIndex: 1,
        contentMd: 'Note',
        rationale: 'Tip',
        status: 'proposed',
      },
    ];
    const round = {
      id: 'r_1',
      draftHash: 'h',
      createdAt: '2026-05-03T10:00:00.000Z',
      suggestions: persistedSuggestions,
    };

    mocks.getSession.mockResolvedValue(validSession);
    mocks.getProfile.mockResolvedValue(validProfile);
    mocks.listSectionDrafts.mockResolvedValue([
      { sectionId: 'intro', contentMd: 'A' },
      { sectionId: 'body', contentMd: 'B' },
    ]);
    mocks.proposeDecorationRun.mockResolvedValue({
      suggestions: persistedSuggestions.map(({ id: _i, status: _s, ...rest }) => rest),
    });
    mocks.appendDecorationRound.mockResolvedValue(round);

    const { runDecoration } = await import('../../../src/server/pipeline/run-decoration');
    const result = await runDecoration({ sessionId: 10, userId: 1 });

    expect(result).toEqual({ ok: true, roundId: 'r_1', suggestionCount: 2 });

    const kinds = mocks.emitEvent.mock.calls.map((c: unknown[]) => {
      const payload = c[2] as { kind: string };
      return payload.kind;
    });
    expect(kinds).toEqual([
      'decoration_suggestion',
      'decoration_suggestion',
      'decoration_round',
    ]);

    const lastCall = mocks.emitEvent.mock.calls.at(-1)!;
    expect(lastCall[2]).toMatchObject({
      kind: 'decoration_round',
      roundId: 'r_1',
      suggestionCount: 2,
    });
  });
});

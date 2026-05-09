import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  updateSessionDraft: vi.fn(),
  findSuggestion: vi.fn(),
  setSuggestionStatus: vi.fn(),
  getSectionDraft: vi.fn(),
  upsertSectionDraft: vi.fn(),
  listSectionDrafts: vi.fn(),
}));

vi.mock('../../../src/server/sessions/repo', () => ({
  getSession: mocks.getSession,
  updateSessionDraft: mocks.updateSessionDraft,
}));
vi.mock('../../../src/server/sessions/decoration-repo', () => ({
  findSuggestion: mocks.findSuggestion,
  setSuggestionStatus: mocks.setSuggestionStatus,
}));
vi.mock('../../../src/server/sessions/section-drafts-repo', () => ({
  getSectionDraft: mocks.getSectionDraft,
  upsertSectionDraft: mocks.upsertSectionDraft,
  listSectionDrafts: mocks.listSectionDrafts,
}));

const validPlan = {
  thesis: 'thesis',
  targetTakeaway: 'takeaway',
  sections: [
    {
      id: 'intro',
      title: 'Intro',
      intent: 'open',
      keyPoints: ['k'],
      expectedLength: 100,
    },
    {
      id: 'body',
      title: 'Body',
      intent: 'detail',
      keyPoints: ['k'],
      expectedLength: 500,
    },
  ],
};

const validSession = {
  id: 10,
  userId: 1,
  plan: validPlan,
  draftMd: 'old',
};

function makeSuggestion(overrides: Record<string, unknown> = {}) {
  return {
    round: { id: 'r_1', draftHash: 'h', createdAt: '2026-05-03T10:00:00.000Z', suggestions: [] },
    suggestion: {
      id: 's_r_1_0',
      kind: 'callout',
      sectionId: 'intro',
      paragraphIndex: 1,
      contentMd: 'INSERTED',
      rationale: 'why',
      status: 'proposed',
      ...overrides,
    },
  };
}

afterEach(() => vi.clearAllMocks());

describe('applyDecoration', () => {
  it('returns session_invalid when session missing', async () => {
    mocks.getSession.mockResolvedValue(null);
    const { applyDecoration } = await import('../../../src/server/pipeline/apply-decoration');
    expect(await applyDecoration({ sessionId: 10, userId: 1, suggestionId: 's' })).toEqual({
      ok: false,
      error: 'session_invalid',
    });
  });

  it('returns plan_invalid when plan fails to parse', async () => {
    mocks.getSession.mockResolvedValue({ ...validSession, plan: { broken: true } });
    const { applyDecoration } = await import('../../../src/server/pipeline/apply-decoration');
    expect(await applyDecoration({ sessionId: 10, userId: 1, suggestionId: 's' })).toEqual({
      ok: false,
      error: 'plan_invalid',
    });
  });

  it('returns not_found when findSuggestion is null', async () => {
    mocks.getSession.mockResolvedValue(validSession);
    mocks.findSuggestion.mockResolvedValue(null);
    const { applyDecoration } = await import('../../../src/server/pipeline/apply-decoration');
    expect(await applyDecoration({ sessionId: 10, userId: 1, suggestionId: 's' })).toEqual({
      ok: false,
      error: 'not_found',
    });
  });

  it('returns section_missing when getSectionDraft is null', async () => {
    mocks.getSession.mockResolvedValue(validSession);
    mocks.findSuggestion.mockResolvedValue(makeSuggestion());
    mocks.getSectionDraft.mockResolvedValue(null);
    const { applyDecoration } = await import('../../../src/server/pipeline/apply-decoration');
    expect(await applyDecoration({ sessionId: 10, userId: 1, suggestionId: 's' })).toEqual({
      ok: false,
      error: 'section_missing',
    });
  });

  it('inserts the snippet at the configured paragraph and persists', async () => {
    mocks.getSession.mockResolvedValue(validSession);
    mocks.findSuggestion.mockResolvedValue(makeSuggestion());
    mocks.getSectionDraft.mockResolvedValue({
      id: 1,
      sessionId: 10,
      sectionId: 'intro',
      contentMd: 'A\n\nB',
    });
    mocks.upsertSectionDraft.mockResolvedValue({});
    mocks.listSectionDrafts.mockResolvedValue([
      { id: 1, sessionId: 10, sectionId: 'intro', contentMd: 'A\n\nINSERTED\n\nB' },
      { id: 2, sessionId: 10, sectionId: 'body', contentMd: 'BODY' },
    ]);
    mocks.updateSessionDraft.mockResolvedValue({});
    mocks.setSuggestionStatus.mockResolvedValue({ status: 'accepted' });

    const { applyDecoration } = await import('../../../src/server/pipeline/apply-decoration');
    const result = await applyDecoration({ sessionId: 10, userId: 1, suggestionId: 's_r_1_0' });

    expect(mocks.upsertSectionDraft).toHaveBeenCalledWith(1, 10, 'intro', 'A\n\nINSERTED\n\nB');
    expect(result).toEqual({ ok: true, revisedDraftMd: 'A\n\nINSERTED\n\nB\n\nBODY' });
    expect(mocks.updateSessionDraft).toHaveBeenCalledWith(1, 10, 'A\n\nINSERTED\n\nB\n\nBODY');
    expect(mocks.setSuggestionStatus).toHaveBeenCalledWith(1, 10, 's_r_1_0', 'accepted');
  });

  it('honors plan order when recomposing draftMd', async () => {
    mocks.getSession.mockResolvedValue(validSession);
    mocks.findSuggestion.mockResolvedValue(makeSuggestion({ sectionId: 'body' }));
    mocks.getSectionDraft.mockResolvedValue({
      id: 2,
      sessionId: 10,
      sectionId: 'body',
      contentMd: 'BODY',
    });
    mocks.upsertSectionDraft.mockResolvedValue({});
    // db returns rows in id order: body, intro — but plan order is intro, body
    mocks.listSectionDrafts.mockResolvedValue([
      { id: 2, sessionId: 10, sectionId: 'body', contentMd: 'BODY-NEW' },
      { id: 5, sessionId: 10, sectionId: 'intro', contentMd: 'INTRO-CONTENT' },
    ]);
    mocks.updateSessionDraft.mockResolvedValue({});
    mocks.setSuggestionStatus.mockResolvedValue({});

    const { applyDecoration } = await import('../../../src/server/pipeline/apply-decoration');
    const result = await applyDecoration({ sessionId: 10, userId: 1, suggestionId: 's' });
    expect(result).toEqual({ ok: true, revisedDraftMd: 'INTRO-CONTENT\n\nBODY-NEW' });
  });

  it('places sections not in plan at the tail in db order', async () => {
    mocks.getSession.mockResolvedValue(validSession);
    mocks.findSuggestion.mockResolvedValue(makeSuggestion());
    mocks.getSectionDraft.mockResolvedValue({
      id: 1,
      sessionId: 10,
      sectionId: 'intro',
      contentMd: 'INTRO',
    });
    mocks.upsertSectionDraft.mockResolvedValue({});
    mocks.listSectionDrafts.mockResolvedValue([
      { id: 9, sessionId: 10, sectionId: 'orphan-a', contentMd: 'OA' },
      { id: 1, sessionId: 10, sectionId: 'intro', contentMd: 'INTRO-NEW' },
      { id: 11, sessionId: 10, sectionId: 'orphan-b', contentMd: 'OB' },
      { id: 2, sessionId: 10, sectionId: 'body', contentMd: 'BODY' },
    ]);
    mocks.updateSessionDraft.mockResolvedValue({});
    mocks.setSuggestionStatus.mockResolvedValue({});

    const { applyDecoration } = await import('../../../src/server/pipeline/apply-decoration');
    const result = await applyDecoration({ sessionId: 10, userId: 1, suggestionId: 's' });
    expect(result).toEqual({
      ok: true,
      revisedDraftMd: 'INTRO-NEW\n\nBODY\n\nOA\n\nOB',
    });
  });
});

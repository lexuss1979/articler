import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  updateSessionDraft: vi.fn(),
  findSlot: vi.fn(),
  setSlotChoice: vi.fn(),
  getImageState: vi.fn(),
  getSectionDraft: vi.fn(),
  upsertSectionDraft: vi.fn(),
  listSectionDrafts: vi.fn(),
}));

vi.mock('../../../src/server/sessions/repo', () => ({
  getSession: mocks.getSession,
  updateSessionDraft: mocks.updateSessionDraft,
}));
vi.mock('../../../src/server/sessions/images-repo', () => ({
  findSlot: mocks.findSlot,
  setSlotChoice: mocks.setSlotChoice,
  getImageState: mocks.getImageState,
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
    { id: 'intro', title: 'Intro', intent: 'open', keyPoints: ['k'], expectedLength: 100 },
    { id: 'body', title: 'Body', intent: 'detail', keyPoints: ['k'], expectedLength: 500 },
  ],
};

const validSession = { id: 10, userId: 1, plan: validPlan, draftMd: 'old' };

const generatedHeroCandidate = {
  id: 'c1',
  source: 'generated' as const,
  localPath: '/api/images/10/slot_hero/c1.png',
  createdAt: '2026-05-03T10:00:00.000Z',
};

const generatedInlineCandidate = {
  id: 'c2',
  source: 'generated' as const,
  localPath: '/api/images/10/slot_inline/c2.png',
  createdAt: '2026-05-03T11:00:00.000Z',
};

afterEach(() => vi.clearAllMocks());

describe('applyImageSelection', () => {
  it('returns session_invalid when session missing', async () => {
    mocks.getSession.mockResolvedValue(null);
    const { applyImageSelection } = await import(
      '../../../src/server/pipeline/apply-image'
    );
    expect(
      await applyImageSelection({ sessionId: 10, userId: 1, slotId: 's', candidateId: 'c' }),
    ).toEqual({ ok: false, error: 'session_invalid' });
  });

  it('returns plan_invalid when plan fails to parse', async () => {
    mocks.getSession.mockResolvedValue({ ...validSession, plan: { broken: true } });
    const { applyImageSelection } = await import(
      '../../../src/server/pipeline/apply-image'
    );
    expect(
      await applyImageSelection({ sessionId: 10, userId: 1, slotId: 's', candidateId: 'c' }),
    ).toEqual({ ok: false, error: 'plan_invalid' });
  });

  it('returns not_found when findSlot is null', async () => {
    mocks.getSession.mockResolvedValue(validSession);
    mocks.findSlot.mockResolvedValue(null);
    const { applyImageSelection } = await import(
      '../../../src/server/pipeline/apply-image'
    );
    expect(
      await applyImageSelection({ sessionId: 10, userId: 1, slotId: 's', candidateId: 'c' }),
    ).toEqual({ ok: false, error: 'not_found' });
  });

  it('re-applying the same hero candidate is a no-op draft compose without setSlotChoice', async () => {
    mocks.getSession.mockResolvedValue(validSession);
    mocks.findSlot.mockResolvedValue({
      id: 'slot_hero',
      kind: 'hero',
      brief: 'b',
      mode: 'generate',
      candidates: [generatedHeroCandidate],
      chosenCandidateId: 'c1',
    });
    mocks.listSectionDrafts.mockResolvedValue([]);
    mocks.getImageState.mockResolvedValue({
      slots: [
        {
          id: 'slot_hero',
          kind: 'hero',
          brief: 'b',
          mode: 'generate',
          candidates: [generatedHeroCandidate],
          chosenCandidateId: 'c1',
        },
      ],
    });
    mocks.updateSessionDraft.mockResolvedValue({});
    const { applyImageSelection } = await import(
      '../../../src/server/pipeline/apply-image'
    );
    const result = await applyImageSelection({
      sessionId: 10,
      userId: 1,
      slotId: 'slot_hero',
      candidateId: 'c1',
    });
    expect(result.ok).toBe(true);
    expect(mocks.setSlotChoice).not.toHaveBeenCalled();
    expect(mocks.upsertSectionDraft).not.toHaveBeenCalled();
  });

  it('returns not_found when candidate id is missing on slot', async () => {
    mocks.getSession.mockResolvedValue(validSession);
    mocks.findSlot.mockResolvedValue({
      id: 'slot_hero',
      kind: 'hero',
      brief: 'b',
      mode: 'generate',
      candidates: [generatedHeroCandidate],
    });
    const { applyImageSelection } = await import(
      '../../../src/server/pipeline/apply-image'
    );
    expect(
      await applyImageSelection({
        sessionId: 10,
        userId: 1,
        slotId: 'slot_hero',
        candidateId: 'c_missing',
      }),
    ).toEqual({ ok: false, error: 'not_found' });
  });

  it('inserts inline image at the configured paragraph and persists', async () => {
    mocks.getSession.mockResolvedValue(validSession);
    mocks.findSlot.mockResolvedValue({
      id: 'slot_inline',
      kind: 'inline',
      sectionId: 'intro',
      paragraphIndex: 1,
      brief: 'b',
      mode: 'generate',
      candidates: [generatedInlineCandidate],
    });
    mocks.getSectionDraft.mockResolvedValue({
      id: 1,
      sessionId: 10,
      sectionId: 'intro',
      contentMd: 'A\n\nB',
    });
    mocks.upsertSectionDraft.mockResolvedValue({});
    mocks.listSectionDrafts.mockResolvedValue([
      {
        id: 1,
        sessionId: 10,
        sectionId: 'intro',
        contentMd: 'A\n\n![](/api/images/10/slot_inline/c2.png)\n\nB',
      },
      { id: 2, sessionId: 10, sectionId: 'body', contentMd: 'BODY' },
    ]);
    mocks.updateSessionDraft.mockResolvedValue({});
    mocks.setSlotChoice.mockResolvedValue({});
    mocks.getImageState.mockResolvedValue({
      slots: [
        {
          id: 'slot_inline',
          kind: 'inline',
          sectionId: 'intro',
          paragraphIndex: 1,
          brief: 'b',
          mode: 'generate',
          candidates: [generatedInlineCandidate],
          chosenCandidateId: 'c2',
        },
      ],
    });

    const { applyImageSelection } = await import(
      '../../../src/server/pipeline/apply-image'
    );
    const result = await applyImageSelection({
      sessionId: 10,
      userId: 1,
      slotId: 'slot_inline',
      candidateId: 'c2',
    });

    expect(mocks.upsertSectionDraft).toHaveBeenCalledWith(
      1,
      10,
      'intro',
      'A\n\n![](/api/images/10/slot_inline/c2.png)\n\nB',
    );
    expect(result).toEqual({
      ok: true,
      revisedDraftMd: 'A\n\n![](/api/images/10/slot_inline/c2.png)\n\nB\n\nBODY',
    });
    expect(mocks.setSlotChoice).toHaveBeenCalledWith(1, 10, 'slot_inline', 'c2');
  });

  it('returns section_missing when inline slot has no matching section draft', async () => {
    mocks.getSession.mockResolvedValue(validSession);
    mocks.findSlot.mockResolvedValue({
      id: 'slot_inline',
      kind: 'inline',
      sectionId: 'intro',
      paragraphIndex: 0,
      brief: 'b',
      mode: 'generate',
      candidates: [generatedInlineCandidate],
    });
    mocks.getSectionDraft.mockResolvedValue(null);
    const { applyImageSelection } = await import(
      '../../../src/server/pipeline/apply-image'
    );
    expect(
      await applyImageSelection({
        sessionId: 10,
        userId: 1,
        slotId: 'slot_inline',
        candidateId: 'c2',
      }),
    ).toEqual({ ok: false, error: 'section_missing' });
  });

  it('prepends hero image and honors plan order', async () => {
    mocks.getSession.mockResolvedValue(validSession);
    mocks.findSlot.mockResolvedValue({
      id: 'slot_hero',
      kind: 'hero',
      brief: 'b',
      mode: 'generate',
      candidates: [generatedHeroCandidate],
    });
    mocks.listSectionDrafts.mockResolvedValue([
      { id: 2, sessionId: 10, sectionId: 'body', contentMd: 'BODY' },
      { id: 5, sessionId: 10, sectionId: 'intro', contentMd: 'INTRO' },
    ]);
    mocks.updateSessionDraft.mockResolvedValue({});
    mocks.setSlotChoice.mockResolvedValue({});
    mocks.getImageState.mockResolvedValue({
      slots: [
        {
          id: 'slot_hero',
          kind: 'hero',
          brief: 'b',
          mode: 'generate',
          candidates: [generatedHeroCandidate],
          chosenCandidateId: 'c1',
        },
      ],
    });

    const { applyImageSelection } = await import(
      '../../../src/server/pipeline/apply-image'
    );
    const result = await applyImageSelection({
      sessionId: 10,
      userId: 1,
      slotId: 'slot_hero',
      candidateId: 'c1',
    });

    expect(mocks.upsertSectionDraft).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: true,
      revisedDraftMd: '![](/api/images/10/slot_hero/c1.png)\n\nINTRO\n\nBODY',
    });
  });

  it('re-selecting a hero swaps chosenCandidateId and the composer renders the new URL', async () => {
    const newHeroCandidate = {
      id: 'c1b',
      source: 'generated' as const,
      localPath: '/api/images/10/slot_hero/c1b.png',
      createdAt: '2026-05-03T12:00:00.000Z',
    };
    mocks.getSession.mockResolvedValue(validSession);
    mocks.findSlot.mockResolvedValue({
      id: 'slot_hero',
      kind: 'hero',
      brief: 'b',
      mode: 'generate',
      candidates: [generatedHeroCandidate, newHeroCandidate],
      chosenCandidateId: 'c1',
    });
    mocks.listSectionDrafts.mockResolvedValue([
      { id: 5, sessionId: 10, sectionId: 'intro', contentMd: 'INTRO' },
    ]);
    mocks.getImageState.mockResolvedValue({
      slots: [
        {
          id: 'slot_hero',
          kind: 'hero',
          brief: 'b',
          mode: 'generate',
          candidates: [generatedHeroCandidate, newHeroCandidate],
          chosenCandidateId: 'c1b',
        },
      ],
    });
    mocks.updateSessionDraft.mockResolvedValue({});
    mocks.setSlotChoice.mockResolvedValue({});

    const { applyImageSelection } = await import(
      '../../../src/server/pipeline/apply-image'
    );
    const result = await applyImageSelection({
      sessionId: 10,
      userId: 1,
      slotId: 'slot_hero',
      candidateId: 'c1b',
    });

    expect(mocks.setSlotChoice).toHaveBeenCalledWith(1, 10, 'slot_hero', 'c1b');
    expect(mocks.upsertSectionDraft).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: true,
      revisedDraftMd: '![](/api/images/10/slot_hero/c1b.png)\n\nINTRO',
    });
  });

  it('re-selecting an inline candidate replaces the old image markdown in the section draft', async () => {
    const newInlineCandidate = {
      id: 'c2b',
      source: 'generated' as const,
      localPath: '/api/images/10/slot_inline/c2b.png',
      createdAt: '2026-05-03T13:00:00.000Z',
    };
    mocks.getSession.mockResolvedValue(validSession);
    mocks.findSlot.mockResolvedValue({
      id: 'slot_inline',
      kind: 'inline',
      sectionId: 'intro',
      paragraphIndex: 1,
      brief: 'b',
      mode: 'generate',
      candidates: [generatedInlineCandidate, newInlineCandidate],
      chosenCandidateId: 'c2',
    });
    mocks.getSectionDraft.mockResolvedValue({
      id: 1,
      sessionId: 10,
      sectionId: 'intro',
      contentMd: 'A\n\n![](/api/images/10/slot_inline/c2.png)\n\nB',
    });
    mocks.upsertSectionDraft.mockResolvedValue({});
    mocks.listSectionDrafts.mockResolvedValue([
      {
        id: 1,
        sessionId: 10,
        sectionId: 'intro',
        contentMd: 'A\n\n![](/api/images/10/slot_inline/c2b.png)\n\nB',
      },
    ]);
    mocks.getImageState.mockResolvedValue({
      slots: [
        {
          id: 'slot_inline',
          kind: 'inline',
          sectionId: 'intro',
          paragraphIndex: 1,
          brief: 'b',
          mode: 'generate',
          candidates: [generatedInlineCandidate, newInlineCandidate],
          chosenCandidateId: 'c2b',
        },
      ],
    });
    mocks.updateSessionDraft.mockResolvedValue({});
    mocks.setSlotChoice.mockResolvedValue({});

    const { applyImageSelection } = await import(
      '../../../src/server/pipeline/apply-image'
    );
    const result = await applyImageSelection({
      sessionId: 10,
      userId: 1,
      slotId: 'slot_inline',
      candidateId: 'c2b',
    });

    expect(mocks.upsertSectionDraft).toHaveBeenCalledWith(
      1,
      10,
      'intro',
      'A\n\n![](/api/images/10/slot_inline/c2b.png)\n\nB',
    );
    expect(mocks.setSlotChoice).toHaveBeenCalledWith(1, 10, 'slot_inline', 'c2b');
    expect(result.ok).toBe(true);
  });

  it('preserves a previously chosen hero when applying an inline image afterwards', async () => {
    mocks.getSession.mockResolvedValue(validSession);
    mocks.findSlot.mockResolvedValue({
      id: 'slot_inline',
      kind: 'inline',
      sectionId: 'intro',
      paragraphIndex: 0,
      brief: 'b',
      mode: 'generate',
      candidates: [generatedInlineCandidate],
    });
    mocks.getSectionDraft.mockResolvedValue({
      id: 1,
      sessionId: 10,
      sectionId: 'intro',
      contentMd: 'INTRO',
    });
    mocks.upsertSectionDraft.mockResolvedValue({});
    mocks.listSectionDrafts.mockResolvedValue([
      {
        id: 1,
        sessionId: 10,
        sectionId: 'intro',
        contentMd: '![](/api/images/10/slot_inline/c2.png)\n\nINTRO',
      },
    ]);
    mocks.updateSessionDraft.mockResolvedValue({});
    mocks.setSlotChoice.mockResolvedValue({});
    mocks.getImageState.mockResolvedValue({
      slots: [
        {
          id: 'slot_hero',
          kind: 'hero',
          brief: 'h',
          mode: 'generate',
          candidates: [generatedHeroCandidate],
          chosenCandidateId: 'c1',
        },
        {
          id: 'slot_inline',
          kind: 'inline',
          sectionId: 'intro',
          paragraphIndex: 0,
          brief: 'b',
          mode: 'generate',
          candidates: [generatedInlineCandidate],
          chosenCandidateId: 'c2',
        },
      ],
    });

    const { applyImageSelection } = await import(
      '../../../src/server/pipeline/apply-image'
    );
    const result = await applyImageSelection({
      sessionId: 10,
      userId: 1,
      slotId: 'slot_inline',
      candidateId: 'c2',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.revisedDraftMd).toContain('/api/images/10/slot_hero/c1.png');
      expect(result.revisedDraftMd).toContain('/api/images/10/slot_inline/c2.png');
      expect(result.revisedDraftMd.indexOf('/api/images/10/slot_hero/c1.png')).toBeLessThan(
        result.revisedDraftMd.indexOf('/api/images/10/slot_inline/c2.png'),
      );
    }
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSessionFn: vi.fn(),
  getProfileFn: vi.fn(),
  listSessionSourcesFn: vi.fn(),
  listSectionDraftsFn: vi.fn(),
  upsertSectionDraftFn: vi.fn(),
  updateSessionDraftFn: vi.fn(),
  emitEventFn: vi.fn(),
  draftSectionRunFn: vi.fn(),
}));

vi.mock('../../../src/server/sessions/repo', () => ({
  getSession: mocks.getSessionFn,
  updateSessionDraft: mocks.updateSessionDraftFn,
}));

vi.mock('../../../src/server/profiles/repo', () => ({
  getProfile: mocks.getProfileFn,
}));

vi.mock('../../../src/server/sessions/sources-repo', () => ({
  listSessionSources: mocks.listSessionSourcesFn,
}));

vi.mock('../../../src/server/sessions/section-drafts-repo', () => ({
  listSectionDrafts: mocks.listSectionDraftsFn,
  upsertSectionDraft: mocks.upsertSectionDraftFn,
}));

vi.mock('../../../src/server/events/bus', () => ({
  emitEvent: mocks.emitEventFn,
}));

vi.mock('../../../src/server/pipeline/stages/draft-section', () => ({
  draftSection: { run: mocks.draftSectionRunFn },
}));

const plan = {
  thesis: 'Rust is fast.',
  targetTakeaway: 'Use Rust.',
  sections: [
    { id: 'intro', title: 'Introduction', intent: 'Hook', expectedLength: 300, keyPoints: ['fast'] },
    { id: 'perf', title: 'Performance', intent: 'Show data', expectedLength: 500, keyPoints: ['benchmarks'] },
    { id: 'conclusion', title: 'Conclusion', intent: 'Wrap up', expectedLength: 200, keyPoints: ['summary'] },
  ],
};

const brief = { topic: 'Rust', goal: '', notes: '', sourceArticles: [] };

const profile = {
  id: 1, userId: 1, name: 'Blog', format: 'long_read', style: 'technical', audience: 'engineers',
  targetVolumeMin: 1000, targetVolumeMax: 3000, markupRules: {}, extraPrompt: '', createdAt: new Date(),
};

const existingDrafts = [
  { id: 1, sessionId: 10, sectionId: 'intro', contentMd: '## Intro\nOld.', createdAt: new Date(), updatedAt: new Date() },
  { id: 2, sessionId: 10, sectionId: 'perf', contentMd: '## Perf\nOld.', createdAt: new Date(), updatedAt: new Date() },
];

afterEach(() => vi.clearAllMocks());

describe('regenerateSection', () => {
  it('passes only sections before the target as prevSections', async () => {
    mocks.getSessionFn.mockResolvedValue({ id: 10, userId: 1, plan, brief, profileId: 1, mode: 'new' });
    mocks.getProfileFn.mockResolvedValue(profile);
    mocks.listSessionSourcesFn.mockResolvedValue([]);
    mocks.listSectionDraftsFn.mockResolvedValue(existingDrafts);
    mocks.upsertSectionDraftFn.mockResolvedValue({ id: 2 });
    mocks.updateSessionDraftFn.mockResolvedValue({ id: 10 });
    mocks.emitEventFn.mockResolvedValue({ id: 1 });
    mocks.draftSectionRunFn.mockResolvedValue({ contentMd: '## Perf\nNew content.' });

    const { regenerateSection } = await import('../../../src/server/pipeline/regenerate-section');
    const result = await regenerateSection({ sessionId: 10, userId: 1, sectionId: 'perf' });

    expect(result).toEqual({ ok: true, contentMd: '## Perf\nNew content.' });

    const callArg = mocks.draftSectionRunFn.mock.calls[0][0] as {
      section: { id: string };
      prevSections: Array<{ id: string; contentMd: string }>;
    };
    expect(callArg.section.id).toBe('perf');
    // Only 'intro' is before 'perf' in plan order
    expect(callArg.prevSections).toEqual([{ id: 'intro', contentMd: '## Intro\nOld.' }]);
  });

  it('passes instruction through to draftSection.run', async () => {
    mocks.getSessionFn.mockResolvedValue({ id: 10, userId: 1, plan, brief, profileId: 1, mode: 'new' });
    mocks.getProfileFn.mockResolvedValue(profile);
    mocks.listSessionSourcesFn.mockResolvedValue([]);
    mocks.listSectionDraftsFn.mockResolvedValue([]);
    mocks.upsertSectionDraftFn.mockResolvedValue({ id: 1 });
    mocks.updateSessionDraftFn.mockResolvedValue({ id: 10 });
    mocks.emitEventFn.mockResolvedValue({ id: 1 });
    mocks.draftSectionRunFn.mockResolvedValue({ contentMd: '## Intro\nTight.' });

    const { regenerateSection } = await import('../../../src/server/pipeline/regenerate-section');
    await regenerateSection({ sessionId: 10, userId: 1, sectionId: 'intro', instruction: 'Tighten the intro' });

    const callArg = mocks.draftSectionRunFn.mock.calls[0][0] as { instruction: string };
    expect(callArg.instruction).toBe('Tighten the intro');
  });

  it('new draft_md places the regenerated section in plan order', async () => {
    mocks.getSessionFn.mockResolvedValue({ id: 10, userId: 1, plan, brief, profileId: 1, mode: 'new' });
    mocks.getProfileFn.mockResolvedValue(profile);
    mocks.listSessionSourcesFn.mockResolvedValue([]);
    // intro and perf already drafted, we regenerate perf
    mocks.listSectionDraftsFn.mockResolvedValue(existingDrafts);
    mocks.upsertSectionDraftFn.mockResolvedValue({ id: 2 });
    mocks.updateSessionDraftFn.mockResolvedValue({ id: 10 });
    mocks.emitEventFn.mockResolvedValue({ id: 1 });
    mocks.draftSectionRunFn.mockResolvedValue({ contentMd: '## Perf\nNew content.' });

    const { regenerateSection } = await import('../../../src/server/pipeline/regenerate-section');
    await regenerateSection({ sessionId: 10, userId: 1, sectionId: 'perf' });

    const draftMdArg = (mocks.updateSessionDraftFn.mock.calls[0] as unknown[])[2] as string;
    // intro first, then new perf (conclusion not drafted yet so omitted)
    expect(draftMdArg).toBe('## Intro\nOld.\n\n## Perf\nNew content.');
  });

  it('returns section_not_found when sectionId does not exist in plan', async () => {
    mocks.getSessionFn.mockResolvedValue({ id: 10, userId: 1, plan, brief, profileId: 1, mode: 'new' });
    mocks.getProfileFn.mockResolvedValue(profile);
    mocks.listSessionSourcesFn.mockResolvedValue([]);
    mocks.listSectionDraftsFn.mockResolvedValue([]);

    const { regenerateSection } = await import('../../../src/server/pipeline/regenerate-section');
    const result = await regenerateSection({ sessionId: 10, userId: 1, sectionId: 'nonexistent' });

    expect(result).toEqual({ ok: false, error: 'section_not_found' });
    expect(mocks.draftSectionRunFn).not.toHaveBeenCalled();
  });
});

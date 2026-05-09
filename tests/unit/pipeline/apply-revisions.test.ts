import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  updateSessionRevision: vi.fn(),
  getFindingForUser: vi.fn(),
  bulkSetFindingStatus: vi.fn(),
  emitEvent: vi.fn(),
  applyRevisionsStageRun: vi.fn(),
}));

vi.mock('../../../src/server/sessions/repo', () => ({
  getSession: mocks.getSession,
  updateSessionRevision: mocks.updateSessionRevision,
}));
vi.mock('../../../src/server/sessions/critique-repo', () => ({
  getFindingForUser: mocks.getFindingForUser,
  bulkSetFindingStatus: mocks.bulkSetFindingStatus,
}));
vi.mock('../../../src/server/events/bus', () => ({ emitEvent: mocks.emitEvent }));
vi.mock('../../../src/server/pipeline/stages/apply-revisions', () => ({
  applyRevisions: { run: mocks.applyRevisionsStageRun },
}));

function makeFinding(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    roundId: 1,
    criticId: 'review',
    severity: 'critical',
    span: { sectionId: 'intro', charStart: 0, charEnd: 5 },
    problem: 'P',
    suggestedChange: 'S',
    rationale: '',
    status: 'open',
    ...overrides,
  };
}

afterEach(() => vi.clearAllMocks());

describe('applyRevisions orchestrator', () => {
  it('returns session_invalid when session missing', async () => {
    mocks.getSession.mockResolvedValue(null);
    const { applyRevisions } = await import('../../../src/server/pipeline/apply-revisions');
    const result = await applyRevisions({ sessionId: 1, userId: 1, findingIds: [1] });
    expect(result).toEqual({ ok: false, error: 'session_invalid' });
  });

  it('returns no_draft when draftMd is empty', async () => {
    mocks.getSession.mockResolvedValue({ id: 1, draftMd: '', revisionStatus: null });
    const { applyRevisions } = await import('../../../src/server/pipeline/apply-revisions');
    const result = await applyRevisions({ sessionId: 1, userId: 1, findingIds: [1] });
    expect(result).toEqual({ ok: false, error: 'no_draft' });
  });

  it('returns pending_exists when a revision is already pending', async () => {
    mocks.getSession.mockResolvedValue({ id: 1, draftMd: '# d', revisionStatus: 'pending' });
    const { applyRevisions } = await import('../../../src/server/pipeline/apply-revisions');
    const result = await applyRevisions({ sessionId: 1, userId: 1, findingIds: [1] });
    expect(result).toEqual({ ok: false, error: 'pending_exists' });
  });

  it('filters out minor findings before calling the rewrite stage', async () => {
    mocks.getSession.mockResolvedValue({ id: 1, draftMd: '# d', revisionStatus: null });
    mocks.getFindingForUser
      .mockResolvedValueOnce(makeFinding({ id: 1, severity: 'critical' }))
      .mockResolvedValueOnce(makeFinding({ id: 2, severity: 'minor' }))
      .mockResolvedValueOnce(makeFinding({ id: 3, severity: 'medium' }));
    mocks.applyRevisionsStageRun.mockResolvedValue({ revisedDraftMd: '# revised' });
    mocks.updateSessionRevision.mockResolvedValue({ id: 1 });
    mocks.bulkSetFindingStatus.mockResolvedValue([]);

    const { applyRevisions } = await import('../../../src/server/pipeline/apply-revisions');
    const result = await applyRevisions({ sessionId: 1, userId: 1, findingIds: [1, 2, 3] });

    expect(mocks.applyRevisionsStageRun).toHaveBeenCalledTimes(1);
    const stageInput = mocks.applyRevisionsStageRun.mock.calls[0][0] as {
      findings: Array<{ severity: string }>;
    };
    expect(stageInput.findings.map((f) => f.severity)).toEqual(['critical', 'medium']);
    expect(result).toMatchObject({ ok: true, appliedFindingIds: [1, 3] });
  });

  it('returns no_findings when only minor findings are passed', async () => {
    mocks.getSession.mockResolvedValue({ id: 1, draftMd: '# d', revisionStatus: null });
    mocks.getFindingForUser.mockResolvedValueOnce(makeFinding({ id: 9, severity: 'minor' }));

    const { applyRevisions } = await import('../../../src/server/pipeline/apply-revisions');
    const result = await applyRevisions({ sessionId: 1, userId: 1, findingIds: [9] });

    expect(result).toEqual({ ok: false, error: 'no_findings' });
    expect(mocks.applyRevisionsStageRun).not.toHaveBeenCalled();
  });

  it('persists revisedDraftMd, marks findings pending_apply, and emits revision_pending', async () => {
    mocks.getSession.mockResolvedValue({ id: 1, draftMd: '# d', revisionStatus: null });
    mocks.getFindingForUser.mockResolvedValueOnce(
      makeFinding({ id: 7, severity: 'critical' }),
    );
    mocks.applyRevisionsStageRun.mockResolvedValue({ revisedDraftMd: '# revised content' });
    mocks.updateSessionRevision.mockResolvedValue({ id: 1 });
    mocks.bulkSetFindingStatus.mockResolvedValue([]);

    const { applyRevisions } = await import('../../../src/server/pipeline/apply-revisions');
    const result = await applyRevisions({ sessionId: 1, userId: 1, findingIds: [7] });

    expect(mocks.updateSessionRevision).toHaveBeenCalledWith(1, 1, {
      revisedDraftMd: '# revised content',
      revisionStatus: 'pending',
    });
    expect(mocks.bulkSetFindingStatus).toHaveBeenCalledWith(1, [7], 'pending_apply');

    const revisionEmit = (mocks.emitEvent.mock.calls as Array<[number, string, unknown]>).find(
      ([, kind, p]) => kind === 'artifact_updated' && (p as { kind: string }).kind === 'revision_pending',
    );
    expect(revisionEmit).toBeDefined();
    expect(result).toMatchObject({ ok: true, appliedFindingIds: [7], revisedDraftMd: '# revised content' });
  });

  it('drops the overall sectionId placeholder when forwarding to the stage', async () => {
    mocks.getSession.mockResolvedValue({ id: 1, draftMd: '# d', revisionStatus: null });
    mocks.getFindingForUser.mockResolvedValueOnce(
      makeFinding({ id: 1, severity: 'critical', span: { sectionId: 'overall', charStart: 0, charEnd: 0 } }),
    );
    mocks.applyRevisionsStageRun.mockResolvedValue({ revisedDraftMd: '# revised' });
    mocks.updateSessionRevision.mockResolvedValue({ id: 1 });

    const { applyRevisions } = await import('../../../src/server/pipeline/apply-revisions');
    await applyRevisions({ sessionId: 1, userId: 1, findingIds: [1] });

    const stageInput = mocks.applyRevisionsStageRun.mock.calls[0][0] as {
      findings: Array<{ sectionId?: string }>;
    };
    expect(stageInput.findings[0].sectionId).toBeUndefined();
  });
});

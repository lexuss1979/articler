import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  applyRevisions: vi.fn(),
  acceptRevisions: vi.fn(),
  discardRevisions: vi.fn(),
  revalidatePath: vi.fn(),
  startRunner: vi.fn(),
  cancelPendingInput: vi.fn(),
  resolveUserInput: vi.fn(),
}));

vi.mock('../../../src/server/auth/require-user', () => ({ requireUser: mocks.requireUser }));
vi.mock('../../../src/server/pipeline/apply-revisions', () => ({
  applyRevisions: mocks.applyRevisions,
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('../../../src/server/pipeline/runner', () => ({
  startRunner: mocks.startRunner,
  resolveUserInput: mocks.resolveUserInput,
  cancelPendingInput: mocks.cancelPendingInput,
  hasPendingInput: vi.fn(),
}));
vi.mock('../../../src/server/sessions/repo', () => ({
  getSession: vi.fn(),
  updateSessionBrief: vi.fn(),
  updateSessionPlan: vi.fn(),
  updateSessionState: vi.fn(),
  updateSessionActiveCritics: vi.fn(),
  acceptRevisions: mocks.acceptRevisions,
  discardRevisions: mocks.discardRevisions,
}));
vi.mock('../../../src/server/sessions/sources-repo', () => ({
  setSourceStatus: vi.fn(),
  setSourceSection: vi.fn(),
}));
vi.mock('../../../src/server/pipeline/regenerate-section', () => ({
  regenerateSection: vi.fn(),
}));
vi.mock('../../../src/server/sessions/claims-repo', () => ({
  setClaimStatus: vi.fn(),
  getClaimWithLatestVerdict: vi.fn(),
}));
vi.mock('../../../src/server/pipeline/run-review', () => ({ runReview: vi.fn() }));
vi.mock('../../../src/server/pipeline/run-fact-check', () => ({ runFactCheck: vi.fn() }));

afterEach(() => vi.clearAllMocks());

describe('applyRevisionsAction', () => {
  it('returns validation error when findingIds is not a number array', async () => {
    mocks.requireUser.mockResolvedValue({ id: 1 });
    const { applyRevisionsAction } = await import('../../../src/app/(app)/sessions/[id]/actions');
    const result = await applyRevisionsAction(5, ['nope' as unknown as number]);
    expect(result).toEqual({ ok: false, error: 'validation' });
    expect(mocks.applyRevisions).not.toHaveBeenCalled();
  });

  it('forwards validated ids to applyRevisions and revalidates on success', async () => {
    mocks.requireUser.mockResolvedValue({ id: 7 });
    mocks.applyRevisions.mockResolvedValue({
      ok: true,
      appliedFindingIds: [1, 2],
      revisedDraftMd: '# new',
    });

    const { applyRevisionsAction } = await import('../../../src/app/(app)/sessions/[id]/actions');
    const result = await applyRevisionsAction(5, [1, 2]);

    expect(mocks.applyRevisions).toHaveBeenCalledWith({
      sessionId: 5,
      userId: 7,
      findingIds: [1, 2],
    });
    expect(result).toEqual({ ok: true, appliedFindingIds: [1, 2], revisedDraftMd: '# new' });
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/sessions/5');
  });

  it('does not revalidate when applyRevisions fails', async () => {
    mocks.requireUser.mockResolvedValue({ id: 7 });
    mocks.applyRevisions.mockResolvedValue({ ok: false, error: 'no_findings' });

    const { applyRevisionsAction } = await import('../../../src/app/(app)/sessions/[id]/actions');
    const result = await applyRevisionsAction(5, [1, 2]);

    expect(result).toEqual({ ok: false, error: 'no_findings' });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe('acceptRevisionsAction', () => {
  it('calls acceptRevisions and returns ok on success', async () => {
    mocks.requireUser.mockResolvedValue({ id: 3 });
    mocks.acceptRevisions.mockResolvedValue({ id: 5 });

    const { acceptRevisionsAction } = await import('../../../src/app/(app)/sessions/[id]/actions');
    const result = await acceptRevisionsAction(5);

    expect(mocks.acceptRevisions).toHaveBeenCalledWith(3, 5);
    expect(result).toEqual({ ok: true });
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/sessions/5');
  });

  it('returns not_found when acceptRevisions returns null', async () => {
    mocks.requireUser.mockResolvedValue({ id: 3 });
    mocks.acceptRevisions.mockResolvedValue(null);

    const { acceptRevisionsAction } = await import('../../../src/app/(app)/sessions/[id]/actions');
    const result = await acceptRevisionsAction(5);

    expect(result).toEqual({ ok: false, error: 'not_found' });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe('discardRevisionsAction', () => {
  it('calls discardRevisions and returns ok on success', async () => {
    mocks.requireUser.mockResolvedValue({ id: 9 });
    mocks.discardRevisions.mockResolvedValue({ id: 5 });

    const { discardRevisionsAction } = await import('../../../src/app/(app)/sessions/[id]/actions');
    const result = await discardRevisionsAction(5);

    expect(mocks.discardRevisions).toHaveBeenCalledWith(9, 5);
    expect(result).toEqual({ ok: true });
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/sessions/5');
  });

  it('returns not_found when discardRevisions returns null', async () => {
    mocks.requireUser.mockResolvedValue({ id: 9 });
    mocks.discardRevisions.mockResolvedValue(null);

    const { discardRevisionsAction } = await import('../../../src/app/(app)/sessions/[id]/actions');
    const result = await discardRevisionsAction(5);

    expect(result).toEqual({ ok: false, error: 'not_found' });
  });
});

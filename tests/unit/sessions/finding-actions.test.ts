import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  setFindingStatus: vi.fn(),
  getFindingForUser: vi.fn(),
  regenerateSection: vi.fn(),
  revalidatePath: vi.fn(),
  startRunner: vi.fn(),
  cancelPendingInput: vi.fn(),
  resolveUserInput: vi.fn(),
}));

vi.mock('../../../src/server/auth/require-user', () => ({ requireUser: mocks.requireUser }));
vi.mock('../../../src/server/sessions/critique-repo', () => ({
  setFindingStatus: mocks.setFindingStatus,
  getFindingForUser: mocks.getFindingForUser,
}));
vi.mock('../../../src/server/pipeline/regenerate-section', () => ({
  regenerateSection: mocks.regenerateSection,
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
}));
vi.mock('../../../src/server/sessions/sources-repo', () => ({
  setSourceStatus: vi.fn(),
  setSourceSection: vi.fn(),
}));
vi.mock('../../../src/server/pipeline/run-review', () => ({ runReview: vi.fn() }));

afterEach(() => vi.clearAllMocks());

const finding = {
  id: 10,
  roundId: 1,
  criticId: 'editorial',
  severity: 'minor',
  span: { sectionId: 'intro', charStart: 0, charEnd: 5 },
  problem: 'Weak opening.',
  suggestedChange: 'Start stronger.',
  rationale: 'First impression matters.',
  status: 'open',
};

describe('dismissFindingAction', () => {
  it('calls setFindingStatus with dismissed and returns ok:true', async () => {
    mocks.requireUser.mockResolvedValue({ id: 3 });
    mocks.setFindingStatus.mockResolvedValue(finding);

    const { dismissFindingAction } = await import('../../../src/app/(app)/sessions/[id]/actions');
    const result = await dismissFindingAction(5, 10);

    expect(mocks.setFindingStatus).toHaveBeenCalledWith(3, 10, 'dismissed');
    expect(result).toEqual({ ok: true });
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/sessions/5');
  });

  it('returns not_found when setFindingStatus returns null', async () => {
    mocks.requireUser.mockResolvedValue({ id: 3 });
    mocks.setFindingStatus.mockResolvedValue(null);

    const { dismissFindingAction } = await import('../../../src/app/(app)/sessions/[id]/actions');
    const result = await dismissFindingAction(5, 99);

    expect(result).toEqual({ ok: false, error: 'not_found' });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe('applyFindingAction', () => {
  it('calls setFindingStatus with applied and returns ok:true', async () => {
    mocks.requireUser.mockResolvedValue({ id: 7 });
    mocks.setFindingStatus.mockResolvedValue(finding);

    const { applyFindingAction } = await import('../../../src/app/(app)/sessions/[id]/actions');
    const result = await applyFindingAction(5, 10);

    expect(mocks.setFindingStatus).toHaveBeenCalledWith(7, 10, 'applied');
    expect(result).toEqual({ ok: true });
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/sessions/5');
  });

  it('returns not_found when setFindingStatus returns null', async () => {
    mocks.requireUser.mockResolvedValue({ id: 7 });
    mocks.setFindingStatus.mockResolvedValue(null);

    const { applyFindingAction } = await import('../../../src/app/(app)/sessions/[id]/actions');
    const result = await applyFindingAction(5, 99);

    expect(result).toEqual({ ok: false, error: 'not_found' });
  });
});

describe('rewriteFromFindingAction', () => {
  it('returns not_found when finding does not exist', async () => {
    mocks.requireUser.mockResolvedValue({ id: 1 });
    mocks.getFindingForUser.mockResolvedValue(null);

    const { rewriteFromFindingAction } = await import('../../../src/app/(app)/sessions/[id]/actions');
    const result = await rewriteFromFindingAction(5, 99);

    expect(result).toEqual({ ok: false, error: 'not_found' });
    expect(mocks.regenerateSection).not.toHaveBeenCalled();
  });

  it('builds instruction from criticId + problem + suggestedChange and calls regenerateSection', async () => {
    mocks.requireUser.mockResolvedValue({ id: 2 });
    mocks.getFindingForUser.mockResolvedValue(finding);
    mocks.regenerateSection.mockResolvedValue({ ok: true, contentMd: '# Updated' });
    mocks.setFindingStatus.mockResolvedValue({ ...finding, status: 'rewritten' });

    const { rewriteFromFindingAction } = await import('../../../src/app/(app)/sessions/[id]/actions');
    const result = await rewriteFromFindingAction(5, 10);

    expect(mocks.regenerateSection).toHaveBeenCalledWith({
      sessionId: 5,
      userId: 2,
      sectionId: 'intro',
      instruction: '[critic editorial] Weak opening. — Start stronger.',
    });
    expect(result).toEqual({ ok: true, contentMd: '# Updated' });
  });

  it('marks finding as rewritten on successful regeneration', async () => {
    mocks.requireUser.mockResolvedValue({ id: 2 });
    mocks.getFindingForUser.mockResolvedValue(finding);
    mocks.regenerateSection.mockResolvedValue({ ok: true, contentMd: '# New' });
    mocks.setFindingStatus.mockResolvedValue({ ...finding, status: 'rewritten' });

    const { rewriteFromFindingAction } = await import('../../../src/app/(app)/sessions/[id]/actions');
    await rewriteFromFindingAction(5, 10);

    expect(mocks.setFindingStatus).toHaveBeenCalledWith(2, 10, 'rewritten');
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/sessions/5');
  });

  it('does not mark as rewritten when regenerateSection fails', async () => {
    mocks.requireUser.mockResolvedValue({ id: 2 });
    mocks.getFindingForUser.mockResolvedValue(finding);
    mocks.regenerateSection.mockResolvedValue({ ok: false, error: 'session_invalid' });

    const { rewriteFromFindingAction } = await import('../../../src/app/(app)/sessions/[id]/actions');
    const result = await rewriteFromFindingAction(5, 10);

    expect(mocks.setFindingStatus).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, error: 'session_invalid' });
  });
});

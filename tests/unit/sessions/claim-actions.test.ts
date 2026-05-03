import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  setClaimStatus: vi.fn(),
  getClaimWithLatestVerdict: vi.fn(),
  regenerateSection: vi.fn(),
  revalidatePath: vi.fn(),
  startRunner: vi.fn(),
  cancelPendingInput: vi.fn(),
  resolveUserInput: vi.fn(),
}));

vi.mock('../../../src/server/auth/require-user', () => ({ requireUser: mocks.requireUser }));
vi.mock('../../../src/server/sessions/claims-repo', () => ({
  setClaimStatus: mocks.setClaimStatus,
  getClaimWithLatestVerdict: mocks.getClaimWithLatestVerdict,
  listSessionClaims: vi.fn(),
  findClaimBySpanHash: vi.fn(),
  insertClaim: vi.fn(),
  insertClaimVerdict: vi.fn(),
  insertClaimEvidence: vi.fn(),
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
vi.mock('../../../src/server/sessions/critique-repo', () => ({
  setFindingStatus: vi.fn(),
  getFindingForUser: vi.fn(),
}));
vi.mock('../../../src/server/pipeline/run-review', () => ({ runReview: vi.fn() }));
vi.mock('../../../src/server/pipeline/run-fact-check', () => ({ runFactCheck: vi.fn() }));

afterEach(() => vi.clearAllMocks());

describe('dismissClaimAction', () => {
  it('calls setClaimStatus with dismissed and returns ok:true', async () => {
    mocks.requireUser.mockResolvedValue({ id: 5 });
    mocks.setClaimStatus.mockResolvedValue({ id: 10, status: 'dismissed' });

    const { dismissClaimAction } = await import('../../../src/app/(app)/sessions/[id]/actions');
    const result = await dismissClaimAction(1, 10);

    expect(mocks.setClaimStatus).toHaveBeenCalledWith(5, 10, 'dismissed');
    expect(result).toEqual({ ok: true });
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/sessions/1');
  });

  it('returns not_found when setClaimStatus returns null', async () => {
    mocks.requireUser.mockResolvedValue({ id: 1 });
    mocks.setClaimStatus.mockResolvedValue(null);

    const { dismissClaimAction } = await import('../../../src/app/(app)/sessions/[id]/actions');
    const result = await dismissClaimAction(1, 99);

    expect(result).toEqual({ ok: false, error: 'not_found' });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe('markClaimOpinionAction', () => {
  it('calls setClaimStatus with opinion and returns ok:true', async () => {
    mocks.requireUser.mockResolvedValue({ id: 3 });
    mocks.setClaimStatus.mockResolvedValue({ id: 7, status: 'opinion' });

    const { markClaimOpinionAction } = await import('../../../src/app/(app)/sessions/[id]/actions');
    const result = await markClaimOpinionAction(2, 7);

    expect(mocks.setClaimStatus).toHaveBeenCalledWith(3, 7, 'opinion');
    expect(result).toEqual({ ok: true });
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/sessions/2');
  });

  it('returns not_found when setClaimStatus returns null', async () => {
    mocks.requireUser.mockResolvedValue({ id: 1 });
    mocks.setClaimStatus.mockResolvedValue(null);

    const { markClaimOpinionAction } = await import('../../../src/app/(app)/sessions/[id]/actions');
    const result = await markClaimOpinionAction(1, 99);

    expect(result).toEqual({ ok: false, error: 'not_found' });
  });
});

describe('acceptClaimCorrectionAction', () => {
  const claimRow = {
    claim: {
      id: 10,
      claimText: 'Claude reduces costs by 90%.',
      span: { sectionId: 'intro', charStart: 0, charEnd: 30 },
      status: 'open',
    },
    verdict: {
      id: 5,
      verdict: 'contradicted',
      justification: 'Evidence shows only 50% reduction.',
    },
  };

  it('returns not_found when claim does not exist', async () => {
    mocks.requireUser.mockResolvedValue({ id: 1 });
    mocks.getClaimWithLatestVerdict.mockResolvedValue(null);

    const { acceptClaimCorrectionAction } = await import(
      '../../../src/app/(app)/sessions/[id]/actions'
    );
    const result = await acceptClaimCorrectionAction(1, 99);

    expect(result).toEqual({ ok: false, error: 'not_found' });
    expect(mocks.regenerateSection).not.toHaveBeenCalled();
  });

  it('returns no_correction_needed when verdict is verified', async () => {
    mocks.requireUser.mockResolvedValue({ id: 1 });
    mocks.getClaimWithLatestVerdict.mockResolvedValue({
      ...claimRow,
      verdict: { ...claimRow.verdict, verdict: 'verified' },
    });

    const { acceptClaimCorrectionAction } = await import(
      '../../../src/app/(app)/sessions/[id]/actions'
    );
    const result = await acceptClaimCorrectionAction(1, 10);

    expect(result).toEqual({ ok: false, error: 'no_correction_needed' });
    expect(mocks.regenerateSection).not.toHaveBeenCalled();
  });

  it('calls regenerateSection with instruction containing verdict and claim text', async () => {
    mocks.requireUser.mockResolvedValue({ id: 2 });
    mocks.getClaimWithLatestVerdict.mockResolvedValue(claimRow);
    mocks.regenerateSection.mockResolvedValue({ ok: true });
    mocks.setClaimStatus.mockResolvedValue({ id: 10, status: 'dismissed' });

    const { acceptClaimCorrectionAction } = await import(
      '../../../src/app/(app)/sessions/[id]/actions'
    );
    await acceptClaimCorrectionAction(3, 10);

    const regenCall = mocks.regenerateSection.mock.calls[0][0] as {
      sessionId: number;
      userId: number;
      sectionId: string;
      instruction: string;
    };
    expect(regenCall.sessionId).toBe(3);
    expect(regenCall.userId).toBe(2);
    expect(regenCall.sectionId).toBe('intro');
    expect(regenCall.instruction).toContain('[fact-check]');
    expect(regenCall.instruction).toContain('contradicted');
    expect(regenCall.instruction).toContain('Claude reduces costs by 90%.');
  });

  it('calls setClaimStatus dismissed and revalidates on successful regeneration', async () => {
    mocks.requireUser.mockResolvedValue({ id: 2 });
    mocks.getClaimWithLatestVerdict.mockResolvedValue(claimRow);
    mocks.regenerateSection.mockResolvedValue({ ok: true });
    mocks.setClaimStatus.mockResolvedValue({ id: 10, status: 'dismissed' });

    const { acceptClaimCorrectionAction } = await import(
      '../../../src/app/(app)/sessions/[id]/actions'
    );
    const result = await acceptClaimCorrectionAction(3, 10);

    expect(mocks.setClaimStatus).toHaveBeenCalledWith(2, 10, 'dismissed');
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/sessions/3');
    expect(result).toEqual({ ok: true });
  });

  it('does not call setClaimStatus when regeneration fails', async () => {
    mocks.requireUser.mockResolvedValue({ id: 1 });
    mocks.getClaimWithLatestVerdict.mockResolvedValue(claimRow);
    mocks.regenerateSection.mockResolvedValue({ ok: false, error: 'session_invalid' });

    const { acceptClaimCorrectionAction } = await import(
      '../../../src/app/(app)/sessions/[id]/actions'
    );
    await acceptClaimCorrectionAction(1, 10);

    expect(mocks.setClaimStatus).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

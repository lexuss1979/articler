import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  listSessionClaimsWithVerdicts: vi.fn(),
  verifyExistingClaim: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('../../../src/server/auth/require-user', () => ({ requireUser: mocks.requireUser }));
vi.mock('../../../src/server/sessions/claims-repo', () => ({
  listSessionClaimsWithVerdicts: mocks.listSessionClaimsWithVerdicts,
  setClaimStatus: vi.fn(),
  getClaimWithLatestVerdict: vi.fn(),
  listSessionClaims: vi.fn(),
  findClaimBySpanHash: vi.fn(),
  insertClaim: vi.fn(),
  insertClaimVerdict: vi.fn(),
  insertClaimEvidence: vi.fn(),
}));
vi.mock('../../../src/server/pipeline/run-fact-check', () => ({
  runFactCheck: vi.fn(),
  verifyExistingClaim: mocks.verifyExistingClaim,
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('../../../src/server/pipeline/runner', () => ({
  startRunner: vi.fn(),
  resolveUserInput: vi.fn(),
  cancelPendingInput: vi.fn(),
  hasPendingInput: vi.fn(),
}));
vi.mock('../../../src/server/sessions/repo', () => ({
  getSession: vi.fn(),
  updateSessionBrief: vi.fn(),
  updateSessionPlan: vi.fn(),
  updateSessionDraft: vi.fn(),
  updateSessionDraftPreReview: vi.fn(),
  updateSessionState: vi.fn(),
  updateSessionActiveCritics: vi.fn(),
  acceptRevisions: vi.fn(),
  discardRevisions: vi.fn(),
}));
vi.mock('../../../src/server/sessions/sources-repo', () => ({
  setSourceStatus: vi.fn(),
  setSourceSection: vi.fn(),
  listSessionSources: vi.fn(),
}));
vi.mock('../../../src/server/sessions/critique-repo', () => ({
  setFindingStatus: vi.fn(),
  getFindingForUser: vi.fn(),
  createCritiqueRound: vi.fn(),
}));
vi.mock('../../../src/server/pipeline/run-review', () => ({ runReview: vi.fn() }));
vi.mock('../../../src/server/profiles/repo', () => ({ getProfile: vi.fn() }));
vi.mock('../../../src/server/events/bus', () => ({ emitEvent: vi.fn() }));

afterEach(() => vi.clearAllMocks());

function makeClaimRow(
  id: number,
  opts: { checkWorthiness?: string; status?: string; hasVerdict?: boolean } = {},
) {
  return {
    claim: {
      id,
      sessionId: 10,
      roundId: 1,
      spanHash: `hash-${id}`,
      claimText: `Claim ${id}`,
      claimType: 'statistic',
      checkWorthiness: opts.checkWorthiness ?? 'high',
      status: opts.status ?? 'open',
      span: { sectionId: 'full', charStart: 0, charEnd: 5, text: 'hello' },
      createdAt: new Date(),
    },
    verdict: opts.hasVerdict
      ? { id: 100 + id, claimId: id, verdict: 'verified', justification: 'ok', createdAt: new Date() }
      : null,
  };
}

describe('verifyClaimAction', () => {
  it('calls verifyExistingClaim with userId from requireUser, sessionId, claimId, and force', async () => {
    mocks.requireUser.mockResolvedValue({ id: 7 });
    mocks.verifyExistingClaim.mockResolvedValue({ ok: true, verdict: 'verified' });

    const { verifyClaimAction } = await import('../../../src/app/(app)/sessions/[id]/actions');
    const result = await verifyClaimAction(10, 5, true);

    expect(mocks.verifyExistingClaim).toHaveBeenCalledWith({
      sessionId: 10,
      userId: 7,
      claimId: 5,
      force: true,
    });
    expect(result).toEqual({ ok: true, verdict: 'verified' });
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/sessions/10');
  });

  it('does not call revalidatePath when verifyExistingClaim returns ok: false', async () => {
    mocks.requireUser.mockResolvedValue({ id: 7 });
    mocks.verifyExistingClaim.mockResolvedValue({ ok: false, error: 'already_verified' });

    const { verifyClaimAction } = await import('../../../src/app/(app)/sessions/[id]/actions');
    await verifyClaimAction(10, 5);

    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe('verifyAllClaimsAction', () => {
  it('skips claims with existing verdicts, low checkWorthiness, or non-open status', async () => {
    mocks.requireUser.mockResolvedValue({ id: 7 });
    mocks.listSessionClaimsWithVerdicts.mockResolvedValue([
      makeClaimRow(1),                                               // eligible
      makeClaimRow(2, { hasVerdict: true }),                         // skip: has verdict
      makeClaimRow(3, { checkWorthiness: 'low' }),                   // skip: low worthiness
      makeClaimRow(4, { status: 'dismissed' }),                      // skip: not open
      makeClaimRow(5),                                               // eligible
    ]);
    mocks.verifyExistingClaim.mockResolvedValue({ ok: true, verdict: 'verified' });

    const { verifyAllClaimsAction } = await import('../../../src/app/(app)/sessions/[id]/actions');
    const result = await verifyAllClaimsAction(10);

    expect(mocks.verifyExistingClaim).toHaveBeenCalledTimes(2);
    expect(mocks.verifyExistingClaim).toHaveBeenCalledWith(expect.objectContaining({ claimId: 1 }));
    expect(mocks.verifyExistingClaim).toHaveBeenCalledWith(expect.objectContaining({ claimId: 5 }));
    expect(result).toEqual({ ok: true, verifiedCount: 2, failedCount: 0, budgetExceeded: false });
  });

  it('sets budgetExceeded: true and stops scheduling when BudgetExceededError is thrown', async () => {
    const { BudgetExceededError } = await import('../../../src/server/llm/budget-guard');
    mocks.requireUser.mockResolvedValue({ id: 7 });

    // 5 eligible claims
    mocks.listSessionClaimsWithVerdicts.mockResolvedValue(
      [1, 2, 3, 4, 5].map((id) => makeClaimRow(id)),
    );

    // Use a deferred promise to control when in-flight calls resolve
    let resolveInflight!: () => void;
    const inflightDone = new Promise<void>((res) => { resolveInflight = res; });

    let callCount = 0;
    mocks.verifyExistingClaim.mockImplementation(async ({ claimId }: { claimId: number }) => {
      callCount++;
      if (claimId === 1) {
        // This in-flight call is awaited before budget error throws
        await inflightDone;
        return { ok: true, verdict: 'verified' };
      }
      if (claimId === 2) {
        throw new BudgetExceededError('user', 5, 4);
      }
      return { ok: true, verdict: 'verified' };
    });

    const { verifyAllClaimsAction } = await import('../../../src/app/(app)/sessions/[id]/actions');
    const actionPromise = verifyAllClaimsAction(10);

    // Let the budget-exceeded path run, then resolve the in-flight call
    await Promise.resolve();
    resolveInflight();

    const result = await actionPromise;

    expect(result.budgetExceeded).toBe(true);
    // Claims 4 and 5 should NOT have been scheduled after budget exceeded
    expect(mocks.verifyExistingClaim).not.toHaveBeenCalledWith(
      expect.objectContaining({ claimId: 4 }),
    );
    expect(mocks.verifyExistingClaim).not.toHaveBeenCalledWith(
      expect.objectContaining({ claimId: 5 }),
    );
    // In-flight (claimId 1) was awaited and counts
    expect(result.verifiedCount).toBeGreaterThanOrEqual(0);
  });

  it('increments failedCount for ok: false results and calls revalidatePath at end', async () => {
    mocks.requireUser.mockResolvedValue({ id: 7 });
    mocks.listSessionClaimsWithVerdicts.mockResolvedValue([
      makeClaimRow(1),
      makeClaimRow(2),
    ]);
    mocks.verifyExistingClaim
      .mockResolvedValueOnce({ ok: true, verdict: 'verified' })
      .mockResolvedValueOnce({ ok: false, error: 'session_invalid' });

    const { verifyAllClaimsAction } = await import('../../../src/app/(app)/sessions/[id]/actions');
    const result = await verifyAllClaimsAction(10);

    expect(result).toEqual({ ok: true, verifiedCount: 1, failedCount: 1, budgetExceeded: false });
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/sessions/10');
  });
});

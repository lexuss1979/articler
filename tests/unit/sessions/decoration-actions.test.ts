import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  runDecoration: vi.fn(),
  applyDecoration: vi.fn(),
  setSuggestionStatus: vi.fn(),
  resolveUserInput: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('../../../src/server/auth/require-user', () => ({ requireUser: mocks.requireUser }));
vi.mock('../../../src/server/pipeline/run-decoration', () => ({
  runDecoration: mocks.runDecoration,
}));
vi.mock('../../../src/server/pipeline/apply-decoration', () => ({
  applyDecoration: mocks.applyDecoration,
}));
vi.mock('../../../src/server/sessions/decoration-repo', () => ({
  setSuggestionStatus: mocks.setSuggestionStatus,
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('../../../src/server/pipeline/runner', () => ({
  startRunner: vi.fn(),
  resolveUserInput: mocks.resolveUserInput,
  cancelPendingInput: vi.fn(),
  hasPendingInput: vi.fn(),
}));
vi.mock('../../../src/server/sessions/repo', () => ({
  getSession: vi.fn(),
  updateSessionBrief: vi.fn(),
  updateSessionPlan: vi.fn(),
  updateSessionState: vi.fn(),
  updateSessionActiveCritics: vi.fn(),
  acceptRevisions: vi.fn(),
  discardRevisions: vi.fn(),
}));
vi.mock('../../../src/server/sessions/sources-repo', () => ({
  setSourceStatus: vi.fn(),
  setSourceSection: vi.fn(),
}));
vi.mock('../../../src/server/pipeline/regenerate-section', () => ({
  regenerateSection: vi.fn(),
}));
vi.mock('../../../src/server/pipeline/run-review', () => ({ runReview: vi.fn() }));
vi.mock('../../../src/server/pipeline/run-fact-check', () => ({ runFactCheck: vi.fn() }));
vi.mock('../../../src/server/pipeline/apply-revisions', () => ({ applyRevisions: vi.fn() }));
vi.mock('../../../src/server/sessions/claims-repo', () => ({
  setClaimStatus: vi.fn(),
  getClaimWithLatestVerdict: vi.fn(),
}));

afterEach(() => vi.clearAllMocks());

describe('startDecorationAction', () => {
  it('passes user.id to runDecoration', async () => {
    mocks.requireUser.mockResolvedValue({ id: 7 });
    mocks.runDecoration.mockResolvedValue({ ok: true, roundId: 'r_1', suggestionCount: 2 });
    const { startDecorationAction } = await import(
      '../../../src/app/(app)/sessions/[id]/actions'
    );
    await startDecorationAction(5);
    expect(mocks.runDecoration).toHaveBeenCalledWith({ sessionId: 5, userId: 7 });
  });

  it('revalidates path on ok:true', async () => {
    mocks.requireUser.mockResolvedValue({ id: 1 });
    mocks.runDecoration.mockResolvedValue({ ok: true, roundId: 'r', suggestionCount: 0 });
    const { startDecorationAction } = await import(
      '../../../src/app/(app)/sessions/[id]/actions'
    );
    await startDecorationAction(5);
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/sessions/5');
  });

  it('skips revalidation on ok:false', async () => {
    mocks.requireUser.mockResolvedValue({ id: 1 });
    mocks.runDecoration.mockResolvedValue({ ok: false, error: 'no_draft' });
    const { startDecorationAction } = await import(
      '../../../src/app/(app)/sessions/[id]/actions'
    );
    const result = await startDecorationAction(5);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, error: 'no_draft' });
  });
});

describe('acceptDecorationAction', () => {
  it('rejects empty suggestionId with validation error', async () => {
    mocks.requireUser.mockResolvedValue({ id: 1 });
    const { acceptDecorationAction } = await import(
      '../../../src/app/(app)/sessions/[id]/actions'
    );
    const result = await acceptDecorationAction(5, '');
    expect(result).toEqual({ ok: false, error: 'validation' });
    expect(mocks.applyDecoration).not.toHaveBeenCalled();
  });

  it('passes user.id and suggestionId to applyDecoration', async () => {
    mocks.requireUser.mockResolvedValue({ id: 7 });
    mocks.applyDecoration.mockResolvedValue({ ok: true, revisedDraftMd: 'x' });
    const { acceptDecorationAction } = await import(
      '../../../src/app/(app)/sessions/[id]/actions'
    );
    await acceptDecorationAction(5, 's_r_1_0');
    expect(mocks.applyDecoration).toHaveBeenCalledWith({
      sessionId: 5,
      userId: 7,
      suggestionId: 's_r_1_0',
    });
  });

  it('revalidates on ok:true', async () => {
    mocks.requireUser.mockResolvedValue({ id: 1 });
    mocks.applyDecoration.mockResolvedValue({ ok: true, revisedDraftMd: 'x' });
    const { acceptDecorationAction } = await import(
      '../../../src/app/(app)/sessions/[id]/actions'
    );
    await acceptDecorationAction(5, 's_r_1_0');
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/sessions/5');
  });
});

describe('rejectDecorationAction', () => {
  it('rejects empty suggestionId with validation error', async () => {
    mocks.requireUser.mockResolvedValue({ id: 1 });
    const { rejectDecorationAction } = await import(
      '../../../src/app/(app)/sessions/[id]/actions'
    );
    const result = await rejectDecorationAction(5, '');
    expect(result).toEqual({ ok: false, error: 'validation' });
    expect(mocks.setSuggestionStatus).not.toHaveBeenCalled();
  });

  it('passes user.id, sessionId, suggestionId, "rejected" to setSuggestionStatus', async () => {
    mocks.requireUser.mockResolvedValue({ id: 7 });
    mocks.setSuggestionStatus.mockResolvedValue({ id: 's_r_1_0', status: 'rejected' });
    const { rejectDecorationAction } = await import(
      '../../../src/app/(app)/sessions/[id]/actions'
    );
    await rejectDecorationAction(5, 's_r_1_0');
    expect(mocks.setSuggestionStatus).toHaveBeenCalledWith(7, 5, 's_r_1_0', 'rejected');
  });

  it('returns not_found when setSuggestionStatus returns null', async () => {
    mocks.requireUser.mockResolvedValue({ id: 1 });
    mocks.setSuggestionStatus.mockResolvedValue(null);
    const { rejectDecorationAction } = await import(
      '../../../src/app/(app)/sessions/[id]/actions'
    );
    const result = await rejectDecorationAction(5, 's_r_1_0');
    expect(result).toEqual({ ok: false, error: 'not_found' });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe('finishDecorationAction', () => {
  it('returns no_pending_decoration when nothing is parked', async () => {
    mocks.requireUser.mockResolvedValue({ id: 1 });
    mocks.resolveUserInput.mockReturnValue(false);
    const { finishDecorationAction } = await import(
      '../../../src/app/(app)/sessions/[id]/actions'
    );
    expect(await finishDecorationAction(5)).toEqual({
      ok: false,
      error: 'no_pending_decoration',
    });
  });

  it('returns ok when resolveUserInput returns truthy', async () => {
    mocks.requireUser.mockResolvedValue({ id: 1 });
    mocks.resolveUserInput.mockReturnValue(true);
    const { finishDecorationAction } = await import(
      '../../../src/app/(app)/sessions/[id]/actions'
    );
    expect(await finishDecorationAction(5)).toEqual({ ok: true });
    expect(mocks.resolveUserInput).toHaveBeenCalledWith(5, { action: 'finish' });
  });
});

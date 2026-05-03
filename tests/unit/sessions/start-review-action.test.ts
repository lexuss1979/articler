import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  runReview: vi.fn(),
  revalidatePath: vi.fn(),
  startRunner: vi.fn(),
  cancelPendingInput: vi.fn(),
  resolveUserInput: vi.fn(),
}));

vi.mock('../../../src/server/auth/require-user', () => ({ requireUser: mocks.requireUser }));
vi.mock('../../../src/server/pipeline/run-review', () => ({ runReview: mocks.runReview }));
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
vi.mock('../../../src/server/pipeline/regenerate-section', () => ({
  regenerateSection: vi.fn(),
}));

afterEach(() => vi.clearAllMocks());

describe('startReviewAction', () => {
  it('passes userId from requireUser to runReview', async () => {
    mocks.requireUser.mockResolvedValue({ id: 7 });
    mocks.runReview.mockResolvedValue({ ok: true, roundId: 10, findingCount: 3 });

    const { startReviewAction } = await import(
      '../../../src/app/(app)/sessions/[id]/actions'
    );
    await startReviewAction(5);

    expect(mocks.runReview).toHaveBeenCalledWith({ sessionId: 5, userId: 7 });
  });

  it('revalidates path on ok:true', async () => {
    mocks.requireUser.mockResolvedValue({ id: 1 });
    mocks.runReview.mockResolvedValue({ ok: true, roundId: 10, findingCount: 0 });

    const { startReviewAction } = await import(
      '../../../src/app/(app)/sessions/[id]/actions'
    );
    await startReviewAction(5);

    expect(mocks.revalidatePath).toHaveBeenCalledWith('/sessions/5');
  });

  it('does not revalidate on ok:false', async () => {
    mocks.requireUser.mockResolvedValue({ id: 1 });
    mocks.runReview.mockResolvedValue({ ok: false, error: 'no_draft' });

    const { startReviewAction } = await import(
      '../../../src/app/(app)/sessions/[id]/actions'
    );
    await startReviewAction(5);

    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('returns result from runReview', async () => {
    mocks.requireUser.mockResolvedValue({ id: 1 });
    mocks.runReview.mockResolvedValue({ ok: false, error: 'session_invalid' });

    const { startReviewAction } = await import(
      '../../../src/app/(app)/sessions/[id]/actions'
    );
    const result = await startReviewAction(99);

    expect(result).toEqual({ ok: false, error: 'session_invalid' });
  });
});

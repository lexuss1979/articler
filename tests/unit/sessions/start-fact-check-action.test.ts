import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  runFactCheck: vi.fn(),
  revalidatePath: vi.fn(),
  startRunner: vi.fn(),
  cancelPendingInput: vi.fn(),
  resolveUserInput: vi.fn(),
}));

vi.mock('../../../src/server/auth/require-user', () => ({ requireUser: mocks.requireUser }));
vi.mock('../../../src/server/pipeline/run-fact-check', () => ({ runFactCheck: mocks.runFactCheck }));
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
vi.mock('../../../src/server/pipeline/run-review', () => ({ runReview: vi.fn() }));

afterEach(() => vi.clearAllMocks());

describe('startFactCheckAction', () => {
  it('passes userId and sessionId to runFactCheck', async () => {
    mocks.requireUser.mockResolvedValue({ id: 7 });
    mocks.runFactCheck.mockResolvedValue({ ok: true, roundId: 5, claimCount: 3, verdictCount: 2 });

    const { startFactCheckAction } = await import(
      '../../../src/app/(app)/sessions/[id]/actions'
    );
    await startFactCheckAction(10);

    expect(mocks.runFactCheck).toHaveBeenCalledWith({ sessionId: 10, userId: 7, force: false });
  });

  it('passes force=true when force argument is truthy', async () => {
    mocks.requireUser.mockResolvedValue({ id: 3 });
    mocks.runFactCheck.mockResolvedValue({ ok: true, roundId: 5, claimCount: 1, verdictCount: 1 });

    const { startFactCheckAction } = await import(
      '../../../src/app/(app)/sessions/[id]/actions'
    );
    await startFactCheckAction(10, true);

    expect(mocks.runFactCheck).toHaveBeenCalledWith({ sessionId: 10, userId: 3, force: true });
  });

  it('revalidates path on ok:true', async () => {
    mocks.requireUser.mockResolvedValue({ id: 1 });
    mocks.runFactCheck.mockResolvedValue({ ok: true, roundId: 5, claimCount: 0, verdictCount: 0 });

    const { startFactCheckAction } = await import(
      '../../../src/app/(app)/sessions/[id]/actions'
    );
    await startFactCheckAction(5);

    expect(mocks.revalidatePath).toHaveBeenCalledWith('/sessions/5');
  });

  it('does not revalidate on ok:false', async () => {
    mocks.requireUser.mockResolvedValue({ id: 1 });
    mocks.runFactCheck.mockResolvedValue({ ok: false, error: 'no_draft' });

    const { startFactCheckAction } = await import(
      '../../../src/app/(app)/sessions/[id]/actions'
    );
    await startFactCheckAction(5);

    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('returns result from runFactCheck', async () => {
    mocks.requireUser.mockResolvedValue({ id: 1 });
    mocks.runFactCheck.mockResolvedValue({ ok: false, error: 'session_invalid' });

    const { startFactCheckAction } = await import(
      '../../../src/app/(app)/sessions/[id]/actions'
    );
    const result = await startFactCheckAction(99);

    expect(result).toEqual({ ok: false, error: 'session_invalid' });
  });
});

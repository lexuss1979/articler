import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRequireUser = vi.fn().mockResolvedValue({ id: 7, email: 'u@test.com' });
const mockSetSourceStatus = vi.fn();
const mockSetSourceSection = vi.fn();
const mockResolveUserInput = vi.fn();
const mockRevalidatePath = vi.fn();

vi.mock('../../../src/server/auth/require-user', () => ({
  requireUser: mockRequireUser,
}));

vi.mock('../../../src/server/sessions/sources-repo', () => ({
  setSourceStatus: mockSetSourceStatus,
  setSourceSection: mockSetSourceSection,
}));

vi.mock('../../../src/server/pipeline/runner', () => ({
  resolveUserInput: mockResolveUserInput,
  startRunner: vi.fn(),
  hasPendingInput: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: mockRevalidatePath,
}));

vi.mock('../../../src/server/sessions/repo', () => ({
  getSession: vi.fn(),
  updateSessionBrief: vi.fn(),
  updateSessionPlan: vi.fn(),
  updateSessionState: vi.fn(),
}));

beforeEach(() => vi.clearAllMocks());

describe('acceptSourceAction', () => {
  it('calls setSourceStatus with user.id and accepted, returns ok:true', async () => {
    const row = { id: 5, status: 'accepted' };
    mockSetSourceStatus.mockResolvedValue(row);
    const { acceptSourceAction } = await import('../../../src/app/(app)/sessions/[id]/actions');
    const result = await acceptSourceAction(10, 5);
    expect(result).toEqual({ ok: true });
    expect(mockSetSourceStatus).toHaveBeenCalledWith(7, 5, 'accepted');
    expect(mockRevalidatePath).toHaveBeenCalledWith('/sessions/10');
  });

  it('returns not_found when repo returns null', async () => {
    mockSetSourceStatus.mockResolvedValue(null);
    const { acceptSourceAction } = await import('../../../src/app/(app)/sessions/[id]/actions');
    const result = await acceptSourceAction(10, 99);
    expect(result).toEqual({ ok: false, error: 'not_found' });
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });
});

describe('rejectSourceAction', () => {
  it('calls setSourceStatus with user.id and rejected, returns ok:true', async () => {
    mockSetSourceStatus.mockResolvedValue({ id: 5, status: 'rejected' });
    const { rejectSourceAction } = await import('../../../src/app/(app)/sessions/[id]/actions');
    const result = await rejectSourceAction(10, 5);
    expect(result).toEqual({ ok: true });
    expect(mockSetSourceStatus).toHaveBeenCalledWith(7, 5, 'rejected');
  });

  it('returns not_found when repo returns null', async () => {
    mockSetSourceStatus.mockResolvedValue(null);
    const { rejectSourceAction } = await import('../../../src/app/(app)/sessions/[id]/actions');
    expect(await rejectSourceAction(10, 99)).toEqual({ ok: false, error: 'not_found' });
  });
});

describe('assignSourceSectionAction', () => {
  it('passes validated sectionId to setSourceSection and returns ok:true', async () => {
    mockSetSourceSection.mockResolvedValue({ id: 5, sectionId: 'intro' });
    const { assignSourceSectionAction } = await import(
      '../../../src/app/(app)/sessions/[id]/actions'
    );
    const result = await assignSourceSectionAction(10, 5, 'intro');
    expect(result).toEqual({ ok: true });
    expect(mockSetSourceSection).toHaveBeenCalledWith(7, 5, 'intro');
  });

  it('accepts null sectionId', async () => {
    mockSetSourceSection.mockResolvedValue({ id: 5, sectionId: null });
    const { assignSourceSectionAction } = await import(
      '../../../src/app/(app)/sessions/[id]/actions'
    );
    const result = await assignSourceSectionAction(10, 5, null);
    expect(result).toEqual({ ok: true });
    expect(mockSetSourceSection).toHaveBeenCalledWith(7, 5, null);
  });

  it('returns validation error for sectionId exceeding 40 chars', async () => {
    const { assignSourceSectionAction } = await import(
      '../../../src/app/(app)/sessions/[id]/actions'
    );
    const long = 'x'.repeat(41);
    const result = await assignSourceSectionAction(10, 5, long);
    expect(result).toEqual({ ok: false, error: 'validation' });
    expect(mockSetSourceSection).not.toHaveBeenCalled();
  });

  it('returns not_found when repo returns null', async () => {
    mockSetSourceSection.mockResolvedValue(null);
    const { assignSourceSectionAction } = await import(
      '../../../src/app/(app)/sessions/[id]/actions'
    );
    expect(await assignSourceSectionAction(10, 99, 'intro')).toEqual({
      ok: false,
      error: 'not_found',
    });
  });
});

describe('finishResearchAction', () => {
  it('calls resolveUserInput with {action:finish} and returns ok:true when resolved', async () => {
    mockResolveUserInput.mockReturnValue(true);
    const { finishResearchAction } = await import('../../../src/app/(app)/sessions/[id]/actions');
    const result = await finishResearchAction(10);
    expect(result).toEqual({ ok: true });
    expect(mockResolveUserInput).toHaveBeenCalledOnce();
    expect(mockResolveUserInput).toHaveBeenCalledWith(10, { action: 'finish' });
  });

  it('returns no_pending_research when resolveUserInput returns false', async () => {
    mockResolveUserInput.mockReturnValue(false);
    const { finishResearchAction } = await import('../../../src/app/(app)/sessions/[id]/actions');
    const result = await finishResearchAction(10);
    expect(result).toEqual({ ok: false, error: 'no_pending_research' });
  });
});

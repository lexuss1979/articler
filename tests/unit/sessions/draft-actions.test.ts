import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireUserFn: vi.fn(),
  regenerateSectionFn: vi.fn(),
  resolveUserInputFn: vi.fn(),
  revalidatePathFn: vi.fn(),
}));

vi.mock('../../../src/server/auth/require-user', () => ({
  requireUser: mocks.requireUserFn,
}));

vi.mock('../../../src/server/pipeline/regenerate-section', () => ({
  regenerateSection: mocks.regenerateSectionFn,
}));

vi.mock('../../../src/server/pipeline/runner', () => ({
  startRunner: vi.fn(),
  resolveUserInput: mocks.resolveUserInputFn,
  hasPendingInput: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePathFn,
}));

vi.mock('../../../src/server/sessions/repo', () => ({
  getSession: vi.fn(),
  updateSessionBrief: vi.fn(),
  updateSessionPlan: vi.fn(),
  updateSessionState: vi.fn(),
  updateSessionDraft: vi.fn(),
}));
vi.mock('../../../src/server/sessions/sources-repo', () => ({
  setSourceStatus: vi.fn(),
  setSourceSection: vi.fn(),
  listSessionSources: vi.fn(),
}));

afterEach(() => vi.clearAllMocks());

describe('regenerateSectionAction', () => {
  it('passes userId through to regenerateSection', async () => {
    mocks.requireUserFn.mockResolvedValue({ id: 7 });
    mocks.regenerateSectionFn.mockResolvedValue({ ok: true, contentMd: '## Hello' });

    const { regenerateSectionAction } = await import(
      '../../../src/app/(app)/sessions/[id]/actions'
    );
    const result = await regenerateSectionAction(10, 'intro', '');

    expect(result).toMatchObject({ ok: true, contentMd: '## Hello' });
    expect(mocks.regenerateSectionFn).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 7, sessionId: 10, sectionId: 'intro' }),
    );
  });

  it('returns validation error for invalid sectionId', async () => {
    mocks.requireUserFn.mockResolvedValue({ id: 7 });

    const { regenerateSectionAction } = await import(
      '../../../src/app/(app)/sessions/[id]/actions'
    );
    const result = await regenerateSectionAction(10, '', '');
    expect(result).toEqual({ ok: false, error: 'validation' });
    expect(mocks.regenerateSectionFn).not.toHaveBeenCalled();
  });

  it('returns validation error for instruction longer than 1000 chars', async () => {
    mocks.requireUserFn.mockResolvedValue({ id: 7 });

    const { regenerateSectionAction } = await import(
      '../../../src/app/(app)/sessions/[id]/actions'
    );
    const result = await regenerateSectionAction(10, 'intro', 'a'.repeat(1001));
    expect(result).toEqual({ ok: false, error: 'validation' });
    expect(mocks.regenerateSectionFn).not.toHaveBeenCalled();
  });

  it('calls revalidatePath on success', async () => {
    mocks.requireUserFn.mockResolvedValue({ id: 7 });
    mocks.regenerateSectionFn.mockResolvedValue({ ok: true, contentMd: '## Hello' });

    const { regenerateSectionAction } = await import(
      '../../../src/app/(app)/sessions/[id]/actions'
    );
    await regenerateSectionAction(10, 'intro', '');
    expect(mocks.revalidatePathFn).toHaveBeenCalledWith('/sessions/10');
  });
});

describe('finishDraftAction', () => {
  it('returns ok true when resolveUserInput succeeds', async () => {
    mocks.requireUserFn.mockResolvedValue({ id: 7 });
    mocks.resolveUserInputFn.mockReturnValue(true);

    const { finishDraftAction } = await import(
      '../../../src/app/(app)/sessions/[id]/actions'
    );
    const result = await finishDraftAction(10);
    expect(result).toEqual({ ok: true });
    expect(mocks.resolveUserInputFn).toHaveBeenCalledWith(10, { action: 'finish' });
  });

  it('returns no_pending_draft when resolveUserInput returns false', async () => {
    mocks.requireUserFn.mockResolvedValue({ id: 7 });
    mocks.resolveUserInputFn.mockReturnValue(false);

    const { finishDraftAction } = await import(
      '../../../src/app/(app)/sessions/[id]/actions'
    );
    const result = await finishDraftAction(10);
    expect(result).toEqual({ ok: false, error: 'no_pending_draft' });
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getSession: vi.fn(),
  updateSessionDraft: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('../../../src/server/auth/require-user', () => ({
  requireUser: mocks.requireUser,
}));

vi.mock('../../../src/server/sessions/repo', () => ({
  getSession: mocks.getSession,
  updateSessionDraft: mocks.updateSessionDraft,
  updateSessionBrief: vi.fn(),
  updateSessionPlan: vi.fn(),
  updateSessionState: vi.fn(),
  updateSessionActiveCritics: vi.fn(),
  updateSessionDraftPreReview: vi.fn(),
  acceptRevisions: vi.fn(),
  discardRevisions: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}));

vi.mock('../../../src/server/pipeline/runner', () => ({
  startRunner: vi.fn(),
  resolveUserInput: vi.fn(),
  cancelPendingInput: vi.fn(),
}));

vi.mock('../../../src/server/pipeline/run-review', () => ({ runReview: vi.fn() }));
vi.mock('../../../src/server/pipeline/run-fact-check', () => ({ runFactCheck: vi.fn() }));
vi.mock('../../../src/server/pipeline/run-auto-review', () => ({ runAutoReview: vi.fn() }));
vi.mock('../../../src/server/pipeline/apply-revisions', () => ({ applyRevisions: vi.fn() }));
vi.mock('../../../src/server/pipeline/run-decoration', () => ({ runDecoration: vi.fn() }));
vi.mock('../../../src/server/pipeline/apply-decoration', () => ({ applyDecoration: vi.fn() }));
vi.mock('../../../src/server/pipeline/run-illustration', () => ({ runIllustration: vi.fn() }));
vi.mock('../../../src/server/pipeline/apply-image', () => ({ applyImageSelection: vi.fn() }));
vi.mock('../../../src/server/pipeline/regenerate-section', () => ({ regenerateSection: vi.fn() }));
vi.mock('../../../src/server/pipeline/stages/compose-image-prompt', () => ({
  composeImagePrompt: { run: vi.fn() },
}));
vi.mock('../../../src/server/pipeline/stages/prerender-images', () => ({
  prerenderImages: { run: vi.fn() },
}));
vi.mock('../../../src/server/pipeline/stages/stock-keywords', () => ({
  stockKeywords: { run: vi.fn() },
}));
vi.mock('../../../src/server/pipeline/with-stage-ctx', () => ({
  withStageCtx: (_s: unknown, _sid: unknown, _uid: unknown, fn: () => unknown) => fn(),
}));
vi.mock('../../../src/server/sessions/sources-repo', () => ({
  insertSource: vi.fn(),
  listSessionSources: vi.fn(),
  findSourceByQuery: vi.fn(),
}));
vi.mock('../../../src/server/sessions/section-drafts-repo', () => ({
  upsertSectionDraft: vi.fn(),
  listSectionDrafts: vi.fn(),
}));
vi.mock('../../../src/server/sessions/claims-repo', () => ({
  getClaimWithLatestVerdict: vi.fn(),
  setClaimStatus: vi.fn(),
}));
vi.mock('../../../src/server/sessions/decoration-repo', () => ({
  getDecoration: vi.fn(),
  upsertDecoration: vi.fn(),
}));
vi.mock('../../../src/server/profiles/repo', () => ({
  getProfile: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: 7 });
});

afterEach(() => vi.clearAllMocks());

describe('revertToPreReviewAction', () => {
  it('returns not_found when session does not exist', async () => {
    mocks.getSession.mockResolvedValue(null);
    const { revertToPreReviewAction } = await import(
      '../../../src/app/(app)/sessions/[id]/actions'
    );
    const result = await revertToPreReviewAction(42);
    expect(result).toEqual({ ok: false, error: 'not_found' });
    expect(mocks.updateSessionDraft).not.toHaveBeenCalled();
  });

  it('returns no_snapshot when draftMdPreReview is null', async () => {
    mocks.getSession.mockResolvedValue({ id: 42, userId: 7, draftMdPreReview: null });
    const { revertToPreReviewAction } = await import(
      '../../../src/app/(app)/sessions/[id]/actions'
    );
    const result = await revertToPreReviewAction(42);
    expect(result).toEqual({ ok: false, error: 'no_snapshot' });
    expect(mocks.updateSessionDraft).not.toHaveBeenCalled();
  });

  it('calls updateSessionDraft with snapshot text and returns ok:true', async () => {
    mocks.getSession.mockResolvedValue({
      id: 42,
      userId: 7,
      draftMdPreReview: 'original text',
    });
    mocks.updateSessionDraft.mockResolvedValue({ id: 42 });
    const { revertToPreReviewAction } = await import(
      '../../../src/app/(app)/sessions/[id]/actions'
    );
    const result = await revertToPreReviewAction(42);
    expect(mocks.updateSessionDraft).toHaveBeenCalledWith(7, 42, 'original text');
    expect(result).toEqual({ ok: true });
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getSession: vi.fn(),
  resolveUserInput: vi.fn(),
}));

vi.mock('../../../src/server/auth/require-user', () => ({ requireUser: mocks.requireUser }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('../../../src/server/sessions/repo', () => ({
  getSession: mocks.getSession,
  updateSessionBrief: vi.fn(),
  updateSessionPlan: vi.fn(),
  updateSessionState: vi.fn(),
  updateSessionActiveCritics: vi.fn(),
  acceptRevisions: vi.fn(),
  discardRevisions: vi.fn(),
}));
vi.mock('../../../src/server/pipeline/runner', () => ({
  startRunner: vi.fn(),
  resolveUserInput: mocks.resolveUserInput,
  cancelPendingInput: vi.fn(),
}));
vi.mock('../../../src/server/pipeline/regenerate-section', () => ({
  regenerateSection: vi.fn(),
}));
vi.mock('../../../src/server/pipeline/run-review', () => ({ runReview: vi.fn() }));
vi.mock('../../../src/server/pipeline/run-fact-check', () => ({ runFactCheck: vi.fn() }));
vi.mock('../../../src/server/pipeline/apply-revisions', () => ({ applyRevisions: vi.fn() }));
vi.mock('../../../src/server/pipeline/run-decoration', () => ({ runDecoration: vi.fn() }));
vi.mock('../../../src/server/pipeline/apply-decoration', () => ({ applyDecoration: vi.fn() }));
vi.mock('../../../src/server/pipeline/run-illustration', () => ({ runIllustration: vi.fn() }));
vi.mock('../../../src/server/pipeline/apply-image', () => ({ applyImageSelection: vi.fn() }));
vi.mock('../../../src/server/pipeline/stages/compose-image-prompt', () => ({
  composeImagePrompt: { run: vi.fn() },
}));
vi.mock('../../../src/server/pipeline/stages/prerender-images', () => ({
  prerenderImages: { run: vi.fn() },
}));
vi.mock('../../../src/server/pipeline/stages/stock-keywords', () => ({
  stockKeywords: { run: vi.fn() },
}));
vi.mock('../../../src/server/images/stock', async () => {
  class StockUnconfiguredError extends Error {}
  class StockHttpError extends Error {
    constructor(public readonly status: number) {
      super('http ' + status);
    }
  }
  return {
    searchUnsplash: vi.fn(),
    StockUnconfiguredError,
    StockHttpError,
  };
});
vi.mock('../../../src/server/images/storage', () => ({
  saveImageFromUrl: vi.fn(),
  saveImageFromB64: vi.fn(),
  IMAGES_ROOT: '/tmp/test',
}));
vi.mock('../../../src/server/sessions/images-repo', () => ({
  setSlotMode: vi.fn(),
  setSlotPrompt: vi.fn(),
  appendSlotCandidates: vi.fn(),
  findSlot: vi.fn(),
}));
vi.mock('../../../src/server/profiles/repo', () => ({ getProfile: vi.fn() }));
vi.mock('../../../src/server/events/bus', () => ({ emitEvent: vi.fn() }));
vi.mock('../../../src/server/llm/router', () => ({
  routeChat: vi.fn(),
  routeSearch: vi.fn(),
  routeImage: vi.fn(),
}));
vi.mock('../../../src/server/sessions/decoration-repo', () => ({
  setSuggestionStatus: vi.fn(),
}));
vi.mock('../../../src/server/sessions/claims-repo', () => ({
  setClaimStatus: vi.fn(),
  getClaimWithLatestVerdict: vi.fn(),
}));
vi.mock('../../../src/server/sessions/sources-repo', () => ({
  setSourceStatus: vi.fn(),
  setSourceSection: vi.fn(),
}));

beforeEach(() => {
  mocks.requireUser.mockResolvedValue({ id: 1, email: 'u@test.com' });
  mocks.getSession.mockResolvedValue({ id: 10, userId: 1 });
  mocks.resolveUserInput.mockReturnValue(true);
});

afterEach(() => vi.clearAllMocks());

describe('finishExportAction', () => {
  it('returns no_pending_export when the session is not owned by the user', async () => {
    mocks.getSession.mockResolvedValue(null);
    const { finishExportAction } = await import(
      '../../../src/app/(app)/sessions/[id]/actions'
    );
    const result = await finishExportAction(10);
    expect(result).toEqual({ ok: false, error: 'no_pending_export' });
    expect(mocks.resolveUserInput).not.toHaveBeenCalled();
  });

  it('threads user.id into the ownership check', async () => {
    const { finishExportAction } = await import(
      '../../../src/app/(app)/sessions/[id]/actions'
    );
    await finishExportAction(10);
    expect(mocks.getSession).toHaveBeenCalledWith(1, 10);
  });

  it('returns no_pending_export when the runner has no parked input', async () => {
    mocks.resolveUserInput.mockReturnValue(false);
    const { finishExportAction } = await import(
      '../../../src/app/(app)/sessions/[id]/actions'
    );
    const result = await finishExportAction(10);
    expect(result).toEqual({ ok: false, error: 'no_pending_export' });
  });

  it('returns ok on resolve and forwards the finish action to the runner', async () => {
    const { finishExportAction } = await import(
      '../../../src/app/(app)/sessions/[id]/actions'
    );
    const result = await finishExportAction(10);
    expect(result).toEqual({ ok: true });
    expect(mocks.resolveUserInput).toHaveBeenCalledWith(10, { action: 'finish' });
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  runIllustration: vi.fn(),
  applyImageSelection: vi.fn(),
  composeImagePromptRun: vi.fn(),
  prerenderImagesRun: vi.fn(),
  stockKeywordsRun: vi.fn(),
  searchUnsplash: vi.fn(),
  saveImageFromUrl: vi.fn(),
  setSlotMode: vi.fn(),
  setSlotPrompt: vi.fn(),
  appendSlotCandidates: vi.fn(),
  findSlot: vi.fn(),
  getSession: vi.fn(),
  getProfile: vi.fn(),
  resolveUserInput: vi.fn(),
  revalidatePath: vi.fn(),
  emitEvent: vi.fn(),
}));

vi.mock('../../../src/server/auth/require-user', () => ({ requireUser: mocks.requireUser }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('../../../src/server/pipeline/run-illustration', () => ({
  runIllustration: mocks.runIllustration,
}));
vi.mock('../../../src/server/pipeline/apply-image', () => ({
  applyImageSelection: mocks.applyImageSelection,
}));
vi.mock('../../../src/server/pipeline/stages/compose-image-prompt', () => ({
  composeImagePrompt: { run: mocks.composeImagePromptRun },
}));
vi.mock('../../../src/server/pipeline/stages/prerender-images', () => ({
  prerenderImages: { run: mocks.prerenderImagesRun },
}));
vi.mock('../../../src/server/pipeline/stages/stock-keywords', () => ({
  stockKeywords: { run: mocks.stockKeywordsRun },
}));
vi.mock('../../../src/server/images/stock', async () => {
  class StockUnconfiguredError extends Error {
    constructor() {
      super('UNSPLASH_ACCESS_KEY not set');
      this.name = 'StockUnconfiguredError';
    }
  }
  class StockHttpError extends Error {
    constructor(public readonly status: number) {
      super('Unsplash HTTP ' + status);
      this.name = 'StockHttpError';
    }
  }
  return {
    searchUnsplash: mocks.searchUnsplash,
    StockUnconfiguredError,
    StockHttpError,
  };
});
vi.mock('../../../src/server/images/storage', () => ({
  saveImageFromUrl: mocks.saveImageFromUrl,
  saveImageFromB64: vi.fn(),
  IMAGES_ROOT: '/tmp/test',
}));
vi.mock('../../../src/server/sessions/images-repo', () => ({
  setSlotMode: mocks.setSlotMode,
  setSlotPrompt: mocks.setSlotPrompt,
  appendSlotCandidates: mocks.appendSlotCandidates,
  findSlot: mocks.findSlot,
}));
vi.mock('../../../src/server/profiles/repo', () => ({ getProfile: mocks.getProfile }));
vi.mock('../../../src/server/events/bus', () => ({ emitEvent: mocks.emitEvent }));
vi.mock('../../../src/server/llm/router', () => ({
  routeChat: vi.fn(),
  routeSearch: vi.fn(),
  routeImage: vi.fn(),
}));
vi.mock('../../../src/server/pipeline/runner', () => ({
  startRunner: vi.fn(),
  resolveUserInput: mocks.resolveUserInput,
  cancelPendingInput: vi.fn(),
  hasPendingInput: vi.fn(),
}));
vi.mock('../../../src/server/sessions/repo', () => ({
  getSession: mocks.getSession,
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
vi.mock('../../../src/server/pipeline/run-decoration', () => ({ runDecoration: vi.fn() }));
vi.mock('../../../src/server/pipeline/apply-decoration', () => ({ applyDecoration: vi.fn() }));
vi.mock('../../../src/server/pipeline/apply-revisions', () => ({ applyRevisions: vi.fn() }));
vi.mock('../../../src/server/sessions/decoration-repo', () => ({
  setSuggestionStatus: vi.fn(),
}));
vi.mock('../../../src/server/sessions/claims-repo', () => ({
  setClaimStatus: vi.fn(),
  getClaimWithLatestVerdict: vi.fn(),
}));

const validPlan = {
  thesis: 'thesis',
  targetTakeaway: 'takeaway',
  sections: [
    { id: 'intro', title: 'Intro', intent: 'open', keyPoints: ['k'], expectedLength: 100 },
    { id: 'body', title: 'Body', intent: 'detail', keyPoints: ['k'], expectedLength: 500 },
  ],
};
const validProfile = { id: 7, userId: 1, name: 'P' };
const heroSlot = {
  id: 'slot_hero',
  kind: 'hero',
  brief: 'h',
  mode: 'undecided',
  candidates: [],
};
const validSession = {
  id: 5,
  userId: 7,
  profileId: 7,
  plan: validPlan,
  draftMd: 'draft',
  images: { slots: [heroSlot] },
};

const minimalPrompt = {
  subject: 'A laptop',
  style: 'editorial photo',
  composition: 'centered',
  palette: ['indigo'],
  lighting: 'soft',
  mood: 'focused',
  aspect: '16:9' as const,
};

afterEach(() => vi.clearAllMocks());

describe('startIllustrationAction', () => {
  it('threads user.id to runIllustration', async () => {
    mocks.requireUser.mockResolvedValue({ id: 7 });
    mocks.runIllustration.mockResolvedValue({ ok: true, slotCount: 2 });
    const { startIllustrationAction } = await import(
      '../../../src/app/(app)/sessions/[id]/actions'
    );
    await startIllustrationAction(5);
    expect(mocks.runIllustration).toHaveBeenCalledWith({ sessionId: 5, userId: 7 });
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/sessions/5');
  });
});

describe('setSlotModeAction', () => {
  it('rejects empty slotId with validation error', async () => {
    mocks.requireUser.mockResolvedValue({ id: 7 });
    const { setSlotModeAction } = await import(
      '../../../src/app/(app)/sessions/[id]/actions'
    );
    expect(await setSlotModeAction(5, '', 'generate')).toEqual({
      ok: false,
      error: 'validation',
    });
    expect(mocks.setSlotMode).not.toHaveBeenCalled();
  });
  it('rejects unknown mode', async () => {
    mocks.requireUser.mockResolvedValue({ id: 7 });
    const { setSlotModeAction } = await import(
      '../../../src/app/(app)/sessions/[id]/actions'
    );
    expect(await setSlotModeAction(5, 'slot_a', 'unknown')).toEqual({
      ok: false,
      error: 'validation',
    });
  });
  it('passes user.id and mode to setSlotMode', async () => {
    mocks.requireUser.mockResolvedValue({ id: 7 });
    mocks.setSlotMode.mockResolvedValue({ ...heroSlot, mode: 'generate' });
    const { setSlotModeAction } = await import(
      '../../../src/app/(app)/sessions/[id]/actions'
    );
    await setSlotModeAction(5, 'slot_hero', 'generate');
    expect(mocks.setSlotMode).toHaveBeenCalledWith(7, 5, 'slot_hero', 'generate');
  });
});

describe('savePromptAction', () => {
  it('rejects an invalid prompt', async () => {
    mocks.requireUser.mockResolvedValue({ id: 7 });
    const { savePromptAction } = await import(
      '../../../src/app/(app)/sessions/[id]/actions'
    );
    expect(
      await savePromptAction(5, 'slot_hero', { subject: 'x' }),
    ).toEqual({ ok: false, error: 'validation' });
  });
  it('persists a valid prompt', async () => {
    mocks.requireUser.mockResolvedValue({ id: 7 });
    mocks.setSlotPrompt.mockResolvedValue({ ...heroSlot, prompt: minimalPrompt });
    const { savePromptAction } = await import(
      '../../../src/app/(app)/sessions/[id]/actions'
    );
    const result = await savePromptAction(5, 'slot_hero', minimalPrompt);
    expect(result).toEqual({ ok: true, prompt: minimalPrompt });
    expect(mocks.setSlotPrompt).toHaveBeenCalledWith(7, 5, 'slot_hero', minimalPrompt);
  });
});

describe('composePromptAction', () => {
  it('returns session_invalid when getSession is null', async () => {
    mocks.requireUser.mockResolvedValue({ id: 7 });
    mocks.getSession.mockResolvedValue(null);
    const { composePromptAction } = await import(
      '../../../src/app/(app)/sessions/[id]/actions'
    );
    expect(await composePromptAction(5, 'slot_hero')).toEqual({
      ok: false,
      error: 'session_invalid',
    });
  });
  it('runs composeImagePrompt and persists the result', async () => {
    mocks.requireUser.mockResolvedValue({ id: 7 });
    mocks.getSession.mockResolvedValue(validSession);
    mocks.getProfile.mockResolvedValue(validProfile);
    mocks.findSlot.mockResolvedValue(heroSlot);
    mocks.composeImagePromptRun.mockResolvedValue(minimalPrompt);
    mocks.setSlotPrompt.mockResolvedValue({ ...heroSlot, prompt: minimalPrompt });
    const { composePromptAction } = await import(
      '../../../src/app/(app)/sessions/[id]/actions'
    );
    const result = await composePromptAction(5, 'slot_hero');
    expect(result).toEqual({ ok: true, prompt: minimalPrompt });
    expect(mocks.setSlotPrompt).toHaveBeenCalledWith(7, 5, 'slot_hero', minimalPrompt);
  });
});

describe('prerenderSlotAction', () => {
  it('returns no_prompt when slot has no prompt', async () => {
    mocks.requireUser.mockResolvedValue({ id: 7 });
    mocks.findSlot.mockResolvedValue(heroSlot);
    const { prerenderSlotAction } = await import(
      '../../../src/app/(app)/sessions/[id]/actions'
    );
    expect(await prerenderSlotAction(5, 'slot_hero')).toEqual({
      ok: false,
      error: 'no_prompt',
    });
    expect(mocks.prerenderImagesRun).not.toHaveBeenCalled();
  });
  it('runs prerenderImages and appends candidates', async () => {
    const cands = [
      {
        id: 'c1',
        source: 'generated' as const,
        localPath: '/p.png',
        createdAt: '2026-05-03T10:00:00.000Z',
      },
    ];
    mocks.requireUser.mockResolvedValue({ id: 7 });
    mocks.findSlot.mockResolvedValue({ ...heroSlot, prompt: minimalPrompt });
    mocks.prerenderImagesRun.mockResolvedValue({ candidates: cands });
    mocks.appendSlotCandidates.mockResolvedValue({ ...heroSlot, candidates: cands });
    const { prerenderSlotAction } = await import(
      '../../../src/app/(app)/sessions/[id]/actions'
    );
    const result = await prerenderSlotAction(5, 'slot_hero');
    expect(result).toEqual({ ok: true, candidates: cands });
    expect(mocks.appendSlotCandidates).toHaveBeenCalledWith(7, 5, 'slot_hero', cands);
  });
});

describe('stockSearchAction', () => {
  it('maps StockUnconfiguredError to unconfigured', async () => {
    mocks.requireUser.mockResolvedValue({ id: 7 });
    mocks.getSession.mockResolvedValue(validSession);
    mocks.getProfile.mockResolvedValue(validProfile);
    mocks.findSlot.mockResolvedValue(heroSlot);
    mocks.stockKeywordsRun.mockResolvedValue({ keywords: ['k'] });
    const { StockUnconfiguredError } = await import('../../../src/server/images/stock');
    mocks.searchUnsplash.mockRejectedValue(new StockUnconfiguredError());
    const { stockSearchAction } = await import(
      '../../../src/app/(app)/sessions/[id]/actions'
    );
    expect(await stockSearchAction(5, 'slot_hero')).toEqual({
      ok: false,
      error: 'unconfigured',
    });
    expect(mocks.appendSlotCandidates).not.toHaveBeenCalled();
  });
  it('maps StockHttpError to http_error', async () => {
    mocks.requireUser.mockResolvedValue({ id: 7 });
    mocks.getSession.mockResolvedValue(validSession);
    mocks.getProfile.mockResolvedValue(validProfile);
    mocks.findSlot.mockResolvedValue(heroSlot);
    mocks.stockKeywordsRun.mockResolvedValue({ keywords: ['k'] });
    const { StockHttpError } = await import('../../../src/server/images/stock');
    mocks.searchUnsplash.mockRejectedValue(new StockHttpError(500));
    const { stockSearchAction } = await import(
      '../../../src/app/(app)/sessions/[id]/actions'
    );
    expect(await stockSearchAction(5, 'slot_hero')).toEqual({
      ok: false,
      error: 'http_error',
    });
  });
  it('downloads each result and appends candidates', async () => {
    mocks.requireUser.mockResolvedValue({ id: 7 });
    mocks.getSession.mockResolvedValue(validSession);
    mocks.getProfile.mockResolvedValue(validProfile);
    mocks.findSlot.mockResolvedValue(heroSlot);
    mocks.stockKeywordsRun.mockResolvedValue({ keywords: ['k'] });
    mocks.searchUnsplash.mockResolvedValue({
      candidates: [
        {
          id: 'unsplash_abc',
          sourceUrl: 'https://images.unsplash.com/abc',
          thumbUrl: 'https://images.unsplash.com/abc-small',
          attribution: 'Photo by X on Unsplash',
        },
      ],
    });
    mocks.saveImageFromUrl.mockResolvedValue({
      localPath: '/api/images/5/slot_hero/unsplash_abc.jpg',
      absPath: '/tmp/test/5/slot_hero/unsplash_abc.jpg',
    });
    mocks.appendSlotCandidates.mockResolvedValue(heroSlot);
    const { stockSearchAction } = await import(
      '../../../src/app/(app)/sessions/[id]/actions'
    );
    const result = await stockSearchAction(5, 'slot_hero');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0]!.source).toBe('stock');
      expect(result.candidates[0]!.attribution).toContain('Unsplash');
    }
    expect(mocks.appendSlotCandidates).toHaveBeenCalled();
  });
});

describe('selectCandidateAction', () => {
  it('rejects empty slotId or candidateId with validation', async () => {
    mocks.requireUser.mockResolvedValue({ id: 7 });
    const { selectCandidateAction } = await import(
      '../../../src/app/(app)/sessions/[id]/actions'
    );
    expect(await selectCandidateAction(5, '', 'c1')).toEqual({
      ok: false,
      error: 'validation',
    });
    expect(await selectCandidateAction(5, 'slot_a', '')).toEqual({
      ok: false,
      error: 'validation',
    });
  });
  it('threads through to applyImageSelection', async () => {
    mocks.requireUser.mockResolvedValue({ id: 7 });
    mocks.applyImageSelection.mockResolvedValue({ ok: true, revisedDraftMd: 'x' });
    const { selectCandidateAction } = await import(
      '../../../src/app/(app)/sessions/[id]/actions'
    );
    const result = await selectCandidateAction(5, 'slot_a', 'c1');
    expect(result).toEqual({ ok: true, revisedDraftMd: 'x' });
    expect(mocks.applyImageSelection).toHaveBeenCalledWith({
      sessionId: 5,
      userId: 7,
      slotId: 'slot_a',
      candidateId: 'c1',
    });
  });
});

describe('finishIllustrationAction', () => {
  it('returns no_pending_illustration when nothing is parked', async () => {
    mocks.requireUser.mockResolvedValue({ id: 7 });
    mocks.resolveUserInput.mockReturnValue(false);
    const { finishIllustrationAction } = await import(
      '../../../src/app/(app)/sessions/[id]/actions'
    );
    expect(await finishIllustrationAction(5)).toEqual({
      ok: false,
      error: 'no_pending_illustration',
    });
  });
  it('returns ok when resolveUserInput resolves', async () => {
    mocks.requireUser.mockResolvedValue({ id: 7 });
    mocks.resolveUserInput.mockReturnValue(true);
    const { finishIllustrationAction } = await import(
      '../../../src/app/(app)/sessions/[id]/actions'
    );
    expect(await finishIllustrationAction(5)).toEqual({ ok: true });
    expect(mocks.resolveUserInput).toHaveBeenCalledWith(5, { action: 'finish' });
  });
});

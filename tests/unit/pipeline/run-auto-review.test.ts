import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getProfile: vi.fn(),
  emitEvent: vi.fn(),
  autoReviewRun: vi.fn(),
  withStageCtx: vi.fn(),
}));

vi.mock('../../../src/server/sessions/repo', () => ({ getSession: mocks.getSession }));
vi.mock('../../../src/server/profiles/repo', () => ({ getProfile: mocks.getProfile }));
vi.mock('../../../src/server/events/bus', () => ({ emitEvent: mocks.emitEvent }));
vi.mock('../../../src/server/pipeline/stages/auto-review', () => ({
  autoReview: { name: 'auto_review', run: mocks.autoReviewRun },
}));
vi.mock('../../../src/server/pipeline/with-stage-ctx', () => ({
  withStageCtx: mocks.withStageCtx,
}));

const profile = {
  id: 1,
  userId: 7,
  name: 'TestPub',
  format: 'blog',
  style: 'conversational',
  audience: 'developers',
  targetVolumeMin: 500,
  targetVolumeMax: 1500,
  markupRules: null,
  extraPrompt: '',
  lightResearchSources: 3,
  lightMaxWords: 800,
  createdAt: new Date('2024-01-01'),
};

const session = {
  id: 42,
  userId: 7,
  profileId: 1,
  draftMd: 'draft content',
  draftMdPreReview: null,
  state: 'review',
  mode: 'light',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue(session);
  mocks.getProfile.mockResolvedValue(profile);
  mocks.withStageCtx.mockImplementation(
    (_stage: unknown, _sid: unknown, _uid: unknown, fn: () => unknown) => fn(),
  );
  mocks.autoReviewRun.mockResolvedValue({
    revisedMd: 'revised content',
    changes: [{ kind: 'humanize', before: 'a', after: 'b' }],
  });
});

afterEach(() => vi.clearAllMocks());

describe('runAutoReview', () => {
  it('returns session_invalid when getSession returns null', async () => {
    mocks.getSession.mockResolvedValue(null);
    const { runAutoReview } = await import('../../../src/server/pipeline/run-auto-review');
    const result = await runAutoReview({ sessionId: 42, userId: 7 });
    expect(result).toEqual({ ok: false, error: 'session_invalid' });
    expect(mocks.autoReviewRun).not.toHaveBeenCalled();
  });

  it('returns no_draft when session.draftMd is null', async () => {
    mocks.getSession.mockResolvedValue({ ...session, draftMd: null });
    const { runAutoReview } = await import('../../../src/server/pipeline/run-auto-review');
    const result = await runAutoReview({ sessionId: 42, userId: 7 });
    expect(result).toEqual({ ok: false, error: 'no_draft' });
    expect(mocks.autoReviewRun).not.toHaveBeenCalled();
  });

  it('returns session_invalid when getProfile returns null', async () => {
    mocks.getProfile.mockResolvedValue(null);
    const { runAutoReview } = await import('../../../src/server/pipeline/run-auto-review');
    const result = await runAutoReview({ sessionId: 42, userId: 7 });
    expect(result).toEqual({ ok: false, error: 'session_invalid' });
    expect(mocks.autoReviewRun).not.toHaveBeenCalled();
  });

  it('returns ok result with revisedMd, changeCount, and changes on success', async () => {
    const { runAutoReview } = await import('../../../src/server/pipeline/run-auto-review');
    const result = await runAutoReview({ sessionId: 42, userId: 7 });
    expect(result).toEqual({
      ok: true,
      revisedMd: 'revised content',
      changeCount: 1,
      changes: [{ kind: 'humanize', before: 'a', after: 'b' }],
    });
  });

  it('calls withStageCtx which invokes autoReview.run', async () => {
    const { runAutoReview } = await import('../../../src/server/pipeline/run-auto-review');
    await runAutoReview({ sessionId: 42, userId: 7 });
    expect(mocks.withStageCtx).toHaveBeenCalledOnce();
    expect(mocks.autoReviewRun).toHaveBeenCalledOnce();
    const [stage, sid, uid] = mocks.withStageCtx.mock.calls[0] as [
      unknown,
      number,
      number,
      unknown,
    ];
    expect((stage as { name: string }).name).toBe('auto_review');
    expect(sid).toBe(42);
    expect(uid).toBe(7);
  });
});

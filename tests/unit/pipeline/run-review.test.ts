import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getProfile: vi.fn(),
  listSectionDrafts: vi.fn(),
  createCritiqueRound: vi.fn(),
  insertFinding: vi.fn(),
  emitEvent: vi.fn(),
  runReviewStageRun: vi.fn(),
}));

vi.mock('../../../src/server/sessions/repo', () => ({ getSession: mocks.getSession }));
vi.mock('../../../src/server/profiles/repo', () => ({ getProfile: mocks.getProfile }));
vi.mock('../../../src/server/sessions/section-drafts-repo', () => ({
  listSectionDrafts: mocks.listSectionDrafts,
}));
vi.mock('../../../src/server/sessions/critique-repo', () => ({
  createCritiqueRound: mocks.createCritiqueRound,
  insertFinding: mocks.insertFinding,
}));
vi.mock('../../../src/server/events/bus', () => ({ emitEvent: mocks.emitEvent }));
vi.mock('../../../src/server/pipeline/stages/run-review', () => ({
  runReview: { run: mocks.runReviewStageRun },
}));

const plan = {
  thesis: 'Test thesis.',
  targetTakeaway: 'Test takeaway.',
  sections: [
    { id: 'intro', title: 'Introduction', intent: 'Hook the reader.', keyPoints: ['x'], expectedLength: 200 },
    { id: 'body', title: 'Main Content', intent: 'Explain the topic.', keyPoints: ['y'], expectedLength: 800 },
  ],
};

const profile = {
  id: 1,
  userId: 1,
  name: 'Habr longread',
  format: 'long_read',
  style: 'Technical',
  audience: 'Engineers',
  targetVolumeMin: 2000,
  targetVolumeMax: 4000,
  markupRules: {},
  extraPrompt: '',
  lightResearchSources: 1,
  lightMaxWords: 800,
  createdAt: new Date(),
};

const sectionDrafts = [{ sectionId: 'intro', contentMd: '# Intro\nHello.' }];

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    userId: 1,
    profileId: 1,
    plan,
    draftMd: '# Intro\nHello.',
    activeCritics: { enabledIds: ['editorial', 'style'], custom: [] },
    mode: 'write',
    ...overrides,
  };
}

function setupHappyPath() {
  mocks.getProfile.mockResolvedValue(profile);
  mocks.listSectionDrafts.mockResolvedValue(sectionDrafts);
  mocks.createCritiqueRound.mockResolvedValue({ id: 42, sessionId: 1, kind: 'critique', draftHash: 'abc' });
  mocks.emitEvent.mockResolvedValue(undefined);
  mocks.insertFinding.mockImplementation(async (_uid: number, _rid: number, fields: unknown) => ({
    id: Math.random(),
    roundId: 42,
    status: 'open',
    ...(fields as object),
  }));
}

afterEach(() => vi.clearAllMocks());

describe('runReview', () => {
  it('returns session_invalid when session not found', async () => {
    mocks.getSession.mockResolvedValue(null);
    const { runReview } = await import('../../../src/server/pipeline/run-review');
    const result = await runReview({ sessionId: 1, userId: 1 });
    expect(result).toEqual({ ok: false, error: 'session_invalid' });
  });

  it('returns session_invalid when plan parse fails', async () => {
    mocks.getSession.mockResolvedValue(makeSession({ plan: null }));
    const { runReview } = await import('../../../src/server/pipeline/run-review');
    const result = await runReview({ sessionId: 1, userId: 1 });
    expect(result).toEqual({ ok: false, error: 'session_invalid' });
  });

  it('returns session_invalid when profile not found', async () => {
    mocks.getSession.mockResolvedValue(makeSession());
    mocks.getProfile.mockResolvedValue(null);
    const { runReview } = await import('../../../src/server/pipeline/run-review');
    const result = await runReview({ sessionId: 1, userId: 1 });
    expect(result).toEqual({ ok: false, error: 'session_invalid' });
  });

  it('returns no_draft when draftMd is empty', async () => {
    mocks.getSession.mockResolvedValue(makeSession({ draftMd: '' }));
    mocks.getProfile.mockResolvedValue(profile);
    const { runReview } = await import('../../../src/server/pipeline/run-review');
    const result = await runReview({ sessionId: 1, userId: 1 });
    expect(result).toEqual({ ok: false, error: 'no_draft' });
    expect(mocks.runReviewStageRun).not.toHaveBeenCalled();
  });

  it('invokes the review stage exactly once regardless of enabled-critic count', async () => {
    mocks.getSession.mockResolvedValue(
      makeSession({
        activeCritics: { enabledIds: ['editorial', 'style', 'methodology', 'structure'], custom: [] },
      }),
    );
    mocks.runReviewStageRun.mockResolvedValue({ findings: [] });
    setupHappyPath();

    const { runReview } = await import('../../../src/server/pipeline/run-review');
    await runReview({ sessionId: 1, userId: 1 });

    expect(mocks.runReviewStageRun).toHaveBeenCalledTimes(1);
    const [stageInput] = mocks.runReviewStageRun.mock.calls[0] as [
      { enabledCriticIds: string[] },
    ];
    expect(stageInput.enabledCriticIds).toEqual(['editorial', 'style', 'methodology', 'structure']);
  });

  it('persists findings with criticId="review" and falls back to overall span when missing', async () => {
    mocks.getSession.mockResolvedValue(makeSession({ activeCritics: { enabledIds: ['editorial'], custom: [] } }));
    mocks.runReviewStageRun.mockResolvedValue({
      findings: [
        {
          severity: 'critical',
          problem: 'Big issue.',
          suggestedChange: 'Fix it.',
          span: { sectionId: 'intro', charStart: 0, charEnd: 5 },
        },
        {
          severity: 'minor',
          problem: 'Tone slightly off.',
          suggestedChange: 'Soften.',
        },
      ],
    });
    setupHappyPath();

    const { runReview } = await import('../../../src/server/pipeline/run-review');
    const result = await runReview({ sessionId: 1, userId: 1 });

    expect(mocks.insertFinding).toHaveBeenCalledTimes(2);
    const firstInsert = mocks.insertFinding.mock.calls[0][2] as Record<string, unknown>;
    expect(firstInsert).toMatchObject({
      criticId: 'review',
      severity: 'critical',
      span: { sectionId: 'intro', charStart: 0, charEnd: 5 },
      problem: 'Big issue.',
      suggestedChange: 'Fix it.',
      rationale: '',
    });
    const secondInsert = mocks.insertFinding.mock.calls[1][2] as Record<string, unknown>;
    expect(secondInsert).toMatchObject({
      criticId: 'review',
      severity: 'minor',
      span: { sectionId: 'overall', charStart: 0, charEnd: 0 },
    });
    expect(result).toMatchObject({ ok: true, roundId: 42, findingCount: 2 });
  });

  it('emits artifact_updated per finding and a final critique_round event', async () => {
    mocks.getSession.mockResolvedValue(makeSession({ activeCritics: { enabledIds: ['editorial'], custom: [] } }));
    mocks.runReviewStageRun.mockResolvedValue({
      findings: [
        {
          severity: 'medium',
          problem: 'P',
          suggestedChange: 'S',
          span: { sectionId: 'intro', charStart: 0, charEnd: 1 },
        },
      ],
    });
    setupHappyPath();

    const { runReview } = await import('../../../src/server/pipeline/run-review');
    await runReview({ sessionId: 1, userId: 1 });

    const artifactCalls = (mocks.emitEvent.mock.calls as Array<[number, string, unknown]>).filter(
      ([, kind]) => kind === 'artifact_updated',
    );
    expect(artifactCalls.find(([, , p]) => (p as { kind: string }).kind === 'finding')).toBeDefined();
    const roundEmit = artifactCalls.find(
      ([, , p]) => (p as { kind: string }).kind === 'critique_round',
    );
    expect(roundEmit).toBeDefined();
    expect(roundEmit![2]).toMatchObject({ kind: 'critique_round', roundId: 42, findingCount: 1 });
  });
});

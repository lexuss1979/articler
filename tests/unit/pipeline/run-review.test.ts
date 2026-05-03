import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getProfile: vi.fn(),
  listSectionDrafts: vi.fn(),
  createCritiqueRound: vi.fn(),
  insertFinding: vi.fn(),
  emitEvent: vi.fn(),
  runCriticRun: vi.fn(),
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
vi.mock('../../../src/server/pipeline/stages/run-critic', () => ({
  runCritic: { run: mocks.runCriticRun },
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
    expect(mocks.runCriticRun).not.toHaveBeenCalled();
  });

  it('returns no_draft when draftMd is null', async () => {
    mocks.getSession.mockResolvedValue(makeSession({ draftMd: null }));
    mocks.getProfile.mockResolvedValue(profile);
    const { runReview } = await import('../../../src/server/pipeline/run-review');
    const result = await runReview({ sessionId: 1, userId: 1 });
    expect(result).toEqual({ ok: false, error: 'no_draft' });
  });

  it('calls runCritic.run for each enabled built-in plus custom critics', async () => {
    const session = makeSession({
      activeCritics: {
        enabledIds: ['editorial', 'style'],
        custom: [{ id: 'custom1', label: 'Custom', promptFragment: 'Check for issues.' }],
      },
    });
    mocks.getSession.mockResolvedValue(session);
    mocks.runCriticRun.mockResolvedValue({ findings: [] });
    setupHappyPath();

    const { runReview } = await import('../../../src/server/pipeline/run-review');
    await runReview({ sessionId: 1, userId: 1 });

    expect(mocks.runCriticRun).toHaveBeenCalledTimes(3);
    const criticIds = (mocks.runCriticRun.mock.calls as Array<[{ critic: { id: string } }]>).map(([input]) => input.critic.id);
    expect(criticIds).toContain('editorial');
    expect(criticIds).toContain('style');
    expect(criticIds).toContain('custom1');
  });

  it('custom critic system prompt starts with GENERIC_CRITIC_SYSTEM_PROMPT + fragment', async () => {
    const session = makeSession({
      activeCritics: {
        enabledIds: [],
        custom: [{ id: 'c1', label: 'C1', promptFragment: 'Check tone.' }],
      },
    });
    mocks.getSession.mockResolvedValue(session);
    mocks.runCriticRun.mockResolvedValue({ findings: [] });
    setupHappyPath();

    const { runReview, GENERIC_CRITIC_SYSTEM_PROMPT } = await import(
      '../../../src/server/pipeline/run-review'
    );
    await runReview({ sessionId: 1, userId: 1 });

    const [input] = mocks.runCriticRun.mock.calls[0] as [{ critic: { systemPrompt: string } }];
    expect(input.critic.systemPrompt).toBe(GENERIC_CRITIC_SYSTEM_PROMPT + '\n' + 'Check tone.');
  });

  it('persists findings and emits artifact_updated per finding', async () => {
    mocks.getSession.mockResolvedValue(makeSession({ activeCritics: { enabledIds: ['editorial'], custom: [] } }));
    const finding = {
      criticId: 'editorial',
      severity: 'minor',
      span: { sectionId: 'intro', charStart: 0, charEnd: 5 },
      problem: 'Weak.',
      suggestedChange: 'Improve.',
      rationale: 'Because.',
    };
    mocks.runCriticRun.mockResolvedValue({ findings: [finding] });
    setupHappyPath();

    const { runReview } = await import('../../../src/server/pipeline/run-review');
    await runReview({ sessionId: 1, userId: 1 });

    expect(mocks.insertFinding).toHaveBeenCalledTimes(1);
    expect(mocks.insertFinding.mock.calls[0][1]).toBe(42);

    const artifactCalls = (mocks.emitEvent.mock.calls as Array<[number, string, unknown]>).filter(
      ([, kind]) => kind === 'artifact_updated',
    );
    const findingEmit = artifactCalls.find(([, , p]) => (p as { kind: string }).kind === 'finding');
    expect(findingEmit).toBeDefined();
  });

  it('emits final artifact_updated with critique_round kind and correct findingCount', async () => {
    mocks.getSession.mockResolvedValue(makeSession({ activeCritics: { enabledIds: ['editorial'], custom: [] } }));
    const f1 = { criticId: 'editorial', severity: 'minor', span: { sectionId: 'intro', charStart: 0, charEnd: 5 }, problem: 'P', suggestedChange: 'S', rationale: 'R' };
    const f2 = { ...f1, problem: 'P2' };
    mocks.runCriticRun.mockResolvedValue({ findings: [f1, f2] });
    setupHappyPath();

    const { runReview } = await import('../../../src/server/pipeline/run-review');
    const result = await runReview({ sessionId: 1, userId: 1 });

    expect(result).toMatchObject({ ok: true, roundId: 42, findingCount: 2 });

    const roundEmit = (mocks.emitEvent.mock.calls as Array<[number, string, unknown]>).find(
      ([, kind, p]) => kind === 'artifact_updated' && (p as { kind: string }).kind === 'critique_round',
    );
    expect(roundEmit).toBeDefined();
    expect(roundEmit![2]).toMatchObject({ kind: 'critique_round', roundId: 42, findingCount: 2 });
  });

  it('returns ok:true with roundId and findingCount on success', async () => {
    mocks.getSession.mockResolvedValue(makeSession({ activeCritics: { enabledIds: ['editorial'], custom: [] } }));
    mocks.runCriticRun.mockResolvedValue({ findings: [] });
    setupHappyPath();

    const { runReview } = await import('../../../src/server/pipeline/run-review');
    const result = await runReview({ sessionId: 1, userId: 1 });

    expect(result).toEqual({ ok: true, roundId: 42, findingCount: 0 });
  });
});

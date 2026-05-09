import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getProfile: vi.fn(),
  listSectionDrafts: vi.fn(),
  listSessionSources: vi.fn(),
  createCritiqueRound: vi.fn(),
  insertClaim: vi.fn(),
  findClaimBySpanHash: vi.fn(),
  insertClaimVerdict: vi.fn(),
  insertClaimEvidence: vi.fn(),
  emitEvent: vi.fn(),
  extractClaimsRun: vi.fn(),
  verifyClaimRun: vi.fn(),
  adjudicateClaimRun: vi.fn(),
}));

vi.mock('../../../src/server/sessions/repo', () => ({ getSession: mocks.getSession }));
vi.mock('../../../src/server/profiles/repo', () => ({ getProfile: mocks.getProfile }));
vi.mock('../../../src/server/sessions/section-drafts-repo', () => ({
  listSectionDrafts: mocks.listSectionDrafts,
}));
vi.mock('../../../src/server/sessions/sources-repo', () => ({
  listSessionSources: mocks.listSessionSources,
}));
vi.mock('../../../src/server/sessions/critique-repo', () => ({
  createCritiqueRound: mocks.createCritiqueRound,
}));
vi.mock('../../../src/server/sessions/claims-repo', () => ({
  insertClaim: mocks.insertClaim,
  findClaimBySpanHash: mocks.findClaimBySpanHash,
  insertClaimVerdict: mocks.insertClaimVerdict,
  insertClaimEvidence: mocks.insertClaimEvidence,
}));
vi.mock('../../../src/server/events/bus', () => ({ emitEvent: mocks.emitEvent }));
vi.mock('../../../src/server/pipeline/stages/extract-claims', () => ({
  extractClaims: { run: mocks.extractClaimsRun },
}));
vi.mock('../../../src/server/pipeline/stages/verify-claim', () => ({
  verifyClaim: { run: mocks.verifyClaimRun },
}));
vi.mock('../../../src/server/pipeline/stages/adjudicate-claim', () => ({
  adjudicateClaim: { run: mocks.adjudicateClaimRun },
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
  name: 'Test profile',
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

const acceptedSource = {
  id: 1,
  sessionId: 1,
  status: 'accepted' as const,
  url: 'https://example.com',
  title: 'Example',
  summary: 'Summary',
  rawExcerpt: 'Excerpt',
  query: 'q',
  createdAt: new Date(),
};

const highClaim = {
  span: { sectionId: 'intro', charStart: 0, charEnd: 30, text: 'Claude reduces token costs by 90%' },
  claimType: 'statistic' as const,
  checkWorthiness: 'high' as const,
};

const lowClaim = {
  span: { sectionId: 'body', charStart: 0, charEnd: 20, text: 'AI is a popular topic' },
  claimType: 'other' as const,
  checkWorthiness: 'low' as const,
};

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    userId: 1,
    profileId: 1,
    plan,
    draftMd: '# Intro\nHello.',
    activeCritics: { enabledIds: [], custom: [] },
    mode: 'write',
    ...overrides,
  };
}

function setupHappyPath() {
  mocks.getProfile.mockResolvedValue(profile);
  mocks.listSectionDrafts.mockResolvedValue(sectionDrafts);
  mocks.listSessionSources.mockResolvedValue([acceptedSource]);
  mocks.createCritiqueRound.mockResolvedValue({ id: 99, sessionId: 1, kind: 'factcheck', draftHash: 'abc' });
  mocks.emitEvent.mockResolvedValue(undefined);
  mocks.insertClaim.mockImplementation(async (_uid, _sid, _rid, fields) => ({
    id: Math.random(),
    sessionId: 1,
    roundId: 99,
    status: 'open',
    ...fields,
  }));
  mocks.insertClaimVerdict.mockImplementation(async (_uid, claimId, fields) => ({
    id: Math.random(),
    claimId,
    ...fields,
  }));
  mocks.insertClaimEvidence.mockResolvedValue([]);
  mocks.findClaimBySpanHash.mockResolvedValue(null);
  mocks.verifyClaimRun.mockResolvedValue({ evidence: [], cached: false });
  mocks.adjudicateClaimRun.mockResolvedValue({
    verdict: 'verified',
    justification: 'matches evidence',
    citationUrls: [],
  });
}

afterEach(() => vi.clearAllMocks());

describe('runFactCheck', () => {
  it('returns session_invalid when session not found', async () => {
    mocks.getSession.mockResolvedValue(null);
    const { runFactCheck } = await import('../../../src/server/pipeline/run-fact-check');
    const result = await runFactCheck({ sessionId: 1, userId: 1 });
    expect(result).toEqual({ ok: false, error: 'session_invalid' });
  });

  it('returns session_invalid when plan parse fails', async () => {
    mocks.getSession.mockResolvedValue(makeSession({ plan: null }));
    const { runFactCheck } = await import('../../../src/server/pipeline/run-fact-check');
    const result = await runFactCheck({ sessionId: 1, userId: 1 });
    expect(result).toEqual({ ok: false, error: 'session_invalid' });
  });

  it('returns session_invalid when profile not found', async () => {
    mocks.getSession.mockResolvedValue(makeSession());
    mocks.getProfile.mockResolvedValue(null);
    const { runFactCheck } = await import('../../../src/server/pipeline/run-fact-check');
    const result = await runFactCheck({ sessionId: 1, userId: 1 });
    expect(result).toEqual({ ok: false, error: 'session_invalid' });
  });

  it('returns no_draft when draftMd is empty', async () => {
    mocks.getSession.mockResolvedValue(makeSession({ draftMd: '' }));
    mocks.getProfile.mockResolvedValue(profile);
    const { runFactCheck } = await import('../../../src/server/pipeline/run-fact-check');
    const result = await runFactCheck({ sessionId: 1, userId: 1 });
    expect(result).toEqual({ ok: false, error: 'no_draft' });
    expect(mocks.extractClaimsRun).not.toHaveBeenCalled();
  });

  it('creates factcheck round with spanHash of draftMd', async () => {
    mocks.getSession.mockResolvedValue(makeSession());
    mocks.extractClaimsRun.mockResolvedValue({ claims: [] });
    setupHappyPath();

    const { runFactCheck } = await import('../../../src/server/pipeline/run-fact-check');
    await runFactCheck({ sessionId: 1, userId: 1 });

    expect(mocks.createCritiqueRound).toHaveBeenCalledWith(
      1, 1, 'factcheck', expect.any(String),
    );
  });

  it('passes only accepted sources to verifyClaim', async () => {
    const rejectedSource = { ...acceptedSource, id: 2, status: 'rejected' as const };
    mocks.getSession.mockResolvedValue(makeSession());
    mocks.listSessionSources.mockResolvedValue([acceptedSource, rejectedSource]);
    mocks.extractClaimsRun.mockResolvedValue({ claims: [highClaim] });
    setupHappyPath();
    mocks.listSessionSources.mockResolvedValue([acceptedSource, rejectedSource]);

    const { runFactCheck } = await import('../../../src/server/pipeline/run-fact-check');
    await runFactCheck({ sessionId: 1, userId: 1 });

    const verifyCall = mocks.verifyClaimRun.mock.calls[0] as [{ acceptedSources: unknown[] }];
    expect(verifyCall[0].acceptedSources).toHaveLength(1);
    expect(verifyCall[0].acceptedSources[0]).toMatchObject({ id: 1 });
  });

  it('inserts claim and runs verify+adjudicate for high-worthiness claim', async () => {
    mocks.getSession.mockResolvedValue(makeSession());
    mocks.extractClaimsRun.mockResolvedValue({ claims: [highClaim] });
    setupHappyPath();

    const { runFactCheck } = await import('../../../src/server/pipeline/run-fact-check');
    const result = await runFactCheck({ sessionId: 1, userId: 1 });

    expect(mocks.insertClaim).toHaveBeenCalledTimes(1);
    expect(mocks.verifyClaimRun).toHaveBeenCalledTimes(1);
    expect(mocks.adjudicateClaimRun).toHaveBeenCalledTimes(1);
    expect(mocks.insertClaimVerdict).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ ok: true, roundId: 99, claimCount: 1, verdictCount: 1 });
  });

  it('inserts claim but skips verify+adjudicate for low-worthiness claim', async () => {
    mocks.getSession.mockResolvedValue(makeSession());
    mocks.extractClaimsRun.mockResolvedValue({ claims: [lowClaim] });
    setupHappyPath();

    const { runFactCheck } = await import('../../../src/server/pipeline/run-fact-check');
    const result = await runFactCheck({ sessionId: 1, userId: 1 });

    expect(mocks.insertClaim).toHaveBeenCalledTimes(1);
    expect(mocks.verifyClaimRun).not.toHaveBeenCalled();
    expect(mocks.adjudicateClaimRun).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: true, claimCount: 1, verdictCount: 0 });
  });

  it('emits artifact_updated per verdict and final factcheck_round emit', async () => {
    mocks.getSession.mockResolvedValue(makeSession());
    mocks.extractClaimsRun.mockResolvedValue({ claims: [highClaim] });
    setupHappyPath();

    const { runFactCheck } = await import('../../../src/server/pipeline/run-fact-check');
    await runFactCheck({ sessionId: 1, userId: 1 });

    const emitCalls = mocks.emitEvent.mock.calls as Array<[number, string, unknown]>;
    const claimVerdictEmit = emitCalls.find(
      ([, kind, p]) => kind === 'artifact_updated' && (p as { kind: string }).kind === 'claim_verdict',
    );
    expect(claimVerdictEmit).toBeDefined();

    const roundEmit = emitCalls.find(
      ([, kind, p]) => kind === 'artifact_updated' && (p as { kind: string }).kind === 'factcheck_round',
    );
    expect(roundEmit).toBeDefined();
    expect(roundEmit![2]).toMatchObject({ kind: 'factcheck_round', roundId: 99, claimCount: 1, verdictCount: 1 });
  });

  it('skips claim when !force and findClaimBySpanHash returns row with verdict', async () => {
    mocks.getSession.mockResolvedValue(makeSession());
    mocks.extractClaimsRun.mockResolvedValue({ claims: [highClaim] });
    setupHappyPath();
    mocks.findClaimBySpanHash.mockResolvedValue({
      claim: { id: 7, spanHash: 'abc' },
      verdict: { id: 3, verdict: 'verified' },
    });

    const { runFactCheck } = await import('../../../src/server/pipeline/run-fact-check');
    const result = await runFactCheck({ sessionId: 1, userId: 1, force: false });

    expect(mocks.insertClaim).not.toHaveBeenCalled();
    expect(mocks.verifyClaimRun).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: true, claimCount: 0, verdictCount: 0 });

    const progressEmit = (mocks.emitEvent.mock.calls as Array<[number, string, unknown]>).find(
      ([, kind]) => kind === 'task_progress',
    );
    expect(progressEmit).toBeDefined();
    expect(progressEmit![2]).toMatchObject({ stage: 'fact_check' });
  });

  it('re-runs claim when force=true even if findClaimBySpanHash returns row with verdict', async () => {
    mocks.getSession.mockResolvedValue(makeSession());
    mocks.extractClaimsRun.mockResolvedValue({ claims: [highClaim] });
    setupHappyPath();
    mocks.findClaimBySpanHash.mockResolvedValue({
      claim: { id: 7 },
      verdict: { id: 3, verdict: 'verified' },
    });

    const { runFactCheck } = await import('../../../src/server/pipeline/run-fact-check');
    const result = await runFactCheck({ sessionId: 1, userId: 1, force: true });

    expect(mocks.insertClaim).toHaveBeenCalledTimes(1);
    expect(mocks.verifyClaimRun).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ ok: true, claimCount: 1, verdictCount: 1 });
  });
});

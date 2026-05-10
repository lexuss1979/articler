import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  listSessionSources: vi.fn(),
  getClaimWithLatestVerdict: vi.fn(),
  insertClaimVerdict: vi.fn(),
  insertClaimEvidence: vi.fn(),
  emitEvent: vi.fn(),
  verifyClaimRun: vi.fn(),
  adjudicateClaimRun: vi.fn(),
  withStageCtx: vi.fn(),
}));

vi.mock('../../../src/server/sessions/repo', () => ({ getSession: mocks.getSession }));
vi.mock('../../../src/server/sessions/sources-repo', () => ({
  listSessionSources: mocks.listSessionSources,
}));
vi.mock('../../../src/server/sessions/claims-repo', () => ({
  getClaimWithLatestVerdict: mocks.getClaimWithLatestVerdict,
  insertClaimVerdict: mocks.insertClaimVerdict,
  insertClaimEvidence: mocks.insertClaimEvidence,
  insertClaim: vi.fn(),
  findClaimBySpanHash: vi.fn(),
}));
vi.mock('../../../src/server/events/bus', () => ({ emitEvent: mocks.emitEvent }));
vi.mock('../../../src/server/pipeline/stages/verify-claim', () => ({
  verifyClaim: { name: 'verify_claim', run: mocks.verifyClaimRun },
}));
vi.mock('../../../src/server/pipeline/stages/adjudicate-claim', () => ({
  adjudicateClaim: { name: 'adjudicate_claim', run: mocks.adjudicateClaimRun },
}));
vi.mock('../../../src/server/pipeline/with-stage-ctx', () => ({
  withStageCtx: mocks.withStageCtx,
}));

const session = {
  id: 10,
  userId: 1,
  profileId: 1,
  draftMd: 'draft content',
  state: 'done',
  mode: 'light',
};

const acceptedSource = {
  id: 1,
  sessionId: 10,
  status: 'accepted' as const,
  url: 'https://example.com',
  title: 'Example',
  summary: 'Summary',
  rawExcerpt: 'Excerpt',
  query: 'q',
  createdAt: new Date(),
};

const claimRow = {
  id: 5,
  sessionId: 10,
  roundId: 99,
  spanHash: 'abc',
  claimText: 'Some claim text',
  claimType: 'statistic',
  checkWorthiness: 'high',
  span: { sectionId: 'full', charStart: 0, charEnd: 10, text: 'Some claim' },
  status: 'open',
  createdAt: new Date(),
};

const verdictRow = {
  id: 20,
  claimId: 5,
  verdict: 'verified',
  justification: 'Confirmed by sources.',
  createdAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue(session);
  mocks.listSessionSources.mockResolvedValue([acceptedSource]);
  mocks.getClaimWithLatestVerdict.mockResolvedValue({ claim: claimRow, verdict: null });
  mocks.insertClaimVerdict.mockResolvedValue(verdictRow);
  mocks.insertClaimEvidence.mockResolvedValue([]);
  mocks.emitEvent.mockResolvedValue(undefined);
  mocks.withStageCtx.mockImplementation(
    (_stage: unknown, _sid: unknown, _uid: unknown, fn: () => unknown) => fn(),
  );
  mocks.verifyClaimRun.mockResolvedValue({ evidence: [], cached: false });
  mocks.adjudicateClaimRun.mockResolvedValue({
    verdict: 'verified',
    justification: 'Confirmed by sources.',
    citationUrls: [],
  });
});

afterEach(() => vi.clearAllMocks());

describe('verifyExistingClaim', () => {
  it('returns claim_not_found when getClaimWithLatestVerdict returns null', async () => {
    mocks.getClaimWithLatestVerdict.mockResolvedValue(null);
    const { verifyExistingClaim } = await import('../../../src/server/pipeline/run-fact-check');
    const result = await verifyExistingClaim({ sessionId: 10, userId: 1, claimId: 5 });
    expect(result).toEqual({ ok: false, error: 'claim_not_found' });
    expect(mocks.verifyClaimRun).not.toHaveBeenCalled();
    expect(mocks.adjudicateClaimRun).not.toHaveBeenCalled();
  });

  it('returns claim_not_found when claim.sessionId differs from argument sessionId', async () => {
    mocks.getClaimWithLatestVerdict.mockResolvedValue({
      claim: { ...claimRow, sessionId: 999 },
      verdict: null,
    });
    const { verifyExistingClaim } = await import('../../../src/server/pipeline/run-fact-check');
    const result = await verifyExistingClaim({ sessionId: 10, userId: 1, claimId: 5 });
    expect(result).toEqual({ ok: false, error: 'claim_not_found' });
    expect(mocks.verifyClaimRun).not.toHaveBeenCalled();
  });

  it('returns already_verified when verdict exists and force is falsey', async () => {
    mocks.getClaimWithLatestVerdict.mockResolvedValue({
      claim: claimRow,
      verdict: verdictRow,
    });
    const { verifyExistingClaim } = await import('../../../src/server/pipeline/run-fact-check');
    const result = await verifyExistingClaim({ sessionId: 10, userId: 1, claimId: 5 });
    expect(result).toEqual({ ok: false, error: 'already_verified' });
    expect(mocks.verifyClaimRun).not.toHaveBeenCalled();
  });

  it('re-runs and returns ok when force: true with existing verdict', async () => {
    mocks.getClaimWithLatestVerdict.mockResolvedValue({
      claim: claimRow,
      verdict: verdictRow,
    });
    const { verifyExistingClaim } = await import('../../../src/server/pipeline/run-fact-check');
    const result = await verifyExistingClaim({ sessionId: 10, userId: 1, claimId: 5, force: true });
    expect(result).toEqual({ ok: true, verdict: 'verified' });
    expect(mocks.verifyClaimRun).toHaveBeenCalledOnce();
  });

  it('full success: insertClaimVerdict and insertClaimEvidence called once, artifact_updated emitted with verdict', async () => {
    const { verifyExistingClaim } = await import('../../../src/server/pipeline/run-fact-check');
    const result = await verifyExistingClaim({ sessionId: 10, userId: 1, claimId: 5 });

    expect(mocks.insertClaimVerdict).toHaveBeenCalledOnce();
    expect(mocks.insertClaimEvidence).toHaveBeenCalledOnce();

    const emitCalls = mocks.emitEvent.mock.calls as Array<[number, string, unknown]>;
    const verdictEmit = emitCalls.find(
      ([, kind, p]) => kind === 'artifact_updated' && (p as { kind: string }).kind === 'claim_verdict',
    );
    expect(verdictEmit).toBeDefined();
    expect(verdictEmit![2]).toMatchObject({ kind: 'claim_verdict', claimId: 5, verdict: 'verified' });

    expect(result).toEqual({ ok: true, verdict: 'verified' });
  });

  it('calls withStageCtx twice — once for verifyClaim and once for adjudicateClaim', async () => {
    const { verifyExistingClaim } = await import('../../../src/server/pipeline/run-fact-check');
    await verifyExistingClaim({ sessionId: 10, userId: 1, claimId: 5 });

    expect(mocks.withStageCtx).toHaveBeenCalledTimes(2);
    const stageNames = (mocks.withStageCtx.mock.calls as Array<[{ name: string }, ...unknown[]]>).map(
      ([stage]) => stage.name,
    );
    expect(stageNames).toContain('verify_claim');
    expect(stageNames).toContain('adjudicate_claim');
  });
});

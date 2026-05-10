import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  createCritiqueRound: vi.fn(),
  insertClaim: vi.fn(),
  emitEvent: vi.fn(),
  extractClaimsRun: vi.fn(),
  withStageCtx: vi.fn(),
}));

vi.mock('../../../src/server/sessions/repo', () => ({ getSession: mocks.getSession }));
vi.mock('../../../src/server/sessions/critique-repo', () => ({
  createCritiqueRound: mocks.createCritiqueRound,
}));
vi.mock('../../../src/server/sessions/claims-repo', () => ({
  insertClaim: mocks.insertClaim,
}));
vi.mock('../../../src/server/events/bus', () => ({ emitEvent: mocks.emitEvent }));
vi.mock('../../../src/server/pipeline/stages/extract-claims', () => ({
  extractClaims: { name: 'extract_claims', run: mocks.extractClaimsRun },
}));
vi.mock('../../../src/server/pipeline/with-stage-ctx', () => ({
  withStageCtx: mocks.withStageCtx,
}));

const plan = {
  thesis: 'Test thesis.',
  targetTakeaway: 'Test takeaway.',
  sections: [
    { id: 'intro', title: 'Introduction', intent: 'Hook the reader.', keyPoints: ['x'], expectedLength: 200 },
    { id: 'body', title: 'Main Content', intent: 'Explain the topic.', keyPoints: ['y'], expectedLength: 800 },
  ],
};

const session = {
  id: 10,
  userId: 1,
  profileId: 1,
  plan,
  draftMd: 'draft content',
  state: 'review',
  mode: 'light',
};

const revisedMd = 'hello world article text';

const claim = {
  span: { sectionId: 'full', charStart: 0, charEnd: 5, text: 'hello' },
  claimType: 'other' as const,
  checkWorthiness: 'low' as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue(session);
  mocks.createCritiqueRound.mockResolvedValue({ id: 99, sessionId: 10, kind: 'auto_review', draftHash: 'abc' });
  mocks.emitEvent.mockResolvedValue(undefined);
  mocks.insertClaim.mockResolvedValue({ id: 1, roundId: 99 });
  mocks.withStageCtx.mockImplementation(
    (_stage: unknown, _sid: unknown, _uid: unknown, fn: () => unknown) => fn(),
  );
  mocks.extractClaimsRun.mockResolvedValue({ claims: [claim] });
});

afterEach(() => vi.clearAllMocks());

describe('runLightClaimsExtraction', () => {
  it('returns session_invalid when getSession returns null and does not call extractClaims.run', async () => {
    mocks.getSession.mockResolvedValue(null);
    const { runLightClaimsExtraction } = await import(
      '../../../src/server/pipeline/run-light-claims-extraction'
    );
    const result = await runLightClaimsExtraction({ sessionId: 10, userId: 1, revisedMd });
    expect(result).toEqual({ ok: false, error: 'session_invalid' });
    expect(mocks.extractClaimsRun).not.toHaveBeenCalled();
  });

  it('returns no_plan when session.plan fails planSchema.safeParse', async () => {
    mocks.getSession.mockResolvedValue({ ...session, plan: null });
    const { runLightClaimsExtraction } = await import(
      '../../../src/server/pipeline/run-light-claims-extraction'
    );
    const result = await runLightClaimsExtraction({ sessionId: 10, userId: 1, revisedMd });
    expect(result).toEqual({ ok: false, error: 'no_plan' });
    expect(mocks.extractClaimsRun).not.toHaveBeenCalled();
  });

  it('returns session_invalid when createCritiqueRound returns null', async () => {
    mocks.createCritiqueRound.mockResolvedValue(null);
    const { runLightClaimsExtraction } = await import(
      '../../../src/server/pipeline/run-light-claims-extraction'
    );
    const result = await runLightClaimsExtraction({ sessionId: 10, userId: 1, revisedMd });
    expect(result).toEqual({ ok: false, error: 'session_invalid' });
    expect(mocks.extractClaimsRun).not.toHaveBeenCalled();
  });

  it('full success path: insertClaim called with roundId 99 and correct spanHash, artifact_updated emitted, result ok', async () => {
    const { runLightClaimsExtraction } = await import(
      '../../../src/server/pipeline/run-light-claims-extraction'
    );
    const { spanHash } = await import('../../../src/server/sessions/claims');
    const result = await runLightClaimsExtraction({ sessionId: 10, userId: 1, revisedMd });

    expect(mocks.insertClaim).toHaveBeenCalledOnce();
    const [uid, sid, rid, fields] = mocks.insertClaim.mock.calls[0] as [
      number,
      number,
      number,
      { spanHash: string; claimText: string },
    ];
    expect(uid).toBe(1);
    expect(sid).toBe(10);
    expect(rid).toBe(99);
    expect(fields.spanHash).toBe(spanHash('hello'));
    expect(fields.claimText).toBe('hello');

    const emitCalls = mocks.emitEvent.mock.calls as Array<[number, string, unknown]>;
    const artifactEmit = emitCalls.find(
      ([, kind, p]) => kind === 'artifact_updated' && (p as { kind: string }).kind === 'claims_extracted',
    );
    expect(artifactEmit).toBeDefined();
    expect(artifactEmit![2]).toMatchObject({ kind: 'claims_extracted', count: 1, roundId: 99 });

    expect(result).toEqual({ ok: true, roundId: 99, count: 1 });
  });

  it('calls withStageCtx with extractClaims stage, sessionId, and userId', async () => {
    const { runLightClaimsExtraction } = await import(
      '../../../src/server/pipeline/run-light-claims-extraction'
    );
    await runLightClaimsExtraction({ sessionId: 10, userId: 1, revisedMd });

    expect(mocks.withStageCtx).toHaveBeenCalledOnce();
    const [stage, sid, uid] = mocks.withStageCtx.mock.calls[0] as [
      { name: string },
      number,
      number,
      unknown,
    ];
    expect(stage.name).toBe('extract_claims');
    expect(sid).toBe(10);
    expect(uid).toBe(1);
  });

  it('passes sectionDrafts with sectionId full and revisedMd as contentMd to extractClaims.run', async () => {
    const { runLightClaimsExtraction } = await import(
      '../../../src/server/pipeline/run-light-claims-extraction'
    );
    await runLightClaimsExtraction({ sessionId: 10, userId: 1, revisedMd });

    const [input] = mocks.extractClaimsRun.mock.calls[0] as [
      { sectionDrafts: Array<{ sectionId: string; contentMd: string }> },
    ];
    expect(input.sectionDrafts).toEqual([{ sectionId: 'full', contentMd: revisedMd }]);
  });
});

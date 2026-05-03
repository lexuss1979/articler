import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRouteJsonChat = vi.fn();

vi.mock('../../../src/server/llm/structured', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/server/llm/structured')>();
  return { ...actual, routeJsonChat: mockRouteJsonChat };
});

function makeCtx() {
  const emitted: Array<[string, unknown]> = [];
  return {
    emit: vi.fn(async (kind: string, payload: unknown) => {
      emitted.push([kind, payload]);
      return { id: 1, sessionId: 1, kind, payload, ts: new Date() };
    }),
    userInput: vi.fn(),
    log: { append: vi.fn() },
    llm: {} as never,
    _emitted: emitted,
  };
}

const claim = {
  span: {
    sectionId: 'intro',
    charStart: 0,
    charEnd: 30,
    text: 'Claude reduces token costs by 90%',
  },
  claimType: 'statistic' as const,
  checkWorthiness: 'high' as const,
};

const evidence = [
  { url: 'https://x.test', snippet: 'Claude reduces costs.', supports: true },
  { url: 'https://y.test', snippet: 'Benchmarks show 90% reduction.', supports: true },
];

function makeAdjudicationResult(
  verdict: 'verified' | 'contradicted' | 'unverifiable' | 'needs_caveat',
) {
  return {
    result: { verdict, justification: 'matches evidence', citationUrls: ['https://x.test'] },
    modelUsed: 'claude-sonnet',
    modelClass: 'smart' as const,
    promptTokens: 100,
    completionTokens: 100,
    latencyMs: 400,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('adjudicateClaim stage', () => {
  it('returns verdict from routeJsonChat', async () => {
    mockRouteJsonChat.mockResolvedValue(makeAdjudicationResult('verified'));
    const { adjudicateClaim } = await import(
      '../../../src/server/pipeline/stages/adjudicate-claim'
    );
    const ctx = makeCtx();
    const result = await adjudicateClaim.run({ claim, evidence }, ctx);

    expect(result.verdict).toBe('verified');
    expect(result.justification).toBe('matches evidence');
    expect(result.citationUrls).toContain('https://x.test');
  });

  it('emits task_started then task_completed with verdict', async () => {
    mockRouteJsonChat.mockResolvedValue(makeAdjudicationResult('verified'));
    const { adjudicateClaim } = await import(
      '../../../src/server/pipeline/stages/adjudicate-claim'
    );
    const ctx = makeCtx();
    await adjudicateClaim.run({ claim, evidence }, ctx);

    expect(ctx._emitted.map(([k]) => k)).toEqual(['task_started', 'task_completed']);
    expect(ctx._emitted[0][1]).toMatchObject({ stage: 'adjudicate_claim' });
    expect(ctx._emitted[1][1]).toMatchObject({ stage: 'adjudicate_claim', verdict: 'verified' });
  });

  it('user prompt contains claim text and evidence URL', async () => {
    mockRouteJsonChat.mockResolvedValue(makeAdjudicationResult('verified'));
    const { adjudicateClaim } = await import(
      '../../../src/server/pipeline/stages/adjudicate-claim'
    );
    const ctx = makeCtx();
    await adjudicateClaim.run({ claim, evidence }, ctx);

    const callArgs = mockRouteJsonChat.mock.calls[0][0] as { user: string };
    expect(callArgs.user).toContain(claim.span.text);
    expect(callArgs.user).toContain('https://x.test');
  });

  it('returns unverifiable without calling routeJsonChat when evidence is empty', async () => {
    const { adjudicateClaim } = await import(
      '../../../src/server/pipeline/stages/adjudicate-claim'
    );
    const ctx = makeCtx();
    const result = await adjudicateClaim.run({ claim, evidence: [] }, ctx);

    expect(result.verdict).toBe('unverifiable');
    expect(result.justification).toBe('No evidence available.');
    expect(result.citationUrls).toEqual([]);
    expect(mockRouteJsonChat).not.toHaveBeenCalled();
  });

  it('still emits task_started and task_completed for no-evidence path', async () => {
    const { adjudicateClaim } = await import(
      '../../../src/server/pipeline/stages/adjudicate-claim'
    );
    const ctx = makeCtx();
    await adjudicateClaim.run({ claim, evidence: [] }, ctx);

    expect(ctx._emitted.map(([k]) => k)).toEqual(['task_started', 'task_completed']);
    expect(ctx._emitted[1][1]).toMatchObject({ verdict: 'unverifiable' });
  });
});

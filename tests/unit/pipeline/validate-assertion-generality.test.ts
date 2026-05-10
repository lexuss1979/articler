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

function makeResult(results: object[]) {
  return {
    result: { results },
    modelUsed: 'claude-haiku',
    modelClass: 'fast' as const,
    promptTokens: 50,
    completionTokens: 30,
    latencyMs: 200,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('validateAssertionGenerality stage', () => {
  it('returns both verdicts in the same order as input', async () => {
    const items = [
      {
        key: 'structure_historical_intro',
        category: 'structure',
        assertion: 'author opens articles with a short historical context',
      },
      {
        key: 'scope_ladder_safety',
        category: 'scope',
        assertion: 'user wants ladder safety section',
      },
    ];
    const results = [
      { key: 'structure_historical_intro', passes: true, reason: 'general structural preference' },
      { key: 'scope_ladder_safety', passes: false, reason: 'topic-bound to ladders' },
    ];
    mockRouteJsonChat.mockResolvedValue(makeResult(results));

    const { validateAssertionGenerality } = await import(
      '../../../src/server/pipeline/stages/validate-assertion-generality'
    );
    const ctx = makeCtx();
    const out = await validateAssertionGenerality.run({ items }, ctx);

    expect(out.results).toEqual(results);
    expect(out.results[0]!.key).toBe('structure_historical_intro');
    expect(out.results[1]!.key).toBe('scope_ladder_safety');
  });

  it('emits task_started then task_completed with correct stage and count', async () => {
    mockRouteJsonChat.mockResolvedValue(makeResult([]));

    const { validateAssertionGenerality } = await import(
      '../../../src/server/pipeline/stages/validate-assertion-generality'
    );
    const ctx = makeCtx();
    await validateAssertionGenerality.run({ items: [] }, ctx);

    expect(ctx._emitted.map(([k]) => k)).toEqual(['task_started', 'task_completed']);
    expect(ctx._emitted[0][1]).toMatchObject({ stage: 'validate_assertion_generality' });
    expect(ctx._emitted[1][1]).toMatchObject({ stage: 'validate_assertion_generality', count: 0 });
  });

  it('calls routeJsonChat with class fast', async () => {
    mockRouteJsonChat.mockResolvedValue(makeResult([]));

    const { validateAssertionGenerality } = await import(
      '../../../src/server/pipeline/stages/validate-assertion-generality'
    );
    const ctx = makeCtx();
    await validateAssertionGenerality.run({ items: [] }, ctx);

    expect(mockRouteJsonChat.mock.calls[0][0]).toMatchObject({ class: 'fast' });
  });

  it('system prompt contains the four mandatory example pairs and the verdict question', async () => {
    mockRouteJsonChat.mockResolvedValue(makeResult([]));

    const { validateAssertionGenerality } = await import(
      '../../../src/server/pipeline/stages/validate-assertion-generality'
    );
    const ctx = makeCtx();
    await validateAssertionGenerality.run({ items: [] }, ctx);

    const system: string = mockRouteJsonChat.mock.calls[0][0].system;
    expect(system).toContain('Would this assertion still hold');
    expect(system).toContain('scope_ladder_safety');
    expect(system).toContain('scope_includes_safety');
    expect(system).toContain('custom_mustache_history');
    expect(system).toContain('structure_historical_intro');
    expect(system).toContain('tone_dry_about_lasers');
    expect(system).toContain('tone_dry_humour');
    expect(system).toContain('audience_assumes_firefighters');
    expect(system).toContain('audience_assumes_practitioners');
  });
});

describe('validateAssertionGenerality outputSchema', () => {
  it('rejects a result missing passes', async () => {
    const { validateAssertionGeneralityOutputSchema } = await import(
      '../../../src/server/pipeline/stages/validate-assertion-generality'
    );
    const result = validateAssertionGeneralityOutputSchema.safeParse({
      results: [{ key: 'foo', reason: 'x' }],
    });
    expect(result.success).toBe(false);
  });

  it('accepts a valid results entry', async () => {
    const { validateAssertionGeneralityOutputSchema } = await import(
      '../../../src/server/pipeline/stages/validate-assertion-generality'
    );
    const result = validateAssertionGeneralityOutputSchema.safeParse({
      results: [{ key: 'foo', passes: true, reason: 'general' }],
    });
    expect(result.success).toBe(true);
  });
});

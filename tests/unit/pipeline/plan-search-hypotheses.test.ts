import { describe, expect, it, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const mockRouteJsonChat = vi.fn();

vi.mock('../../../src/server/llm/structured', () => ({
  routeJsonChat: mockRouteJsonChat,
}));

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

const profile = {
  id: 1,
  userId: 1,
  name: 'Tech Blog',
  format: 'long_read',
  style: 'Technical, precise',
  audience: 'Software engineers',
  targetVolumeMin: 2000,
  targetVolumeMax: 4000,
  markupRules: {},
  extraPrompt: '',
  createdAt: new Date(),
};

const plan = {
  thesis: 'Prompt caching reduces LLM costs significantly.',
  targetTakeaway: 'Readers will implement prompt caching in their apps.',
  sections: [
    {
      id: 'intro',
      title: 'Introduction',
      intent: 'Set the context',
      expectedLength: 400,
      keyPoints: ['what is prompt caching'],
    },
    {
      id: 'benchmarks',
      title: 'Benchmarks',
      intent: 'Show cost savings',
      expectedLength: 800,
      keyPoints: ['token savings', 'latency impact'],
    },
  ],
};

const hypothesesResult = {
  hypotheses: [
    { id: 'h-1', sectionId: 'intro', text: 'Caching reduces costs by 50%', evidenceKind: 'statistic' },
    { id: 'h-2', sectionId: 'intro', text: 'Experts recommend caching', evidenceKind: 'expert_quote' },
    { id: 'h-3', sectionId: 'benchmarks', text: 'Latency drops with cache hits', evidenceKind: 'case_study' },
  ],
};

beforeEach(() => vi.clearAllMocks());

describe('planSearchHypotheses stage', () => {
  it('emits task_started and task_completed in order, returns hypotheses', async () => {
    mockRouteJsonChat.mockResolvedValue({
      result: hypothesesResult,
      modelUsed: 'claude',
      modelClass: 'smart',
      promptTokens: 20,
      completionTokens: 50,
      latencyMs: 120,
    });

    const { planSearchHypotheses } = await import(
      '../../../src/server/pipeline/stages/plan-search-hypotheses'
    );
    const ctx = makeCtx();
    const result = await planSearchHypotheses.run({ plan, profile }, ctx);

    expect(result).toEqual(hypothesesResult);
    expect(ctx._emitted.map(([k]) => k)).toEqual(['task_started', 'task_completed']);
    expect(ctx._emitted[1][1]).toMatchObject({ count: 3 });
  });

  it('calls routeJsonChat with class smart', async () => {
    mockRouteJsonChat.mockResolvedValue({
      result: hypothesesResult,
      modelUsed: 'claude',
      modelClass: 'smart',
      promptTokens: 20,
      completionTokens: 50,
      latencyMs: 120,
    });

    const { planSearchHypotheses } = await import(
      '../../../src/server/pipeline/stages/plan-search-hypotheses'
    );
    const ctx = makeCtx();
    await planSearchHypotheses.run({ plan, profile }, ctx);

    expect(mockRouteJsonChat).toHaveBeenCalledWith(
      expect.objectContaining({ class: 'smart' }),
    );
  });

  it('throws OrphanHypothesisError when a hypothesis references an unknown sectionId', async () => {
    mockRouteJsonChat.mockResolvedValue({
      result: {
        hypotheses: [
          { id: 'h-1', sectionId: 'nonexistent-section', text: 'test', evidenceKind: 'statistic' },
        ],
      },
      modelUsed: 'claude',
      modelClass: 'smart',
      promptTokens: 10,
      completionTokens: 10,
      latencyMs: 80,
    });

    const { planSearchHypotheses, OrphanHypothesisError } = await import(
      '../../../src/server/pipeline/stages/plan-search-hypotheses'
    );
    const ctx = makeCtx();
    await expect(planSearchHypotheses.run({ plan, profile }, ctx)).rejects.toBeInstanceOf(
      OrphanHypothesisError,
    );
  });

  it('does not emit task_completed when OrphanHypothesisError is thrown', async () => {
    mockRouteJsonChat.mockResolvedValue({
      result: {
        hypotheses: [
          { id: 'h-1', sectionId: 'ghost', text: 'test', evidenceKind: 'statistic' },
        ],
      },
      modelUsed: 'claude',
      modelClass: 'smart',
      promptTokens: 10,
      completionTokens: 10,
      latencyMs: 80,
    });

    const { planSearchHypotheses } = await import(
      '../../../src/server/pipeline/stages/plan-search-hypotheses'
    );
    const ctx = makeCtx();
    await planSearchHypotheses.run({ plan, profile }, ctx).catch(() => {});

    const kinds = ctx._emitted.map(([k]) => k);
    expect(kinds).not.toContain('task_completed');
  });
});

describe('planSearchHypotheses stage — fixture: habr-longread-1', () => {
  it('returns expected.snapshot unchanged when routeJsonChat returns it', async () => {
    type Fixture = {
      input: { plan: unknown; profile: { createdAt: string } & Record<string, unknown> };
      expected: { snapshot: unknown };
    };
    const fixture = JSON.parse(
      readFileSync(
        join(__dirname, '../../eval/fixtures/plan_search_hypotheses/habr-longread-1.json'),
        'utf8',
      ),
    ) as Fixture;

    mockRouteJsonChat.mockResolvedValue({
      result: fixture.expected.snapshot,
      modelUsed: 'claude',
      modelClass: 'smart',
      promptTokens: 10,
      completionTokens: 20,
      latencyMs: 100,
    });

    const { planSearchHypotheses } = await import(
      '../../../src/server/pipeline/stages/plan-search-hypotheses'
    );
    const ctx = makeCtx();
    const input = {
      plan: fixture.input.plan,
      profile: { ...fixture.input.profile, createdAt: new Date(fixture.input.profile.createdAt) },
    };
    const result = await planSearchHypotheses.run(input as Parameters<typeof planSearchHypotheses.run>[0], ctx);
    expect(result).toEqual(fixture.expected.snapshot);
  });
});

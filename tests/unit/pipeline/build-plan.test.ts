import { describe, expect, it, vi, beforeEach } from 'vitest';

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

const profile = {
  id: 1,
  userId: 1,
  name: 'Habr longread',
  format: 'long_read',
  style: 'Technical',
  audience: 'Software engineers',
  targetVolumeMin: 2000,
  targetVolumeMax: 4000,
  markupRules: {},
  extraPrompt: '',
  createdAt: new Date(),
};

const brief = { topic: 'Prompt caching', goal: '', notes: '', sourceArticles: [] };
const angle = { title: 'Deep Dive', methodology: 'deep_dive', rationale: 'Technical readers want depth.' };

const validPlan = {
  thesis: 'Prompt caching can reduce costs by 90%.',
  targetTakeaway: 'Readers will know when and how to cache.',
  sections: [
    { id: 'intro', title: 'Introduction', intent: 'Hook.', expectedLength: 300, keyPoints: ['Cost matters'] },
    { id: 'how', title: 'How It Works', intent: 'Explain TTL.', expectedLength: 700, keyPoints: ['5-minute TTL', 'Cache prefix'] },
  ],
};

beforeEach(() => vi.clearAllMocks());

describe('buildPlan stage', () => {
  it('returns the plan and emits task_started / task_completed in order', async () => {
    mockRouteJsonChat.mockResolvedValue({
      result: validPlan,
      modelUsed: 'claude',
      modelClass: 'smart',
      promptTokens: 20,
      completionTokens: 150,
      latencyMs: 400,
    });

    const { buildPlan } = await import('../../../src/server/pipeline/stages/build-plan');
    const ctx = makeCtx();
    const result = await buildPlan.run({ brief, profile, angle }, ctx);

    expect(result.sections).toHaveLength(2);
    expect(result.thesis).toBe('Prompt caching can reduce costs by 90%.');
    expect(ctx._emitted.map(([k]) => k)).toEqual(['task_started', 'task_completed']);
    expect(ctx._emitted[1][1]).toMatchObject({ sections: 2 });
  });

  it('propagates errors from routeJsonChat', async () => {
    mockRouteJsonChat.mockRejectedValue(new Error('LLM error'));

    const { buildPlan } = await import('../../../src/server/pipeline/stages/build-plan');
    const ctx = makeCtx();
    await expect(buildPlan.run({ brief, profile, angle }, ctx)).rejects.toThrow('LLM error');
  });
});

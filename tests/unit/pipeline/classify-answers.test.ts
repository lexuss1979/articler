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

const profile = {
  id: 1,
  userId: 42,
  name: 'Tech Blog',
  format: 'longread',
  style: 'conversational',
  audience: 'developers',
  targetVolumeMin: 1000,
  targetVolumeMax: 3000,
  markupRules: {},
  extraPrompt: '',
  lightResearchSources: 1,
  lightMaxWords: 800,
  createdAt: new Date('2024-01-01'),
};

const qa = [
  { question: 'What tone should the articles use?', answer: 'Conversational but professional.' },
];

const existingAssertions = [
  { key: 'tone_conversational', category: 'tone', assertion: 'Articles use a conversational tone.', confidence: 0.8, evidenceCount: 3 },
];

function makeResult(delta: object[]) {
  return {
    result: { delta },
    modelUsed: 'claude-haiku',
    modelClass: 'fast' as const,
    promptTokens: 50,
    completionTokens: 30,
    latencyMs: 200,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('classifyAnswers stage', () => {
  it('returns the model delta verbatim when valid', async () => {
    const delta = [{ kind: 'agree', key: 'tone_conversational' }];
    mockRouteJsonChat.mockResolvedValue(makeResult(delta));
    const { classifyAnswers } = await import('../../../src/server/pipeline/stages/classify-answers');
    const ctx = makeCtx();
    const result = await classifyAnswers.run({ profile, qa, existingAssertions }, ctx);

    expect(result).toEqual({ delta });
  });

  it('emits task_started then task_completed with correct stage and count', async () => {
    const delta = [
      { kind: 'agree', key: 'tone_conversational' },
      { kind: 'new', key: 'format_uses_code', category: 'format', assertion: 'Uses code blocks liberally.' },
    ];
    mockRouteJsonChat.mockResolvedValue(makeResult(delta));
    const { classifyAnswers } = await import('../../../src/server/pipeline/stages/classify-answers');
    const ctx = makeCtx();
    await classifyAnswers.run({ profile, qa, existingAssertions }, ctx);

    expect(ctx._emitted.map(([k]) => k)).toEqual(['task_started', 'task_completed']);
    expect(ctx._emitted[0][1]).toMatchObject({ stage: 'classify_answers' });
    expect(ctx._emitted[1][1]).toMatchObject({ stage: 'classify_answers', count: delta.length });
  });

  it('system prompt contains all five seed key prefixes', async () => {
    mockRouteJsonChat.mockResolvedValue(makeResult([]));
    const { classifyAnswers } = await import('../../../src/server/pipeline/stages/classify-answers');
    const ctx = makeCtx();
    await classifyAnswers.run({ profile, qa, existingAssertions }, ctx);

    const system: string = mockRouteJsonChat.mock.calls[0][0].system;
    expect(system).toContain('scope_');
    expect(system).toContain('tone_');
    expect(system).toContain('format_');
    expect(system).toContain('structure_');
    expect(system).toContain('audience_');
  });

  it('calls routeJsonChat with class fast', async () => {
    mockRouteJsonChat.mockResolvedValue(makeResult([]));
    const { classifyAnswers } = await import('../../../src/server/pipeline/stages/classify-answers');
    const ctx = makeCtx();
    await classifyAnswers.run({ profile, qa, existingAssertions }, ctx);

    expect(mockRouteJsonChat.mock.calls[0][0]).toMatchObject({ class: 'fast' });
  });

  it('returns a single new ladder-safety item unchanged (truncation is content-agnostic)', async () => {
    const delta = [
      { kind: 'new', key: 'scope_ladder_safety', category: 'scope', assertion: 'user wants ladder safety section' },
    ];
    mockRouteJsonChat.mockResolvedValue(makeResult(delta));
    const { classifyAnswers } = await import('../../../src/server/pipeline/stages/classify-answers');
    const ctx = makeCtx();
    const result = await classifyAnswers.run({ profile, qa, existingAssertions: [] }, ctx);

    expect(result).toEqual({ delta });
  });

  it('caps "new" items at 2, dropping trailing "new"s while preserving "agree" items', async () => {
    const delta = [
      { kind: 'new', key: 'tone_a', category: 'tone', assertion: 'A' },
      { kind: 'new', key: 'tone_b', category: 'tone', assertion: 'B' },
      { kind: 'new', key: 'tone_c', category: 'tone', assertion: 'C' },
      { kind: 'new', key: 'tone_d', category: 'tone', assertion: 'D' },
      { kind: 'agree', key: 'tone_conversational' },
    ];
    mockRouteJsonChat.mockResolvedValue(makeResult(delta));
    const { classifyAnswers } = await import('../../../src/server/pipeline/stages/classify-answers');
    const ctx = makeCtx();
    const result = await classifyAnswers.run({ profile, qa, existingAssertions }, ctx);

    expect(result.delta).toEqual([
      { kind: 'new', key: 'tone_a', category: 'tone', assertion: 'A' },
      { kind: 'new', key: 'tone_b', category: 'tone', assertion: 'B' },
      { kind: 'agree', key: 'tone_conversational' },
    ]);
  });

  it('keeps both "agree" items and the first 2 of 3 "new" items', async () => {
    const delta = [
      { kind: 'agree', key: 'tone_conversational' },
      { kind: 'agree', key: 'tone_conversational' },
      { kind: 'new', key: 'structure_a', category: 'structure', assertion: 'A' },
      { kind: 'new', key: 'structure_b', category: 'structure', assertion: 'B' },
      { kind: 'new', key: 'structure_c', category: 'structure', assertion: 'C' },
    ];
    mockRouteJsonChat.mockResolvedValue(makeResult(delta));
    const { classifyAnswers } = await import('../../../src/server/pipeline/stages/classify-answers');
    const ctx = makeCtx();
    const result = await classifyAnswers.run({ profile, qa, existingAssertions }, ctx);

    expect(result.delta).toEqual([
      { kind: 'agree', key: 'tone_conversational' },
      { kind: 'agree', key: 'tone_conversational' },
      { kind: 'new', key: 'structure_a', category: 'structure', assertion: 'A' },
      { kind: 'new', key: 'structure_b', category: 'structure', assertion: 'B' },
    ]);
  });

  it('emits task_completed count reflecting the capped delta length', async () => {
    const delta = [
      { kind: 'new', key: 'tone_a', category: 'tone', assertion: 'A' },
      { kind: 'new', key: 'tone_b', category: 'tone', assertion: 'B' },
      { kind: 'new', key: 'tone_c', category: 'tone', assertion: 'C' },
    ];
    mockRouteJsonChat.mockResolvedValue(makeResult(delta));
    const { classifyAnswers } = await import('../../../src/server/pipeline/stages/classify-answers');
    const ctx = makeCtx();
    await classifyAnswers.run({ profile, qa, existingAssertions }, ctx);

    expect(ctx._emitted[1][1]).toMatchObject({ stage: 'classify_answers', count: 2 });
  });

  it('system prompt encodes the cross-topic invariant and at least 4 Bad/Good example pairs', async () => {
    mockRouteJsonChat.mockResolvedValue(makeResult([]));
    const { classifyAnswers } = await import('../../../src/server/pipeline/stages/classify-answers');
    const ctx = makeCtx();
    await classifyAnswers.run({ profile, qa, existingAssertions: [] }, ctx);

    const system: string = mockRouteJsonChat.mock.calls[0][0].system;
    expect(system).toContain('Cross-topic invariant');

    const badLines = system.split('\n').filter((l) => l.trimStart().startsWith('Bad:'));
    const goodLines = system.split('\n').filter((l) => l.trimStart().startsWith('Good:'));
    expect(badLines.length).toBeGreaterThanOrEqual(4);
    expect(goodLines.length).toBeGreaterThanOrEqual(4);
  });

  it('system prompt instructs the model to emit at most 2 "new" items per call', async () => {
    mockRouteJsonChat.mockResolvedValue(makeResult([]));
    const { classifyAnswers } = await import('../../../src/server/pipeline/stages/classify-answers');
    const ctx = makeCtx();
    await classifyAnswers.run({ profile, qa, existingAssertions: [] }, ctx);

    const system: string = mockRouteJsonChat.mock.calls[0][0].system;
    expect(system).toContain('at most 2 "new" items per call');
  });
});

describe('classifyAnswers outputSchema', () => {
  it('rejects a new item missing assertion', async () => {
    const { classifyAnswersOutputSchema } = await import(
      '../../../src/server/pipeline/stages/classify-answers'
    );
    const result = classifyAnswersOutputSchema.safeParse({
      delta: [{ kind: 'new', key: 'tone_casual', category: 'tone' }],
    });
    expect(result.success).toBe(false);
  });

  it('accepts an agree item with only kind + key', async () => {
    const { classifyAnswersOutputSchema } = await import(
      '../../../src/server/pipeline/stages/classify-answers'
    );
    const result = classifyAnswersOutputSchema.safeParse({
      delta: [{ kind: 'agree', key: 'tone_conversational' }],
    });
    expect(result.success).toBe(true);
  });

  it('accepts a valid new item with all required fields', async () => {
    const { classifyAnswersOutputSchema } = await import(
      '../../../src/server/pipeline/stages/classify-answers'
    );
    const result = classifyAnswersOutputSchema.safeParse({
      delta: [{ kind: 'new', key: 'format_uses_code', category: 'format', assertion: 'Uses code blocks.' }],
    });
    expect(result.success).toBe(true);
  });
});

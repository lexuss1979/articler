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

const examples = [
  { content: 'This is a technical article about Rust memory management.' },
  { content: 'Another deep-dive into async programming patterns.' },
];

const sampleItems = [
  { key: 'tone_conversational', category: 'tone' as const, assertion: 'Articles use a conversational tone.' },
  { key: 'scope_technical_depth', category: 'scope' as const, assertion: 'Content targets advanced developers.' },
  { key: 'format_uses_headers', category: 'format' as const, assertion: 'Sections are separated by H2 headers.' },
];

const sampleOutput = {
  summary: 'The articles exhibit a technical, conversational style aimed at experienced developers.',
  items: sampleItems,
};

function makeJsonChatResult(output: typeof sampleOutput) {
  return {
    result: output,
    modelUsed: 'claude-sonnet',
    modelClass: 'smart' as const,
    promptTokens: 100,
    completionTokens: 200,
    latencyMs: 500,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('analyzeExamples stage', () => {
  it('returns the model output verbatim when valid', async () => {
    mockRouteJsonChat.mockResolvedValue(makeJsonChatResult(sampleOutput));
    const { analyzeExamples } = await import('../../../src/server/pipeline/stages/analyze-examples');
    const ctx = makeCtx();
    const result = await analyzeExamples.run({ profile, examples }, ctx);

    expect(result.summary).toBe(sampleOutput.summary);
    expect(result.items).toHaveLength(sampleItems.length);
    expect(result.items[0]).toMatchObject(sampleItems[0]);
    expect(result.items[1]).toMatchObject(sampleItems[1]);
    expect(result.items[2]).toMatchObject(sampleItems[2]);
  });

  it('emits task_started then task_completed with correct stage and count', async () => {
    mockRouteJsonChat.mockResolvedValue(makeJsonChatResult(sampleOutput));
    const { analyzeExamples } = await import('../../../src/server/pipeline/stages/analyze-examples');
    const ctx = makeCtx();
    await analyzeExamples.run({ profile, examples }, ctx);

    expect(ctx._emitted.map(([k]) => k)).toEqual(['task_started', 'task_completed']);
    expect(ctx._emitted[0][1]).toMatchObject({ stage: 'analyze_examples' });
    expect(ctx._emitted[1][1]).toMatchObject({ stage: 'analyze_examples', count: sampleItems.length });
  });

  it('emits count = items.length for any number of items', async () => {
    const fewItems = [sampleItems[0]];
    mockRouteJsonChat.mockResolvedValue(
      makeJsonChatResult({ summary: 'Short summary.', items: fewItems }),
    );
    const { analyzeExamples } = await import('../../../src/server/pipeline/stages/analyze-examples');
    const ctx = makeCtx();
    await analyzeExamples.run({ profile, examples }, ctx);

    const completedPayload = ctx._emitted[1][1] as { count: number };
    expect(completedPayload.count).toBe(1);
  });

  it('system prompt contains all five seed key prefixes', async () => {
    mockRouteJsonChat.mockResolvedValue(makeJsonChatResult({ summary: '', items: [] }));
    const { analyzeExamples } = await import('../../../src/server/pipeline/stages/analyze-examples');
    const ctx = makeCtx();
    await analyzeExamples.run({ profile, examples }, ctx);

    const callArgs = mockRouteJsonChat.mock.calls[0][0] as { system: string };
    expect(callArgs.system).toContain('scope_');
    expect(callArgs.system).toContain('tone_');
    expect(callArgs.system).toContain('format_');
    expect(callArgs.system).toContain('structure_');
    expect(callArgs.system).toContain('audience_');
  });

  it('calls routeJsonChat with class smart', async () => {
    mockRouteJsonChat.mockResolvedValue(makeJsonChatResult({ summary: '', items: [] }));
    const { analyzeExamples } = await import('../../../src/server/pipeline/stages/analyze-examples');
    const ctx = makeCtx();
    await analyzeExamples.run({ profile, examples }, ctx);

    expect(mockRouteJsonChat.mock.calls[0][0]).toMatchObject({ class: 'smart' });
  });
});

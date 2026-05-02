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
  name: 'Habr longread',
  format: 'long_read',
  style: 'Technical, precise',
  audience: 'Software engineers',
  targetVolumeMin: 2000,
  targetVolumeMax: 4000,
  markupRules: {},
  extraPrompt: '',
  createdAt: new Date(),
};

const brief = {
  topic: 'Prompt caching in LLMs',
  goal: 'Explain cost savings',
  notes: '',
  sourceArticles: [],
};

beforeEach(() => vi.clearAllMocks());

const sampleQuestion = {
  question: 'Who is your target reader?',
  suggestions: ['Backend engineers', 'ML researchers', 'Product managers'],
};

describe('clarifyBrief stage', () => {
  it('emits task_started and task_completed in order, returns questions array', async () => {
    mockRouteJsonChat.mockResolvedValue({
      result: { questions: [sampleQuestion] },
      modelUsed: 'claude',
      modelClass: 'smart',
      promptTokens: 10,
      completionTokens: 5,
      latencyMs: 100,
    });

    const { clarifyBrief } = await import('../../../src/server/pipeline/stages/clarify-brief');
    const ctx = makeCtx();
    const result = await clarifyBrief.run({ brief, profile }, ctx);

    expect(result).toEqual({ questions: [sampleQuestion] });
    expect(ctx._emitted.map(([k]) => k)).toEqual(['task_started', 'task_completed']);
    expect(ctx._emitted[1][1]).toMatchObject({ count: 1 });
  });

  it('returns empty questions when LLM says brief is sufficient', async () => {
    mockRouteJsonChat.mockResolvedValue({
      result: { questions: [] },
      modelUsed: 'claude',
      modelClass: 'smart',
      promptTokens: 8,
      completionTokens: 3,
      latencyMs: 80,
    });

    const { clarifyBrief } = await import('../../../src/server/pipeline/stages/clarify-brief');
    const ctx = makeCtx();
    const result = await clarifyBrief.run({ brief, profile }, ctx);

    expect(result.questions).toHaveLength(0);
    expect(ctx._emitted[1][1]).toMatchObject({ count: 0 });
  });

  it('outputSchema rejects a question with no suggestions', async () => {
    const { clarifyBrief } = await import('../../../src/server/pipeline/stages/clarify-brief');
    expect(
      clarifyBrief.outputSchema.safeParse({
        questions: [{ question: 'Who?', suggestions: [] }],
      }).success,
    ).toBe(false);
  });
});

describe('clarifyBrief stage — fixture: habr-longread-1', () => {
  it('returns expected.snapshot unchanged when routeJsonChat returns it', async () => {
    type Fixture = {
      input: { brief: typeof brief; profile: typeof profile & { createdAt: string } };
      expected: { snapshot: unknown };
    };
    const fixture = JSON.parse(
      readFileSync(
        join(__dirname, '../../eval/fixtures/clarify_brief/habr-longread-1.json'),
        'utf8',
      ),
    ) as Fixture;

    mockRouteJsonChat.mockResolvedValue({
      result: fixture.expected.snapshot,
      modelUsed: 'claude',
      modelClass: 'smart',
      promptTokens: 10,
      completionTokens: 5,
      latencyMs: 100,
    });

    const { clarifyBrief } = await import('../../../src/server/pipeline/stages/clarify-brief');
    const ctx = makeCtx();
    const input = {
      ...fixture.input,
      profile: { ...fixture.input.profile, createdAt: new Date(fixture.input.profile.createdAt) },
    };
    const result = await clarifyBrief.run(input, ctx);

    expect(result).toEqual(fixture.expected.snapshot);
  });
});

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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
  lightResearchSources: 1,
  lightMaxWords: 800,
  createdAt: new Date(),
};

const brief = {
  topic: 'Prompt caching',
  goal: 'Save costs',
  notes: '',
  sourceArticles: [],
};

const threeAngles = {
  angles: [
    { title: 'The Cost Problem', methodology: 'pas', rationale: 'Engineers care about cost.' },
    { title: 'Cache Deep-Dive', methodology: 'deep_dive', rationale: 'Technical audience wants depth.' },
    { title: 'How-To Guide', methodology: 'how_to', rationale: 'Actionable steps.' },
  ],
};

beforeEach(() => vi.clearAllMocks());

describe('proposeAngles stage', () => {
  it('returns 3 angles and emits task_started / task_completed in order', async () => {
    mockRouteJsonChat.mockResolvedValue({
      result: threeAngles,
      modelUsed: 'claude',
      modelClass: 'smart',
      promptTokens: 15,
      completionTokens: 80,
      latencyMs: 200,
    });

    const { proposeAngles } = await import(
      '../../../src/server/pipeline/stages/propose-angles'
    );
    const ctx = makeCtx();
    const result = await proposeAngles.run({ brief, profile }, ctx);

    expect(result.angles).toHaveLength(3);
    expect(ctx._emitted.map(([k]) => k)).toEqual(['task_started', 'task_completed']);
    expect(ctx._emitted[1][1]).toMatchObject({ count: 3 });
  });

  it('throws when LLM returns fewer than 2 angles (schema rejects)', async () => {
    mockRouteJsonChat.mockRejectedValue(
      new (await import('../../../src/server/llm/structured')).JsonChatSchemaError([]),
    );

    const { proposeAngles } = await import(
      '../../../src/server/pipeline/stages/propose-angles'
    );
    const ctx = makeCtx();
    await expect(proposeAngles.run({ brief, profile }, ctx)).rejects.toThrow();
  });

  it('includes clarification answers in the prompt when provided', async () => {
    mockRouteJsonChat.mockResolvedValue({ result: threeAngles, modelUsed: 'claude', modelClass: 'smart', promptTokens: 10, completionTokens: 50, latencyMs: 100 });

    const { proposeAngles } = await import(
      '../../../src/server/pipeline/stages/propose-angles'
    );
    const ctx = makeCtx();
    await proposeAngles.run({
      brief,
      profile,
      clarifications: [{ question: 'Who reads this?', answer: 'Senior engineers' }],
    }, ctx);

    const callArg = mockRouteJsonChat.mock.calls[0][0] as { user: string };
    expect(callArg.user).toContain('Senior engineers');
  });
});

describe('proposeAngles stage — fixture: habr-longread-1', () => {
  it('returns expected.snapshot unchanged when routeJsonChat returns it', async () => {
    type Fixture = {
      input: {
        brief: typeof brief;
        profile: typeof profile & { createdAt: string };
        clarifications: Array<{ question: string; answer: string }>;
      };
      expected: { snapshot: { angles: typeof threeAngles.angles } };
    };
    const fixture = JSON.parse(
      readFileSync(
        join(__dirname, '../../eval/fixtures/propose_angles/habr-longread-1.json'),
        'utf8',
      ),
    ) as Fixture;

    mockRouteJsonChat.mockResolvedValue({
      result: fixture.expected.snapshot,
      modelUsed: 'claude',
      modelClass: 'smart',
      promptTokens: 15,
      completionTokens: 80,
      latencyMs: 200,
    });

    const { proposeAngles } = await import(
      '../../../src/server/pipeline/stages/propose-angles'
    );
    const ctx = makeCtx();
    const input = {
      ...fixture.input,
      profile: { ...fixture.input.profile, createdAt: new Date(fixture.input.profile.createdAt) },
    };
    const result = await proposeAngles.run(input, ctx);

    expect(result).toEqual(fixture.expected.snapshot);
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

const plan = {
  thesis: 'Prompt caching reduces costs significantly.',
  targetTakeaway: 'Use prompt caching to save money.',
  sections: [
    { id: 'intro', title: 'Introduction', intent: 'Hook the reader.', keyPoints: ['Overview'], expectedLength: 200 },
    { id: 'body', title: 'Main Content', intent: 'Explain the topic.', keyPoints: ['Details'], expectedLength: 1000 },
  ],
};

const sectionDrafts = [
  { sectionId: 'intro', contentMd: '# Introduction\nHello world.' },
  { sectionId: 'body', contentMd: '# Main\nDetails here.' },
];

function makeJsonChatResult(findings: unknown[]) {
  return {
    result: { findings },
    modelUsed: 'claude-opus',
    modelClass: 'smart' as const,
    promptTokens: 100,
    completionTokens: 200,
    latencyMs: 500,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('runReview stage', () => {
  it('emits task_started/task_completed with the finding count', async () => {
    mockRouteJsonChat.mockResolvedValue(
      makeJsonChatResult([
        {
          severity: 'critical',
          problem: 'p',
          suggestedChange: 's',
          span: { sectionId: 'intro', charStart: 0, charEnd: 1 },
        },
      ]),
    );
    const { runReview } = await import('../../../src/server/pipeline/stages/run-review');
    const ctx = makeCtx();
    await runReview.run(
      { enabledCriticIds: ['editorial'], plan, profile, sectionDrafts },
      ctx,
    );

    expect(ctx._emitted.map(([k]) => k)).toEqual(['task_started', 'task_completed']);
    expect(ctx._emitted[1][1]).toMatchObject({ stage: 'run_review', count: 1 });
  });

  it('composes the system prompt with each enabled built-in lens', async () => {
    mockRouteJsonChat.mockResolvedValue(makeJsonChatResult([]));
    const { runReview } = await import('../../../src/server/pipeline/stages/run-review');
    const ctx = makeCtx();
    await runReview.run(
      { enabledCriticIds: ['editorial', 'style'], plan, profile, sectionDrafts },
      ctx,
    );

    const callArgs = mockRouteJsonChat.mock.calls[0][0] as { system: string };
    expect(callArgs.system).toContain('Editorial lens');
    expect(callArgs.system).toContain('Prose-style lens');
    expect(callArgs.system).not.toContain('Methodology lens');
    expect(callArgs.system).toContain(plan.thesis);
  });

  it('uses class smart', async () => {
    mockRouteJsonChat.mockResolvedValue(makeJsonChatResult([]));
    const { runReview } = await import('../../../src/server/pipeline/stages/run-review');
    const ctx = makeCtx();
    await runReview.run(
      { enabledCriticIds: ['editorial'], plan, profile, sectionDrafts },
      ctx,
    );
    expect(mockRouteJsonChat.mock.calls[0][0]).toMatchObject({ class: 'smart' });
  });

  it('falls back gracefully when no lenses are enabled', async () => {
    mockRouteJsonChat.mockResolvedValue(makeJsonChatResult([]));
    const { runReview } = await import('../../../src/server/pipeline/stages/run-review');
    const ctx = makeCtx();
    await runReview.run({ enabledCriticIds: [], plan, profile, sectionDrafts }, ctx);

    const callArgs = mockRouteJsonChat.mock.calls[0][0] as { system: string };
    expect(callArgs.system).toContain('general editorial review');
  });
});

describe('runReview stage — fixture: habr-longread-1', () => {
  it('returns expected.snapshot when routeJsonChat returns it', async () => {
    type Fixture = {
      input: {
        enabledCriticIds: string[];
        plan: typeof plan;
        profile: typeof profile;
        sectionDrafts: typeof sectionDrafts;
      };
      expected: { snapshot: { findings: unknown[] } };
    };
    const fixture = JSON.parse(
      readFileSync(
        join(__dirname, '../../eval/fixtures/run_review/habr-longread-1.json'),
        'utf8',
      ),
    ) as Fixture;

    mockRouteJsonChat.mockResolvedValue({
      result: fixture.expected.snapshot,
      modelUsed: 'claude-opus',
      modelClass: 'smart' as const,
      promptTokens: 100,
      completionTokens: 100,
      latencyMs: 400,
    });

    const { runReview } = await import('../../../src/server/pipeline/stages/run-review');
    const ctx = makeCtx();
    const result = await runReview.run(
      {
        ...fixture.input,
        profile: { ...fixture.input.profile, createdAt: new Date(fixture.input.profile.createdAt as unknown as string) },
      } as Parameters<typeof runReview.run>[0],
      ctx,
    );
    expect(result).toEqual(fixture.expected.snapshot);
  });
});

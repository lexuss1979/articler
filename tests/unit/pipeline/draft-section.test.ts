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
  name: 'TechBlog',
  format: 'long-read',
  style: 'informative',
  audience: 'senior engineers',
  targetVolumeMin: 3000,
  targetVolumeMax: 5000,
  markupRules: {},
  extraPrompt: '',
  createdAt: new Date(),
};

const plan = {
  thesis: 'Rust is the best choice for systems programming in 2024.',
  targetTakeaway: 'Readers should try Rust for their next systems project.',
  sections: [
    {
      id: 'intro',
      title: 'Introduction',
      intent: 'Hook the reader with Rust momentum',
      expectedLength: 300,
      keyPoints: ['Rust adoption is growing', 'Memory safety without GC'],
    },
    {
      id: 'perf',
      title: 'Performance',
      intent: 'Show benchmark data',
      expectedLength: 500,
      keyPoints: ['Zero-cost abstractions', 'Comparable to C'],
    },
  ],
};

const section = plan.sections[0];

const acceptedSources = [
  {
    url: 'https://blog.rust-lang.org/survey',
    title: 'Rust Survey 2024',
    summary: 'Rust was voted most loved language for the 9th year.',
    rawExcerpt: 'Rust community survey results...',
  },
];

const stubResult = { contentMd: '## Hook\n\nRust is taking over systems programming.' };

beforeEach(() => vi.clearAllMocks());

describe('draftSection stage', () => {
  it('emits task_started and task_completed in order, returns contentMd', async () => {
    mockRouteJsonChat.mockResolvedValue({
      result: stubResult,
      modelUsed: 'claude-sonnet',
      modelClass: 'smart',
      promptTokens: 100,
      completionTokens: 80,
      latencyMs: 200,
    });

    const { draftSection } = await import('../../../src/server/pipeline/stages/draft-section');
    const ctx = makeCtx();
    const result = await draftSection.run(
      { profile, plan, section, acceptedSources, prevSections: [] },
      ctx,
    );

    expect(result).toEqual(stubResult);
    expect(ctx._emitted.map(([k]) => k)).toEqual(['task_started', 'task_completed']);
    expect(ctx._emitted[0][1]).toMatchObject({ stage: 'draft_section', sectionId: 'intro' });
    expect(ctx._emitted[1][1]).toMatchObject({
      stage: 'draft_section',
      sectionId: 'intro',
      length: stubResult.contentMd.length,
    });
  });

  it('system prompt mentions section title and platform name', async () => {
    mockRouteJsonChat.mockResolvedValue({
      result: stubResult,
      modelUsed: 'claude-sonnet',
      modelClass: 'smart',
      promptTokens: 100,
      completionTokens: 80,
      latencyMs: 200,
    });

    const { draftSection } = await import('../../../src/server/pipeline/stages/draft-section');
    const ctx = makeCtx();
    await draftSection.run({ profile, plan, section, acceptedSources, prevSections: [] }, ctx);

    const call = mockRouteJsonChat.mock.calls[0][0] as { system: string; user: string };
    expect(call.system).toContain('TechBlog');
    expect(call.user).toContain('Introduction');
  });

  it('user prompt mentions an accepted source url', async () => {
    mockRouteJsonChat.mockResolvedValue({
      result: stubResult,
      modelUsed: 'claude-sonnet',
      modelClass: 'smart',
      promptTokens: 100,
      completionTokens: 80,
      latencyMs: 200,
    });

    const { draftSection } = await import('../../../src/server/pipeline/stages/draft-section');
    const ctx = makeCtx();
    await draftSection.run({ profile, plan, section, acceptedSources, prevSections: [] }, ctx);

    const call = mockRouteJsonChat.mock.calls[0][0] as { user: string };
    expect(call.user).toContain('https://blog.rust-lang.org/survey');
  });

  it('calls routeJsonChat with class smart', async () => {
    mockRouteJsonChat.mockResolvedValue({
      result: stubResult,
      modelUsed: 'claude-sonnet',
      modelClass: 'smart',
      promptTokens: 100,
      completionTokens: 80,
      latencyMs: 200,
    });

    const { draftSection } = await import('../../../src/server/pipeline/stages/draft-section');
    const ctx = makeCtx();
    await draftSection.run({ profile, plan, section, acceptedSources, prevSections: [] }, ctx);

    expect(mockRouteJsonChat).toHaveBeenCalledWith(expect.objectContaining({ class: 'smart' }));
  });

  it('includes instruction block and rewriteSourceArticles block when provided', async () => {
    mockRouteJsonChat.mockResolvedValue({
      result: stubResult,
      modelUsed: 'claude-sonnet',
      modelClass: 'smart',
      promptTokens: 100,
      completionTokens: 80,
      latencyMs: 200,
    });

    const { draftSection } = await import('../../../src/server/pipeline/stages/draft-section');
    const ctx = makeCtx();
    await draftSection.run(
      {
        profile,
        plan,
        section,
        acceptedSources,
        prevSections: [],
        instruction: 'Tighten the intro',
        rewriteSourceArticles: [
          { url: 'https://original.com/article', content: 'Original article content here.' },
        ],
      },
      ctx,
    );

    const call = mockRouteJsonChat.mock.calls[0][0] as { user: string };
    expect(call.user).toContain('Tighten the intro');
    expect(call.user).toContain('https://original.com/article');
  });
});

describe('draftSection stage — fixture: habr-longread-1', () => {
  it('returns expected.snapshot unchanged when routeJsonChat returns it', async () => {
    type Fixture = { input: unknown; expected: { snapshot: unknown } };
    const fixture = JSON.parse(
      readFileSync(
        join(__dirname, '../../eval/fixtures/draft_section/habr-longread-1.json'),
        'utf8',
      ),
    ) as Fixture;

    mockRouteJsonChat.mockResolvedValue({
      result: fixture.expected.snapshot,
      modelUsed: 'claude-sonnet',
      modelClass: 'smart',
      promptTokens: 200,
      completionTokens: 300,
      latencyMs: 400,
    });

    const { draftSection } = await import('../../../src/server/pipeline/stages/draft-section');
    const ctx = makeCtx();
    const result = await draftSection.run(
      fixture.input as Parameters<typeof draftSection.run>[0],
      ctx,
    );
    expect(result).toEqual(fixture.expected.snapshot);
  });
});

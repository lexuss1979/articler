import { describe, expect, it, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const mockRouteChat = vi.fn();

vi.mock('../../../src/server/llm/router', () => ({
  routeChat: mockRouteChat,
  routeSearch: vi.fn(),
  routeImage: vi.fn(),
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

const section = plan.sections[0]!;

const acceptedSources = [
  {
    url: 'https://blog.rust-lang.org/survey',
    title: 'Rust Survey 2024',
    summary: 'Rust was voted most loved language for the 9th year.',
    rawExcerpt: 'Rust community survey results...',
  },
];

const stubContentMd = '## Hook\n\nRust is taking over systems programming.';

function makeChatResult(content: string) {
  return {
    content,
    modelUsed: 'anthropic/claude-opus-4.7',
    modelClass: 'smart',
    promptTokens: 100,
    completionTokens: 80,
    latencyMs: 200,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('draftSection stage', () => {
  it('emits task_started and task_completed in order, returns contentMd', async () => {
    mockRouteChat.mockResolvedValue(makeChatResult(stubContentMd));

    const { draftSection } = await import('../../../src/server/pipeline/stages/draft-section');
    const ctx = makeCtx();
    const result = await draftSection.run(
      { profile, plan, section, acceptedSources, prevSections: [] },
      ctx,
    );

    expect(result).toEqual({ contentMd: stubContentMd });
    expect(ctx._emitted.map(([k]) => k)).toEqual(['task_started', 'task_completed']);
    expect(ctx._emitted[0]![1]).toMatchObject({ stage: 'draft_section', sectionId: 'intro' });
    expect(ctx._emitted[1]![1]).toMatchObject({
      stage: 'draft_section',
      sectionId: 'intro',
      length: stubContentMd.length,
    });
  });

  it('system prompt mentions platform name and thesis', async () => {
    mockRouteChat.mockResolvedValue(makeChatResult(stubContentMd));

    const { draftSection } = await import('../../../src/server/pipeline/stages/draft-section');
    const ctx = makeCtx();
    await draftSection.run({ profile, plan, section, acceptedSources, prevSections: [] }, ctx);

    const call = mockRouteChat.mock.calls[0]![0] as { messages: Array<{ role: string; content: string }> };
    const system = call.messages.find((m) => m.role === 'system')!.content;
    expect(system).toContain('TechBlog');
    expect(system).toContain('long-read');
  });

  it('user prompt mentions section title and accepted source url', async () => {
    mockRouteChat.mockResolvedValue(makeChatResult(stubContentMd));

    const { draftSection } = await import('../../../src/server/pipeline/stages/draft-section');
    const ctx = makeCtx();
    await draftSection.run({ profile, plan, section, acceptedSources, prevSections: [] }, ctx);

    const call = mockRouteChat.mock.calls[0]![0] as { messages: Array<{ role: string; content: string }> };
    const user = call.messages.find((m) => m.role === 'user')!.content;
    expect(user).toContain('Introduction');
    expect(user).toContain('https://blog.rust-lang.org/survey');
  });

  it('calls routeChat with class smart', async () => {
    mockRouteChat.mockResolvedValue(makeChatResult(stubContentMd));

    const { draftSection } = await import('../../../src/server/pipeline/stages/draft-section');
    const ctx = makeCtx();
    await draftSection.run({ profile, plan, section, acceptedSources, prevSections: [] }, ctx);

    expect(mockRouteChat).toHaveBeenCalledWith(expect.objectContaining({ class: 'smart' }));
  });

  it('includes instruction and rewriteSourceArticles in user prompt', async () => {
    mockRouteChat.mockResolvedValue(makeChatResult(stubContentMd));

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

    const call = mockRouteChat.mock.calls[0]![0] as { messages: Array<{ role: string; content: string }> };
    const user = call.messages.find((m) => m.role === 'user')!.content;
    expect(user).toContain('Tighten the intro');
    expect(user).toContain('https://original.com/article');
  });

  it('shows only titles for older prevSections, full content for recent two', async () => {
    mockRouteChat.mockResolvedValue(makeChatResult(stubContentMd));

    const prevSections = [
      { id: 'old-1', contentMd: 'Old section one content' },
      { id: 'old-2', contentMd: 'Old section two content' },
      { id: 'intro', contentMd: 'Recent section content' },
    ];

    const { draftSection } = await import('../../../src/server/pipeline/stages/draft-section');
    const ctx = makeCtx();
    await draftSection.run({ profile, plan, section: plan.sections[1]!, acceptedSources: [], prevSections }, ctx);

    const call = mockRouteChat.mock.calls[0]![0] as { messages: Array<{ role: string; content: string }> };
    const user = call.messages.find((m) => m.role === 'user')!.content;
    expect(user).toContain('[already written]');
    expect(user).toContain('Recent section content');
    expect(user).not.toContain('Old section one content');
  });
});

describe('draftSection stage — fixture: habr-longread-1', () => {
  it('returns expected.snapshot contentMd when routeChat returns it', async () => {
    type Fixture = { input: unknown; expected: { snapshot: { contentMd: string } } };
    const fixture = JSON.parse(
      readFileSync(
        join(__dirname, '../../eval/fixtures/draft_section/habr-longread-1.json'),
        'utf8',
      ),
    ) as Fixture;

    mockRouteChat.mockResolvedValue(makeChatResult(fixture.expected.snapshot.contentMd));

    const { draftSection } = await import('../../../src/server/pipeline/stages/draft-section');
    const ctx = makeCtx();
    const result = await draftSection.run(
      fixture.input as Parameters<typeof draftSection.run>[0],
      ctx,
    );
    expect(result).toEqual(fixture.expected.snapshot);
  });
});

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

function nWords(n: number, start = 0): string {
  return Array.from({ length: n }, (_, i) => `word${start + i}`).join(' ');
}

const profile = {
  id: 1,
  userId: 1,
  name: 'TechBlog',
  format: 'long_read',
  style: 'Technical',
  audience: 'Engineers',
  targetVolumeMin: 600,
  targetVolumeMax: 1000,
  markupRules: {},
  extraPrompt: '',
  lightResearchSources: 1,
  lightMaxWords: 800,
  createdAt: new Date(),
};

const brief = {
  topic: 'Prompt caching',
  goal: 'Save LLM costs',
  notes: '',
  sourceArticles: [],
};

const plan = {
  thesis: 'Prompt caching cuts costs.',
  targetTakeaway: 'Use caching.',
  sections: [
    {
      id: 'intro',
      title: 'Introduction',
      intent: 'Hook the reader',
      expectedLength: 400,
      keyPoints: ['Cost savings'],
    },
    {
      id: 'how',
      title: 'How It Works',
      intent: 'Explain the mechanism',
      expectedLength: 400,
      keyPoints: ['Token reuse'],
    },
  ],
};

const sources: Array<{ url: string; title: string; summary: string; rawExcerpt: string }> = [];

function makeResult(contentMd: string) {
  return {
    result: { contentMd },
    modelUsed: 'claude',
    modelClass: 'smart' as const,
    promptTokens: 100,
    completionTokens: 200,
    latencyMs: 500,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('draftFull stage', () => {
  it('returns markdown unchanged and wordCount when under cap', async () => {
    const content = nWords(300, 0);
    mockRouteJsonChat.mockResolvedValue(makeResult(content));

    const { draftFull } = await import('../../../src/server/pipeline/stages/draft-full');
    const ctx = makeCtx();
    const result = await draftFull.run({ profile, brief, plan, sources, lightMaxWords: 800 }, ctx);

    expect(result.contentMd).toBe(content);
    expect(result.wordCount).toBe(300);
    expect(ctx.log.append).not.toHaveBeenCalled();
  });

  it('truncates at paragraph boundary and logs when over cap', async () => {
    const para1 = nWords(400, 0);
    const para2 = nWords(400, 400);
    const para3 = nWords(400, 800);
    const content = [para1, para2, para3].join('\n\n');
    mockRouteJsonChat.mockResolvedValue(makeResult(content));

    const { draftFull } = await import('../../../src/server/pipeline/stages/draft-full');
    const ctx = makeCtx();
    const result = await draftFull.run({ profile, brief, plan, sources, lightMaxWords: 800 }, ctx);

    const finalWordCount = result.contentMd.trim().split(/\s+/).length;
    expect(finalWordCount).toBeLessThanOrEqual(920);
    expect(result.contentMd).not.toContain(para3.slice(0, 20));
    expect(result.wordCount).toBe(finalWordCount);

    expect(ctx.log.append).toHaveBeenCalledOnce();
    const logArg = (ctx.log.append as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>;
    expect(logArg.event).toBe('draft_full_truncated');
    expect(logArg.originalWords).toBe(1200);
  });

  it('emits task_started then task_completed with stage and wordCount', async () => {
    const content = nWords(300);
    mockRouteJsonChat.mockResolvedValue(makeResult(content));

    const { draftFull } = await import('../../../src/server/pipeline/stages/draft-full');
    const ctx = makeCtx();
    await draftFull.run({ profile, brief, plan, sources, lightMaxWords: 800 }, ctx);

    const kinds = ctx._emitted.map(([k]) => k);
    expect(kinds).toEqual(['task_started', 'task_completed']);
    expect(ctx._emitted[0][1]).toMatchObject({ stage: 'draft_full' });
    expect(ctx._emitted[1][1]).toMatchObject({ stage: 'draft_full', wordCount: expect.any(Number) });
  });

  it('calls routeJsonChat with class: smart', async () => {
    mockRouteJsonChat.mockResolvedValue(makeResult(nWords(100, 0)));

    const { draftFull } = await import('../../../src/server/pipeline/stages/draft-full');
    const ctx = makeCtx();
    await draftFull.run({ profile, brief, plan, sources, lightMaxWords: 800 }, ctx);

    expect(mockRouteJsonChat).toHaveBeenCalledOnce();
    const callArg = mockRouteJsonChat.mock.calls[0][0] as { class: string };
    expect(callArg.class).toBe('smart');
  });

  it('inputSchema rejects lightMaxWords below 200', async () => {
    const { draftFull } = await import('../../../src/server/pipeline/stages/draft-full');
    const result = draftFull.inputSchema.safeParse({
      profile,
      brief,
      plan,
      sources,
      lightMaxWords: 100,
    });
    expect(result.success).toBe(false);
  });
});

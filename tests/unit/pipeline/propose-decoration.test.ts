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
  markupRules: { calloutSyntax: 'fenced' },
  extraPrompt: '',
  createdAt: new Date(),
};

const plan = {
  thesis: 'Prompt caching reduces costs significantly.',
  targetTakeaway: 'Use prompt caching to save money.',
  sections: [
    {
      id: 'intro',
      title: 'Introduction',
      intent: 'Hook the reader.',
      keyPoints: ['Overview'],
      expectedLength: 200,
    },
    {
      id: 'body',
      title: 'Main Content',
      intent: 'Explain the topic.',
      keyPoints: ['Details'],
      expectedLength: 1000,
    },
  ],
};

const sectionDrafts = [
  { sectionId: 'intro', contentMd: '# Introduction\nHello world.' },
  { sectionId: 'body', contentMd: '# Main\nDetails here.' },
];

function makeJsonChatResult(suggestions: unknown[]) {
  return {
    result: { suggestions },
    modelUsed: 'claude-opus',
    modelClass: 'smart' as const,
    promptTokens: 100,
    completionTokens: 200,
    latencyMs: 500,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('proposeDecoration stage', () => {
  it('returns the routeJsonChat result and emits start/complete with count', async () => {
    const suggestion = {
      kind: 'pull_quote',
      sectionId: 'intro',
      paragraphIndex: 1,
      contentMd: '> Hello world.',
      rationale: 'Memorable opener.',
    };
    mockRouteJsonChat.mockResolvedValue(makeJsonChatResult([suggestion]));
    const { proposeDecoration } = await import(
      '../../../src/server/pipeline/stages/propose-decoration'
    );
    const ctx = makeCtx();
    const result = await proposeDecoration.run({ profile, plan, sectionDrafts }, ctx);

    expect(result).toEqual({ suggestions: [suggestion] });
    expect(ctx._emitted.map(([k]) => k)).toEqual(['task_started', 'task_completed']);
    expect(ctx._emitted[0][1]).toMatchObject({ stage: 'propose_decoration' });
    expect(ctx._emitted[1][1]).toMatchObject({ stage: 'propose_decoration', count: 1 });
  });

  it('passes class smart to routeJsonChat', async () => {
    mockRouteJsonChat.mockResolvedValue(makeJsonChatResult([]));
    const { proposeDecoration } = await import(
      '../../../src/server/pipeline/stages/propose-decoration'
    );
    await proposeDecoration.run({ profile, plan, sectionDrafts }, makeCtx());
    expect(mockRouteJsonChat.mock.calls[0][0]).toMatchObject({ class: 'smart' });
  });

  it('system prompt names every allowed kind enum value', async () => {
    mockRouteJsonChat.mockResolvedValue(makeJsonChatResult([]));
    const { proposeDecoration } = await import(
      '../../../src/server/pipeline/stages/propose-decoration'
    );
    await proposeDecoration.run({ profile, plan, sectionDrafts }, makeCtx());
    const callArgs = mockRouteJsonChat.mock.calls[0][0] as { system: string };
    for (const kind of ['pull_quote', 'callout', 'code_block', 'comparison_table', 'info_box']) {
      expect(callArgs.system).toContain(kind);
    }
  });

  it('user prompt renders sections with [sectionId=...] tags', async () => {
    mockRouteJsonChat.mockResolvedValue(makeJsonChatResult([]));
    const { proposeDecoration } = await import(
      '../../../src/server/pipeline/stages/propose-decoration'
    );
    await proposeDecoration.run({ profile, plan, sectionDrafts }, makeCtx());
    const callArgs = mockRouteJsonChat.mock.calls[0][0] as { user: string };
    expect(callArgs.user).toContain('[sectionId=intro]');
    expect(callArgs.user).toContain('[sectionId=body]');
    expect(callArgs.user).toContain('Hello world.');
  });

  it('still issues a valid call with empty sectionDrafts', async () => {
    mockRouteJsonChat.mockResolvedValue(makeJsonChatResult([]));
    const { proposeDecoration } = await import(
      '../../../src/server/pipeline/stages/propose-decoration'
    );
    const result = await proposeDecoration.run(
      { profile, plan, sectionDrafts: [] },
      makeCtx(),
    );
    expect(result).toEqual({ suggestions: [] });
    expect(mockRouteJsonChat).toHaveBeenCalledTimes(1);
    const callArgs = mockRouteJsonChat.mock.calls[0][0] as { user: string };
    expect(callArgs.user).toBe('');
  });
});

describe('proposeDecoration stage — fixture: habr-longread-1', () => {
  it('returns expected.snapshot when routeJsonChat returns it', async () => {
    type Fixture = {
      input: {
        profile: typeof profile;
        plan: typeof plan;
        sectionDrafts: typeof sectionDrafts;
      };
      expected: { snapshot: { suggestions: unknown[] } };
    };
    const fixture = JSON.parse(
      readFileSync(
        join(__dirname, '../../eval/fixtures/propose_decoration/habr-longread-1.json'),
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

    const { proposeDecoration } = await import(
      '../../../src/server/pipeline/stages/propose-decoration'
    );
    const result = await proposeDecoration.run(
      {
        ...fixture.input,
        profile: {
          ...fixture.input.profile,
          createdAt: new Date(fixture.input.profile.createdAt as unknown as string),
        },
      } as Parameters<typeof proposeDecoration.run>[0],
      makeCtx(),
    );
    expect(result).toEqual(fixture.expected.snapshot);
  });
});

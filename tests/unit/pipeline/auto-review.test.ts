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
  name: 'TestPub',
  format: 'blog',
  style: 'conversational',
  audience: 'developers',
  targetVolumeMin: 500,
  targetVolumeMax: 1500,
  markupRules: null,
  extraPrompt: 'Keep it concise.',
  lightResearchSources: 3,
  lightMaxWords: 800,
  createdAt: new Date('2024-01-01'),
};

const draftMd = '# Article\n\nThis is a test draft with some AI-sounding passages.';

function makeJsonChatResult(revisedMd: string, changes: unknown[]) {
  return {
    result: { revisedMd, changes },
    modelUsed: 'claude-sonnet',
    modelClass: 'smart' as const,
    promptTokens: 100,
    completionTokens: 200,
    latencyMs: 500,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('autoReview stage', () => {
  it('returns revisedMd and changes from routeJsonChat result', async () => {
    const changes = [{ kind: 'humanize', before: 'AI-sounding', after: 'Natural phrasing' }];
    mockRouteJsonChat.mockResolvedValue(makeJsonChatResult('# Revised\n\nBetter text.', changes));

    const { autoReview } = await import('../../../src/server/pipeline/stages/auto-review');
    const ctx = makeCtx();
    const result = await autoReview.run({ profile, draftMd }, ctx);

    expect(result.revisedMd).toBe('# Revised\n\nBetter text.');
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]).toMatchObject({ kind: 'humanize' });
  });

  it('emits task_started then task_completed with stage and changeCount', async () => {
    const changes = [
      { kind: 'humanize', before: 'a', after: 'b' },
      { kind: 'clarify', before: 'c', after: 'd' },
    ];
    mockRouteJsonChat.mockResolvedValue(makeJsonChatResult('revised', changes));

    const { autoReview } = await import('../../../src/server/pipeline/stages/auto-review');
    const ctx = makeCtx();
    await autoReview.run({ profile, draftMd }, ctx);

    expect(ctx._emitted.map(([k]) => k)).toEqual(['task_started', 'task_completed']);
    expect(ctx._emitted[0][1]).toMatchObject({ stage: 'auto_review' });
    expect(ctx._emitted[1][1]).toMatchObject({ stage: 'auto_review', changeCount: 2 });
  });

  it('calls routeJsonChat with class smart', async () => {
    mockRouteJsonChat.mockResolvedValue(makeJsonChatResult('revised', []));

    const { autoReview } = await import('../../../src/server/pipeline/stages/auto-review');
    const ctx = makeCtx();
    await autoReview.run({ profile, draftMd }, ctx);

    expect(mockRouteJsonChat.mock.calls[0][0]).toMatchObject({ class: 'smart' });
  });

  it('system prompt contains profile style, audience, and extraPrompt', async () => {
    mockRouteJsonChat.mockResolvedValue(makeJsonChatResult('revised', []));

    const { autoReview } = await import('../../../src/server/pipeline/stages/auto-review');
    const ctx = makeCtx();
    await autoReview.run({ profile, draftMd }, ctx);

    const callArgs = mockRouteJsonChat.mock.calls[0][0] as { system: string };
    expect(callArgs.system).toContain(profile.style);
    expect(callArgs.system).toContain(profile.audience);
    expect(callArgs.system).toContain(profile.extraPrompt);
  });
});

describe('autoReview outputSchema', () => {
  it('rejects invalid kind enum value', async () => {
    const { outputSchema } = await import('../../../src/server/pipeline/stages/auto-review');
    const result = outputSchema.safeParse({
      revisedMd: 'ok',
      changes: [{ kind: 'invalid', before: 'x', after: 'y' }],
    });
    expect(result.success).toBe(false);
  });

  it('accepts valid humanize kind with optional note absent', async () => {
    const { outputSchema } = await import('../../../src/server/pipeline/stages/auto-review');
    const result = outputSchema.safeParse({
      revisedMd: 'ok',
      changes: [{ kind: 'humanize', before: 'x', after: 'y' }],
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid change with note present', async () => {
    const { outputSchema } = await import('../../../src/server/pipeline/stages/auto-review');
    const result = outputSchema.safeParse({
      revisedMd: 'ok',
      changes: [{ kind: 'cut', before: 'x', after: 'y', note: 'redundant' }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.changes[0].note).toBe('redundant');
    }
  });
});

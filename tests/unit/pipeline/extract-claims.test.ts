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

const claimMedium = {
  span: { sectionId: 'intro', charStart: 0, charEnd: 20, text: 'Claude saves 90% cost' },
  claimType: 'statistic' as const,
  checkWorthiness: 'medium' as const,
};

const claimLow = {
  span: { sectionId: 'body', charStart: 5, charEnd: 25, text: 'AI is a popular topic' },
  claimType: 'other' as const,
  checkWorthiness: 'low' as const,
};

function makeJsonChatResult(claims: unknown[]) {
  return {
    result: { claims },
    modelUsed: 'claude-sonnet',
    modelClass: 'smart' as const,
    promptTokens: 100,
    completionTokens: 200,
    latencyMs: 500,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('extractClaims stage', () => {
  it('returns both claims from routeJsonChat result', async () => {
    mockRouteJsonChat.mockResolvedValue(makeJsonChatResult([claimMedium, claimLow]));
    const { extractClaims } = await import('../../../src/server/pipeline/stages/extract-claims');
    const ctx = makeCtx();
    const result = await extractClaims.run({ plan, sectionDrafts }, ctx);

    expect(result.claims).toHaveLength(2);
    expect(result.claims[0]).toMatchObject(claimMedium);
    expect(result.claims[1]).toMatchObject(claimLow);
  });

  it('emits task_started then task_completed with correct count', async () => {
    mockRouteJsonChat.mockResolvedValue(makeJsonChatResult([claimMedium, claimLow]));
    const { extractClaims } = await import('../../../src/server/pipeline/stages/extract-claims');
    const ctx = makeCtx();
    await extractClaims.run({ plan, sectionDrafts }, ctx);

    expect(ctx._emitted.map(([k]) => k)).toEqual(['task_started', 'task_completed']);
    expect(ctx._emitted[0][1]).toMatchObject({ stage: 'extract_claims' });
    expect(ctx._emitted[1][1]).toMatchObject({ stage: 'extract_claims', count: 2 });
  });

  it('system prompt mentions worthiness ladder terms', async () => {
    mockRouteJsonChat.mockResolvedValue(makeJsonChatResult([]));
    const { extractClaims } = await import('../../../src/server/pipeline/stages/extract-claims');
    const ctx = makeCtx();
    await extractClaims.run({ plan, sectionDrafts }, ctx);

    const callArgs = mockRouteJsonChat.mock.calls[0][0] as { system: string };
    expect(callArgs.system).toContain('low');
    expect(callArgs.system).toContain('medium');
    expect(callArgs.system).toContain('high');
  });

  it('user prompt lists sections in sectionId format', async () => {
    mockRouteJsonChat.mockResolvedValue(makeJsonChatResult([]));
    const { extractClaims } = await import('../../../src/server/pipeline/stages/extract-claims');
    const ctx = makeCtx();
    await extractClaims.run({ plan, sectionDrafts }, ctx);

    const callArgs = mockRouteJsonChat.mock.calls[0][0] as { user: string };
    expect(callArgs.user).toContain('[sectionId=intro]');
    expect(callArgs.user).toContain('[sectionId=body]');
  });

  it('calls routeJsonChat with class smart', async () => {
    mockRouteJsonChat.mockResolvedValue(makeJsonChatResult([]));
    const { extractClaims } = await import('../../../src/server/pipeline/stages/extract-claims');
    const ctx = makeCtx();
    await extractClaims.run({ plan, sectionDrafts }, ctx);

    expect(mockRouteJsonChat.mock.calls[0][0]).toMatchObject({ class: 'smart' });
  });
});

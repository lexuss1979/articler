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
  createdAt: new Date(),
};

const plan = {
  thesis: 'Prompt caching reduces costs.',
  targetTakeaway: 'Use prompt caching to save money.',
  sections: [
    {
      id: 'intro',
      title: 'Introduction',
      intent: 'Hook.',
      keyPoints: ['Overview'],
      expectedLength: 200,
    },
    {
      id: 'body',
      title: 'Main',
      intent: 'Explain.',
      keyPoints: ['Details'],
      expectedLength: 1000,
    },
  ],
};

const sectionDrafts = [
  { sectionId: 'intro', contentMd: '# Intro\nHello world.' },
  { sectionId: 'body', contentMd: '# Body\nDetails here.' },
];

function makeJsonChatResult(payload: unknown) {
  return {
    result: payload,
    modelUsed: 'claude-opus',
    modelClass: 'smart' as const,
    promptTokens: 100,
    completionTokens: 200,
    latencyMs: 500,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('proposeImageSlots stage', () => {
  it('returns the routeJsonChat result and emits start/complete with hero+inline count', async () => {
    const payload = {
      heroBrief: 'A glowing cache laid out across a server room',
      inlineSlots: [
        { sectionId: 'body', paragraphIndex: 1, brief: 'Diagram of cache hits' },
      ],
    };
    mockRouteJsonChat.mockResolvedValue(makeJsonChatResult(payload));
    const { proposeImageSlots } = await import(
      '../../../src/server/pipeline/stages/propose-image-slots'
    );
    const ctx = makeCtx();
    const result = await proposeImageSlots.run({ profile, plan, sectionDrafts }, ctx);

    expect(result).toEqual(payload);
    expect(ctx._emitted.map(([k]) => k)).toEqual(['task_started', 'task_completed']);
    expect(ctx._emitted[0][1]).toMatchObject({ stage: 'propose_image_slots' });
    expect(ctx._emitted[1][1]).toMatchObject({ stage: 'propose_image_slots', count: 2 });
  });

  it('passes class smart to routeJsonChat', async () => {
    mockRouteJsonChat.mockResolvedValue(
      makeJsonChatResult({ heroBrief: 'h', inlineSlots: [] }),
    );
    const { proposeImageSlots } = await import(
      '../../../src/server/pipeline/stages/propose-image-slots'
    );
    await proposeImageSlots.run({ profile, plan, sectionDrafts }, makeCtx());
    expect(mockRouteJsonChat.mock.calls[0][0]).toMatchObject({ class: 'smart' });
  });

  it('system prompt mentions the hero contract', async () => {
    mockRouteJsonChat.mockResolvedValue(
      makeJsonChatResult({ heroBrief: 'h', inlineSlots: [] }),
    );
    const { proposeImageSlots } = await import(
      '../../../src/server/pipeline/stages/propose-image-slots'
    );
    await proposeImageSlots.run({ profile, plan, sectionDrafts }, makeCtx());
    const callArgs = mockRouteJsonChat.mock.calls[0][0] as { system: string };
    expect(callArgs.system.toLowerCase()).toContain('hero');
    expect(callArgs.system).toContain('heroBrief');
    expect(callArgs.system).toContain('inlineSlots');
  });

  it('user prompt renders sections with [sectionId=...] tags', async () => {
    mockRouteJsonChat.mockResolvedValue(
      makeJsonChatResult({ heroBrief: 'h', inlineSlots: [] }),
    );
    const { proposeImageSlots } = await import(
      '../../../src/server/pipeline/stages/propose-image-slots'
    );
    await proposeImageSlots.run({ profile, plan, sectionDrafts }, makeCtx());
    const callArgs = mockRouteJsonChat.mock.calls[0][0] as { user: string };
    expect(callArgs.user).toContain('[sectionId=intro]');
    expect(callArgs.user).toContain('[sectionId=body]');
  });

  it('still issues a valid call with empty sectionDrafts', async () => {
    mockRouteJsonChat.mockResolvedValue(
      makeJsonChatResult({ heroBrief: 'h', inlineSlots: [] }),
    );
    const { proposeImageSlots } = await import(
      '../../../src/server/pipeline/stages/propose-image-slots'
    );
    const result = await proposeImageSlots.run(
      { profile, plan, sectionDrafts: [] },
      makeCtx(),
    );
    expect(result).toEqual({ heroBrief: 'h', inlineSlots: [] });
    expect(mockRouteJsonChat).toHaveBeenCalledTimes(1);
    const callArgs = mockRouteJsonChat.mock.calls[0][0] as { user: string };
    expect(callArgs.user).toBe('');
  });
});

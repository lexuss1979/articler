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
  ],
};

const minimalPrompt = {
  subject: 'A laptop on a desk with code',
  style: 'editorial photo',
  composition: 'centered, shallow depth of field',
  palette: ['indigo', 'amber'],
  lighting: 'soft window light',
  mood: 'focused',
  aspect: '16:9' as const,
};

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

describe('composeImagePrompt stage', () => {
  it('returns the routeJsonChat result and emits start/complete with slotId', async () => {
    mockRouteJsonChat.mockResolvedValue(makeJsonChatResult(minimalPrompt));
    const { composeImagePrompt } = await import(
      '../../../src/server/pipeline/stages/compose-image-prompt'
    );
    const ctx = makeCtx();
    const result = await composeImagePrompt.run(
      {
        profile,
        plan,
        slot: { id: 'slot_a', kind: 'inline', sectionId: 'intro', paragraphIndex: 0, brief: 'Cache hit diagram' },
      },
      ctx,
    );
    expect(result).toEqual(minimalPrompt);
    expect(ctx._emitted.map(([k]) => k)).toEqual(['task_started', 'task_completed']);
    expect(ctx._emitted[0][1]).toMatchObject({ stage: 'compose_image_prompt', slotId: 'slot_a' });
    expect(ctx._emitted[1][1]).toMatchObject({ stage: 'compose_image_prompt', slotId: 'slot_a' });
  });

  it('forwards the slot brief into the user prompt', async () => {
    mockRouteJsonChat.mockResolvedValue(makeJsonChatResult(minimalPrompt));
    const { composeImagePrompt } = await import(
      '../../../src/server/pipeline/stages/compose-image-prompt'
    );
    await composeImagePrompt.run(
      {
        profile,
        plan,
        slot: { id: 'slot_b', kind: 'hero', brief: 'unique-hero-brief-token' },
      },
      makeCtx(),
    );
    const callArgs = mockRouteJsonChat.mock.calls[0][0] as { user: string };
    expect(callArgs.user).toContain('unique-hero-brief-token');
  });

  it('passes class smart to routeJsonChat', async () => {
    mockRouteJsonChat.mockResolvedValue(makeJsonChatResult(minimalPrompt));
    const { composeImagePrompt } = await import(
      '../../../src/server/pipeline/stages/compose-image-prompt'
    );
    await composeImagePrompt.run(
      {
        profile,
        plan,
        slot: { id: 'slot_a', kind: 'hero', brief: 'b' },
      },
      makeCtx(),
    );
    expect(mockRouteJsonChat.mock.calls[0][0]).toMatchObject({ class: 'smart' });
  });

  it('includes surroundingMd when provided', async () => {
    mockRouteJsonChat.mockResolvedValue(makeJsonChatResult(minimalPrompt));
    const { composeImagePrompt } = await import(
      '../../../src/server/pipeline/stages/compose-image-prompt'
    );
    await composeImagePrompt.run(
      {
        profile,
        plan,
        slot: { id: 'slot_x', kind: 'inline', sectionId: 'intro', paragraphIndex: 1, brief: 'b' },
        surroundingMd: 'unique-surrounding-token',
      },
      makeCtx(),
    );
    const callArgs = mockRouteJsonChat.mock.calls[0][0] as { user: string };
    expect(callArgs.user).toContain('unique-surrounding-token');
  });
});

describe('composeImagePrompt stage — fixture: habr-longread-1', () => {
  it('returns expected.snapshot when routeJsonChat returns it', async () => {
    type Fixture = {
      input: {
        profile: typeof profile;
        plan: typeof plan;
        slot: { id: string; kind: 'hero' | 'inline'; brief: string };
      };
      expected: { snapshot: typeof minimalPrompt };
    };
    const fixture = JSON.parse(
      readFileSync(
        join(__dirname, '../../eval/fixtures/compose_image_prompt/habr-longread-1.json'),
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

    const { composeImagePrompt } = await import(
      '../../../src/server/pipeline/stages/compose-image-prompt'
    );
    const result = await composeImagePrompt.run(
      {
        ...fixture.input,
        profile: {
          ...fixture.input.profile,
          createdAt: new Date(fixture.input.profile.createdAt as unknown as string),
        },
      } as Parameters<typeof composeImagePrompt.run>[0],
      makeCtx(),
    );
    expect(result).toEqual(fixture.expected.snapshot);
  });
});

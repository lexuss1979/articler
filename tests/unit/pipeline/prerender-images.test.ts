import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSaveImageFromB64 = vi.fn();
const mockSaveImageFromUrl = vi.fn();

vi.mock('../../../src/server/images/storage', () => ({
  saveImageFromB64: mockSaveImageFromB64,
  saveImageFromUrl: mockSaveImageFromUrl,
  IMAGES_ROOT: '/tmp/test-images',
}));

const FAKE_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const minimalPrompt = {
  subject: 'A laptop',
  style: 'editorial photo',
  composition: 'centered',
  palette: ['indigo', 'amber'],
  lighting: 'soft window',
  mood: 'focused',
  aspect: '16:9' as const,
};

type ImageResp = {
  data: Array<{ url?: string; b64_json?: string }>;
  modelUsed: string;
  modelClass: 'image';
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
};

type RouteImageFn = (args: { prompt: string }) => Promise<ImageResp>;

function makeCtx(routeImage: RouteImageFn) {
  const emitted: Array<[string, unknown]> = [];
  return {
    emit: vi.fn(async (kind: string, payload: unknown) => {
      emitted.push([kind, payload]);
      return { id: 1, sessionId: 1, kind, payload, ts: new Date() };
    }),
    userInput: vi.fn(),
    log: { append: vi.fn() },
    llm: {
      routeImage: routeImage as unknown as (args: { prompt: string }) => Promise<ImageResp>,
      routeChat: vi.fn() as unknown as (args: { messages: unknown[] }) => Promise<never>,
      routeSearch: vi.fn() as unknown as (args: { messages: unknown[] }) => Promise<never>,
    },
    _emitted: emitted,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSaveImageFromB64.mockImplementation(async (args) => ({
    localPath: `/api/images/${args.sessionId}/${args.slotId}/${args.candidateId}.png`,
    absPath: `/tmp/test-images/${args.sessionId}/${args.slotId}/${args.candidateId}.png`,
  }));
  mockSaveImageFromUrl.mockImplementation(async (args) => ({
    localPath: `/api/images/${args.sessionId}/${args.slotId}/${args.candidateId}.jpg`,
    absPath: `/tmp/test-images/${args.sessionId}/${args.slotId}/${args.candidateId}.jpg`,
  }));
});

describe('prerenderImages stage', () => {
  it('returns 3 candidates by default and emits start/complete', async () => {
    const routeImage = vi.fn(async (_args: { prompt: string }) => ({
      data: [{ b64_json: FAKE_B64 }],
      modelUsed: 'google/nano-banana',
      modelClass: 'image' as const,
      promptTokens: 0,
      completionTokens: 0,
      latencyMs: 100,
    }));
    const ctx = makeCtx(routeImage);
    const { prerenderImages } = await import(
      '../../../src/server/pipeline/stages/prerender-images'
    );
    const result = await prerenderImages.run(
      { sessionId: 7, slotId: 'slot_a', prompt: minimalPrompt },
      ctx,
    );
    expect(result.candidates).toHaveLength(3);
    expect(routeImage).toHaveBeenCalledTimes(3);
    for (const c of result.candidates) {
      expect(c.source).toBe('generated');
      expect(c.localPath.startsWith('/api/images/7/slot_a/')).toBe(true);
      expect(c.model).toBe('google/nano-banana');
    }
    expect(ctx._emitted.map(([k]) => k)).toEqual(['task_started', 'task_completed']);
    expect(ctx._emitted[1][1]).toMatchObject({
      stage: 'prerender_images',
      slotId: 'slot_a',
      count: 3,
    });
  });

  it('falls back to saveImageFromUrl when only url is present', async () => {
    const routeImage = vi.fn(async (_args: { prompt: string }) => ({
      data: [{ url: 'https://cdn.example.com/x.jpg' }],
      modelUsed: 'openai/image-2',
      modelClass: 'image' as const,
      promptTokens: 0,
      completionTokens: 0,
      latencyMs: 100,
    }));
    const ctx = makeCtx(routeImage);
    const { prerenderImages } = await import(
      '../../../src/server/pipeline/stages/prerender-images'
    );
    const result = await prerenderImages.run(
      { sessionId: 1, slotId: 'slot_a', prompt: minimalPrompt, count: 2 },
      ctx,
    );
    expect(result.candidates).toHaveLength(2);
    expect(mockSaveImageFromUrl).toHaveBeenCalledTimes(2);
    expect(mockSaveImageFromB64).not.toHaveBeenCalled();
  });

  it('skips candidates that have neither b64_json nor url', async () => {
    let call = 0;
    const routeImage = vi.fn(async () => {
      call++;
      return {
        data: [
          call === 1 ? { b64_json: FAKE_B64 } : {},
        ],
        modelUsed: 'google/nano-banana',
        modelClass: 'image' as const,
        promptTokens: 0,
        completionTokens: 0,
        latencyMs: 100,
      };
    });
    const ctx = makeCtx(routeImage);
    const { prerenderImages } = await import(
      '../../../src/server/pipeline/stages/prerender-images'
    );
    const result = await prerenderImages.run(
      { sessionId: 1, slotId: 'slot_a', prompt: minimalPrompt, count: 3 },
      ctx,
    );
    expect(result.candidates).toHaveLength(1);
  });

  it('throws when every routeImage call fails', async () => {
    const routeImage = vi.fn(async () => {
      throw new Error('boom');
    });
    const ctx = makeCtx(routeImage);
    const { prerenderImages } = await import(
      '../../../src/server/pipeline/stages/prerender-images'
    );
    await expect(
      prerenderImages.run(
        { sessionId: 1, slotId: 'slot_a', prompt: minimalPrompt, count: 3 },
        ctx,
      ),
    ).rejects.toThrow(/all calls failed/);
  });

  it('builds a textual prompt that contains palette and aspect', async () => {
    const routeImage = vi.fn(async (_args: { prompt: string }) => ({
      data: [{ b64_json: FAKE_B64 }],
      modelUsed: 'google/nano-banana',
      modelClass: 'image' as const,
      promptTokens: 0,
      completionTokens: 0,
      latencyMs: 100,
    }));
    const ctx = makeCtx(routeImage);
    const { prerenderImages } = await import(
      '../../../src/server/pipeline/stages/prerender-images'
    );
    await prerenderImages.run(
      { sessionId: 1, slotId: 'slot_a', prompt: minimalPrompt, count: 1 },
      ctx,
    );
    const callArg = routeImage.mock.calls[0]![0] as { prompt: string };
    expect(callArg.prompt).toContain('indigo, amber');
    expect(callArg.prompt).toContain('aspect 16:9');
    expect(callArg.prompt).toContain('negative: none');
  });
});

import { describe, it, expect, vi, afterEach } from 'vitest';
import { OpenRouterError } from '../../../src/server/llm/openrouter';
import { MODEL_ROUTING } from '../../../src/server/llm/models';

vi.mock('../../../src/server/llm/openrouter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/server/llm/openrouter')>();
  return { ...actual, openrouterChat: vi.fn(), openrouterImage: vi.fn() };
});

afterEach(() => {
  vi.resetAllMocks();
});

function makeChatResponse(model: string) {
  return {
    id: 'r1',
    model,
    choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 10, completion_tokens: 5 },
  };
}

describe('routeChat', () => {
  it('retries fallback on 5xx and returns fallback modelUsed', async () => {
    const { openrouterChat } = await import('../../../src/server/llm/openrouter');
    const { routeChat } = await import('../../../src/server/llm/router');
    const fallback = MODEL_ROUTING.smart.fallback;

    vi.mocked(openrouterChat)
      .mockRejectedValueOnce(new OpenRouterError(503, 'overload'))
      .mockResolvedValueOnce(makeChatResponse(fallback));

    const result = await routeChat({ messages: [] });
    expect(result.modelUsed).toBe(fallback);
  });

  it('does not retry on 4xx errors', async () => {
    const { openrouterChat } = await import('../../../src/server/llm/openrouter');
    const { routeChat } = await import('../../../src/server/llm/router');

    vi.mocked(openrouterChat).mockRejectedValue(new OpenRouterError(400, 'bad request'));

    await expect(routeChat({ messages: [] })).rejects.toThrow(OpenRouterError);
    expect(vi.mocked(openrouterChat)).toHaveBeenCalledTimes(1);
  });

  it('uses smart class by default', async () => {
    const { openrouterChat } = await import('../../../src/server/llm/openrouter');
    const { routeChat } = await import('../../../src/server/llm/router');

    vi.mocked(openrouterChat).mockResolvedValue(
      makeChatResponse(MODEL_ROUTING.smart.primary),
    );

    const result = await routeChat({ messages: [] });
    expect(result.modelClass).toBe('smart');
    expect(result.modelUsed).toBe(MODEL_ROUTING.smart.primary);
  });

  it('uses fast class when specified', async () => {
    const { openrouterChat } = await import('../../../src/server/llm/openrouter');
    const { routeChat } = await import('../../../src/server/llm/router');

    vi.mocked(openrouterChat).mockResolvedValue(
      makeChatResponse(MODEL_ROUTING.fast.primary),
    );

    const result = await routeChat({ messages: [], class: 'fast' });
    expect(result.modelClass).toBe('fast');
  });
});

describe('routeSearch', () => {
  it('uses search class and returns content', async () => {
    const { openrouterChat } = await import('../../../src/server/llm/openrouter');
    const { routeSearch } = await import('../../../src/server/llm/router');

    vi.mocked(openrouterChat).mockResolvedValue(
      makeChatResponse(MODEL_ROUTING.search.primary),
    );

    const result = await routeSearch({ messages: [] });
    expect(result.modelClass).toBe('search');
    expect(result.content).toBe('ok');
  });
});

describe('routeImage', () => {
  it('uses image class and returns data array', async () => {
    const { openrouterImage } = await import('../../../src/server/llm/openrouter');
    const { routeImage } = await import('../../../src/server/llm/router');

    vi.mocked(openrouterImage).mockResolvedValue({
      data: [{ url: 'https://example.com/img.png' }],
    });

    const result = await routeImage({ prompt: 'a cat' });
    expect(result.modelClass).toBe('image');
    expect(result.data[0].url).toBe('https://example.com/img.png');
  });
});

import { describe, it, expect, vi, afterEach } from 'vitest';
import { openrouterChat, openrouterImage, OpenRouterError } from '../../../src/server/llm/openrouter';

const FAKE_CHAT_RESPONSE = {
  id: 'chat-1',
  model: 'anthropic/claude-opus-4.7',
  choices: [{ message: { role: 'assistant', content: 'Hello' }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 10, completion_tokens: 5 },
};

function mockFetch(status: number, body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(JSON.stringify(body)),
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.OPENROUTER_API_KEY;
});

describe('openrouterChat', () => {
  it('sends Authorization header with API key', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    mockFetch(200, FAKE_CHAT_RESPONSE);

    await openrouterChat({ model: 'anthropic/claude-opus-4.7', messages: [] });

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer test-key');
  });

  it('parses a 200 chat response into the typed shape', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    mockFetch(200, FAKE_CHAT_RESPONSE);

    const result = await openrouterChat({ model: 'anthropic/claude-opus-4.7', messages: [] });

    expect(result.id).toBe('chat-1');
    expect(result.usage.prompt_tokens).toBe(10);
    expect(result.choices[0].message.content).toBe('Hello');
  });

  it('throws OpenRouterError with status 500 on a 500 response', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    mockFetch(500, { error: 'internal server error' });

    await expect(
      openrouterChat({ model: 'anthropic/claude-opus-4.7', messages: [] }),
    ).rejects.toThrow(OpenRouterError);

    await expect(
      openrouterChat({ model: 'anthropic/claude-opus-4.7', messages: [] }),
    ).rejects.toMatchObject({ status: 500 });
  });

  it('throws synchronously when API key is missing', async () => {
    mockFetch(200, FAKE_CHAT_RESPONSE);
    await expect(
      openrouterChat({ model: 'anthropic/claude-opus-4.7', messages: [] }),
    ).rejects.toThrow('OPENROUTER_API_KEY is not set');
  });
});

describe('openrouterImage', () => {
  it('posts to image generations endpoint and returns data array', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    mockFetch(200, { data: [{ url: 'https://example.com/img.png' }] });

    const result = await openrouterImage({ model: 'google/nano-banana', prompt: 'a cat' });

    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/v1/images/generations');
    expect(result.data[0].url).toBe('https://example.com/img.png');
  });
});

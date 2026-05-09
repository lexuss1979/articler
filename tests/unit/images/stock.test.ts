import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockUndiciFetch = vi.hoisted(() => vi.fn());

vi.mock('undici', async (importOriginal) => {
  const actual = await importOriginal<typeof import('undici')>();
  return { ...actual, fetch: mockUndiciFetch };
});

function fakeResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
    headers: new Map(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  delete process.env.UNSPLASH_ACCESS_KEY;
});

describe('searchUnsplash', () => {
  it('throws StockUnconfiguredError when UNSPLASH_ACCESS_KEY is missing', async () => {
    const { searchUnsplash, StockUnconfiguredError } = await import(
      '../../../src/server/images/stock'
    );
    await expect(searchUnsplash(['cache'])).rejects.toBeInstanceOf(StockUnconfiguredError);
  });

  it('returns normalized candidates on a 200 response', async () => {
    process.env.UNSPLASH_ACCESS_KEY = 'test-key';
    mockUndiciFetch.mockResolvedValue(
      fakeResponse(200, {
        results: [
          {
            id: 'abc123',
            urls: { regular: 'https://images.unsplash.com/abc-regular', small: 'https://images.unsplash.com/abc-small' },
            user: { name: 'Jane Doe' },
          },
          {
            id: 'def456',
            urls: { regular: 'https://images.unsplash.com/def-regular', small: 'https://images.unsplash.com/def-small' },
            user: { name: 'John Roe' },
          },
        ],
      }),
    );
    const { searchUnsplash } = await import('../../../src/server/images/stock');
    const out = await searchUnsplash(['cache', 'memory']);
    expect(out.candidates).toEqual([
      {
        id: 'unsplash_abc123',
        sourceUrl: 'https://images.unsplash.com/abc-regular',
        thumbUrl: 'https://images.unsplash.com/abc-small',
        attribution: 'Photo by Jane Doe on Unsplash',
      },
      {
        id: 'unsplash_def456',
        sourceUrl: 'https://images.unsplash.com/def-regular',
        thumbUrl: 'https://images.unsplash.com/def-small',
        attribution: 'Photo by John Roe on Unsplash',
      },
    ]);
  });

  it('sends Authorization: Client-ID <key> and the encoded query', async () => {
    process.env.UNSPLASH_ACCESS_KEY = 'sec_42';
    mockUndiciFetch.mockResolvedValue(fakeResponse(200, { results: [] }));
    const { searchUnsplash } = await import('../../../src/server/images/stock');
    await searchUnsplash(['cache hit', 'memory']);

    const [url, init] = mockUndiciFetch.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(url).toContain('https://api.unsplash.com/search/photos?query=');
    expect(url).toContain('cache+hit+memory');
    expect(url).toContain('per_page=6');
    expect(init.headers.Authorization).toBe('Client-ID sec_42');
  });

  it('throws StockHttpError with status on non-200', async () => {
    process.env.UNSPLASH_ACCESS_KEY = 'k';
    mockUndiciFetch.mockResolvedValue(fakeResponse(401, 'unauthorized'));
    const { searchUnsplash, StockHttpError } = await import(
      '../../../src/server/images/stock'
    );
    await expect(searchUnsplash(['x'])).rejects.toBeInstanceOf(StockHttpError);

    mockUndiciFetch.mockResolvedValue(fakeResponse(401, 'unauthorized'));
    try {
      await searchUnsplash(['x']);
    } catch (err) {
      expect((err as { status: number }).status).toBe(401);
    }
  });
});

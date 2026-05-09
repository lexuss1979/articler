import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchExampleUrl } from '../../../src/server/profiles/fetch-example-url';

function makeResponse(
  body: string,
  status: number,
  contentType: string,
): Response {
  return new Response(body, {
    status,
    headers: { 'content-type': contentType },
  });
}

describe('fetchExampleUrl', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('strips script/style blocks and HTML tags from a 200 text/html response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(makeResponse(
        '<script>bad()</script><p>hi</p>',
        200,
        'text/html; charset=utf-8',
      )),
    );

    const result = await fetchExampleUrl('https://example.com/article');

    expect(result).toEqual({ ok: true, content: 'hi' });
  });

  it('returns ok: false with non-empty error for a 404 response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(makeResponse('Not Found', 404, 'text/html')),
    );

    const result = await fetchExampleUrl('https://example.com/missing');

    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error.length).toBeGreaterThan(0);
  });

  it('returns ok: false when fetch throws (network error)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('connection refused')),
    );

    const result = await fetchExampleUrl('https://example.com/article');

    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error.length).toBeGreaterThan(0);
  });

  it('returns ok: false for a 200 response with content-type application/pdf', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(makeResponse('%PDF-1.4 ...', 200, 'application/pdf')),
    );

    const result = await fetchExampleUrl('https://example.com/doc.pdf');

    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error.length).toBeGreaterThan(0);
  });

  it('strips style blocks in addition to script blocks', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(makeResponse(
        '<style>body { color: red; }</style><p>hello world</p>',
        200,
        'text/html',
      )),
    );

    const result = await fetchExampleUrl('https://example.com/article');

    expect(result).toEqual({ ok: true, content: 'hello world' });
  });

  it('handles text/plain responses correctly', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(makeResponse('plain text content', 200, 'text/plain')),
    );

    const result = await fetchExampleUrl('https://example.com/text.txt');

    expect(result).toEqual({ ok: true, content: 'plain text content' });
  });

  it('caps content at 50_000 characters', async () => {
    const bigContent = 'a'.repeat(100_000);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(makeResponse(bigContent, 200, 'text/plain')),
    );

    const result = await fetchExampleUrl('https://example.com/big.txt');

    expect(result.ok).toBe(true);
    expect((result as { ok: true; content: string }).content.length).toBe(50_000);
  });

  it('collapses whitespace in the output', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(makeResponse(
        '<p>hello   \n\n   world</p>',
        200,
        'text/html',
      )),
    );

    const result = await fetchExampleUrl('https://example.com/article');

    expect(result).toEqual({ ok: true, content: 'hello world' });
  });
});

import { fetch as undiciFetch, ProxyAgent, type Dispatcher } from 'undici';
import '../proxy';

export class StockUnconfiguredError extends Error {
  constructor() {
    super('UNSPLASH_ACCESS_KEY not set');
    this.name = 'StockUnconfiguredError';
  }
}

export class StockHttpError extends Error {
  constructor(public readonly status: number, body?: string) {
    super(`Unsplash HTTP ${status}` + (body ? `: ${body.slice(0, 200)}` : ''));
    this.name = 'StockHttpError';
  }
}

export interface StockCandidate {
  id: string;
  sourceUrl: string;
  thumbUrl: string;
  attribution: string;
}

interface UnsplashSearchHit {
  id: string;
  urls: { regular: string; small: string };
  user: { name: string };
}

function getDispatcher(): Dispatcher | undefined {
  const proxy = process.env.HTTP_PROXY || process.env.HTTPS_PROXY;
  return proxy ? new ProxyAgent(proxy) : undefined;
}

export async function searchUnsplash(
  keywords: string[],
  opts?: { perPage?: number },
): Promise<{ candidates: StockCandidate[] }> {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) throw new StockUnconfiguredError();

  const perPage = opts?.perPage ?? 6;
  const query = encodeURIComponent(keywords.join(' ')).replace(/%20/g, '+');
  const url = `https://api.unsplash.com/search/photos?query=${query}&per_page=${perPage}`;

  const res = await undiciFetch(url, {
    headers: {
      Authorization: `Client-ID ${key}`,
    },
    dispatcher: getDispatcher(),
  } as Parameters<typeof undiciFetch>[1]);

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new StockHttpError(res.status, body);
  }

  const data = (await res.json()) as { results?: UnsplashSearchHit[] };
  const results = Array.isArray(data.results) ? data.results : [];

  const candidates: StockCandidate[] = results.map((hit) => ({
    id: 'unsplash_' + hit.id,
    sourceUrl: hit.urls.regular,
    thumbUrl: hit.urls.small,
    attribution: `Photo by ${hit.user.name} on Unsplash`,
  }));

  return { candidates };
}

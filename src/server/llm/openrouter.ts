import { fetch as undiciFetch, ProxyAgent, type Dispatcher } from 'undici';
import '../proxy';

export class OpenRouterError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(`OpenRouter error ${status}`);
    this.name = 'OpenRouterError';
  }
}

function getDispatcher(): Dispatcher | undefined {
  const proxy = process.env.HTTP_PROXY || process.env.HTTPS_PROXY;
  return proxy ? new ProxyAgent(proxy) : undefined;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatResponse {
  id: string;
  model: string;
  choices: Array<{ message: { role: string; content: string }; finish_reason: string }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    cost?: number;
    prompt_tokens_details?: {
      cached_tokens?: number;
      cache_write_tokens?: number;
    };
    completion_tokens_details?: {
      reasoning_tokens?: number;
    };
  };
}

export interface ImageResponse {
  data: Array<{ url?: string; b64_json?: string }>;
  usage?: ChatResponse['usage'];
}

function apiKey(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('OPENROUTER_API_KEY is not set');
  return key;
}

// Network-level errors worth retrying — usually transient residential-proxy
// hiccups (bad exit, tunnel reset, CONNECT 502). API-level errors from
// OpenRouter (any 4xx/5xx response body) are NOT retried.
const RETRYABLE_NETWORK_CODES = new Set([
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_ABORTED',
  'UND_ERR_SOCKET',
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EAI_AGAIN',
]);

function isRetryableNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.name !== 'TypeError' || err.message !== 'fetch failed') return false;
  const cause = (err as { cause?: { code?: string; cause?: { code?: string } } }).cause;
  if (cause?.code && RETRYABLE_NETWORK_CODES.has(cause.code)) return true;
  // Inner cause (e.g. TypeError → AbortError → underlying)
  if (cause?.cause?.code && RETRYABLE_NETWORK_CODES.has(cause.cause.code)) return true;
  return false;
}

async function postOnce<T>(path: string, body: unknown): Promise<T> {
  const res = await undiciFetch(`https://openrouter.ai${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey()}`,
    },
    body: JSON.stringify(body),
    dispatcher: getDispatcher(),
  } as Parameters<typeof undiciFetch>[1]);
  const responseBody = await res.text().catch(() => '');
  if (!res.ok) {
    throw new OpenRouterError(res.status, responseBody);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(responseBody);
  } catch {
    throw new OpenRouterError(res.status, `Non-JSON response: ${responseBody.slice(0, 200)}`);
  }
  if (
    parsed !== null &&
    typeof parsed === 'object' &&
    'choices' in parsed &&
    Array.isArray((parsed as { choices: unknown }).choices)
  ) {
    const choices = (parsed as { choices: unknown[] }).choices;
    if (choices.length === 0) {
      throw new OpenRouterError(200, `Empty choices array: ${responseBody.slice(0, 500)}`);
    }
    const first = choices[0] as { message?: { content?: unknown } } | undefined;
    if (first && 'message' in first) {
      const content = first.message?.content;
      if (content == null || (typeof content === 'string' && content.trim() === '')) {
        throw new OpenRouterError(
          200,
          `Empty/null message content: ${responseBody.slice(0, 500)}`,
        );
      }
    }
  }
  return parsed as T;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const maxAttempts = 3;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await postOnce<T>(path, body);
    } catch (err) {
      lastErr = err;
      if (!isRetryableNetworkError(err) || attempt === maxAttempts) throw err;
      const delayMs = 200 * 2 ** (attempt - 1); // 200, 400ms
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

export function openrouterChat(args: {
  model: string;
  messages: ChatMessage[];
  [key: string]: unknown;
}): Promise<ChatResponse> {
  return post<ChatResponse>('/api/v1/chat/completions', { stream: false, ...args });
}

interface ChatImagesResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
      images?: Array<{ image_url?: { url?: string } }>;
    };
  }>;
  usage?: ChatResponse['usage'];
}

async function imageFetchOnce(body: unknown): Promise<Response> {
  return undiciFetch(`https://openrouter.ai/api/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey()}`,
    },
    body: JSON.stringify(body),
    dispatcher: getDispatcher(),
  } as Parameters<typeof undiciFetch>[1]) as unknown as Promise<Response>;
}

export async function openrouterImage(args: {
  model: string;
  prompt: string;
  [key: string]: unknown;
}): Promise<ImageResponse> {
  const { model, prompt, ...rest } = args;
  const body = {
    model,
    messages: [{ role: 'user', content: prompt }],
    modalities: ['image', 'text'],
    stream: false,
    ...rest,
  };

  const maxAttempts = 3;
  let res: Response | undefined;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      res = await imageFetchOnce(body);
      break;
    } catch (err) {
      lastErr = err;
      if (!isRetryableNetworkError(err) || attempt === maxAttempts) throw err;
      await new Promise((r) => setTimeout(r, 200 * 2 ** (attempt - 1)));
    }
  }
  if (!res) throw lastErr;

  const responseBody = await res.text().catch(() => '');
  if (!res.ok) {
    throw new OpenRouterError(res.status, responseBody);
  }

  let parsed: ChatImagesResponse;
  try {
    parsed = JSON.parse(responseBody);
  } catch {
    throw new OpenRouterError(res.status, `Non-JSON response: ${responseBody.slice(0, 200)}`);
  }

  const images = parsed.choices?.[0]?.message?.images ?? [];
  if (!Array.isArray(images) || images.length === 0) {
    throw new OpenRouterError(
      200,
      `No images in chat response: ${responseBody.slice(0, 500)}`,
    );
  }

  const data: ImageResponse['data'] = images.map((img) => {
    const url = img.image_url?.url;
    if (!url) return {};
    const dataMatch = url.match(/^data:([^;]+);base64,(.+)$/);
    if (dataMatch) {
      return { b64_json: dataMatch[2] };
    }
    return { url };
  });

  return { data, usage: parsed.usage };
}

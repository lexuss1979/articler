import { fetch as undiciFetch, ProxyAgent, type Dispatcher } from 'undici';

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
  usage: { prompt_tokens: number; completion_tokens: number };
}

export interface ImageResponse {
  data: Array<{ url?: string; b64_json?: string }>;
}

function apiKey(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('OPENROUTER_API_KEY is not set');
  return key;
}

async function post<T>(path: string, body: unknown): Promise<T> {
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

export function openrouterChat(args: {
  model: string;
  messages: ChatMessage[];
  [key: string]: unknown;
}): Promise<ChatResponse> {
  return post<ChatResponse>('/api/v1/chat/completions', { stream: false, ...args });
}

export function openrouterImage(args: {
  model: string;
  prompt: string;
  [key: string]: unknown;
}): Promise<ImageResponse> {
  return post<ImageResponse>('/api/v1/images/generations', args);
}

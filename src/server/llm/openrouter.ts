export class OpenRouterError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(`OpenRouter error ${status}`);
    this.name = 'OpenRouterError';
  }
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
  const res = await fetch(`https://openrouter.ai${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey()}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const responseBody = await res.text().catch(() => '');
    throw new OpenRouterError(res.status, responseBody);
  }
  return res.json() as Promise<T>;
}

export function openrouterChat(args: {
  model: string;
  messages: ChatMessage[];
  [key: string]: unknown;
}): Promise<ChatResponse> {
  return post<ChatResponse>('/api/v1/chat/completions', args);
}

export function openrouterImage(args: {
  model: string;
  prompt: string;
  [key: string]: unknown;
}): Promise<ImageResponse> {
  return post<ImageResponse>('/api/v1/images/generations', args);
}

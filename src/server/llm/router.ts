import { openrouterChat, openrouterImage, OpenRouterError, type ChatMessage } from './openrouter';
import { modelsFor, type ModelClass } from './models';

export interface RouterResult {
  modelUsed: string;
  modelClass: ModelClass;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
}

export interface ChatRouterResult extends RouterResult {
  content: string;
}

export interface ImageRouterResult extends RouterResult {
  data: Array<{ url?: string; b64_json?: string }>;
}

function isTransient(err: unknown): boolean {
  if (!(err instanceof OpenRouterError)) return false;
  if (err.status >= 500) return true;
  // 200 with non-JSON body = empty/whitespace response from model, treat as transient
  if (err.status === 200) return true;
  return false;
}

async function withFallback<T>(
  cls: ModelClass,
  call: (model: string) => Promise<T>,
): Promise<T & { modelUsed: string }> {
  const models = modelsFor(cls);
  for (let i = 0; i < models.length; i++) {
    try {
      const result = await call(models[i]);
      return { ...result, modelUsed: models[i] };
    } catch (err) {
      if (i < models.length - 1 && isTransient(err)) continue;
      throw err;
    }
  }
  throw new Error(`No models available for class "${cls}"`);
}

export async function routeChat(args: {
  messages: ChatMessage[];
  class?: 'smart' | 'fast';
  [key: string]: unknown;
}): Promise<ChatRouterResult> {
  const cls: ModelClass = args.class ?? 'smart';
  const { messages } = args;
  const extra = Object.fromEntries(
    Object.entries(args).filter(([k]) => k !== 'class' && k !== 'messages'),
  );
  const start = Date.now();

  const { modelUsed, ...response } = await withFallback(cls, (model) =>
    openrouterChat({ model, messages, ...extra }),
  );

  return {
    content: response.choices[0].message.content,
    modelUsed,
    modelClass: cls,
    promptTokens: response.usage.prompt_tokens,
    completionTokens: response.usage.completion_tokens,
    latencyMs: Date.now() - start,
  };
}

export async function routeSearch(args: {
  messages: ChatMessage[];
  [key: string]: unknown;
}): Promise<ChatRouterResult> {
  const cls: ModelClass = 'search';
  const { messages, ...rest } = args;
  const start = Date.now();

  const { modelUsed, ...response } = await withFallback(cls, (model) =>
    openrouterChat({ model, messages, ...rest }),
  );

  return {
    content: response.choices[0].message.content,
    modelUsed,
    modelClass: cls,
    promptTokens: response.usage.prompt_tokens,
    completionTokens: response.usage.completion_tokens,
    latencyMs: Date.now() - start,
  };
}

export async function routeImage(args: {
  prompt: string;
  [key: string]: unknown;
}): Promise<ImageRouterResult> {
  const cls: ModelClass = 'image';
  const { prompt, ...rest } = args;
  const start = Date.now();

  const { modelUsed, ...response } = await withFallback(cls, (model) =>
    openrouterImage({ model, prompt, ...rest }),
  );

  return {
    data: response.data,
    modelUsed,
    modelClass: cls,
    promptTokens: 0,
    completionTokens: 0,
    latencyMs: Date.now() - start,
  };
}

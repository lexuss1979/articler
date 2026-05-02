import type { ZodIssue, ZodSchema } from 'zod';
import { routeChat } from './router';
import type { ChatRouterResult } from './router';
import type { ModelClass } from './models';

export class JsonChatParseError extends Error {
  constructor(public readonly rawContent: string) {
    super('LLM returned non-JSON content');
    this.name = 'JsonChatParseError';
  }
}

export class JsonChatSchemaError extends Error {
  constructor(public readonly issues: ZodIssue[]) {
    super('LLM JSON response did not match expected schema');
    this.name = 'JsonChatSchemaError';
  }
}

export type JsonChatResult<T> = Omit<ChatRouterResult, 'content'> & { result: T };

// TODO: consider retry-on-parse-error
export async function routeJsonChat<T>(args: {
  system: string;
  user: string;
  schema: ZodSchema<T>;
  class?: 'smart' | 'fast';
}): Promise<JsonChatResult<T>> {
  const { system, user, schema, class: modelClass } = args;

  const chatResult = await routeChat({
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    class: (modelClass ?? 'smart') as 'smart' | 'fast',
    response_format: { type: 'json_object' },
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(chatResult.content);
  } catch {
    throw new JsonChatParseError(chatResult.content);
  }

  const validated = schema.safeParse(parsed);
  if (!validated.success) {
    throw new JsonChatSchemaError(validated.error.issues);
  }

  return {
    result: validated.data,
    modelUsed: chatResult.modelUsed,
    modelClass: chatResult.modelClass as ModelClass,
    promptTokens: chatResult.promptTokens,
    completionTokens: chatResult.completionTokens,
    latencyMs: chatResult.latencyMs,
  };
}

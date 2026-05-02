import type { ZodIssue, ZodSchema } from 'zod';
import { routeChat, routeSearch } from './router';
import type { ChatRouterResult } from './router';
import type { ModelClass } from './models';

export class JsonChatParseError extends Error {
  constructor(public readonly rawContent: string) {
    super('LLM returned non-JSON content');
    this.name = 'JsonChatParseError';
  }
}

function extractJson(content: string): string {
  // Strip markdown code fences: ```json ... ``` or ``` ... ```
  const fenced = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenced) return fenced[1]!.trim();
  // Fall back to first {...} or [...] block
  const obj = content.match(/\{[\s\S]*\}/);
  if (obj) return obj[0];
  const arr = content.match(/\[[\s\S]*\]/);
  if (arr) return arr[0];
  return content;
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
  class?: 'smart' | 'fast' | 'search';
}): Promise<JsonChatResult<T>> {
  const { system, user, schema, class: modelClass } = args;

  const messages = [
    { role: 'system' as const, content: system },
    { role: 'user' as const, content: user },
  ];

  const chatResult =
    modelClass === 'search'
      ? await routeSearch({ messages, response_format: { type: 'json_object' } })
      : await routeChat({
          messages,
          class: (modelClass ?? 'smart') as 'smart' | 'fast',
          response_format: { type: 'json_object' },
        });

  let parsed: unknown;
  try {
    parsed = JSON.parse(chatResult.content);
  } catch {
    try {
      parsed = JSON.parse(extractJson(chatResult.content));
    } catch {
      throw new JsonChatParseError(chatResult.content);
    }
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

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

export class JsonChatSchemaError extends Error {
  constructor(public readonly issues: ZodIssue[]) {
    super('LLM JSON response did not match expected schema');
    this.name = 'JsonChatSchemaError';
  }
}

export type JsonChatResult<T> = Omit<ChatRouterResult, 'content'> & { result: T };

function extractJson(content: string): string {
  const fenced = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenced) return fenced[1]!.trim();
  const obj = content.match(/\{[\s\S]*\}/);
  if (obj) return obj[0];
  const arr = content.match(/\[[\s\S]*\]/);
  if (arr) return arr[0];
  return content;
}

function tryParse(content: string): unknown {
  try { return JSON.parse(content); } catch {}
  try { return JSON.parse(extractJson(content)); } catch {}
  return undefined;
}

async function callModel(
  modelClass: 'smart' | 'fast' | 'search' | undefined,
  system: string,
  user: string,
): Promise<ChatRouterResult> {
  const messages = [
    { role: 'system' as const, content: system },
    { role: 'user' as const, content: user },
  ];
  return modelClass === 'search'
    ? routeSearch({ messages })
    : routeChat({
        messages,
        class: (modelClass ?? 'smart') as 'smart' | 'fast',
        response_format: { type: 'json_object' },
      });
}

export async function routeJsonChat<T>(args: {
  system: string;
  user: string;
  schema: ZodSchema<T>;
  class?: 'smart' | 'fast' | 'search';
}): Promise<JsonChatResult<T>> {
  const { system, user, schema, class: modelClass } = args;

  let chatResult = await callModel(modelClass, system, user);
  let parsed = tryParse(chatResult.content);

  if (parsed === undefined) {
    // Retry once with an explicit JSON-only reminder appended to the user message
    const retryUser = user + '\n\nRespond with valid JSON only. No prose, no markdown fences.';
    chatResult = await callModel(modelClass, system, retryUser);
    parsed = tryParse(chatResult.content);
    if (parsed === undefined) {
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

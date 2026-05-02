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

const UNSUPPORTED_KEYWORDS = new Set([
  '$schema', 'minLength', 'maxLength', 'minItems', 'maxItems',
  'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum',
  'multipleOf', 'pattern', 'format', 'uniqueItems',
  'contains', 'minContains', 'maxContains',
]);

function stripConstraints(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(stripConstraints);
  if (schema === null || typeof schema !== 'object') return schema;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema as Record<string, unknown>)) {
    if (UNSUPPORTED_KEYWORDS.has(k)) continue;
    out[k] = stripConstraints(v);
  }
  return out;
}

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
  jsonSchema?: object,
): Promise<ChatRouterResult> {
  const messages = [
    { role: 'system' as const, content: system },
    { role: 'user' as const, content: user },
  ];

  if (modelClass === 'search') {
    return routeSearch({ messages });
  }

  const response_format = jsonSchema
    ? {
        type: 'json_schema' as const,
        json_schema: { name: 'response', schema: jsonSchema },
      }
    : { type: 'json_object' as const };

  return routeChat({
    messages,
    class: (modelClass ?? 'smart') as 'smart' | 'fast',
    response_format,
  });
}

export async function routeJsonChat<T>(args: {
  system: string;
  user: string;
  schema: ZodSchema<T>;
  class?: 'smart' | 'fast' | 'search';
}): Promise<JsonChatResult<T>> {
  const { system, user, schema, class: modelClass } = args;

  const jsonSchema =
    modelClass !== 'search'
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? (stripConstraints((schema as any).toJSONSchema()) as object)
      : undefined;

  let chatResult = await callModel(modelClass, system, user, jsonSchema);
  let parsed = tryParse(chatResult.content);

  if (parsed === undefined) {
    const retryUser = user + '\n\nRespond with valid JSON only. No prose, no markdown fences.';
    chatResult = await callModel(modelClass, system, retryUser, jsonSchema);
    parsed = tryParse(chatResult.content);
    if (parsed === undefined) {
      throw new JsonChatParseError(chatResult.content);
    }
  }

  let validated = schema.safeParse(parsed);
  if (!validated.success) {
    const issueLines = validated.error.issues
      .map((i) => `- ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    const retryUser =
      user +
      `\n\nYour previous response had schema validation errors:\n${issueLines}\nPlease correct and respond with valid JSON only.`;
    chatResult = await callModel(modelClass, system, retryUser, jsonSchema);
    parsed = tryParse(chatResult.content);
    if (parsed === undefined) throw new JsonChatParseError(chatResult.content);
    validated = schema.safeParse(parsed);
    if (!validated.success) throw new JsonChatSchemaError(validated.error.issues);
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

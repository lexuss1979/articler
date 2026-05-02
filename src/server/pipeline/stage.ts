import type { ZodSchema } from 'zod';
import type { EventKind, PersistedEvent } from '../events/bus';

export type RouterResult = {
  modelUsed: string;
  modelClass: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  result: unknown;
};

export type StageCtx = {
  emit(kind: EventKind, payload: unknown): Promise<PersistedEvent>;
  userInput<T>(prompt: string, schema: ZodSchema<T>): Promise<T>;
  log: {
    append(entry: object): Promise<void>;
  };
  llm: {
    routeChat(args: { messages: unknown[]; class?: string }): Promise<RouterResult>;
    routeSearch(args: { messages: unknown[] }): Promise<RouterResult>;
    routeImage(args: { prompt: string }): Promise<RouterResult>;
  };
};

export type Stage<I, O> = {
  name: string;
  modelClass: 'smart' | 'fast' | 'search' | 'image';
  inputSchema: ZodSchema<I>;
  outputSchema: ZodSchema<O>;
  run(input: I, ctx: StageCtx): Promise<O>;
};

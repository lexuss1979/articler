import type { ZodSchema } from 'zod';
import type { EventKind, PersistedEvent } from '../events/bus';
import type { ChatRouterResult, ImageRouterResult } from '../llm/router';

export type StageCtx = {
  emit(kind: EventKind, payload: unknown): Promise<PersistedEvent>;
  userInput<T>(prompt: string, schema: ZodSchema<T>): Promise<T>;
  log: {
    append(entry: object): Promise<void>;
  };
  llm: {
    routeChat(args: { messages: unknown[]; class?: 'smart' | 'fast' }): Promise<ChatRouterResult>;
    routeSearch(args: { messages: unknown[] }): Promise<ChatRouterResult>;
    routeImage(args: { prompt: string }): Promise<ImageRouterResult>;
  };
};

export type Stage<I, O> = {
  name: string;
  modelClass: 'smart' | 'fast' | 'search' | 'image';
  inputSchema: ZodSchema<I>;
  outputSchema: ZodSchema<O>;
  run(input: I, ctx: StageCtx): Promise<O>;
};

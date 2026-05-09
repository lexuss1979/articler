import { AsyncLocalStorage } from 'node:async_hooks';

export interface LLMContext {
  userId?: number;
  sessionId?: number;
  stage: string;
  task: string;
  baseDir?: string;
}

const storage = new AsyncLocalStorage<LLMContext>();

export function runWithLLMContext<T>(ctx: LLMContext, fn: () => Promise<T>): Promise<T> {
  return storage.run(ctx, fn);
}

export function getLLMContext(): LLMContext | undefined {
  return storage.getStore();
}

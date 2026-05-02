import type { ZodSchema } from 'zod';
import { emitEvent } from '../events/bus';
import { appendRunLog } from '../logging/jsonl';
import { getSession, updateSessionState } from '../sessions/repo';
import { hello } from './stages/hello';

type Pending = {
  resolve: (value: unknown) => void;
  reject: (err: unknown) => void;
  schema: ZodSchema<unknown>;
};

const pendingInputs = new Map<number, Pending>();

export async function startRunner(sessionId: number, userId: number): Promise<void> {
  const session = await getSession(userId, sessionId);
  if (!session) return;

  const ctx = {
    emit: (kind: Parameters<typeof emitEvent>[1], payload: unknown) =>
      emitEvent(sessionId, kind, payload),
    userInput<T>(prompt: string, schema: ZodSchema<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        pendingInputs.set(sessionId, {
          resolve: resolve as (v: unknown) => void,
          reject,
          schema: schema as ZodSchema<unknown>,
        });
        emitEvent(sessionId, 'awaiting_user', { prompt });
      });
    },
    log: {
      async append(entry: object) {
        await appendRunLog({ sessionId, stage: session.state, ...entry });
      },
    },
    llm: {
      routeChat: () => Promise.reject(new Error('not available in hello stage')),
      routeSearch: () => Promise.reject(new Error('not available in hello stage')),
      routeImage: () => Promise.reject(new Error('not available in hello stage')),
    },
  };

  switch (session.state) {
    case 'briefing': {
      await hello.run({}, ctx);
      await updateSessionState(userId, sessionId, 'done');
      await emitEvent(sessionId, 'state_changed', { state: 'done' });
      break;
    }
    default:
      break;
  }
}

export function resolveUserInput(sessionId: number, value: unknown): boolean {
  const pending = pendingInputs.get(sessionId);
  if (!pending) return false;

  const parsed = pending.schema.safeParse(value);
  if (!parsed.success) return false;

  pendingInputs.delete(sessionId);
  pending.resolve(parsed.data);
  return true;
}

export function hasPendingInput(sessionId: number): boolean {
  return pendingInputs.has(sessionId);
}

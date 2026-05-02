import type { ZodSchema } from 'zod';
import { emitEvent } from '../events/bus';
import { getSession, updateSessionState } from '../sessions/repo';

type Pending = {
  resolve: (value: unknown) => void;
  reject: (err: unknown) => void;
  schema: ZodSchema<unknown>;
};

const pendingInputs = new Map<number, Pending>();

export async function startRunner(sessionId: number, userId: number): Promise<void> {
  const session = await getSession(userId, sessionId);
  if (!session) return;

  switch (session.state) {
    case 'planning': {
      // Planning stages wired in T-5-9; placeholder until then
      await emitEvent(sessionId, 'agent_message', { text: 'Planning stage not yet implemented.' });
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

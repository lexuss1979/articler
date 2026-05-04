import { EventEmitter } from 'node:events';
import { db } from '../db/client';
import { events } from '../db/schema';

export type EventKind =
  | 'state_changed'
  | 'task_started'
  | 'task_progress'
  | 'task_completed'
  | 'artifact_updated'
  | 'cost_updated'
  | 'agent_message'
  | 'awaiting_user'
  | 'budget_blocked';

export type PersistedEvent = typeof events.$inferSelect;

declare global {
  // eslint-disable-next-line no-var
  var __busEmitter: EventEmitter | undefined;
}
const emitter = (global.__busEmitter ??= new EventEmitter());
emitter.setMaxListeners(0);

export function subscribe(
  sessionId: number,
  listener: (e: PersistedEvent) => void,
): () => void {
  const channel = String(sessionId);
  emitter.on(channel, listener);
  return () => emitter.off(channel, listener);
}

export async function emitEvent(
  sessionId: number,
  kind: EventKind,
  payload: unknown,
): Promise<PersistedEvent> {
  const [row] = await db
    .insert(events)
    .values({ sessionId, kind, payload: payload as Record<string, unknown> })
    .returning();
  emitter.emit(String(sessionId), row);
  return row!;
}

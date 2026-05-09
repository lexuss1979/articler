'use client';

import { useEffect, useState } from 'react';

export type SessionEvent = {
  kind: string;
  payload: unknown;
};

const EVENT_KINDS = [
  'state_changed',
  'task_started',
  'task_progress',
  'task_completed',
  'artifact_updated',
  'cost_updated',
  'agent_message',
  'awaiting_user',
  'budget_blocked',
] as const;

export function useSessionEvents(sessionId: number): SessionEvent[] {
  const [events, setEvents] = useState<SessionEvent[]>([]);

  useEffect(() => {
    const source = new EventSource(`/api/stream/${sessionId}`);

    for (const kind of EVENT_KINDS) {
      source.addEventListener(kind, (e: MessageEvent<string>) => {
        const payload = JSON.parse(e.data) as unknown;
        setEvents((prev) => [...prev, { kind, payload }]);
      });
    }

    return () => source.close();
  }, [sessionId]);

  return events;
}

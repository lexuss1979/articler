'use client';

import { useEffect, useState } from 'react';

export type BatchStateEvent = {
  sessionId: number;
  state: string;
  reason?: string;
};

export function useBatchEvents(batchId: number): BatchStateEvent[] {
  const [events, setEvents] = useState<BatchStateEvent[]>([]);

  useEffect(() => {
    const es = new EventSource('/api/stream/batch/' + batchId);
    es.addEventListener('state_changed', (e) => {
      const data = JSON.parse((e as MessageEvent).data) as BatchStateEvent;
      setEvents((prev) => [...prev, data]);
    });
    return () => es.close();
  }, [batchId]);

  return events;
}

'use client';

import { useBatchEvents } from './use-batch-events';

export type BatchSession = {
  id: number;
  topic: string;
  state: string;
  draftMd: string | null;
};

export function BatchCards({
  batchId,
  initialSessions,
}: {
  batchId: number;
  initialSessions: BatchSession[];
}) {
  const events = useBatchEvents(batchId);

  return (
    <div className="space-y-4">
      {initialSessions.map((session) => {
        const sessionEvents = events.filter((e) => e.sessionId === session.id);
        const lastEvent = sessionEvents[sessionEvents.length - 1];
        const state = lastEvent?.state ?? session.state;
        const reason = lastEvent?.reason;

        return (
          <div key={session.id} className="rounded border p-4">
            <a href={`/sessions/${session.id}`} className="font-medium hover:underline">
              {session.topic}
            </a>
            <div className="mt-2">
              {state === 'queued' && (
                <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                  Queued
                </span>
              )}
              {state === 'failed' && (
                <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-600">
                  Failed{reason ? ` — ${reason}` : ''}
                </span>
              )}
              {state === 'done' && (
                <>
                  <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-700">
                    Done
                  </span>
                  {session.draftMd && (
                    <p className="mt-2 text-sm text-gray-600">
                      {session.draftMd.length > 200
                        ? session.draftMd.slice(0, 200) + '…'
                        : session.draftMd}
                    </p>
                  )}
                </>
              )}
              {state !== 'queued' && state !== 'failed' && state !== 'done' && (
                <span className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                  Running — {state}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

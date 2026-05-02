'use client';

import { useEffect, useRef, useState } from 'react';
import { useSessionEvents } from './use-session-events';
import { SourceCard } from './source-card';
import { finishResearchAction } from './actions';
import type { InferSelectModel } from 'drizzle-orm';
import type { sources } from '../../../../server/db/schema';
import type { Plan } from '../../../../server/sessions/plan';

type SourceRow = InferSelectModel<typeof sources>;

function applySource(prev: SourceRow[], incoming: SourceRow): SourceRow[] {
  const idx = prev.findIndex((r) => r.id === incoming.id);
  if (idx >= 0) {
    const next = [...prev];
    next[idx] = incoming;
    return next;
  }
  return [...prev, incoming];
}

export function ResearchPane({
  sessionId,
  initialSources,
  plan,
}: {
  sessionId: number;
  initialSources: SourceRow[];
  plan: Plan;
}) {
  const events = useSessionEvents(sessionId);
  const processedCount = useRef(0);
  const [rows, setRows] = useState<SourceRow[]>(initialSources);
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    const newEvents = events.slice(processedCount.current);
    for (const e of newEvents) {
      if (e.kind === 'artifact_updated') {
        const payload = e.payload as { kind: string; source?: SourceRow };
        if (payload.kind === 'source' && payload.source) {
          setRows((prev) => applySource(prev, payload.source!));
        }
      }
    }
    processedCount.current = events.length;
  }, [events]);

  const hasAccepted = rows.some((r) => r.status === 'accepted');

  async function handleFinish() {
    setFinishing(true);
    try {
      await finishResearchAction(sessionId);
    } finally {
      setFinishing(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-sm font-semibold text-gray-700">Research sources</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-400">Gathering sources…</p>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((src) => (
            <SourceCard
              key={src.id}
              source={src}
              plan={plan}
              onUpdate={(updated) => setRows((prev) => applySource(prev, updated))}
            />
          ))}
        </div>
      )}
      <button
        onClick={() => void handleFinish()}
        disabled={!hasAccepted || finishing}
        className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 disabled:opacity-40 self-start mt-2"
      >
        {finishing ? 'Finishing…' : 'Finish research'}
      </button>
    </div>
  );
}

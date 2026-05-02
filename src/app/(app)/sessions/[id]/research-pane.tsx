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
  const [pipelineDone, setPipelineDone] = useState(false);
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
      if (e.kind === 'awaiting_user') {
        const payload = e.payload as { prompt: string };
        if (payload.prompt === 'research_done') setPipelineDone(true);
      }
    }
    processedCount.current = events.length;
  }, [events]);

  const hasAccepted = rows.some((r) => r.status === 'accepted');
  const canFinish = pipelineDone && hasAccepted;

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
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Research sources</h3>
        {!pipelineDone && (
          <span className="flex items-center gap-1.5 text-xs text-blue-500">
            <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Gathering…
          </span>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-400">Sources will appear here as they are found.</p>
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

      <div className="mt-2 flex flex-col gap-1 self-start">
        <button
          onClick={() => void handleFinish()}
          disabled={!canFinish || finishing}
          className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 disabled:opacity-40"
        >
          {finishing ? 'Finishing…' : 'Finish research'}
        </button>
        {!pipelineDone && (
          <p className="text-xs text-gray-400">Available when all searches complete</p>
        )}
        {pipelineDone && !hasAccepted && (
          <p className="text-xs text-gray-400">Accept at least one source to continue</p>
        )}
      </div>
    </div>
  );
}

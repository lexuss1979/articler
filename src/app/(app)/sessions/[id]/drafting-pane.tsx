'use client';

import { useEffect, useRef, useState } from 'react';
import { useSessionEvents } from './use-session-events';
import { SectionCard } from './section-card';
import { finishDraftAction, startSessionAction } from './actions';
import type { Plan } from '../../../../server/sessions/plan';
import type { InferSelectModel } from 'drizzle-orm';
import type { sectionDrafts } from '../../../../server/db/schema';

type SectionDraftRow = InferSelectModel<typeof sectionDrafts>;

export function DraftingPane({
  sessionId,
  plan,
  initialSections,
}: {
  sessionId: number;
  plan: Plan;
  initialSections: SectionDraftRow[];
}) {
  const events = useSessionEvents(sessionId);
  const processedCount = useRef(0);

  const [draftMap, setDraftMap] = useState<Map<string, string>>(
    () => new Map(initialSections.map((d) => [d.sectionId, d.contentMd])),
  );
  const [awaitingFinish, setAwaitingFinish] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [resuming, setResuming] = useState(false);

  useEffect(() => {
    const newEvents = events.slice(processedCount.current);
    for (const e of newEvents) {
      if (e.kind === 'artifact_updated') {
        const payload = e.payload as { kind: string; sectionId?: string; contentMd?: string };
        if (payload.kind === 'section_draft' && payload.sectionId && payload.contentMd !== undefined) {
          setDraftMap((prev) => new Map(prev).set(payload.sectionId!, payload.contentMd!));
        }
      }
      if (e.kind === 'awaiting_user') {
        const payload = e.payload as { prompt: string };
        if (payload.prompt === 'draft_done') setAwaitingFinish(true);
      }
    }
    processedCount.current = events.length;
  }, [events]);

  const allDrafted = plan.sections.every((s) => draftMap.get(s.id) != null);
  const canFinish = allDrafted && awaitingFinish;

  async function handleFinish() {
    setFinishing(true);
    try {
      const result = await finishDraftAction(sessionId);
      if (!result.ok) setFinishing(false);
    } catch {
      setFinishing(false);
    }
  }

  async function handleResume() {
    setResuming(true);
    try {
      await startSessionAction(sessionId);
    } finally {
      setResuming(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Drafting sections</h3>
        {!awaitingFinish && (
          <span className="flex items-center gap-1.5 text-xs text-blue-500">
            <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Writing…
          </span>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {plan.sections.map((section) => (
          <SectionCard
            key={section.id}
            plan={plan}
            section={section}
            contentMd={draftMap.get(section.id) ?? null}
            sessionId={sessionId}
          />
        ))}
      </div>

      <div className="mt-2 flex flex-col gap-2 self-start">
        <button
          onClick={() => void handleFinish()}
          disabled={!canFinish || finishing}
          className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 disabled:opacity-40"
        >
          {finishing ? 'Finishing…' : 'Finish drafting'}
        </button>
        {!allDrafted && (
          <div className="flex flex-col gap-1">
            <button
              onClick={() => void handleResume()}
              disabled={resuming}
              className="text-xs px-3 py-1.5 rounded border border-blue-200 text-blue-600 hover:bg-blue-50 disabled:opacity-40 self-start"
            >
              {resuming ? 'Resuming…' : 'Resume drafting'}
            </button>
            <p className="text-xs text-gray-400">
              Drafting stuck? Click Resume to pick up where it stopped (already-written sections are skipped).
            </p>
          </div>
        )}
        {allDrafted && !awaitingFinish && (
          <p className="text-xs text-gray-400">Available when drafting completes</p>
        )}
      </div>
    </div>
  );
}

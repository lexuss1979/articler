'use client';

import { useState } from 'react';
import { useSessionEvents } from './use-session-events';
import { ClarificationForm } from './clarification-form';
import { AnglePicker } from './angle-picker';
import { PlanEditor } from './plan-editor';
import type { Angle, Plan } from '../../../../server/sessions/plan';
import type { ClarifyQuestion } from '../../../../server/pipeline/stages/clarify-brief';

export function PlanningPane({ sessionId }: { sessionId: number; initialPlan?: unknown }) {
  const events = useSessionEvents(sessionId);
  const [locking, setLocking] = useState(false);

  let latestPrompt: string | null = null;
  let questions: ClarifyQuestion[] = [];
  let angles: Angle[] = [];
  let plan: Plan | null = null;

  for (const e of events) {
    if (e.kind === 'awaiting_user') {
      const payload = e.payload as { prompt: string };
      latestPrompt = payload.prompt;
    } else if (e.kind === 'artifact_updated') {
      const payload = e.payload as {
        kind: string;
        questions?: ClarifyQuestion[];
        angles?: Angle[];
        plan?: Plan;
      };
      if (payload.kind === 'questions' && payload.questions) {
        questions = payload.questions;
      } else if (payload.kind === 'angles' && payload.angles) {
        angles = payload.angles;
      } else if (payload.kind === 'plan' && payload.plan) {
        plan = payload.plan;
      }
    }
  }

  async function handleLock() {
    setLocking(true);
    try {
      await fetch(`/api/sessions/${sessionId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: { action: 'lock' } }),
      });
    } finally {
      setLocking(false);
    }
  }

  if (latestPrompt === 'clarify') {
    return <ClarificationForm questions={questions} sessionId={sessionId} />;
  }

  if (latestPrompt === 'angle_choice') {
    return <AnglePicker angles={angles} sessionId={sessionId} />;
  }

  if (latestPrompt === 'plan_lock' && plan) {
    return (
      <div className="flex flex-col gap-6">
        <PlanEditor plan={plan} sessionId={sessionId} />
        <button
          onClick={() => void handleLock()}
          disabled={locking}
          className="bg-green-600 text-white px-4 py-2 rounded text-sm hover:bg-green-700 disabled:opacity-50 self-start"
        >
          {locking ? 'Locking…' : 'Lock plan'}
        </button>
      </div>
    );
  }

  return <p className="text-sm text-gray-500">Planning in progress…</p>;
}

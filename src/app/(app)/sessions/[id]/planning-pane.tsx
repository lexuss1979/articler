'use client';

import { useSessionEvents } from './use-session-events';
import { ClarificationForm } from './clarification-form';
import { AnglePicker } from './angle-picker';
import type { Angle } from '../../../../server/sessions/plan';

export function PlanningPane({ sessionId }: { sessionId: number; initialPlan?: unknown }) {
  const events = useSessionEvents(sessionId);

  let latestPrompt: string | null = null;
  let questions: string[] = [];
  let angles: Angle[] = [];

  for (const e of events) {
    if (e.kind === 'awaiting_user') {
      const payload = e.payload as { prompt: string };
      latestPrompt = payload.prompt;
    } else if (e.kind === 'artifact_updated') {
      const payload = e.payload as { kind: string; questions?: string[]; angles?: Angle[] };
      if (payload.kind === 'questions' && payload.questions) {
        questions = payload.questions;
      } else if (payload.kind === 'angles' && payload.angles) {
        angles = payload.angles;
      }
    }
  }

  if (latestPrompt === 'clarify') {
    return <ClarificationForm questions={questions} sessionId={sessionId} />;
  }

  if (latestPrompt === 'angle_choice') {
    return <AnglePicker angles={angles} sessionId={sessionId} />;
  }

  return <p className="text-sm text-gray-500">Planning in progress…</p>;
}

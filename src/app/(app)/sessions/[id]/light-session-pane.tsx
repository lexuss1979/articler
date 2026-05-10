'use client';

import { useSessionEvents } from './use-session-events';
import { LightBriefForm } from './light-brief-form';
import { LightProgressBar } from './light-progress-bar';
import { LightResultPane } from './light-result-pane';
import { ClarificationForm } from './clarification-form';
import type { ClarifyQuestion } from '../../../../server/pipeline/stages/clarify-brief';

export function LightSessionPane({
  sessionId,
  state,
  draftMd,
  previewHtml,
  draftMdPreReview,
  isRewrite: _isRewrite,
}: {
  sessionId: number;
  state: string;
  draftMd: string;
  previewHtml: string | null;
  draftMdPreReview: string | null;
  isRewrite: false;
}) {
  const events = useSessionEvents(sessionId);

  let latestPrompt: string | null = null;
  let questions: ClarifyQuestion[] = [];

  for (const e of events) {
    if (e.kind === 'awaiting_user') {
      const payload = e.payload as { prompt: string };
      latestPrompt = payload.prompt;
    } else if (e.kind === 'artifact_updated') {
      const payload = e.payload as { kind: string; questions?: ClarifyQuestion[] };
      if (payload.kind === 'questions' && payload.questions) {
        questions = payload.questions;
      }
    }
  }

  if (state === 'briefing') {
    return <LightBriefForm sessionId={sessionId} />;
  }

  if (state === 'planning') {
    if (latestPrompt === 'clarify' && questions.length > 0) {
      return <ClarificationForm questions={questions} sessionId={sessionId} />;
    }
    return <LightProgressBar state="planning" />;
  }

  if (state === 'research' || state === 'drafting' || state === 'review') {
    return (
      <LightProgressBar
        state={state as 'research' | 'drafting' | 'review'}
      />
    );
  }

  if (state === 'done') {
    return (
      <LightResultPane
        sessionId={sessionId}
        draftMd={draftMd}
        previewHtml={previewHtml}
        draftMdPreReview={draftMdPreReview}
      />
    );
  }

  return <p className="text-sm text-gray-400">{`Unexpected state: ${state}`}</p>;
}

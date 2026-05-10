'use client';

import { useSessionEvents } from './use-session-events';
import { LightBriefForm } from './light-brief-form';
import { LightProgressBar } from './light-progress-bar';
import { LightResultPane } from './light-result-pane';
import { ClarificationForm } from './clarification-form';
import type { ClarifyQuestion } from '../../../../server/pipeline/stages/clarify-brief';
import type { ClaimWithVerdict } from './factcheck-tab';
import type { ImageState } from '../../../../server/sessions/images';

export function LightSessionPane({
  sessionId,
  state,
  draftMd,
  previewHtml,
  draftMdPreReview,
  isRewrite: _isRewrite,
  claimsWithVerdicts = [],
  initialImageState = { slots: [] },
}: {
  sessionId: number;
  state: string;
  draftMd: string;
  previewHtml: string | null;
  draftMdPreReview: string | null;
  isRewrite: false;
  claimsWithVerdicts?: ClaimWithVerdict[];
  initialImageState?: ImageState;
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

  if (state === 'queued') {
    return (
      <p className="text-sm text-gray-500">
        Queued — waiting for a free slot to start.
      </p>
    );
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
        claimsWithVerdicts={claimsWithVerdicts}
        initialImageState={initialImageState}
      />
    );
  }

  return <p className="text-sm text-gray-400">{`Unexpected state: ${state}`}</p>;
}

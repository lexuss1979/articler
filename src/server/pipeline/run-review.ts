import { emitEvent } from '../events/bus';
import { getSession } from '../sessions/repo';
import { getProfile } from '../profiles/repo';
import { planSchema } from '../sessions/plan';
import { listSectionDrafts } from '../sessions/section-drafts-repo';
import { parseActiveCritics } from '../sessions/critics';
import { createCritiqueRound, insertFinding } from '../sessions/critique-repo';
import { spanHash } from '../sessions/claims';
import { runReview as runReviewStage } from './stages/run-review';
import { withStageCtx } from './with-stage-ctx';

const OVERALL_SECTION_ID = 'overall';

export async function runReview({
  sessionId,
  userId,
}: {
  sessionId: number;
  userId: number;
}): Promise<
  | { ok: true; roundId: number; findingCount: number }
  | { ok: false; error: 'session_invalid' | 'no_draft' }
> {
  const session = await getSession(userId, sessionId);
  if (!session) return { ok: false, error: 'session_invalid' };

  const planParsed = planSchema.safeParse(session.plan);
  if (!planParsed.success) return { ok: false, error: 'session_invalid' };
  const plan = planParsed.data;

  const profile = await getProfile(userId, session.profileId);
  if (!profile) return { ok: false, error: 'session_invalid' };

  if (!session.draftMd) return { ok: false, error: 'no_draft' };

  const activeCritics = parseActiveCritics(session.activeCritics);

  const round = await createCritiqueRound(userId, sessionId, 'critique', spanHash(session.draftMd));
  if (!round) return { ok: false, error: 'session_invalid' };

  const sectionDrafts = await listSectionDrafts(userId, sessionId);

  const ctx = {
    emit: (kind: Parameters<typeof emitEvent>[1], payload: unknown) =>
      emitEvent(sessionId, kind, payload),
    userInput: () => Promise.reject(new Error('userInput not available in review context')),
    log: { append: async () => {} },
    llm: {} as never,
  };

  const { findings } = await withStageCtx(runReviewStage, sessionId, userId, () =>
    runReviewStage.run(
      { enabledCriticIds: activeCritics.enabledIds, plan, profile, sectionDrafts },
      ctx,
    ),
  );

  let findingCount = 0;
  for (const f of findings) {
    const span = f.span ?? { sectionId: OVERALL_SECTION_ID, charStart: 0, charEnd: 0 };
    const row = await insertFinding(userId, round.id, {
      criticId: 'review',
      severity: f.severity,
      span,
      problem: f.problem,
      suggestedChange: f.suggestedChange,
      rationale: '',
    });
    if (row) {
      findingCount++;
      await emitEvent(sessionId, 'artifact_updated', { kind: 'finding', finding: row });
    }
  }

  await emitEvent(sessionId, 'artifact_updated', {
    kind: 'critique_round',
    roundId: round.id,
    findingCount,
  });

  return { ok: true, roundId: round.id, findingCount };
}

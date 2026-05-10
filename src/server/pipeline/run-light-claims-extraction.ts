import { emitEvent } from '../events/bus';
import { getSession } from '../sessions/repo';
import { planSchema } from '../sessions/plan';
import { createCritiqueRound } from '../sessions/critique-repo';
import { insertClaim } from '../sessions/claims-repo';
import { spanHash } from '../sessions/claims';
import { extractClaims } from './stages/extract-claims';
import { withStageCtx } from './with-stage-ctx';

export async function runLightClaimsExtraction({
  sessionId,
  userId,
  revisedMd,
}: {
  sessionId: number;
  userId: number;
  revisedMd: string;
}): Promise<
  | { ok: true; roundId: number; count: number }
  | { ok: false; error: 'session_invalid' | 'no_plan' }
> {
  const session = await getSession(userId, sessionId);
  if (!session) return { ok: false, error: 'session_invalid' };

  const planParsed = planSchema.safeParse(session.plan);
  if (!planParsed.success) return { ok: false, error: 'no_plan' };
  const plan = planParsed.data;

  const syntheticPlan = {
    ...plan,
    sections: [
      ...plan.sections,
      { id: 'full', title: 'Full article', intent: '', expectedLength: revisedMd.length, keyPoints: [] },
    ],
  };

  const round = await createCritiqueRound(userId, sessionId, 'auto_review', spanHash(revisedMd));
  if (!round) return { ok: false, error: 'session_invalid' };

  const ctx = {
    emit: (kind: Parameters<typeof emitEvent>[1], payload: unknown) =>
      emitEvent(sessionId, kind, payload),
    userInput: () => Promise.reject(new Error('userInput not available in claims extraction context')),
    log: { append: async () => {} },
    llm: {} as never,
  };

  const { claims } = await withStageCtx(extractClaims, sessionId, userId, () =>
    extractClaims.run({ plan: syntheticPlan, sectionDrafts: [{ sectionId: 'full', contentMd: revisedMd }] }, ctx),
  );

  let count = 0;
  for (const claim of claims) {
    await insertClaim(userId, sessionId, round.id, {
      span: claim.span,
      spanHash: spanHash(claim.span.text),
      claimText: claim.span.text,
      claimType: claim.claimType,
      checkWorthiness: claim.checkWorthiness,
    });
    count++;
  }

  await emitEvent(sessionId, 'artifact_updated', { kind: 'claims_extracted', count, roundId: round.id });

  return { ok: true, roundId: round.id, count };
}

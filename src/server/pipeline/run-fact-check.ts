import { emitEvent } from '../events/bus';
import { getSession } from '../sessions/repo';
import { getProfile } from '../profiles/repo';
import { planSchema } from '../sessions/plan';
import { listSectionDrafts } from '../sessions/section-drafts-repo';
import { listSessionSources } from '../sessions/sources-repo';
import { createCritiqueRound } from '../sessions/critique-repo';
import {
  insertClaim,
  findClaimBySpanHash,
  insertClaimVerdict,
  insertClaimEvidence,
  getClaimWithLatestVerdict,
} from '../sessions/claims-repo';
import { spanHash } from '../sessions/claims';
import type { ClaimSpan, ClaimType, CheckWorthiness, Verdict } from '../sessions/claims';
import { extractClaims } from './stages/extract-claims';
import { verifyClaim } from './stages/verify-claim';
import { adjudicateClaim } from './stages/adjudicate-claim';
import { withStageCtx } from './with-stage-ctx';

export async function runFactCheck({
  sessionId,
  userId,
  force = false,
}: {
  sessionId: number;
  userId: number;
  force?: boolean;
}): Promise<
  | { ok: true; roundId: number; claimCount: number; verdictCount: number }
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

  const sectionDrafts = await listSectionDrafts(userId, sessionId);
  const allSources = await listSessionSources(userId, sessionId);
  const acceptedSources = allSources.filter((s) => s.status === 'accepted');

  const round = await createCritiqueRound(
    userId,
    sessionId,
    'factcheck',
    spanHash(session.draftMd),
  );
  if (!round) return { ok: false, error: 'session_invalid' };

  const ctx = {
    emit: (kind: Parameters<typeof emitEvent>[1], payload: unknown) =>
      emitEvent(sessionId, kind, payload),
    userInput: () => Promise.reject(new Error('userInput not available in fact-check context')),
    log: { append: async () => {} },
    llm: {} as never,
  };

  const { claims } = await withStageCtx(extractClaims, sessionId, userId, () =>
    extractClaims.run({ plan, sectionDrafts }, ctx),
  );

  let claimCount = 0;
  let verdictCount = 0;

  for (const claim of claims) {
    const hash = spanHash(claim.span.text);

    if (!force) {
      const existing = await findClaimBySpanHash(userId, sessionId, hash);
      if (existing?.verdict) {
        await emitEvent(sessionId, 'task_progress', { stage: 'fact_check', skipped: hash });
        continue;
      }
    }

    const claimRow = await insertClaim(userId, sessionId, round.id, {
      span: claim.span,
      spanHash: hash,
      claimText: claim.span.text,
      claimType: claim.claimType,
      checkWorthiness: claim.checkWorthiness,
    });
    if (!claimRow) continue;
    claimCount++;

    if (claim.checkWorthiness === 'low') continue;

    const { evidence } = await withStageCtx(verifyClaim, sessionId, userId, () =>
      verifyClaim.run({ claim, acceptedSources }, ctx),
    );
    const adjudication = await withStageCtx(adjudicateClaim, sessionId, userId, () =>
      adjudicateClaim.run({ claim, evidence }, ctx),
    );

    const verdictRow = await insertClaimVerdict(userId, claimRow.id, {
      verdict: adjudication.verdict,
      justification: adjudication.justification,
    });
    if (!verdictRow) continue;

    await insertClaimEvidence(userId, verdictRow.id, evidence);

    verdictCount++;
    await emitEvent(sessionId, 'artifact_updated', {
      kind: 'claim_verdict',
      claimId: claimRow.id,
      verdict: adjudication.verdict,
    });
  }

  await emitEvent(sessionId, 'artifact_updated', {
    kind: 'factcheck_round',
    roundId: round.id,
    claimCount,
    verdictCount,
  });

  return { ok: true, roundId: round.id, claimCount, verdictCount };
}

export async function verifyExistingClaim({
  sessionId,
  userId,
  claimId,
  force = false,
}: {
  sessionId: number;
  userId: number;
  claimId: number;
  force?: boolean;
}): Promise<
  | { ok: true; verdict: Verdict }
  | { ok: false; error: 'claim_not_found' | 'session_invalid' | 'already_verified' }
> {
  const row = await getClaimWithLatestVerdict(userId, claimId);
  if (!row) return { ok: false, error: 'claim_not_found' };
  if (row.claim.sessionId !== sessionId) return { ok: false, error: 'claim_not_found' };
  if (row.verdict != null && !force) return { ok: false, error: 'already_verified' };

  const session = await getSession(userId, sessionId);
  if (!session) return { ok: false, error: 'session_invalid' };

  const acceptedSources = (await listSessionSources(userId, sessionId)).filter(
    (s) => s.status === 'accepted',
  );

  const ctx = {
    emit: (kind: Parameters<typeof emitEvent>[1], payload: unknown) =>
      emitEvent(sessionId, kind, payload),
    userInput: () => Promise.reject(new Error('userInput not available in verify context')),
    log: { append: async () => {} },
    llm: {} as never,
  };

  const claim = {
    span: row.claim.span as ClaimSpan,
    claimType: row.claim.claimType as ClaimType,
    checkWorthiness: row.claim.checkWorthiness as CheckWorthiness,
  };

  const { evidence } = await withStageCtx(verifyClaim, sessionId, userId, () =>
    verifyClaim.run({ claim, acceptedSources }, ctx),
  );
  const adjudication = await withStageCtx(adjudicateClaim, sessionId, userId, () =>
    adjudicateClaim.run({ claim, evidence }, ctx),
  );

  const verdictRow = await insertClaimVerdict(userId, claimId, {
    verdict: adjudication.verdict,
    justification: adjudication.justification,
  });
  if (!verdictRow) return { ok: false, error: 'session_invalid' };

  await insertClaimEvidence(userId, verdictRow.id, evidence);

  await emitEvent(sessionId, 'artifact_updated', {
    kind: 'claim_verdict',
    claimId,
    verdict: adjudication.verdict,
  });

  return { ok: true, verdict: adjudication.verdict };
}

import { emitEvent } from '../events/bus';
import { getSession, updateSessionRevision } from '../sessions/repo';
import {
  getFindingForUser,
  bulkSetFindingStatus,
} from '../sessions/critique-repo';
import { applyRevisions as applyRevisionsStage } from './stages/apply-revisions';
import { withStageCtx } from './with-stage-ctx';

export async function applyRevisions({
  sessionId,
  userId,
  findingIds,
}: {
  sessionId: number;
  userId: number;
  findingIds: number[];
}): Promise<
  | { ok: true; appliedFindingIds: number[]; revisedDraftMd: string }
  | { ok: false; error: 'session_invalid' | 'no_draft' | 'no_findings' | 'pending_exists' }
> {
  const session = await getSession(userId, sessionId);
  if (!session) return { ok: false, error: 'session_invalid' };
  if (!session.draftMd) return { ok: false, error: 'no_draft' };
  if (session.revisionStatus === 'pending') return { ok: false, error: 'pending_exists' };

  const findings = (
    await Promise.all(findingIds.map((id) => getFindingForUser(userId, id)))
  ).filter((f): f is NonNullable<typeof f> => f !== null);

  const eligible = findings.filter(
    (f) => f.severity === 'critical' || f.severity === 'medium',
  );
  if (eligible.length === 0) return { ok: false, error: 'no_findings' };

  const ctx = {
    emit: (kind: Parameters<typeof emitEvent>[1], payload: unknown) =>
      emitEvent(sessionId, kind, payload),
    userInput: () =>
      Promise.reject(new Error('userInput not available in apply-revisions context')),
    log: { append: async () => {} },
    llm: {} as never,
  };

  const stageInput = eligible.map((f) => {
    const span = f.span as { sectionId?: string } | null;
    return {
      severity: f.severity as 'critical' | 'medium',
      problem: f.problem,
      suggestedChange: f.suggestedChange,
      sectionId: span?.sectionId && span.sectionId !== 'overall' ? span.sectionId : undefined,
    };
  });

  const { revisedDraftMd } = await withStageCtx(applyRevisionsStage, sessionId, userId, () =>
    applyRevisionsStage.run({ draftMd: session.draftMd!, findings: stageInput }, ctx),
  );

  await updateSessionRevision(userId, sessionId, {
    revisedDraftMd,
    revisionStatus: 'pending',
  });

  const appliedFindingIds = eligible.map((f) => f.id);
  await bulkSetFindingStatus(userId, appliedFindingIds, 'pending_apply');

  await emitEvent(sessionId, 'artifact_updated', {
    kind: 'revision_pending',
    appliedFindingIds,
  });

  return { ok: true, appliedFindingIds, revisedDraftMd };
}

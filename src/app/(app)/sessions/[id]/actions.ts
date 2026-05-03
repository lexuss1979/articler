'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireUser } from '../../../../server/auth/require-user';
import {
  getSession,
  updateSessionBrief,
  updateSessionPlan,
  updateSessionState,
} from '../../../../server/sessions/repo';
import { briefSchema } from '../../../../server/sessions/brief';
import { planSchema } from '../../../../server/sessions/plan';
import type { ZodIssue } from 'zod';
import { startRunner, resolveUserInput, cancelPendingInput } from '../../../../server/pipeline/runner';
import { regenerateSection } from '../../../../server/pipeline/regenerate-section';
import { runReview } from '../../../../server/pipeline/run-review';
import { runFactCheck } from '../../../../server/pipeline/run-fact-check';
import {
  setFindingStatus,
  getFindingForUser,
} from '../../../../server/sessions/critique-repo';
import {
  setClaimStatus,
  getClaimWithLatestVerdict,
} from '../../../../server/sessions/claims-repo';
import {
  setSourceStatus,
  setSourceSection,
} from '../../../../server/sessions/sources-repo';
import { regenerateInstructionSchema } from '../../../../server/sessions/draft';

export async function startSessionAction(sessionId: number): Promise<void> {
  const user = await requireUser();
  const session = await getSession(user.id, sessionId);
  if (!session) return;
  void startRunner(sessionId, user.id);
}

export async function submitBriefAction(
  sessionId: number,
  formData: FormData,
): Promise<{ ok: false; error: 'validation'; issues: string } | null> {
  const user = await requireUser();

  const sourceArticles: Array<{ url: string; content: string }> = [];
  let i = 0;
  while (formData.has(`sourceArticles[${i}][url]`)) {
    sourceArticles.push({
      url: String(formData.get(`sourceArticles[${i}][url]`) ?? ''),
      content: String(formData.get(`sourceArticles[${i}][content]`) ?? ''),
    });
    i++;
  }

  const raw = {
    topic: String(formData.get('topic') ?? ''),
    goal: String(formData.get('goal') ?? '') || undefined,
    notes: String(formData.get('notes') ?? '') || undefined,
    sourceArticles: sourceArticles.length > 0 ? sourceArticles : undefined,
  };

  const parsed = briefSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
    return { ok: false, error: 'validation', issues };
  }

  await updateSessionBrief(user.id, sessionId, parsed.data);
  await updateSessionState(user.id, sessionId, 'planning');
  void startRunner(sessionId, user.id);
  revalidatePath(`/sessions/${sessionId}`);
  return null;
}

export async function acceptSourceAction(
  sessionId: number,
  sourceId: number,
): Promise<{ ok: true } | { ok: false; error: 'not_found' }> {
  const user = await requireUser();
  const row = await setSourceStatus(user.id, sourceId, 'accepted');
  if (!row) return { ok: false, error: 'not_found' };
  revalidatePath('/sessions/' + sessionId);
  return { ok: true };
}

export async function rejectSourceAction(
  sessionId: number,
  sourceId: number,
): Promise<{ ok: true } | { ok: false; error: 'not_found' }> {
  const user = await requireUser();
  const row = await setSourceStatus(user.id, sourceId, 'rejected');
  if (!row) return { ok: false, error: 'not_found' };
  revalidatePath('/sessions/' + sessionId);
  return { ok: true };
}

export async function assignSourceSectionAction(
  sessionId: number,
  sourceId: number,
  sectionId: unknown,
): Promise<{ ok: true } | { ok: false; error: 'not_found' | 'validation' }> {
  const user = await requireUser();
  const parsed = z.string().min(1).max(40).nullable().safeParse(sectionId);
  if (!parsed.success) return { ok: false, error: 'validation' };
  const row = await setSourceSection(user.id, sourceId, parsed.data);
  if (!row) return { ok: false, error: 'not_found' };
  revalidatePath('/sessions/' + sessionId);
  return { ok: true };
}

export async function finishResearchAction(
  sessionId: number,
): Promise<{ ok: true } | { ok: false; error: 'no_pending_research' }> {
  const user = await requireUser();
  const session = await getSession(user.id, sessionId);
  if (!session) return { ok: false, error: 'no_pending_research' };
  const resolved = resolveUserInput(sessionId, { action: 'finish' });
  if (!resolved) return { ok: false, error: 'no_pending_research' };
  return { ok: true };
}

export async function regenerateSectionAction(
  sessionId: number,
  sectionId: unknown,
  instruction: unknown,
): Promise<{ ok: true; contentMd: string } | { ok: false; error: 'validation' | 'session_invalid' | 'section_not_found' }> {
  const user = await requireUser();

  const sectionIdParsed = z.string().min(1).max(40).safeParse(sectionId);
  if (!sectionIdParsed.success) return { ok: false, error: 'validation' };

  const instructionParsed = regenerateInstructionSchema.optional().or(z.literal('')).safeParse(instruction);
  if (!instructionParsed.success) return { ok: false, error: 'validation' };

  const result = await regenerateSection({
    sessionId,
    userId: user.id,
    sectionId: sectionIdParsed.data,
    instruction: instructionParsed.data || undefined,
  });

  if (result.ok) revalidatePath('/sessions/' + sessionId);
  return result;
}

export async function finishDraftAction(
  sessionId: number,
): Promise<{ ok: true } | { ok: false; error: 'no_pending_draft' }> {
  await requireUser();
  const resolved = resolveUserInput(sessionId, { action: 'finish' });
  if (!resolved) return { ok: false, error: 'no_pending_draft' };
  return { ok: true };
}

const DEV_STATES = ['planning', 'research', 'drafting', 'review'] as const;
type DevState = (typeof DEV_STATES)[number];

export async function devResetSessionAction(
  sessionId: number,
  targetState: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (process.env.NODE_ENV !== 'development') return { ok: false, error: 'not_dev' };
  if (!DEV_STATES.includes(targetState as DevState)) return { ok: false, error: 'invalid_state' };
  const user = await requireUser();
  cancelPendingInput(sessionId);
  await updateSessionState(user.id, sessionId, targetState as DevState);
  void startRunner(sessionId, user.id);
  revalidatePath('/sessions/' + sessionId);
  return { ok: true };
}

export async function startReviewAction(
  sessionId: number,
): Promise<
  | { ok: true; roundId: number; findingCount: number }
  | { ok: false; error: 'session_invalid' | 'no_draft' }
> {
  const user = await requireUser();
  const result = await runReview({ sessionId, userId: user.id });
  if (result.ok) revalidatePath('/sessions/' + sessionId);
  return result;
}

export async function dismissFindingAction(
  sessionId: number,
  findingId: number,
): Promise<{ ok: true } | { ok: false; error: 'not_found' }> {
  const user = await requireUser();
  const row = await setFindingStatus(user.id, findingId, 'dismissed');
  if (!row) return { ok: false, error: 'not_found' };
  revalidatePath('/sessions/' + sessionId);
  return { ok: true };
}

export async function applyFindingAction(
  sessionId: number,
  findingId: number,
): Promise<{ ok: true } | { ok: false; error: 'not_found' }> {
  const user = await requireUser();
  // TODO: optionally route through regenerateSection for surgical edit
  const row = await setFindingStatus(user.id, findingId, 'applied');
  if (!row) return { ok: false, error: 'not_found' };
  revalidatePath('/sessions/' + sessionId);
  return { ok: true };
}

export async function rewriteFromFindingAction(
  sessionId: number,
  findingId: number,
): Promise<
  | { ok: true; contentMd: string }
  | { ok: false; error: 'not_found' | 'session_invalid' | 'section_not_found' }
> {
  const user = await requireUser();
  const finding = await getFindingForUser(user.id, findingId);
  if (!finding) return { ok: false, error: 'not_found' };

  const instruction =
    '[critic ' + finding.criticId + '] ' + finding.problem + ' — ' + finding.suggestedChange;
  const result = await regenerateSection({
    sessionId,
    userId: user.id,
    sectionId: (finding.span as { sectionId: string }).sectionId,
    instruction,
  });

  if (result.ok) {
    await setFindingStatus(user.id, findingId, 'rewritten');
    revalidatePath('/sessions/' + sessionId);
  }
  return result;
}

export async function savePlanEditsAction(
  sessionId: number,
  plan: unknown,
): Promise<{ ok: true } | { ok: false; error: 'validation'; issues: ZodIssue[] }> {
  const user = await requireUser();
  const parsed = planSchema.safeParse(plan);
  if (!parsed.success) {
    return { ok: false, error: 'validation', issues: parsed.error.issues };
  }
  await updateSessionPlan(user.id, sessionId, parsed.data);
  return { ok: true };
}

export async function startFactCheckAction(
  sessionId: number,
  force?: boolean,
): Promise<
  | { ok: true; roundId: number; claimCount: number; verdictCount: number }
  | { ok: false; error: 'session_invalid' | 'no_draft' }
> {
  const user = await requireUser();
  const result = await runFactCheck({ sessionId, userId: user.id, force: !!force });
  if (result.ok) revalidatePath('/sessions/' + sessionId);
  return result;
}

export async function dismissClaimAction(
  sessionId: number,
  claimId: number,
): Promise<{ ok: true } | { ok: false; error: 'not_found' }> {
  const user = await requireUser();
  const row = await setClaimStatus(user.id, claimId, 'dismissed');
  if (!row) return { ok: false, error: 'not_found' };
  revalidatePath('/sessions/' + sessionId);
  return { ok: true };
}

export async function markClaimOpinionAction(
  sessionId: number,
  claimId: number,
): Promise<{ ok: true } | { ok: false; error: 'not_found' }> {
  const user = await requireUser();
  const row = await setClaimStatus(user.id, claimId, 'opinion');
  if (!row) return { ok: false, error: 'not_found' };
  revalidatePath('/sessions/' + sessionId);
  return { ok: true };
}

export async function acceptClaimCorrectionAction(
  sessionId: number,
  claimId: number,
): Promise<
  | { ok: true }
  | { ok: false; error: 'not_found' | 'no_correction_needed' | 'regenerate_failed' }
> {
  const user = await requireUser();
  const row = await getClaimWithLatestVerdict(user.id, claimId);
  if (!row) return { ok: false, error: 'not_found' };
  if (row.verdict?.verdict === 'verified') return { ok: false, error: 'no_correction_needed' };
  const sectionId = (row.claim.span as { sectionId: string }).sectionId;
  const instruction =
    '[fact-check] ' +
    (row.verdict?.verdict ?? 'unverifiable') +
    ': ' +
    (row.verdict?.justification ?? 'No verdict available.') +
    ' — claim text: ' +
    row.claim.claimText;
  const result = await regenerateSection({ sessionId, userId: user.id, sectionId, instruction });
  if (result.ok) {
    await setClaimStatus(user.id, claimId, 'dismissed');
    revalidatePath('/sessions/' + sessionId);
  }
  return result;
}

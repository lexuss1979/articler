'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireUser } from '../../../../server/auth/require-user';
import {
  getSession,
  updateSessionBrief,
  updateSessionPlan,
  updateSessionState,
  updateSessionActiveCritics,
  acceptRevisions,
  discardRevisions,
} from '../../../../server/sessions/repo';
import { briefSchema } from '../../../../server/sessions/brief';
import { planSchema } from '../../../../server/sessions/plan';
import type { ZodIssue } from 'zod';
import { startRunner, resolveUserInput, cancelPendingInput } from '../../../../server/pipeline/runner';
import { regenerateSection } from '../../../../server/pipeline/regenerate-section';
import { runReview } from '../../../../server/pipeline/run-review';
import { runFactCheck } from '../../../../server/pipeline/run-fact-check';
import { applyRevisions } from '../../../../server/pipeline/apply-revisions';
import { runDecoration } from '../../../../server/pipeline/run-decoration';
import { applyDecoration } from '../../../../server/pipeline/apply-decoration';
import { runIllustration } from '../../../../server/pipeline/run-illustration';
import { applyImageSelection } from '../../../../server/pipeline/apply-image';
import { composeImagePrompt } from '../../../../server/pipeline/stages/compose-image-prompt';
import { prerenderImages } from '../../../../server/pipeline/stages/prerender-images';
import { stockKeywords } from '../../../../server/pipeline/stages/stock-keywords';
import {
  searchUnsplash,
  StockUnconfiguredError,
  StockHttpError,
} from '../../../../server/images/stock';
import { saveImageFromUrl } from '../../../../server/images/storage';
import {
  appendSlotCandidates,
  findSlot,
  setSlotMode,
  setSlotPrompt,
} from '../../../../server/sessions/images-repo';
import {
  imagePromptSchema,
  type ImageCandidate,
  type ImagePrompt,
  type ImageSlot,
} from '../../../../server/sessions/images';
import { getProfile } from '../../../../server/profiles/repo';
import { emitEvent } from '../../../../server/events/bus';
import { routeChat, routeImage, routeSearch } from '../../../../server/llm/router';
import { setSuggestionStatus } from '../../../../server/sessions/decoration-repo';
import {
  setClaimStatus,
  getClaimWithLatestVerdict,
} from '../../../../server/sessions/claims-repo';
import {
  setSourceStatus,
  setSourceSection,
} from '../../../../server/sessions/sources-repo';
import { regenerateInstructionSchema } from '../../../../server/sessions/draft';
import { activeCriticsSchema } from '../../../../server/sessions/critics';

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

export async function finishReviewAction(
  sessionId: number,
): Promise<{ ok: true } | { ok: false; error: 'no_pending_review' }> {
  await requireUser();
  const resolved = resolveUserInput(sessionId, { action: 'finish' });
  if (!resolved) return { ok: false, error: 'no_pending_review' };
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

export async function applyRevisionsAction(
  sessionId: number,
  findingIds: number[],
): Promise<
  | { ok: true; appliedFindingIds: number[]; revisedDraftMd: string }
  | { ok: false; error: 'session_invalid' | 'no_draft' | 'no_findings' | 'pending_exists' | 'validation' }
> {
  const user = await requireUser();
  const parsed = z.array(z.number().int().positive()).safeParse(findingIds);
  if (!parsed.success) return { ok: false, error: 'validation' };

  const result = await applyRevisions({
    sessionId,
    userId: user.id,
    findingIds: parsed.data,
  });
  if (result.ok) revalidatePath('/sessions/' + sessionId);
  return result;
}

export async function acceptRevisionsAction(
  sessionId: number,
): Promise<{ ok: true } | { ok: false; error: 'not_found' }> {
  const user = await requireUser();
  const row = await acceptRevisions(user.id, sessionId);
  if (!row) return { ok: false, error: 'not_found' };
  revalidatePath('/sessions/' + sessionId);
  return { ok: true };
}

export async function discardRevisionsAction(
  sessionId: number,
): Promise<{ ok: true } | { ok: false; error: 'not_found' }> {
  const user = await requireUser();
  const row = await discardRevisions(user.id, sessionId);
  if (!row) return { ok: false, error: 'not_found' };
  revalidatePath('/sessions/' + sessionId);
  return { ok: true };
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
): Promise<{ ok: true } | { ok: false; error: string }> {
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

export async function startDecorationAction(
  sessionId: number,
): Promise<
  | { ok: true; roundId: string; suggestionCount: number }
  | { ok: false; error: 'session_invalid' | 'no_draft' }
> {
  const user = await requireUser();
  const result = await runDecoration({ sessionId, userId: user.id });
  if (result.ok) revalidatePath('/sessions/' + sessionId);
  return result;
}

export async function acceptDecorationAction(
  sessionId: number,
  suggestionId: unknown,
): Promise<
  | { ok: true; revisedDraftMd: string }
  | { ok: false; error: 'validation' | 'not_found' | 'session_invalid' | 'plan_invalid' | 'section_missing' }
> {
  const user = await requireUser();
  const parsed = z.string().min(1).max(80).safeParse(suggestionId);
  if (!parsed.success) return { ok: false, error: 'validation' };
  const result = await applyDecoration({
    sessionId,
    userId: user.id,
    suggestionId: parsed.data,
  });
  if (result.ok) revalidatePath('/sessions/' + sessionId);
  return result;
}

export async function rejectDecorationAction(
  sessionId: number,
  suggestionId: unknown,
): Promise<{ ok: true } | { ok: false; error: 'not_found' | 'validation' }> {
  const user = await requireUser();
  const parsed = z.string().min(1).max(80).safeParse(suggestionId);
  if (!parsed.success) return { ok: false, error: 'validation' };
  const row = await setSuggestionStatus(user.id, sessionId, parsed.data, 'rejected');
  if (!row) return { ok: false, error: 'not_found' };
  revalidatePath('/sessions/' + sessionId);
  return { ok: true };
}

export async function finishDecorationAction(
  sessionId: number,
): Promise<{ ok: true } | { ok: false; error: 'no_pending_decoration' }> {
  await requireUser();
  const resolved = resolveUserInput(sessionId, { action: 'finish' });
  if (!resolved) return { ok: false, error: 'no_pending_decoration' };
  return { ok: true };
}

export async function setActiveCriticsAction(
  sessionId: number,
  payload: unknown,
): Promise<{ ok: true } | { ok: false; error: 'validation' | 'not_found' }> {
  const user = await requireUser();

  const parsed = activeCriticsSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: 'validation' };

  const row = await updateSessionActiveCritics(user.id, sessionId, parsed.data);
  if (!row) return { ok: false, error: 'not_found' };
  revalidatePath('/sessions/' + sessionId);
  return { ok: true };
}

function makeIllustrationCtx(sessionId: number) {
  return {
    emit: (kind: Parameters<typeof emitEvent>[1], payload: unknown) =>
      emitEvent(sessionId, kind, payload),
    userInput: () =>
      Promise.reject(new Error('userInput not available in illustration context')),
    log: { append: async () => {} },
    llm: {
      routeChat: (args: Parameters<typeof routeChat>[0]) => routeChat(args),
      routeSearch: (args: Parameters<typeof routeSearch>[0]) => routeSearch(args),
      routeImage: (args: Parameters<typeof routeImage>[0]) => routeImage(args),
    },
  };
}

const slotIdSchema = z.string().min(1).max(60);

export async function startIllustrationAction(
  sessionId: number,
): Promise<
  { ok: true; slotCount: number } | { ok: false; error: 'session_invalid' | 'no_draft' }
> {
  const user = await requireUser();
  const result = await runIllustration({ sessionId, userId: user.id });
  if (result.ok) revalidatePath('/sessions/' + sessionId);
  return result;
}

export async function setSlotModeAction(
  sessionId: number,
  slotId: unknown,
  mode: unknown,
): Promise<
  { ok: true; slot: ImageSlot } | { ok: false; error: 'validation' | 'not_found' }
> {
  const user = await requireUser();
  const slotIdParsed = slotIdSchema.safeParse(slotId);
  const modeParsed = z.enum(['generate', 'stock']).safeParse(mode);
  if (!slotIdParsed.success || !modeParsed.success) {
    return { ok: false, error: 'validation' };
  }
  const slot = await setSlotMode(user.id, sessionId, slotIdParsed.data, modeParsed.data);
  if (!slot) return { ok: false, error: 'not_found' };
  revalidatePath('/sessions/' + sessionId);
  return { ok: true, slot };
}

export async function composePromptAction(
  sessionId: number,
  slotId: unknown,
): Promise<
  | { ok: true; prompt: ImagePrompt }
  | { ok: false; error: 'validation' | 'not_found' | 'session_invalid' }
> {
  const user = await requireUser();
  const slotIdParsed = slotIdSchema.safeParse(slotId);
  if (!slotIdParsed.success) return { ok: false, error: 'validation' };

  const session = await getSession(user.id, sessionId);
  if (!session) return { ok: false, error: 'session_invalid' };
  const planParsed = planSchema.safeParse(session.plan);
  if (!planParsed.success) return { ok: false, error: 'session_invalid' };
  const profile = await getProfile(user.id, session.profileId);
  if (!profile) return { ok: false, error: 'session_invalid' };

  const slot = await findSlot(user.id, sessionId, slotIdParsed.data);
  if (!slot) return { ok: false, error: 'not_found' };

  const ctx = makeIllustrationCtx(sessionId);
  const prompt = await composeImagePrompt.run(
    {
      profile,
      plan: planParsed.data,
      slot: {
        id: slot.id,
        kind: slot.kind,
        sectionId: slot.sectionId,
        paragraphIndex: slot.paragraphIndex,
        brief: slot.brief,
      },
    },
    ctx,
  );
  const persisted = await setSlotPrompt(user.id, sessionId, slotIdParsed.data, prompt);
  if (!persisted) return { ok: false, error: 'not_found' };

  revalidatePath('/sessions/' + sessionId);
  return { ok: true, prompt };
}

export async function savePromptAction(
  sessionId: number,
  slotId: unknown,
  prompt: unknown,
): Promise<
  { ok: true; prompt: ImagePrompt } | { ok: false; error: 'validation' | 'not_found' }
> {
  const user = await requireUser();
  const slotIdParsed = slotIdSchema.safeParse(slotId);
  const promptParsed = imagePromptSchema.safeParse(prompt);
  if (!slotIdParsed.success || !promptParsed.success) {
    return { ok: false, error: 'validation' };
  }
  const persisted = await setSlotPrompt(
    user.id,
    sessionId,
    slotIdParsed.data,
    promptParsed.data,
  );
  if (!persisted) return { ok: false, error: 'not_found' };
  revalidatePath('/sessions/' + sessionId);
  return { ok: true, prompt: promptParsed.data };
}

export async function prerenderSlotAction(
  sessionId: number,
  slotId: unknown,
): Promise<
  | { ok: true; candidates: ImageCandidate[] }
  | { ok: false; error: 'no_prompt' | 'not_found' | 'session_invalid' }
> {
  const user = await requireUser();
  const slotIdParsed = slotIdSchema.safeParse(slotId);
  if (!slotIdParsed.success) return { ok: false, error: 'not_found' };

  const slot = await findSlot(user.id, sessionId, slotIdParsed.data);
  if (!slot) return { ok: false, error: 'not_found' };
  if (!slot.prompt) return { ok: false, error: 'no_prompt' };

  const ctx = makeIllustrationCtx(sessionId);
  const result = await prerenderImages.run(
    { sessionId, slotId: slotIdParsed.data, prompt: slot.prompt },
    ctx,
  );
  const persisted = await appendSlotCandidates(
    user.id,
    sessionId,
    slotIdParsed.data,
    result.candidates,
  );
  if (!persisted) return { ok: false, error: 'session_invalid' };

  revalidatePath('/sessions/' + sessionId);
  return { ok: true, candidates: result.candidates };
}

export async function stockSearchAction(
  sessionId: number,
  slotId: unknown,
): Promise<
  | { ok: true; candidates: ImageCandidate[] }
  | { ok: false; error: 'unconfigured' | 'http_error' | 'not_found' }
> {
  const user = await requireUser();
  const slotIdParsed = slotIdSchema.safeParse(slotId);
  if (!slotIdParsed.success) return { ok: false, error: 'not_found' };

  const session = await getSession(user.id, sessionId);
  if (!session) return { ok: false, error: 'not_found' };
  const profile = await getProfile(user.id, session.profileId);
  if (!profile) return { ok: false, error: 'not_found' };

  const slot = await findSlot(user.id, sessionId, slotIdParsed.data);
  if (!slot) return { ok: false, error: 'not_found' };

  const ctx = makeIllustrationCtx(sessionId);
  const kw = await stockKeywords.run(
    { profile, slot: { brief: slot.brief, kind: slot.kind } },
    ctx,
  );

  let unsplash: Awaited<ReturnType<typeof searchUnsplash>>;
  try {
    unsplash = await searchUnsplash(kw.keywords);
  } catch (err) {
    if (err instanceof StockUnconfiguredError) return { ok: false, error: 'unconfigured' };
    if (err instanceof StockHttpError) return { ok: false, error: 'http_error' };
    return { ok: false, error: 'http_error' };
  }

  const candidates: ImageCandidate[] = [];
  for (const c of unsplash.candidates) {
    try {
      const saved = await saveImageFromUrl({
        sessionId,
        slotId: slotIdParsed.data,
        candidateId: c.id,
        url: c.sourceUrl,
      });
      candidates.push({
        id: c.id,
        source: 'stock',
        localPath: saved.localPath,
        sourceUrl: c.sourceUrl,
        thumbUrl: c.thumbUrl,
        attribution: c.attribution,
        createdAt: new Date().toISOString(),
      });
    } catch {
      continue;
    }
  }

  const persisted = await appendSlotCandidates(
    user.id,
    sessionId,
    slotIdParsed.data,
    candidates,
  );
  if (!persisted) return { ok: false, error: 'not_found' };

  revalidatePath('/sessions/' + sessionId);
  return { ok: true, candidates };
}

export async function selectCandidateAction(
  sessionId: number,
  slotId: unknown,
  candidateId: unknown,
): Promise<
  | { ok: true; revisedDraftMd: string }
  | {
      ok: false;
      error:
        | 'validation'
        | 'not_found'
        | 'session_invalid'
        | 'plan_invalid'
        | 'section_missing';
    }
> {
  const user = await requireUser();
  const slotIdParsed = slotIdSchema.safeParse(slotId);
  const candIdParsed = z.string().min(1).max(80).safeParse(candidateId);
  if (!slotIdParsed.success || !candIdParsed.success) {
    return { ok: false, error: 'validation' };
  }
  const result = await applyImageSelection({
    sessionId,
    userId: user.id,
    slotId: slotIdParsed.data,
    candidateId: candIdParsed.data,
  });
  if (result.ok) revalidatePath('/sessions/' + sessionId);
  return result;
}

export async function finishIllustrationAction(
  sessionId: number,
): Promise<{ ok: true } | { ok: false; error: 'no_pending_illustration' }> {
  await requireUser();
  const resolved = resolveUserInput(sessionId, { action: 'finish' });
  if (!resolved) return { ok: false, error: 'no_pending_illustration' };
  return { ok: true };
}

export async function finishExportAction(
  sessionId: number,
): Promise<{ ok: true } | { ok: false; error: 'no_pending_export' }> {
  const user = await requireUser();
  const session = await getSession(user.id, sessionId);
  if (!session) return { ok: false, error: 'no_pending_export' };
  const resolved = resolveUserInput(sessionId, { action: 'finish' });
  if (!resolved) return { ok: false, error: 'no_pending_export' };
  return { ok: true };
}

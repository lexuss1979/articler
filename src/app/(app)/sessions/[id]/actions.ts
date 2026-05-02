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
import { startRunner, resolveUserInput } from '../../../../server/pipeline/runner';
import {
  setSourceStatus,
  setSourceSection,
} from '../../../../server/sessions/sources-repo';

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
  await requireUser();
  const resolved = resolveUserInput(sessionId, { action: 'finish' });
  if (!resolved) return { ok: false, error: 'no_pending_research' };
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

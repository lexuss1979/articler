'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '../../../../server/auth/require-user';
import {
  getSession,
  updateSessionBrief,
  updateSessionState,
} from '../../../../server/sessions/repo';
import { briefSchema } from '../../../../server/sessions/brief';
import { startRunner } from '../../../../server/pipeline/runner';

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

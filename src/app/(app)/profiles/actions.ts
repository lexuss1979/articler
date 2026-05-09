'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '../../../server/auth/require-user';
import { deleteAssertion } from '../../../server/profiles/profile-assertions-repo';
import { createProfile, deleteProfile, getProfile, updateProfile } from '../../../server/profiles/repo';
import { profileInputSchema } from '../../../server/profiles/schema';
import { runAnalyzeExamples } from '../../../server/pipeline/run-analyze-examples';

export type ProfileActionState = {
  ok: false;
  error: 'validation';
  issues: Record<string, string[]>;
} | null;

export async function createProfileAction(
  _prevState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const user = await requireUser();

  const markupRulesRaw = (formData.get('markupRules') as string) ?? '';
  let markupRules: Record<string, unknown> = {};
  if (markupRulesRaw.trim()) {
    try {
      markupRules = JSON.parse(markupRulesRaw) as Record<string, unknown>;
    } catch {
      return { ok: false, error: 'validation', issues: { markupRules: ['Invalid JSON'] } };
    }
  }

  const parsed = profileInputSchema.safeParse({
    name: formData.get('name'),
    format: formData.get('format'),
    style: formData.get('style'),
    audience: formData.get('audience'),
    targetVolumeMin: Number(formData.get('targetVolumeMin')),
    targetVolumeMax: Number(formData.get('targetVolumeMax')),
    markupRules,
    extraPrompt: (formData.get('extraPrompt') as string) ?? '',
  });

  if (!parsed.success) {
    const issues: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join('.') || 'root';
      issues[path] = [...(issues[path] ?? []), issue.message];
    }
    return { ok: false, error: 'validation', issues };
  }

  await createProfile(user.id, parsed.data);
  redirect('/profiles');
}

export async function updateProfileAction(
  _prevState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const user = await requireUser();

  const id = Number(formData.get('id'));
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, error: 'validation', issues: { id: ['Invalid profile id'] } };
  }

  const markupRulesRaw = (formData.get('markupRules') as string) ?? '';
  let markupRules: Record<string, unknown> = {};
  if (markupRulesRaw.trim()) {
    try {
      markupRules = JSON.parse(markupRulesRaw) as Record<string, unknown>;
    } catch {
      return { ok: false, error: 'validation', issues: { markupRules: ['Invalid JSON'] } };
    }
  }

  const parsed = profileInputSchema.safeParse({
    name: formData.get('name'),
    format: formData.get('format'),
    style: formData.get('style'),
    audience: formData.get('audience'),
    targetVolumeMin: Number(formData.get('targetVolumeMin')),
    targetVolumeMax: Number(formData.get('targetVolumeMax')),
    markupRules,
    extraPrompt: (formData.get('extraPrompt') as string) ?? '',
  });

  if (!parsed.success) {
    const issues: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join('.') || 'root';
      issues[path] = [...(issues[path] ?? []), issue.message];
    }
    return { ok: false, error: 'validation', issues };
  }

  await updateProfile(user.id, id, parsed.data);
  redirect('/profiles');
}

export async function deleteProfileAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = Number(formData.get('id'));
  if (!Number.isInteger(id) || id <= 0) return;
  await deleteProfile(user.id, id);
  revalidatePath('/profiles');
}

export async function deleteAssertionAction(
  profileId: number,
  assertionId: number,
): Promise<void> {
  const user = await requireUser();
  const profile = await getProfile(user.id, profileId);
  if (!profile) return;
  await deleteAssertion(profileId, assertionId);
  revalidatePath(`/profiles/${profileId}/edit`, 'page');
}

export type AnalyzeExamplesActionState =
  | { ok: true; summary: string; urlErrors: Array<{ index: number; error: string }> }
  | { ok: false; error: string }
  | null;

export async function analyzeExamplesAction(
  _prevState: AnalyzeExamplesActionState,
  formData: FormData,
): Promise<AnalyzeExamplesActionState> {
  const user = await requireUser();

  const profileId = Number(formData.get('profileId'));
  if (!Number.isInteger(profileId) || profileId <= 0) {
    return { ok: false, error: 'validation' };
  }

  let inputs: Array<{ kind: 'url' | 'text'; value: string }>;
  try {
    const raw = formData.get('inputs');
    if (typeof raw !== 'string') return { ok: false, error: 'validation' };
    inputs = JSON.parse(raw) as Array<{ kind: 'url' | 'text'; value: string }>;
  } catch {
    return { ok: false, error: 'validation' };
  }

  const result = await runAnalyzeExamples({ userId: user.id, profileId, inputs });

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  revalidatePath(`/profiles/${profileId}/edit`, 'page');

  return { ok: true, summary: result.summary, urlErrors: result.urlErrors };
}

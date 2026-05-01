'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '../../../server/auth/require-user';
import { createProfile, deleteProfile, updateProfile } from '../../../server/profiles/repo';
import { profileInputSchema } from '../../../server/profiles/schema';

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

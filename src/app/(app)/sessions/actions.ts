'use server';

import { redirect } from 'next/navigation';
import { requireUser } from '../../../server/auth/require-user';
import { ProfileNotOwnedError, createSession } from '../../../server/sessions/repo';

export type SessionActionState = {
  ok: false;
  error: 'profile_not_owned' | 'validation';
} | null;

export async function createSessionAction(
  _prevState: SessionActionState,
  formData: FormData,
): Promise<SessionActionState> {
  const user = await requireUser();

  const profileId = Number(formData.get('profileId'));
  if (!Number.isInteger(profileId) || profileId <= 0) {
    return { ok: false, error: 'validation' };
  }

  const mode = formData.get('mode') as string | null;
  if (!['new', 'rewrite', 'light'].includes(mode ?? '')) {
    return { ok: false, error: 'validation' };
  }

  try {
    const session = await createSession(user.id, { profileId, mode: mode as 'new' | 'rewrite' | 'light' });
    redirect(`/sessions/${session.id}`);
  } catch (err) {
    if (err instanceof ProfileNotOwnedError) {
      return { ok: false, error: 'profile_not_owned' };
    }
    throw err;
  }
}

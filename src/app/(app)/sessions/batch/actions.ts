'use server';

import { redirect } from 'next/navigation';
import { requireUser } from '../../../../server/auth/require-user';
import { assertBatchCaps } from '../../../../server/batches/caps';
import { dispatchBatchQueue } from '../../../../server/batches/dispatcher';
import { createBatchWithSessions } from '../../../../server/batches/repo';
import { ProfileNotOwnedError } from '../../../../server/sessions/repo';

export type BatchActionState =
  | null
  | { ok: false; error: 'no_topics' }
  | { ok: false; error: 'too_many_topics' }
  | { ok: false; error: 'profile_not_owned' }
  | { ok: false; error: 'monthly_usd_exceeded'; details: { current: number; cap: number } }
  | { ok: false; error: 'daily_session_cap_exceeded'; details: { current: number; cap: number; requested?: number } }
  | { ok: false; error: 'daily_image_cap_exceeded'; details: { current: number; cap: number; requested?: number } };

export async function createBatchAction(
  _prevState: BatchActionState,
  formData: FormData,
): Promise<BatchActionState> {
  const user = await requireUser();

  const raw = String(formData.get('topics') ?? '');
  const topics = [...new Set(raw.split('\n').map((l) => l.trim()).filter(Boolean))];

  if (topics.length === 0) return { ok: false, error: 'no_topics' };
  if (topics.length > 50) return { ok: false, error: 'too_many_topics' };

  const capsResult = await assertBatchCaps(user.id, topics.length);
  if (!capsResult.ok) return capsResult;

  const profileId = parseInt(String(formData.get('profileId') ?? ''), 10);

  let batchId: number;
  try {
    const result = await createBatchWithSessions(user.id, profileId, topics);
    batchId = result.batchId;
  } catch (err) {
    if (err instanceof ProfileNotOwnedError) {
      return { ok: false, error: 'profile_not_owned' };
    }
    throw err;
  }

  void dispatchBatchQueue(user.id).catch((err) => console.error('[batch/dispatch] failed:', err));

  redirect('/sessions/batch/' + batchId);
}

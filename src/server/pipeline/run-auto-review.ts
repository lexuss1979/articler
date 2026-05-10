import { emitEvent } from '../events/bus';
import { getSession } from '../sessions/repo';
import { getProfile } from '../profiles/repo';
import { autoReview } from './stages/auto-review';
import { withStageCtx } from './with-stage-ctx';

export async function runAutoReview({
  sessionId,
  userId,
}: {
  sessionId: number;
  userId: number;
}): Promise<
  | {
      ok: true;
      revisedMd: string;
      changeCount: number;
      changes: Array<{ kind: string; before: string; after: string; note?: string }>;
    }
  | { ok: false; error: 'session_invalid' | 'no_draft' }
> {
  const session = await getSession(userId, sessionId);
  if (!session) return { ok: false, error: 'session_invalid' };

  if (!session.draftMd) return { ok: false, error: 'no_draft' };

  const profile = await getProfile(userId, session.profileId);
  if (!profile) return { ok: false, error: 'session_invalid' };

  const ctx = {
    emit: (kind: Parameters<typeof emitEvent>[1], payload: unknown) =>
      emitEvent(sessionId, kind, payload),
    userInput: () => Promise.reject(new Error('userInput not available in auto-review context')),
    log: { append: async () => {} },
    llm: {} as never,
  };

  const { revisedMd, changes } = await withStageCtx(autoReview, sessionId, userId, () =>
    autoReview.run({ profile, draftMd: session.draftMd! }, ctx),
  );

  return { ok: true, revisedMd, changeCount: changes.length, changes };
}

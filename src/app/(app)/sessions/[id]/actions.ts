'use server';

import { requireUser } from '../../../../server/auth/require-user';
import { getSession } from '../../../../server/sessions/repo';
import { startRunner } from '../../../../server/pipeline/runner';

export async function startSessionAction(sessionId: number): Promise<void> {
  const user = await requireUser();
  const session = await getSession(user.id, sessionId);
  if (!session) return;
  void startRunner(sessionId, user.id);
}

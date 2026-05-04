import { requireUser } from '../../../../../server/auth/require-user';
import { getSession } from '../../../../../server/sessions/repo';
import { getSessionCost, getUserCost } from '../../../../../server/logging/aggregate';
import { getUserSettings } from '../../../../../server/settings/budget';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  const { id: idStr } = await params;
  const id = Number(idStr);

  const session = await getSession(user.id, id);
  if (!session) {
    return Response.json({ ok: false, error: 'not_found' }, { status: 404 });
  }

  const [settings, sessionSpent, userSpent] = await Promise.all([
    getUserSettings(user.id),
    getSessionCost(id),
    getUserCost(user.id),
  ]);

  return Response.json({
    sessionSpent,
    sessionCap: settings.sessionCapUsd,
    userSpent,
    userCap: settings.monthlyCapUsd,
  });
}

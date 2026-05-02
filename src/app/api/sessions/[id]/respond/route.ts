import { requireUser } from '../../../../../server/auth/require-user';
import { getSession } from '../../../../../server/sessions/repo';
import { hasPendingInput, resolveUserInput } from '../../../../../server/pipeline/runner';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  const { id: idStr } = await params;
  const id = Number(idStr);

  const session = await getSession(user.id, id);
  if (!session) {
    return Response.json({ ok: false, error: 'not_found' }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: 'invalid_value' }, { status: 400 });
  }

  const value = (body as Record<string, unknown>)?.value;

  if (!hasPendingInput(id)) {
    return Response.json({ ok: false, error: 'no_pending_input' }, { status: 409 });
  }

  const resolved = resolveUserInput(id, value);
  if (!resolved) {
    return Response.json({ ok: false, error: 'invalid_value' }, { status: 400 });
  }

  return Response.json({ ok: true });
}

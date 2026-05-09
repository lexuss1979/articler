import { z } from 'zod';
import { requireUser } from '../../../../server/auth/require-user';
import { getUserSettings, upsertUserSettings } from '../../../../server/settings/budget';

const capSchema = z.union([z.number().nonnegative().finite(), z.null()]);

const putBodySchema = z.object({
  monthlyCapUsd: capSchema,
  sessionCapUsd: capSchema,
});

export async function GET() {
  const user = await requireUser();
  const settings = await getUserSettings(user.id);
  return Response.json(settings);
}

export async function PUT(request: Request) {
  const user = await requireUser();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const parsed = putBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: 'validation', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  await upsertUserSettings(user.id, parsed.data);
  return Response.json({ ok: true });
}

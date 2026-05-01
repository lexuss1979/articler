'use server';

import { eq } from 'drizzle-orm';
import { signIn } from '../../../server/auth/config';
import { verifyPassword } from '../../../server/auth/password';
import { db } from '../../../server/db/client';
import { users } from '../../../server/db/schema';

export type LoginResult = { ok: false; error: 'invalid_credentials' } | null;

export async function loginUser(
  _prevState: LoginResult,
  formData: FormData,
): Promise<LoginResult> {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  console.log('[login] attempt', { email, passwordLen: password?.length });

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  console.log('[login] db lookup', { found: !!user, userId: user?.id });

  if (!user) {
    console.log('[login] user not found');
    return { ok: false, error: 'invalid_credentials' };
  }

  const valid = await verifyPassword(password, user.passwordHash);
  console.log('[login] password verify', { valid });

  if (!valid) {
    return { ok: false, error: 'invalid_credentials' };
  }

  console.log('[login] calling signIn');
  try {
    await signIn('credentials', { email, password, redirectTo: '/dashboard' });
    console.log('[login] signIn returned (no redirect thrown)');
  } catch (err) {
    console.log('[login] signIn threw', {
      name: (err as Error)?.name,
      digest: (err as { digest?: string })?.digest,
      message: (err as Error)?.message,
    });
    throw err;
  }

  return null;
}

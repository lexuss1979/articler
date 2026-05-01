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

  // Verify credentials before calling signIn so we can return a typed error
  // rather than relying on Auth.js v5 beta's redirect-on-failure behaviour.
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return { ok: false, error: 'invalid_credentials' };
  }

  // Credentials valid — signIn sets the JWT cookie and redirects to /dashboard.
  await signIn('credentials', { email, password, redirectTo: '/dashboard' });
  return null;
}

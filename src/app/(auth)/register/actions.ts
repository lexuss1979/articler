'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { hashPassword } from '../../../server/auth/password';
import { registrationOpen } from '../../../server/auth/registration-open';
import { db } from '../../../server/db/client';
import { users } from '../../../server/db/schema';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export type RegisterResult =
  | { ok: false; error: 'validation' | 'email_taken' | 'registration_closed' }
  | null;

export async function registerUser(
  _prevState: RegisterResult,
  formData: FormData,
): Promise<RegisterResult> {
  if (!registrationOpen()) {
    return { ok: false, error: 'registration_closed' };
  }

  const parsed = schema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    return { ok: false, error: 'validation' };
  }

  const { email, password } = parsed.data;
  const passwordHash = await hashPassword(password);

  try {
    await db.insert(users).values({ email, passwordHash });
  } catch {
    return { ok: false, error: 'email_taken' };
  }

  redirect('/login');
}

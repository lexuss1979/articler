'use server';

import { AuthError } from 'next-auth';
import { redirect } from 'next/navigation';
import { signIn } from '../../../server/auth/config';

export type LoginResult = { ok: false; error: 'invalid_credentials' | 'unknown' } | null;

export async function loginUser(
  _prevState: LoginResult,
  formData: FormData,
): Promise<LoginResult> {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  try {
    await signIn('credentials', { email, password, redirect: false });
  } catch (err) {
    if (err instanceof AuthError) {
      return { ok: false, error: 'invalid_credentials' };
    }
    throw err;
  }

  redirect('/dashboard');
}

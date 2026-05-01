'use server';

import { signOut } from '../../server/auth/config';

export async function logout() {
  await signOut({ redirectTo: '/login' });
}

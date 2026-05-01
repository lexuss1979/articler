import { redirect } from 'next/navigation';
import { auth } from './config';

export async function requireUser(): Promise<{ id: number; email: string }> {
  const session = await auth();
  if (!session?.user?.id || !session?.user?.email) {
    redirect('/login');
  }
  return {
    id: Number(session.user.id),
    email: session.user.email,
  };
}

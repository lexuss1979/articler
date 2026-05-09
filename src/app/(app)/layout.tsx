import Link from 'next/link';
import { requireUser } from '../../server/auth/require-user';
import { Nav } from './nav';
import { LogoutButton } from './logout-button';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="h-full flex flex-col">
      <header className="shrink-0 border-b px-6 py-3 flex items-center gap-6">
        <Link href="/dashboard" className="font-semibold text-base">
          articler
        </Link>
        <Nav />
        <div className="ml-auto flex items-center gap-4">
          <span className="text-sm text-gray-600">{user.email}</span>
          <LogoutButton />
        </div>
      </header>
      <main className="flex-1 min-h-0 overflow-hidden p-6">{children}</main>
    </div>
  );
}

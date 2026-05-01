import { requireUser } from '../../server/auth/require-user';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b px-6 py-3 flex items-center justify-between">
        <span className="text-sm text-gray-600">{user.email}</span>
        <div id="logout-slot" />
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}

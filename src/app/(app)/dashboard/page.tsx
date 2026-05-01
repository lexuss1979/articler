import { requireUser } from '../../../server/auth/require-user';
import { LogoutButton } from '../logout-button';

export default async function DashboardPage() {
  const user = await requireUser();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <LogoutButton />
      </div>
      <p>Signed in as {user.email}</p>
    </div>
  );
}

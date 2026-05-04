import { requireUser } from '../../../server/auth/require-user';

export default async function DashboardPage() {
  await requireUser();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="text-sm text-gray-500">Coming up next: cards.</p>
    </div>
  );
}

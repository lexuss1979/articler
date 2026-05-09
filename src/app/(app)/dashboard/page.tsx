import Link from 'next/link';
import { requireUser } from '../../../server/auth/require-user';
import { loadDashboardData } from '../../../server/dashboard/data';
import { ContinueCard } from './continue-card';
import { ImagesCard } from './images-card';
import { SpendCard } from './spend-card';
import { ProfilesCard } from './profiles-card';
import { RecentCard } from './recent-card';

export default async function DashboardPage() {
  const user = await requireUser();
  const data = await loadDashboardData(user.id);

  return (
    <div className="flex flex-col gap-6 max-w-6xl mx-auto h-full overflow-y-auto pr-1">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <Link
          href="/sessions/new"
          className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700"
        >
          + New session
        </Link>
      </div>

      <ContinueCard active={data.active} />

      <ImagesCard images={data.images} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SpendCard spend={data.spend} settings={data.settings} />
        <ProfilesCard profiles={data.profiles} />
        <RecentCard done={data.done} />
      </div>
    </div>
  );
}

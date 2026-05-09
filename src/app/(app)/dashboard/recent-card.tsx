import Link from 'next/link';
import type { DashboardDoneSession } from '../../../server/dashboard/data';

function dateFmt(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function RecentCard({ done }: { done: DashboardDoneSession[] }) {
  return (
    <div className="border rounded p-4 flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-medium">Recent articles</h2>
        <Link href="/sessions" className="text-xs text-blue-600 hover:underline">
          View all →
        </Link>
      </div>
      {done.length === 0 ? (
        <p className="text-sm text-gray-500">
          No finished articles yet. Sessions show up here once exported.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {done.map((s) => (
            <li key={s.id}>
              <Link
                href={`/sessions/${s.id}`}
                className="block px-3 py-2 -mx-1 rounded hover:bg-gray-50"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium truncate">
                    {s.briefTopic ?? '(no topic)'}
                  </span>
                  <span className="text-xs text-gray-500 shrink-0">
                    {dateFmt(s.updatedAt)}
                  </span>
                </div>
                <div className="text-xs text-gray-500">{s.profileName}</div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

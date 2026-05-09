import Link from 'next/link';
import type { DashboardActiveSession } from '../../../server/dashboard/data';

function relTime(ts: Date): string {
  const diff = Date.now() - ts.getTime();
  const min = Math.round(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 48) return `${hr}h ago`;
  const d = Math.round(hr / 24);
  return `${d}d ago`;
}

export function ContinueCard({ active }: { active: DashboardActiveSession[] }) {
  return (
    <div className="border rounded p-4 flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-medium">Continue working</h2>
        <Link href="/sessions" className="text-xs text-blue-600 hover:underline">
          View all →
        </Link>
      </div>
      {active.length === 0 ? (
        <p className="text-sm text-gray-500">
          No active sessions.{' '}
          <Link href="/sessions/new" className="text-blue-600 hover:underline">
            Start one
          </Link>
          .
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {active.map((s) => (
            <li key={s.id}>
              <Link
                href={`/sessions/${s.id}`}
                className="block px-3 py-2 -mx-1 rounded hover:bg-gray-50"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium truncate">
                    {s.briefTopic ?? '(no topic yet)'}
                  </span>
                  <span className="text-xs text-gray-500 shrink-0">
                    {relTime(s.updatedAt)}
                  </span>
                </div>
                <div className="text-xs text-gray-500">
                  {s.profileName} · {s.state}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

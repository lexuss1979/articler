import Link from 'next/link';
import type { DashboardProfile } from '../../../server/dashboard/data';

export function ProfilesCard({ profiles }: { profiles: DashboardProfile[] }) {
  return (
    <div className="border rounded p-4 flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-medium">Profiles</h2>
        <Link href="/profiles" className="text-xs text-blue-600 hover:underline">
          View all →
        </Link>
      </div>
      {profiles.length === 0 ? (
        <p className="text-sm text-gray-500">
          No profiles yet.{' '}
          <Link href="/profiles/new" className="text-blue-600 hover:underline">
            Create one
          </Link>{' '}
          to start a session.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {profiles.slice(0, 4).map((p) => (
            <li key={p.id} className="flex items-baseline justify-between text-sm">
              <Link
                href={`/profiles/${p.id}/edit`}
                className="text-gray-900 hover:underline truncate"
              >
                {p.name}
              </Link>
              <span className="text-xs text-gray-500 shrink-0 ml-2">{p.format}</span>
            </li>
          ))}
        </ul>
      )}
      <Link
        href="/profiles/new"
        className="text-xs text-blue-600 hover:underline self-start"
      >
        + New profile
      </Link>
    </div>
  );
}

import Link from 'next/link';
import { requireUser } from '../../../server/auth/require-user';
import { listSessions } from '../../../server/sessions/repo';

export default async function SessionsPage() {
  const user = await requireUser();
  const sessions = await listSessions(user.id);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Sessions</h1>
        <Link href="/sessions/new" className="text-blue-600 hover:text-blue-800 text-sm">
          New session
        </Link>
      </div>
      {sessions.length === 0 ? (
        <p className="text-gray-500 text-sm">No sessions yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {sessions.map((session) => (
            <li key={session.id} className="border rounded p-3 flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium">Session #{session.id}</span>
                <span className="text-xs text-gray-500">
                  State: {session.state} · Created:{' '}
                  {new Date(session.createdAt).toLocaleString()}
                </span>
              </div>
              <Link
                href={`/sessions/${session.id}`}
                className="text-blue-600 hover:text-blue-800 text-sm"
              >
                Open
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

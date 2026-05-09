import Link from 'next/link';
import { desc, eq } from 'drizzle-orm';
import { requireUser } from '../../../server/auth/require-user';
import { db } from '../../../server/db/client';
import { profiles, sessions } from '../../../server/db/schema';

const STATE_LABELS: Record<string, string> = {
  briefing: 'briefing',
  planning: 'planning',
  research: 'research',
  drafting: 'drafting',
  review: 'review',
  decoration: 'decoration',
  illustration: 'illustration',
  export: 'export',
  done: 'done',
};

function topicOf(brief: unknown): string | null {
  if (brief && typeof brief === 'object' && 'topic' in brief) {
    const t = (brief as { topic: unknown }).topic;
    if (typeof t === 'string' && t.trim().length > 0) return t;
  }
  return null;
}

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

export default async function SessionsPage() {
  const user = await requireUser();
  const rows = await db
    .select({
      id: sessions.id,
      state: sessions.state,
      mode: sessions.mode,
      brief: sessions.brief,
      updatedAt: sessions.updatedAt,
      profileName: profiles.name,
    })
    .from(sessions)
    .innerJoin(profiles, eq(profiles.id, sessions.profileId))
    .where(eq(sessions.userId, user.id))
    .orderBy(desc(sessions.updatedAt));

  const active = rows.filter((r) => r.state !== 'done');
  const done = rows.filter((r) => r.state === 'done');

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto h-full overflow-y-auto pr-1">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Sessions</h1>
        <Link
          href="/sessions/new"
          className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700"
        >
          + New session
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="text-gray-500 text-sm">No sessions yet.</p>
      ) : (
        <>
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-medium text-gray-600 uppercase tracking-wide">
              Active ({active.length})
            </h2>
            {active.length === 0 ? (
              <p className="text-sm text-gray-500">Nothing in progress.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {active.map((s) => (
                  <li key={s.id}>
                    <Link
                      href={`/sessions/${s.id}`}
                      className="block border rounded p-3 hover:bg-gray-50"
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-sm font-medium truncate">
                          {topicOf(s.brief) ?? <span className="text-gray-400">(no topic yet)</span>}
                        </span>
                        <span className="text-xs text-gray-500 shrink-0">
                          {relTime(s.updatedAt)}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {s.profileName} · {STATE_LABELS[s.state] ?? s.state}
                        {s.mode === 'rewrite' && ' · rewrite'}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-medium text-gray-600 uppercase tracking-wide">
              Finished articles ({done.length})
            </h2>
            {done.length === 0 ? (
              <p className="text-sm text-gray-500">No finished articles yet.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {done.map((s) => (
                  <li key={s.id}>
                    <Link
                      href={`/sessions/${s.id}`}
                      className="block border rounded p-3 hover:bg-gray-50"
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-sm font-medium truncate">
                          {topicOf(s.brief) ?? <span className="text-gray-400">(no topic)</span>}
                        </span>
                        <span className="text-xs text-gray-500 shrink-0">
                          {s.updatedAt.toLocaleDateString()}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {s.profileName} · open to preview &amp; export
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

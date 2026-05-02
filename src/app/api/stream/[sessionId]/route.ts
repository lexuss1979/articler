import { asc, eq } from 'drizzle-orm';
import { db } from '../../../../server/db/client';
import { events } from '../../../../server/db/schema';
import { subscribe } from '../../../../server/events/bus';
import type { PersistedEvent } from '../../../../server/events/bus';
import { requireUser } from '../../../../server/auth/require-user';
import { getSession } from '../../../../server/sessions/repo';

function formatEvent(e: PersistedEvent): string {
  return `event: ${e.kind}\ndata: ${JSON.stringify(e.payload)}\n\n`;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const user = await requireUser();
  const { sessionId: sessionIdStr } = await params;
  const sessionId = Number(sessionIdStr);

  const session = await getSession(user.id, sessionId);
  if (!session) {
    return new Response('Not found', { status: 404 });
  }

  const stored = await db
    .select()
    .from(events)
    .where(eq(events.sessionId, sessionId))
    .orderBy(asc(events.id));

  const stream = new ReadableStream({
    start(controller) {
      for (const e of stored) {
        controller.enqueue(formatEvent(e));
      }

      const unsub = subscribe(sessionId, (e) => {
        controller.enqueue(formatEvent(e));
      });

      request.signal.addEventListener('abort', () => {
        unsub();
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}

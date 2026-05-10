import { asc, inArray } from 'drizzle-orm';
import { db } from '../../../../../server/db/client';
import { events } from '../../../../../server/db/schema';
import { subscribe } from '../../../../../server/events/bus';
import type { PersistedEvent } from '../../../../../server/events/bus';
import { requireUser } from '../../../../../server/auth/require-user';
import { getBatchWithSessions } from '../../../../../server/batches/repo';

function formatEvent(e: PersistedEvent): string {
  const payload = { sessionId: e.sessionId, ...(e.payload as object) };
  return `event: ${e.kind}\ndata: ${JSON.stringify(payload)}\n\n`;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ batchId: string }> },
) {
  const user = await requireUser();
  const { batchId: batchIdStr } = await params;
  const batchId = Number(batchIdStr);

  const result = await getBatchWithSessions(user.id, batchId);
  if (!result) {
    return new Response('Not found', { status: 404 });
  }

  const sessionIds = result.sessions.map((s) => s.id);

  const stored =
    sessionIds.length > 0
      ? await db
          .select()
          .from(events)
          .where(inArray(events.sessionId, sessionIds))
          .orderBy(asc(events.id))
      : [];

  const stream = new ReadableStream({
    start(controller) {
      for (const e of stored) {
        controller.enqueue(formatEvent(e));
      }

      const unsubs = sessionIds.map((sessionId) =>
        subscribe(sessionId, (e) => {
          controller.enqueue(formatEvent(e));
        }),
      );

      request.signal.addEventListener('abort', () => {
        for (const unsub of unsubs) unsub();
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

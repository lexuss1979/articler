import { and, asc, count, eq, inArray } from 'drizzle-orm';
import { db } from '../db/client';
import { batchSessions, batches, profiles, sessions } from '../db/schema';
import { ProfileNotOwnedError } from '../sessions/repo';

export async function createBatchWithSessions(
  userId: number,
  profileId: number,
  topics: string[],
): Promise<{ batchId: number; sessionIds: number[] }> {
  return db.transaction(async (tx) => {
    const [owned] = await tx
      .select({ id: profiles.id })
      .from(profiles)
      .where(and(eq(profiles.id, profileId), eq(profiles.userId, userId)));
    if (!owned) throw new ProfileNotOwnedError();

    const [batch] = await tx.insert(batches).values({ userId, profileId }).returning({ id: batches.id });
    const batchId = batch!.id;

    const sessionRows = await tx
      .insert(sessions)
      .values(
        topics.map((topic) => ({
          userId,
          profileId,
          mode: 'light' as const,
          state: 'queued',
          brief: { topic, goal: '', notes: '', sourceArticles: [] },
        })),
      )
      .returning({ id: sessions.id });

    const sessionIds = sessionRows.map((r) => r.id);

    await tx.insert(batchSessions).values(sessionIds.map((sessionId) => ({ batchId, sessionId })));

    return { batchId, sessionIds };
  });
}

export async function getBatchWithSessions(
  userId: number,
  batchId: number,
): Promise<{ batch: typeof batches.$inferSelect; sessions: (typeof sessions.$inferSelect)[] } | null> {
  const [batch] = await db
    .select()
    .from(batches)
    .where(and(eq(batches.id, batchId), eq(batches.userId, userId)));
  if (!batch) return null;

  const memberIds = await db
    .select({ sessionId: batchSessions.sessionId })
    .from(batchSessions)
    .where(eq(batchSessions.batchId, batchId));

  if (memberIds.length === 0) return { batch, sessions: [] };

  const sessionRows = await db
    .select()
    .from(sessions)
    .where(inArray(sessions.id, memberIds.map((r) => r.sessionId)))
    .orderBy(asc(sessions.id));

  return { batch, sessions: sessionRows };
}

export async function findQueuedLightSessions(
  userId: number,
  limit: number,
): Promise<(typeof sessions.$inferSelect)[]> {
  return db
    .select()
    .from(sessions)
    .where(and(eq(sessions.userId, userId), eq(sessions.mode, 'light'), eq(sessions.state, 'queued')))
    .orderBy(asc(sessions.id))
    .limit(limit);
}

export async function countActiveLightSessions(userId: number): Promise<number> {
  const [row] = await db
    .select({ count: count() })
    .from(sessions)
    .where(
      and(
        eq(sessions.userId, userId),
        eq(sessions.mode, 'light'),
        inArray(sessions.state, ['planning', 'research', 'drafting', 'review']),
      ),
    );
  return Number(row?.count ?? 0);
}

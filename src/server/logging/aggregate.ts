import { db } from '../db/client';
import { runs } from '../db/schema';
import { eq, sum } from 'drizzle-orm';

export async function getSessionCost(sessionId: number): Promise<number> {
  const [row] = await db
    .select({ total: sum(runs.costUsd) })
    .from(runs)
    .where(eq(runs.sessionId, sessionId));
  return parseFloat(row?.total ?? '0') || 0;
}

export async function getUserCost(userId: number): Promise<number> {
  const [row] = await db
    .select({ total: sum(runs.costUsd) })
    .from(runs)
    .where(eq(runs.userId, userId));
  return parseFloat(row?.total ?? '0') || 0;
}

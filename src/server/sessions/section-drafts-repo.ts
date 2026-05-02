import { and, asc, eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { db } from '../db/client';
import { sectionDrafts, sessions } from '../db/schema';

async function checkOwnership(userId: number, sessionId: number) {
  const [owned] = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)));
  return !!owned;
}

export async function upsertSectionDraft(
  userId: number,
  sessionId: number,
  sectionId: string,
  contentMd: string,
) {
  if (!(await checkOwnership(userId, sessionId))) return null;

  const [row] = await db
    .insert(sectionDrafts)
    .values({ sessionId, sectionId, contentMd })
    .onConflictDoUpdate({
      target: [sectionDrafts.sessionId, sectionDrafts.sectionId],
      set: { contentMd, updatedAt: sql`now()` },
    })
    .returning();
  return row!;
}

export async function listSectionDrafts(userId: number, sessionId: number) {
  if (!(await checkOwnership(userId, sessionId))) return [];

  return db
    .select()
    .from(sectionDrafts)
    .where(eq(sectionDrafts.sessionId, sessionId))
    .orderBy(asc(sectionDrafts.id));
}

export async function getSectionDraft(userId: number, sessionId: number, sectionId: string) {
  if (!(await checkOwnership(userId, sessionId))) return null;

  const [row] = await db
    .select()
    .from(sectionDrafts)
    .where(and(eq(sectionDrafts.sessionId, sessionId), eq(sectionDrafts.sectionId, sectionId)));
  return row ?? null;
}

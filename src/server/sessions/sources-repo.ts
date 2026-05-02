import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '../db/client';
import { sessions, sources } from '../db/schema';
import type { SourceStatus } from './sources';

type InsertSourceFields = {
  sectionId: string | null;
  hypothesis: string;
  query: string;
  url: string;
  title: string;
  rawExcerpt: string;
  summary: string;
  relevanceScore: number;
};

function ownedSessionIds(userId: number) {
  return db.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, userId));
}

export async function insertSource(
  userId: number,
  sessionId: number,
  fields: InsertSourceFields,
) {
  const [owned] = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)));
  if (!owned) return null;

  const [row] = await db
    .insert(sources)
    .values({ ...fields, sessionId, status: 'proposed' })
    .returning();
  return row!;
}

export async function listSessionSources(userId: number, sessionId: number) {
  const [owned] = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)));
  if (!owned) return [];

  return db.select().from(sources).where(eq(sources.sessionId, sessionId)).orderBy(asc(sources.id));
}

export async function findSourceByQuery(userId: number, sessionId: number, query: string) {
  const [owned] = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)));
  if (!owned) return [];

  return db
    .select()
    .from(sources)
    .where(and(eq(sources.sessionId, sessionId), eq(sources.query, query)));
}

export async function setSourceStatus(userId: number, sourceId: number, status: SourceStatus) {
  const [row] = await db
    .update(sources)
    .set({ status })
    .where(and(eq(sources.id, sourceId), inArray(sources.sessionId, ownedSessionIds(userId))))
    .returning();
  return row ?? null;
}

export async function setSourceSection(
  userId: number,
  sourceId: number,
  sectionId: string | null,
) {
  const [row] = await db
    .update(sources)
    .set({ sectionId })
    .where(and(eq(sources.id, sourceId), inArray(sources.sessionId, ownedSessionIds(userId))))
    .returning();
  return row ?? null;
}

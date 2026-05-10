import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '../db/client';
import { critiqueFindings, critiqueRounds, sessions } from '../db/schema';
import type { FindingSpan } from './critics';

type FindingFields = {
  criticId: string;
  severity: string;
  span: FindingSpan;
  problem: string;
  suggestedChange: string;
  rationale: string;
};

function ownedRoundIds(userId: number) {
  return db
    .select({ id: critiqueRounds.id })
    .from(critiqueRounds)
    .innerJoin(sessions, and(eq(sessions.id, critiqueRounds.sessionId), eq(sessions.userId, userId)));
}

export async function createCritiqueRound(
  userId: number,
  sessionId: number,
  kind: 'critique' | 'factcheck' | 'auto_review',
  draftHash: string,
) {
  const [owned] = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)));
  if (!owned) return null;

  const [row] = await db
    .insert(critiqueRounds)
    .values({ sessionId, kind, draftHash })
    .returning();
  return row!;
}

export async function insertFinding(
  userId: number,
  roundId: number,
  fields: FindingFields,
) {
  const [owned] = await db
    .select({ id: critiqueRounds.id })
    .from(critiqueRounds)
    .innerJoin(sessions, and(eq(sessions.id, critiqueRounds.sessionId), eq(sessions.userId, userId)))
    .where(eq(critiqueRounds.id, roundId));
  if (!owned) return null;

  const [row] = await db
    .insert(critiqueFindings)
    .values({ ...fields, roundId, status: 'open' })
    .returning();
  return row!;
}

export async function listSessionRounds(
  userId: number,
  sessionId: number,
  kind?: 'critique' | 'factcheck' | 'auto_review',
) {
  const [owned] = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)));
  if (!owned) return [];

  const where = kind
    ? and(eq(critiqueRounds.sessionId, sessionId), eq(critiqueRounds.kind, kind))
    : eq(critiqueRounds.sessionId, sessionId);
  return db.select().from(critiqueRounds).where(where).orderBy(asc(critiqueRounds.id));
}

export async function listRoundFindings(userId: number, roundId: number) {
  const [owned] = await db
    .select({ id: critiqueRounds.id })
    .from(critiqueRounds)
    .innerJoin(sessions, and(eq(sessions.id, critiqueRounds.sessionId), eq(sessions.userId, userId)))
    .where(eq(critiqueRounds.id, roundId));
  if (!owned) return [];

  return db
    .select()
    .from(critiqueFindings)
    .where(eq(critiqueFindings.roundId, roundId))
    .orderBy(asc(critiqueFindings.id));
}

export async function getFindingForUser(userId: number, findingId: number) {
  const [row] = await db
    .select()
    .from(critiqueFindings)
    .where(and(eq(critiqueFindings.id, findingId), inArray(critiqueFindings.roundId, ownedRoundIds(userId))));
  return row ?? null;
}

export type FindingStatus =
  | 'open'
  | 'pending_apply'
  | 'applied'
  | 'dismissed'
  | 'rewritten';

export async function setFindingStatus(
  userId: number,
  findingId: number,
  status: FindingStatus,
) {
  const [row] = await db
    .update(critiqueFindings)
    .set({ status })
    .where(
      and(eq(critiqueFindings.id, findingId), inArray(critiqueFindings.roundId, ownedRoundIds(userId))),
    )
    .returning();
  return row ?? null;
}

export async function bulkSetFindingStatus(
  userId: number,
  findingIds: number[],
  status: FindingStatus,
) {
  if (findingIds.length === 0) return [];
  const rows = await db
    .update(critiqueFindings)
    .set({ status })
    .where(
      and(
        inArray(critiqueFindings.id, findingIds),
        inArray(critiqueFindings.roundId, ownedRoundIds(userId)),
      ),
    )
    .returning();
  return rows;
}

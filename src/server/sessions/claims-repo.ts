import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../db/client';
import { claimEvidence, claims, claimVerdicts, critiqueRounds, sessions } from '../db/schema';
import type { CheckWorthiness, ClaimSpan, ClaimType, Verdict } from './claims';

type InsertClaimFields = {
  span: ClaimSpan;
  spanHash: string;
  claimText: string;
  claimType: ClaimType;
  checkWorthiness: CheckWorthiness;
};

type InsertVerdictFields = {
  verdict: Verdict;
  justification: string;
};

type InsertEvidenceItem = {
  sourceId: number | null;
  url: string;
  snippet: string;
  supports: boolean;
};

function ownedSessionIds(userId: number) {
  return db.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, userId));
}

export async function insertClaim(
  userId: number,
  sessionId: number,
  roundId: number,
  fields: InsertClaimFields,
) {
  const [owned] = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)));
  if (!owned) return null;

  const [round] = await db
    .select({ id: critiqueRounds.id })
    .from(critiqueRounds)
    .where(and(eq(critiqueRounds.id, roundId), eq(critiqueRounds.sessionId, sessionId)));
  if (!round) return null;

  const [row] = await db
    .insert(claims)
    .values({ ...fields, sessionId, roundId, status: 'open' })
    .returning();
  return row!;
}

export async function listSessionClaims(userId: number, sessionId: number) {
  const [owned] = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)));
  if (!owned) return [];

  return db.select().from(claims).where(eq(claims.sessionId, sessionId)).orderBy(asc(claims.id));
}

export async function listSessionClaimsWithVerdicts(userId: number, sessionId: number) {
  const [owned] = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)));
  if (!owned) return [];

  const rows = await db
    .select({ claim: claims, verdict: claimVerdicts })
    .from(claims)
    .leftJoin(claimVerdicts, eq(claimVerdicts.claimId, claims.id))
    .where(eq(claims.sessionId, sessionId))
    .orderBy(asc(claims.id), desc(claimVerdicts.id));

  // Deduplicate: keep only the latest verdict per claim
  const seen = new Set<number>();
  const result: Array<{ claim: typeof rows[0]['claim']; verdict: typeof rows[0]['verdict'] }> = [];
  for (const row of rows) {
    if (!seen.has(row.claim.id)) {
      seen.add(row.claim.id);
      result.push(row);
    }
  }
  return result;
}

export async function findClaimBySpanHash(userId: number, sessionId: number, spanHash: string) {
  const [owned] = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)));
  if (!owned) return null;

  const [row] = await db
    .select({ claim: claims, verdict: claimVerdicts })
    .from(claims)
    .leftJoin(claimVerdicts, eq(claimVerdicts.claimId, claims.id))
    .where(and(eq(claims.sessionId, sessionId), eq(claims.spanHash, spanHash)))
    .orderBy(desc(claims.id), desc(claimVerdicts.id))
    .limit(1);
  return row ?? null;
}

export async function setClaimStatus(
  userId: number,
  claimId: number,
  status: 'open' | 'opinion' | 'dismissed',
) {
  const [row] = await db
    .update(claims)
    .set({ status })
    .where(and(eq(claims.id, claimId), inArray(claims.sessionId, ownedSessionIds(userId))))
    .returning();
  return row ?? null;
}

export async function insertClaimVerdict(
  userId: number,
  claimId: number,
  fields: InsertVerdictFields,
) {
  const [owned] = await db
    .select({ id: claims.id })
    .from(claims)
    .where(and(eq(claims.id, claimId), inArray(claims.sessionId, ownedSessionIds(userId))));
  if (!owned) return null;

  const [row] = await db.insert(claimVerdicts).values({ claimId, ...fields }).returning();
  return row!;
}

export async function insertClaimEvidence(
  userId: number,
  verdictId: number,
  items: InsertEvidenceItem[],
) {
  const [owned] = await db
    .select({ id: claimVerdicts.id })
    .from(claimVerdicts)
    .innerJoin(claims, eq(claims.id, claimVerdicts.claimId))
    .where(and(eq(claimVerdicts.id, verdictId), inArray(claims.sessionId, ownedSessionIds(userId))));
  if (!owned) return [];

  if (!items.length) return [];

  return db
    .insert(claimEvidence)
    .values(items.map((item) => ({ ...item, verdictId })))
    .returning();
}

export async function getClaimWithLatestVerdict(userId: number, claimId: number) {
  const [row] = await db
    .select({ claim: claims, verdict: claimVerdicts })
    .from(claims)
    .leftJoin(claimVerdicts, eq(claimVerdicts.claimId, claims.id))
    .where(and(eq(claims.id, claimId), inArray(claims.sessionId, ownedSessionIds(userId))))
    .orderBy(desc(claimVerdicts.id))
    .limit(1);
  return row ?? null;
}

export async function listClaimVerdicts(userId: number, claimId: number) {
  const [owned] = await db
    .select({ id: claims.id })
    .from(claims)
    .where(and(eq(claims.id, claimId), inArray(claims.sessionId, ownedSessionIds(userId))));
  if (!owned) return [];

  const verdicts = await db
    .select()
    .from(claimVerdicts)
    .where(eq(claimVerdicts.claimId, claimId))
    .orderBy(asc(claimVerdicts.id));

  if (!verdicts.length) return [];

  const verdictIds = verdicts.map((v) => v.id);
  const evidence = await db
    .select()
    .from(claimEvidence)
    .where(inArray(claimEvidence.verdictId, verdictIds))
    .orderBy(asc(claimEvidence.id));

  return verdicts.map((v) => ({
    ...v,
    evidence: evidence.filter((e) => e.verdictId === v.id),
  }));
}

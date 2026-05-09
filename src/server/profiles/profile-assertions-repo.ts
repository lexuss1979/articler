import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { profileAssertions } from '../db/schema';
import {
  applyAgreement,
  applyContradiction,
  applyDecay,
  AUTO_DELETE_BELOW,
  INITIAL_CONFIDENCE,
} from './assertion-policy';

export type Assertion = {
  id: number;
  profileId: number;
  category: string;
  key: string;
  assertion: string;
  confidence: number;
  evidenceCount: number;
  source: string;
  createdAt: Date;
  updatedAt: Date;
};

export async function upsertAssertion(input: {
  profileId: number;
  key: string;
  category: string;
  assertion: string;
  source?: string;
}): Promise<Assertion> {
  const { profileId, key, category, assertion, source = 'session' } = input;
  const [row] = await db
    .insert(profileAssertions)
    .values({
      profileId,
      key,
      category,
      assertion,
      source,
      confidence: String(INITIAL_CONFIDENCE),
      evidenceCount: 1,
    })
    .onConflictDoUpdate({
      target: [profileAssertions.profileId, profileAssertions.key],
      set: {
        assertion,
        category,
        source,
        updatedAt: sql`now()`,
      },
    })
    .returning();
  return mapRow(row!);
}

export async function listAssertions(profileId: number): Promise<Assertion[]> {
  const rows = await db
    .select()
    .from(profileAssertions)
    .where(eq(profileAssertions.profileId, profileId));

  const now = new Date();
  const toDelete: number[] = [];
  const toUpdate: { id: number; confidence: number }[] = [];
  const result: Assertion[] = [];

  for (const row of rows) {
    const decayed = applyDecay(Number(row.confidence), row.updatedAt, now);
    if (decayed < AUTO_DELETE_BELOW) {
      toDelete.push(row.id);
    } else {
      toUpdate.push({ id: row.id, confidence: decayed });
      result.push({ ...mapRow(row), confidence: decayed });
    }
  }

  if (toDelete.length > 0) {
    await db
      .delete(profileAssertions)
      .where(inArray(profileAssertions.id, toDelete));
  }

  if (toUpdate.length > 0) {
    await Promise.all(
      toUpdate.map(({ id, confidence }) =>
        db
          .update(profileAssertions)
          .set({ confidence: String(confidence) })
          .where(eq(profileAssertions.id, id)),
      ),
    );
  }

  return result;
}

export async function recordAgreement(
  profileId: number,
  key: string,
): Promise<Assertion | null> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(profileAssertions)
      .where(and(eq(profileAssertions.profileId, profileId), eq(profileAssertions.key, key)));
    if (!row) return null;

    const newConfidence = applyAgreement(Number(row.confidence));
    const [updated] = await tx
      .update(profileAssertions)
      .set({
        confidence: String(newConfidence),
        evidenceCount: row.evidenceCount + 1,
        updatedAt: sql`now()`,
      })
      .where(eq(profileAssertions.id, row.id))
      .returning();
    return mapRow(updated!);
  });
}

export async function recordContradiction(
  profileId: number,
  key: string,
): Promise<Assertion | null> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(profileAssertions)
      .where(and(eq(profileAssertions.profileId, profileId), eq(profileAssertions.key, key)));
    if (!row) return null;

    const newConfidence = applyContradiction(Number(row.confidence));
    if (newConfidence < AUTO_DELETE_BELOW) {
      await tx.delete(profileAssertions).where(eq(profileAssertions.id, row.id));
      return null;
    }

    const [updated] = await tx
      .update(profileAssertions)
      .set({
        confidence: String(newConfidence),
        evidenceCount: row.evidenceCount + 1,
        updatedAt: sql`now()`,
      })
      .where(eq(profileAssertions.id, row.id))
      .returning();
    return mapRow(updated!);
  });
}

export async function deleteAssertion(
  profileId: number,
  assertionId: number,
): Promise<boolean> {
  const result = await db
    .delete(profileAssertions)
    .where(and(eq(profileAssertions.id, assertionId), eq(profileAssertions.profileId, profileId)))
    .returning({ id: profileAssertions.id });
  return result.length > 0;
}

export async function replaceAssertions(
  profileId: number,
  items: Array<{ key: string; category: string; assertion: string; source: string }>,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(profileAssertions).where(eq(profileAssertions.profileId, profileId));
    if (items.length === 0) return;
    await tx.insert(profileAssertions).values(
      items.map((item) => ({
        profileId,
        key: item.key,
        category: item.category,
        assertion: item.assertion,
        source: item.source,
        confidence: String(INITIAL_CONFIDENCE),
        evidenceCount: 1,
      })),
    );
  });
}

export async function replaceAssertionsBySource(
  profileId: number,
  source: string,
  items: Array<{ key: string; category: string; assertion: string }>,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .delete(profileAssertions)
      .where(
        and(eq(profileAssertions.profileId, profileId), eq(profileAssertions.source, source)),
      );
    if (items.length === 0) return;
    await tx.insert(profileAssertions).values(
      items.map((item) => ({
        profileId,
        key: item.key,
        category: item.category,
        assertion: item.assertion,
        source,
        confidence: String(INITIAL_CONFIDENCE),
        evidenceCount: 1,
      })),
    );
  });
}

export async function mergeDuplicateKey(
  profileId: number,
  fromKey: string,
  toKey: string,
): Promise<Assertion | null> {
  return db.transaction(async (tx) => {
    const [fromRow] = await tx
      .select()
      .from(profileAssertions)
      .where(and(eq(profileAssertions.profileId, profileId), eq(profileAssertions.key, fromKey)));

    const [toRow] = await tx
      .select()
      .from(profileAssertions)
      .where(and(eq(profileAssertions.profileId, profileId), eq(profileAssertions.key, toKey)));

    if (!fromRow) {
      return toRow ? mapRow(toRow) : null;
    }

    if (!toRow) {
      const [renamed] = await tx
        .update(profileAssertions)
        .set({ key: toKey, updatedAt: sql`now()` })
        .where(eq(profileAssertions.id, fromRow.id))
        .returning();
      return mapRow(renamed!);
    }

    const mergedConfidence = Math.max(Number(fromRow.confidence), Number(toRow.confidence));
    const mergedEvidence = fromRow.evidenceCount + toRow.evidenceCount;

    await tx.delete(profileAssertions).where(eq(profileAssertions.id, fromRow.id));

    const [merged] = await tx
      .update(profileAssertions)
      .set({
        confidence: String(mergedConfidence),
        evidenceCount: mergedEvidence,
        updatedAt: sql`now()`,
      })
      .where(eq(profileAssertions.id, toRow.id))
      .returning();
    return mapRow(merged!);
  });
}

function mapRow(row: typeof profileAssertions.$inferSelect): Assertion {
  return {
    id: row.id,
    profileId: row.profileId,
    category: row.category,
    key: row.key,
    assertion: row.assertion,
    confidence: Number(row.confidence),
    evidenceCount: row.evidenceCount,
    source: row.source,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

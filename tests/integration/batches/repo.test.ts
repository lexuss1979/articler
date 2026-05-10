import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../../../src/server/db/client';
import { batchSessions, batches, profiles, sessions, users } from '../../../src/server/db/schema';
import {
  countActiveLightSessions,
  createBatchWithSessions,
  findQueuedLightSessions,
  getBatchWithSessions,
} from '../../../src/server/batches/repo';
import { ProfileNotOwnedError } from '../../../src/server/sessions/repo';

const runIntegration = !!process.env.DATABASE_URL;

const EMAIL_A = `batches-repo-a-${Date.now()}@test.com`;
const EMAIL_B = `batches-repo-b-${Date.now()}@test.com`;

let userAId: number;
let userBId: number;
let profileAId: number;
let profileBId: number;

beforeAll(async () => {
  if (!runIntegration) return;

  const [a] = await db.insert(users).values({ email: EMAIL_A, passwordHash: 'x' }).returning({ id: users.id });
  const [b] = await db.insert(users).values({ email: EMAIL_B, passwordHash: 'x' }).returning({ id: users.id });
  userAId = a.id;
  userBId = b.id;

  const [pa] = await db
    .insert(profiles)
    .values({ userId: userAId, name: 'pA', format: 'long_read', style: 'plain', audience: 'general', targetVolumeMin: 100, targetVolumeMax: 200 })
    .returning({ id: profiles.id });
  profileAId = pa.id;

  const [pb] = await db
    .insert(profiles)
    .values({ userId: userBId, name: 'pB', format: 'long_read', style: 'plain', audience: 'general', targetVolumeMin: 100, targetVolumeMax: 200 })
    .returning({ id: profiles.id });
  profileBId = pb.id;
});

afterAll(async () => {
  if (!runIntegration) return;
  const batchIds = await db.select({ id: batches.id }).from(batches).where(inArray(batches.userId, [userAId, userBId]));
  if (batchIds.length > 0) {
    await db.delete(batchSessions).where(inArray(batchSessions.batchId, batchIds.map((r) => r.id)));
    await db.delete(batches).where(inArray(batches.id, batchIds.map((r) => r.id)));
  }
  await db.delete(sessions).where(inArray(sessions.userId, [userAId, userBId]));
  await db.delete(profiles).where(eq(profiles.id, profileAId));
  await db.delete(profiles).where(eq(profiles.id, profileBId));
  await db.delete(users).where(inArray(users.id, [userAId, userBId]));
});

describe.skipIf(!runIntegration)('createBatchWithSessions', () => {
  it('creates batch, sessions, and join rows in insertion order', async () => {
    const { batchId, sessionIds } = await createBatchWithSessions(userAId, profileAId, ['t1', 't2', 't3']);

    expect(sessionIds).toHaveLength(3);
    expect(batchId).toBeGreaterThan(0);

    const sessionRows = await db.select().from(sessions).where(inArray(sessions.id, sessionIds));
    for (let i = 0; i < 3; i++) {
      const s = sessionRows.find((r) => r.id === sessionIds[i])!;
      expect(s.state).toBe('queued');
      expect(s.mode).toBe('light');
      expect((s.brief as { topic: string }).topic).toBe(['t1', 't2', 't3'][i]);
    }

    const joinRows = await db.select().from(batchSessions).where(eq(batchSessions.batchId, batchId));
    expect(joinRows).toHaveLength(3);
    expect(joinRows.map((r) => r.sessionId).sort()).toEqual([...sessionIds].sort());
  });

  it('throws ProfileNotOwnedError and rolls back when profile belongs to another user', async () => {
    const before = await db.select({ id: batches.id }).from(batches).where(eq(batches.userId, userAId));

    await expect(createBatchWithSessions(userAId, profileBId, ['x'])).rejects.toBeInstanceOf(ProfileNotOwnedError);

    const after = await db.select({ id: batches.id }).from(batches).where(eq(batches.userId, userAId));
    expect(after.length).toBe(before.length);

    // No orphan sessions with profileBId assigned to userAId
    const orphanSessions = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.userId, userAId), eq(sessions.profileId, profileBId)));
    expect(orphanSessions).toHaveLength(0);
  });
});

describe.skipIf(!runIntegration)('getBatchWithSessions', () => {
  it('returns batch and sessions in insertion order', async () => {
    const { batchId, sessionIds } = await createBatchWithSessions(userAId, profileAId, ['a', 'b', 'c']);

    const result = await getBatchWithSessions(userAId, batchId);
    expect(result).not.toBeNull();
    expect(result!.batch.id).toBe(batchId);
    expect(result!.sessions.map((s) => s.id)).toEqual(sessionIds);
  });

  it('returns null for unknown batchId', async () => {
    const result = await getBatchWithSessions(userAId, 999_999_999);
    expect(result).toBeNull();
  });

  it('returns null for batch owned by another user', async () => {
    const { batchId } = await createBatchWithSessions(userAId, profileAId, ['z']);
    const result = await getBatchWithSessions(userBId, batchId);
    expect(result).toBeNull();
  });
});

describe.skipIf(!runIntegration)('findQueuedLightSessions', () => {
  it('returns only queued light sessions for the user, ordered by id, respecting limit', async () => {
    await createBatchWithSessions(userAId, profileAId, ['q1', 'q2', 'q3']);

    const result = await findQueuedLightSessions(userAId, 2);
    expect(result).toHaveLength(2);
    expect(result.every((s) => s.mode === 'light' && s.state === 'queued')).toBe(true);
    expect(result.every((s) => s.userId === userAId)).toBe(true);
    // Ordered ascending by id
    expect(result[0]!.id).toBeLessThan(result[1]!.id);
  });

  it('does not return sessions from other users', async () => {
    const result = await findQueuedLightSessions(userBId, 100);
    expect(result.every((s) => s.userId === userBId)).toBe(true);
  });
});

describe.skipIf(!runIntegration)('countActiveLightSessions', () => {
  it('counts only planning|research|drafting|review light sessions for the user', async () => {
    const activeStates = ['planning', 'research', 'drafting', 'review'];
    const inserted = await db
      .insert(sessions)
      .values([
        ...activeStates.map((state) => ({ userId: userAId, profileId: profileAId, mode: 'light' as const, state })),
        { userId: userAId, profileId: profileAId, mode: 'light' as const, state: 'queued' },
        { userId: userAId, profileId: profileAId, mode: 'light' as const, state: 'done' },
        { userId: userAId, profileId: profileAId, mode: 'new' as const, state: 'planning' },
      ])
      .returning({ id: sessions.id });

    const count = await countActiveLightSessions(userAId);
    expect(count).toBeGreaterThanOrEqual(4);

    // Cleanup
    await db.delete(sessions).where(inArray(sessions.id, inserted.map((r) => r.id)));
  });
});

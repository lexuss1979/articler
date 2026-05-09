/**
 * Integration tests for profile-assertions-repo.ts.
 * Requires: DATABASE_URL env pointing at a running Postgres instance.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../../src/server/db/client';
import { profileAssertions, profiles, users } from '../../../src/server/db/schema';
import {
  listAssertions,
  upsertAssertion,
} from '../../../src/server/profiles/profile-assertions-repo';

const runIntegration = !!process.env.DATABASE_URL;

const TEST_EMAIL = `assertions-repo-${Date.now()}@test.com`;

let userId: number;
let profileId: number;

describe.skipIf(!runIntegration)('profile-assertions-repo', () => {
  beforeAll(async () => {
    const [user] = await db
      .insert(users)
      .values({ email: TEST_EMAIL, passwordHash: 'x' })
      .returning({ id: users.id });
    userId = user.id;

    const [profile] = await db
      .insert(profiles)
      .values({
        userId,
        name: 'Test Profile',
        format: 'blog',
        style: 'casual',
        audience: 'general',
        targetVolumeMin: 500,
        targetVolumeMax: 1000,
      })
      .returning({ id: profiles.id });
    profileId = profile.id;
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.email, TEST_EMAIL));
  });

  it('upsert inserts a new row with default confidence and evidenceCount', async () => {
    const row = await upsertAssertion({
      profileId,
      key: 'tone_formal',
      category: 'tone',
      assertion: 'user prefers formal tone',
    });
    expect(row.confidence).toBeCloseTo(0.5);
    expect(row.evidenceCount).toBe(1);
    expect(row.key).toBe('tone_formal');
  });

  it('upsert updates assertion text but leaves confidence and evidenceCount unchanged', async () => {
    await upsertAssertion({
      profileId,
      key: 'tone_formal',
      category: 'tone',
      assertion: 'updated assertion text',
    });

    const rows = await listAssertions(profileId);
    const row = rows.find((r) => r.key === 'tone_formal');
    expect(row).toBeDefined();
    expect(row!.assertion).toBe('updated assertion text');
    expect(row!.confidence).toBeCloseTo(0.5);
    expect(row!.evidenceCount).toBe(1);
  });

  it('listAssertions applies decay and returns updated confidence', async () => {
    const key = 'format_short';
    await upsertAssertion({
      profileId,
      key,
      category: 'format',
      assertion: 'user prefers short articles',
    });

    // Backdate updated_at to 90 days ago
    await db.execute(
      sql`UPDATE profile_assertions SET updated_at = now() - interval '90 days'
          WHERE profile_id = ${profileId} AND key = ${key}`,
    );

    const rows = await listAssertions(profileId);
    const row = rows.find((r) => r.key === key);
    expect(row).toBeDefined();
    // 90 days → floor(90/30) = 3 periods × 0.02 = 0.06 subtracted → 0.5 - 0.06 = 0.44
    expect(row!.confidence).toBeCloseTo(0.44, 5);

    // Verify the decayed value was persisted to DB
    const [dbRow] = await db
      .select()
      .from(profileAssertions)
      .where(and(eq(profileAssertions.profileId, profileId), eq(profileAssertions.key, key)));
    expect(Number(dbRow!.confidence)).toBeCloseTo(0.44, 5);
  });

  it('listAssertions deletes rows that decay below AUTO_DELETE_BELOW', async () => {
    const key = 'scope_narrow';
    await upsertAssertion({
      profileId,
      key,
      category: 'scope',
      assertion: 'user prefers narrow scope',
    });

    // Set confidence to 0.21 and backdate 60 days → decay 0.04 → 0.17 < 0.20
    await db.execute(
      sql`UPDATE profile_assertions SET confidence = 0.21, updated_at = now() - interval '60 days'
          WHERE profile_id = ${profileId} AND key = ${key}`,
    );

    const rows = await listAssertions(profileId);
    expect(rows.find((r) => r.key === key)).toBeUndefined();

    // Confirm row is gone from DB
    const dbRows = await db
      .select()
      .from(profileAssertions)
      .where(and(eq(profileAssertions.profileId, profileId), eq(profileAssertions.key, key)));
    expect(dbRows).toHaveLength(0);
  });
});

describe.skipIf(runIntegration)('profile-assertions-repo (DB unavailable — skipped)', () => {
  it('skips because DATABASE_URL is not set', () => {
    expect(true).toBe(true);
  });
});

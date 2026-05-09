/**
 * Integration test: profile_assertions cascade deletion.
 *
 * Verifies that deleting a profile row cascades to its assertion rows.
 *
 * Requires: DATABASE_URL env pointing at a running Postgres instance.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../../../src/server/db/client';
import { profileAssertions, profiles, users } from '../../../src/server/db/schema';

const runIntegration = !!process.env.DATABASE_URL;

const TEST_EMAIL = `profile-assertions-schema-${Date.now()}@test.com`;

let userId: number;
let profileId: number;

describe.skipIf(!runIntegration)('profile_assertions cascade', () => {
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

  it('deleting a profile cascades to its assertions', async () => {
    await db.insert(profileAssertions).values({
      profileId,
      category: 'tone',
      key: 'tone_formal',
      assertion: 'user prefers formal tone',
    });

    const [row] = await db
      .select()
      .from(profileAssertions)
      .where(eq(profileAssertions.profileId, profileId));
    expect(row).toBeDefined();

    await db.delete(profiles).where(eq(profiles.id, profileId));

    const remaining = await db
      .select()
      .from(profileAssertions)
      .where(eq(profileAssertions.profileId, profileId));
    expect(remaining).toHaveLength(0);
  });
});

describe.skipIf(runIntegration)('profile_assertions cascade (DB unavailable — skipped)', () => {
  it('skips because DATABASE_URL is not set', () => {
    expect(true).toBe(true);
  });
});

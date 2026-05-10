/**
 * Integration tests for profile-assertions-repo.ts.
 * Requires: DATABASE_URL env pointing at a running Postgres instance.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../../src/server/db/client';
import { profileAssertions, profiles, users } from '../../../src/server/db/schema';
import {
  deleteAssertion,
  deleteAssertionsBySource,
  listAssertions,
  mergeDuplicateKey,
  recordAgreement,
  recordContradiction,
  replaceAssertions,
  replaceAssertionsBySource,
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

  it('recordAgreement increments confidence and evidenceCount', async () => {
    const key = 'audience_tech';
    await upsertAssertion({ profileId, key, category: 'audience', assertion: 'tech audience' });
    // 3 calls: 0.5 → 0.6 → 0.7 → 0.8, evidenceCount 1 → 2 → 3 → 4
    await recordAgreement(profileId, key);
    await recordAgreement(profileId, key);
    const result = await recordAgreement(profileId, key);
    expect(result).not.toBeNull();
    expect(result!.confidence).toBeCloseTo(0.8);
    expect(result!.evidenceCount).toBe(4);
  });

  it('recordAgreement on missing key returns null and inserts nothing', async () => {
    const result = await recordAgreement(profileId, 'unknown_key_xyz');
    expect(result).toBeNull();
    const rows = await db
      .select()
      .from(profileAssertions)
      .where(
        and(
          eq(profileAssertions.profileId, profileId),
          eq(profileAssertions.key, 'unknown_key_xyz'),
        ),
      );
    expect(rows).toHaveLength(0);
  });

  it('recordContradiction leaves row present when confidence stays above AUTO_DELETE_BELOW', async () => {
    const key = 'tone_casual';
    await upsertAssertion({ profileId, key, category: 'tone', assertion: 'casual tone' });
    // 0.5 - 0.25 = 0.25 ≥ 0.20
    const result = await recordContradiction(profileId, key);
    expect(result).not.toBeNull();
    expect(result!.confidence).toBeCloseTo(0.25);
    expect(result!.evidenceCount).toBe(2);
  });

  it('recordContradiction deletes row when confidence drops below AUTO_DELETE_BELOW', async () => {
    const key = 'tone_verbose';
    await upsertAssertion({ profileId, key, category: 'tone', assertion: 'verbose tone' });
    // first: 0.5 → 0.25 (still present)
    await recordContradiction(profileId, key);
    // second: 0.25 → 0.0 < 0.20 → deleted
    const result = await recordContradiction(profileId, key);
    expect(result).toBeNull();
    const rows = await db
      .select()
      .from(profileAssertions)
      .where(and(eq(profileAssertions.profileId, profileId), eq(profileAssertions.key, key)));
    expect(rows).toHaveLength(0);
  });

  it('deleteAssertion returns true and removes row for correct profileId', async () => {
    const row = await upsertAssertion({
      profileId,
      key: 'custom_delete_me',
      category: 'custom',
      assertion: 'to be deleted',
    });
    const hit = await deleteAssertion(profileId, row.id);
    expect(hit).toBe(true);
    const [dbRow] = await db
      .select()
      .from(profileAssertions)
      .where(eq(profileAssertions.id, row.id));
    expect(dbRow).toBeUndefined();
  });

  it('deleteAssertion returns false and leaves row when profileId does not match', async () => {
    const row = await upsertAssertion({
      profileId,
      key: 'custom_keep_me',
      category: 'custom',
      assertion: 'should survive',
    });

    // Create a second profile
    const [profile2] = await db
      .insert(profiles)
      .values({
        userId,
        name: 'Other Profile',
        format: 'blog',
        style: 'formal',
        audience: 'general',
        targetVolumeMin: 300,
        targetVolumeMax: 700,
      })
      .returning({ id: profiles.id });

    const miss = await deleteAssertion(profile2.id, row.id);
    expect(miss).toBe(false);

    const [dbRow] = await db
      .select()
      .from(profileAssertions)
      .where(eq(profileAssertions.id, row.id));
    expect(dbRow).toBeDefined();

    await db.delete(profiles).where(eq(profiles.id, profile2.id));
  });

  it('replaceAssertions replaces all existing rows with new ones at default confidence', async () => {
    const key1 = 'replace_a';
    const key2 = 'replace_b';
    const key3 = 'replace_c';
    await upsertAssertion({ profileId, key: key1, category: 'tone', assertion: 'old a' });
    await upsertAssertion({ profileId, key: key2, category: 'tone', assertion: 'old b' });
    await upsertAssertion({ profileId, key: key3, category: 'tone', assertion: 'old c' });

    await replaceAssertions(profileId, [
      { key: 'replace_x', category: 'format', assertion: 'new x', source: 'examples' },
      { key: 'replace_y', category: 'format', assertion: 'new y', source: 'examples' },
    ]);

    const rows = await db
      .select()
      .from(profileAssertions)
      .where(eq(profileAssertions.profileId, profileId));

    const keys = rows.map((r) => r.key);
    expect(keys).not.toContain(key1);
    expect(keys).not.toContain(key2);
    expect(keys).not.toContain(key3);
    expect(keys).toContain('replace_x');
    expect(keys).toContain('replace_y');
    rows.forEach((r) => {
      expect(Number(r.confidence)).toBeCloseTo(0.5);
      expect(r.evidenceCount).toBe(1);
    });
  });

  it('replaceAssertions with empty array clears all rows for the profile', async () => {
    await upsertAssertion({ profileId, key: 'clear_me', category: 'scope', assertion: 'x' });

    await replaceAssertions(profileId, []);

    const rows = await db
      .select()
      .from(profileAssertions)
      .where(eq(profileAssertions.profileId, profileId));
    expect(rows).toHaveLength(0);
  });

  it('mergeDuplicateKey: both present → toKey gets max confidence + summed evidenceCount, fromKey deleted', async () => {
    await upsertAssertion({ profileId, key: 'merge_from', category: 'tone', assertion: 'from' });
    await upsertAssertion({ profileId, key: 'merge_to', category: 'tone', assertion: 'to' });
    await db.execute(
      sql`UPDATE profile_assertions SET confidence = 0.6, evidence_count = 2
          WHERE profile_id = ${profileId} AND key = 'merge_from'`,
    );
    await db.execute(
      sql`UPDATE profile_assertions SET confidence = 0.7, evidence_count = 4
          WHERE profile_id = ${profileId} AND key = 'merge_to'`,
    );

    const result = await mergeDuplicateKey(profileId, 'merge_from', 'merge_to');
    expect(result).not.toBeNull();
    expect(result!.key).toBe('merge_to');
    expect(result!.confidence).toBeCloseTo(0.7);
    expect(result!.evidenceCount).toBe(6);

    const fromRows = await db
      .select()
      .from(profileAssertions)
      .where(and(eq(profileAssertions.profileId, profileId), eq(profileAssertions.key, 'merge_from')));
    expect(fromRows).toHaveLength(0);
  });

  it('mergeDuplicateKey: only fromKey present → renamed to toKey', async () => {
    await upsertAssertion({ profileId, key: 'rename_from', category: 'scope', assertion: 'rename me' });

    const result = await mergeDuplicateKey(profileId, 'rename_from', 'rename_to');
    expect(result).not.toBeNull();
    expect(result!.key).toBe('rename_to');
    expect(result!.assertion).toBe('rename me');

    const fromRows = await db
      .select()
      .from(profileAssertions)
      .where(and(eq(profileAssertions.profileId, profileId), eq(profileAssertions.key, 'rename_from')));
    expect(fromRows).toHaveLength(0);
  });

  it('mergeDuplicateKey: only toKey present → no-op, returns existing toKey', async () => {
    await upsertAssertion({ profileId, key: 'noop_to', category: 'scope', assertion: 'stay put' });
    const before = await db
      .select()
      .from(profileAssertions)
      .where(and(eq(profileAssertions.profileId, profileId), eq(profileAssertions.key, 'noop_to')));

    const result = await mergeDuplicateKey(profileId, 'nonexistent_from', 'noop_to');
    expect(result).not.toBeNull();
    expect(result!.key).toBe('noop_to');
    expect(result!.id).toBe(before[0]!.id);
  });

  it('mergeDuplicateKey: neither present → returns null', async () => {
    const result = await mergeDuplicateKey(profileId, 'ghost_from', 'ghost_to');
    expect(result).toBeNull();
  });

  it('replaceAssertionsBySource replaces only the given source rows and leaves other sources untouched', async () => {
    // Clear the profile first so we start clean
    await db.delete(profileAssertions).where(eq(profileAssertions.profileId, profileId));

    // Seed two 'session' rows and one 'examples' row
    await upsertAssertion({ profileId, key: 'rbs_session_1', category: 'tone', assertion: 'session row 1', source: 'session' });
    await upsertAssertion({ profileId, key: 'rbs_session_2', category: 'tone', assertion: 'session row 2', source: 'session' });
    await upsertAssertion({ profileId, key: 'rbs_examples_old', category: 'format', assertion: 'old examples row', source: 'examples' });

    await replaceAssertionsBySource(profileId, 'examples', [
      { key: 'rbs_examples_new_1', category: 'format', assertion: 'new examples row 1' },
      { key: 'rbs_examples_new_2', category: 'format', assertion: 'new examples row 2' },
    ]);

    const allRows = await db
      .select()
      .from(profileAssertions)
      .where(eq(profileAssertions.profileId, profileId));

    // Session rows must be untouched
    const sessionRows = allRows.filter((r) => r.source === 'session');
    expect(sessionRows).toHaveLength(2);
    const sessionKeys = sessionRows.map((r) => r.key);
    expect(sessionKeys).toContain('rbs_session_1');
    expect(sessionKeys).toContain('rbs_session_2');

    // Examples source: old row gone, two new rows present
    const examplesRows = allRows.filter((r) => r.source === 'examples');
    expect(examplesRows).toHaveLength(2);
    const examplesKeys = examplesRows.map((r) => r.key);
    expect(examplesKeys).toContain('rbs_examples_new_1');
    expect(examplesKeys).toContain('rbs_examples_new_2');
    expect(examplesKeys).not.toContain('rbs_examples_old');

    // New rows have default confidence and evidenceCount
    examplesRows.forEach((r) => {
      expect(Number(r.confidence)).toBeCloseTo(0.5);
      expect(r.evidenceCount).toBe(1);
    });
  });

  it('replaceAssertionsBySource with empty array deletes all rows for that source and leaves others intact', async () => {
    // Clear the profile first so we start clean
    await db.delete(profileAssertions).where(eq(profileAssertions.profileId, profileId));

    // Seed one 'session' row and one 'examples' row
    await upsertAssertion({ profileId, key: 'rbs_empty_session', category: 'tone', assertion: 'session stays', source: 'session' });
    await upsertAssertion({ profileId, key: 'rbs_empty_examples', category: 'format', assertion: 'examples deleted', source: 'examples' });

    await replaceAssertionsBySource(profileId, 'examples', []);

    const allRows = await db
      .select()
      .from(profileAssertions)
      .where(eq(profileAssertions.profileId, profileId));

    // Session row is intact
    const sessionRows = allRows.filter((r) => r.source === 'session');
    expect(sessionRows).toHaveLength(1);
    expect(sessionRows[0]!.key).toBe('rbs_empty_session');

    // Examples rows are all gone
    const examplesRows = allRows.filter((r) => r.source === 'examples');
    expect(examplesRows).toHaveLength(0);
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

  it('deleteAssertionsBySource removes only matching-source rows for the given profile', async () => {
    await db.delete(profileAssertions).where(eq(profileAssertions.profileId, profileId));

    const [otherProfile] = await db
      .insert(profiles)
      .values({
        userId,
        name: 'Other Profile (delete-by-source)',
        format: 'blog',
        style: 'casual',
        audience: 'general',
        targetVolumeMin: 300,
        targetVolumeMax: 700,
      })
      .returning({ id: profiles.id });

    await upsertAssertion({
      profileId,
      key: 'session_a',
      category: 'tone',
      assertion: 'session a',
      source: 'session',
    });
    await upsertAssertion({
      profileId,
      key: 'session_b',
      category: 'tone',
      assertion: 'session b',
      source: 'session',
    });
    await upsertAssertion({
      profileId,
      key: 'examples_keep',
      category: 'tone',
      assertion: 'examples kept',
      source: 'examples',
    });
    await upsertAssertion({
      profileId: otherProfile.id,
      key: 'session_other',
      category: 'tone',
      assertion: 'other profile session',
      source: 'session',
    });

    const deleted = await deleteAssertionsBySource(profileId, 'session');
    expect(deleted).toBe(2);

    const remaining = await db
      .select()
      .from(profileAssertions)
      .where(eq(profileAssertions.profileId, profileId));
    expect(remaining.map((r) => r.key)).toEqual(['examples_keep']);

    const otherRemaining = await db
      .select()
      .from(profileAssertions)
      .where(eq(profileAssertions.profileId, otherProfile.id));
    expect(otherRemaining.map((r) => r.key)).toEqual(['session_other']);

    await db.delete(profiles).where(eq(profiles.id, otherProfile.id));
  });
});

describe.skipIf(runIntegration)('profile-assertions-repo (DB unavailable — skipped)', () => {
  it('skips because DATABASE_URL is not set', () => {
    expect(true).toBe(true);
  });
});

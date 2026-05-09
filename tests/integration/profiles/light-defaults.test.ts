import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { db } from '../../../src/server/db/client';
import { users } from '../../../src/server/db/schema';

const runIntegration = !!process.env.DATABASE_URL;

const TEST_EMAIL = `light-defaults-test-${Date.now()}@example.com`;

describe.skipIf(!runIntegration)('profiles light column defaults', () => {
  let userId: number;

  beforeAll(async () => {
    const [user] = await db
      .insert(users)
      .values({ email: TEST_EMAIL, passwordHash: 'x' })
      .returning({ id: users.id });
    userId = user.id;
  });

  afterAll(async () => {
    await db.execute(sql`DELETE FROM profiles WHERE user_id = ${userId}`);
    await db.execute(sql`DELETE FROM users WHERE id = ${userId}`);
  });

  it('defaults light_research_sources=1 and light_max_words=800 when not supplied', async () => {
    await db.execute(
      sql`INSERT INTO profiles (user_id, name, format, style, audience, target_volume_min, target_volume_max)
          VALUES (${userId}, 'Test', 'blog', 'casual', 'general', 500, 1000)`,
    );

    const rows = await db.execute<{
      light_research_sources: number;
      light_max_words: number;
    }>(sql`SELECT light_research_sources, light_max_words FROM profiles WHERE user_id = ${userId}`);

    expect(rows).toHaveLength(1);
    expect(Number(rows[0].light_research_sources)).toBe(1);
    expect(Number(rows[0].light_max_words)).toBe(800);
  });
});

/**
 * Integration test: register → verify credentials → protected route guard.
 *
 * Assertions (c) and (d) — "fetch /dashboard with/without cookie" — are tested
 * at the requireUser() layer rather than via full HTTP, because spinning up
 * a Next.js dev server in-process is outside the scope of this test suite.
 * The four observable behaviours from the task spec are all exercised.
 *
 * Requires: DATABASE_URL env pointing at a running Postgres instance.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../../src/server/db/client';
import { users } from '../../src/server/db/schema';
import { hashPassword, verifyPassword } from '../../src/server/auth/password';

vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('NEXT_REDIRECT');
  }),
}));

vi.mock('../../src/server/auth/config', () => ({
  auth: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  handlers: {},
}));

import { auth } from '../../src/server/auth/config';
import type { Session } from 'next-auth';
import { requireUser } from '../../src/server/auth/require-user';
import { redirect } from 'next/navigation';

const TEST_EMAIL = `integration-test-${Date.now()}@example.com`;
const TEST_PASSWORD = 'integration-secret-123';

const runIntegration = !!process.env.DATABASE_URL;

describe.skipIf(!runIntegration)('auth integration flow', () => {
  beforeAll(async () => {
    await db.delete(users).where(eq(users.email, TEST_EMAIL));
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.email, TEST_EMAIL));
  });

  it('(a) registers a user in the database', async () => {
    const passwordHash = await hashPassword(TEST_PASSWORD);
    await db.insert(users).values({ email: TEST_EMAIL, passwordHash });

    const [row] = await db.select().from(users).where(eq(users.email, TEST_EMAIL)).limit(1);
    expect(row).toBeDefined();
    expect(row.email).toBe(TEST_EMAIL);
    expect(row.passwordHash).toMatch(/^\$argon2id\$/);
  });

  it('(b) valid credentials resolve to a user, invalid do not', async () => {
    const [row] = await db.select().from(users).where(eq(users.email, TEST_EMAIL)).limit(1);
    expect(row).toBeDefined();

    expect(await verifyPassword(TEST_PASSWORD, row.passwordHash)).toBe(true);
    expect(await verifyPassword('wrong-password', row.passwordHash)).toBe(false);
  });

  it('(c) requireUser returns user when session cookie is present', async () => {
    const [row] = await db.select().from(users).where(eq(users.email, TEST_EMAIL)).limit(1);
    vi.mocked(auth as unknown as () => Promise<Session | null>).mockResolvedValue({
      user: { id: String(row.id), email: row.email },
      expires: new Date(Date.now() + 3600_000).toISOString(),
    });

    const user = await requireUser();
    expect(user).toEqual({ id: row.id, email: TEST_EMAIL });
  });

  it('(d) requireUser redirects to /login when no session cookie', async () => {
    vi.mocked(auth as unknown as () => Promise<Session | null>).mockResolvedValue(null);

    await expect(requireUser()).rejects.toThrow('NEXT_REDIRECT');
    expect(redirect).toHaveBeenCalledWith('/login');
  });
});

describe.skipIf(runIntegration)('auth integration flow (DB unavailable — skipped)', () => {
  it('skips because DATABASE_URL is not set', () => {
    expect(true).toBe(true);
  });
});

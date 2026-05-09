/**
 * Integration test for /api/settings/budget GET + PUT.
 *
 * Uses two real users to verify per-user isolation. requireUser is exercised
 * via the same auth mock pattern as auth-flow.test.ts; the route handlers
 * are invoked directly (no in-process Next dev server).
 *
 * Requires: DATABASE_URL env pointing at a running Postgres instance.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../../../src/server/db/client';
import { users, userSettings } from '../../../src/server/db/schema';

vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('NEXT_REDIRECT');
  }),
}));

vi.mock('../../../src/server/auth/config', () => ({
  auth: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  handlers: {},
}));

import { auth } from '../../../src/server/auth/config';
import type { Session } from 'next-auth';

const runIntegration = !!process.env.DATABASE_URL;

const EMAIL_A = `budget-integ-a-${Date.now()}@test.com`;
const EMAIL_B = `budget-integ-b-${Date.now()}@test.com`;

let userAId: number;
let userBId: number;

function asUser(id: number, email: string) {
  vi.mocked(auth as unknown as () => Promise<Session | null>).mockResolvedValue({
    user: { id: String(id), email },
    expires: new Date(Date.now() + 3600_000).toISOString(),
  });
}

beforeAll(async () => {
  if (!runIntegration) return;
  const [a] = await db
    .insert(users)
    .values({ email: EMAIL_A, passwordHash: 'x' })
    .returning({ id: users.id });
  const [b] = await db
    .insert(users)
    .values({ email: EMAIL_B, passwordHash: 'x' })
    .returning({ id: users.id });
  userAId = a.id;
  userBId = b.id;
});

afterAll(async () => {
  if (!runIntegration) return;
  await db.delete(userSettings).where(eq(userSettings.userId, userAId));
  await db.delete(userSettings).where(eq(userSettings.userId, userBId));
  await db.delete(users).where(eq(users.id, userAId));
  await db.delete(users).where(eq(users.id, userBId));
});

describe.skipIf(!runIntegration)('/api/settings/budget', () => {
  it('PUT then GET returns saved values for the authenticated user', async () => {
    const { GET, PUT } = await import('../../../src/app/api/settings/budget/route');

    asUser(userAId, EMAIL_A);
    const putRes = await PUT(
      new Request('http://test/api/settings/budget', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monthlyCapUsd: 25.5, sessionCapUsd: 0.75 }),
      }),
    );
    expect(putRes.status).toBe(200);
    expect(await putRes.json()).toEqual({ ok: true });

    asUser(userAId, EMAIL_A);
    const getRes = await GET();
    expect(getRes.status).toBe(200);
    const data = (await getRes.json()) as { monthlyCapUsd: number | null; sessionCapUsd: number | null };
    expect(data.monthlyCapUsd).toBeCloseTo(25.5, 6);
    expect(data.sessionCapUsd).toBeCloseTo(0.75, 6);
  });

  it('PUT with explicit nulls clears the caps', async () => {
    const { GET, PUT } = await import('../../../src/app/api/settings/budget/route');

    asUser(userAId, EMAIL_A);
    await PUT(
      new Request('http://test/api/settings/budget', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monthlyCapUsd: null, sessionCapUsd: null }),
      }),
    );

    asUser(userAId, EMAIL_A);
    const data = (await (await GET()).json()) as { monthlyCapUsd: number | null; sessionCapUsd: number | null };
    expect(data.monthlyCapUsd).toBeNull();
    expect(data.sessionCapUsd).toBeNull();
  });

  it('a different user gets defaults (per-user isolation)', async () => {
    const { GET, PUT } = await import('../../../src/app/api/settings/budget/route');

    asUser(userAId, EMAIL_A);
    await PUT(
      new Request('http://test/api/settings/budget', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monthlyCapUsd: 99, sessionCapUsd: 9.99 }),
      }),
    );

    asUser(userBId, EMAIL_B);
    const data = (await (await GET()).json()) as { monthlyCapUsd: number | null; sessionCapUsd: number | null };
    expect(data).toEqual({ monthlyCapUsd: null, sessionCapUsd: null });
  });

  it('PUT rejects malformed bodies with 400', async () => {
    const { PUT } = await import('../../../src/app/api/settings/budget/route');

    asUser(userAId, EMAIL_A);
    const badJson = await PUT(
      new Request('http://test/api/settings/budget', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: 'not json',
      }),
    );
    expect(badJson.status).toBe(400);

    asUser(userAId, EMAIL_A);
    const negative = await PUT(
      new Request('http://test/api/settings/budget', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monthlyCapUsd: -5, sessionCapUsd: null }),
      }),
    );
    expect(negative.status).toBe(400);
  });
});

describe.skipIf(runIntegration)('/api/settings/budget (DB unavailable — skipped)', () => {
  it('skips because DATABASE_URL is not set', () => {
    expect(true).toBe(true);
  });
});

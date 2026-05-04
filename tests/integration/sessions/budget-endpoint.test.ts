/**
 * Integration test for GET /api/sessions/:id/budget.
 *
 * Verifies aggregated session/user spend, cap pass-through from user_settings,
 * and per-user isolation (cross-user request returns 404).
 *
 * Requires: DATABASE_URL env pointing at a running Postgres instance.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../../../src/server/db/client';
import { profiles, runs, sessions, users, userSettings } from '../../../src/server/db/schema';

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

const EMAIL_A = `budget-endpoint-a-${Date.now()}@test.com`;
const EMAIL_B = `budget-endpoint-b-${Date.now()}@test.com`;

let userAId: number;
let userBId: number;
let profileAId: number;
let sessionAId: number;

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

  const [profile] = await db
    .insert(profiles)
    .values({
      userId: userAId,
      name: 'budget-test',
      format: 'long_read',
      style: 'plain',
      audience: 'general',
      targetVolumeMin: 100,
      targetVolumeMax: 200,
    })
    .returning({ id: profiles.id });
  profileAId = profile.id;

  const [session] = await db
    .insert(sessions)
    .values({ userId: userAId, profileId: profileAId, mode: 'new' })
    .returning({ id: sessions.id });
  sessionAId = session.id;

  await db.insert(userSettings).values({
    userId: userAId,
    monthlyCapUsd: '5.000000',
    sessionCapUsd: '1.500000',
  });

  await db.insert(runs).values([
    {
      sessionId: sessionAId,
      userId: userAId,
      stage: 'test',
      task: 't1',
      modelClass: 'smart',
      modelName: 'm',
      promptTokens: 0,
      completionTokens: 0,
      costUsd: '0.250000',
      latencyMs: 0,
    },
    {
      sessionId: sessionAId,
      userId: userAId,
      stage: 'test',
      task: 't2',
      modelClass: 'smart',
      modelName: 'm',
      promptTokens: 0,
      completionTokens: 0,
      costUsd: '0.500000',
      latencyMs: 0,
    },
    {
      sessionId: null,
      userId: userAId,
      stage: 'orphan',
      task: 't3',
      modelClass: 'smart',
      modelName: 'm',
      promptTokens: 0,
      completionTokens: 0,
      costUsd: '0.100000',
      latencyMs: 0,
    },
  ]);
});

afterAll(async () => {
  if (!runIntegration) return;
  await db.delete(runs).where(eq(runs.userId, userAId));
  await db.delete(userSettings).where(eq(userSettings.userId, userAId));
  await db.delete(sessions).where(eq(sessions.userId, userAId));
  await db.delete(profiles).where(eq(profiles.userId, userAId));
  await db.delete(users).where(eq(users.id, userAId));
  await db.delete(users).where(eq(users.id, userBId));
});

describe.skipIf(!runIntegration)('GET /api/sessions/:id/budget', () => {
  it('returns session spend, user spend, and both caps for the owner', async () => {
    const { GET } = await import('../../../src/app/api/sessions/[id]/budget/route');

    asUser(userAId, EMAIL_A);
    const res = await GET(new Request(`http://test/api/sessions/${sessionAId}/budget`), {
      params: Promise.resolve({ id: String(sessionAId) }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      sessionSpent: number;
      sessionCap: number | null;
      userSpent: number;
      userCap: number | null;
    };

    expect(data.sessionSpent).toBeCloseTo(0.75, 6);
    expect(data.userSpent).toBeCloseTo(0.85, 6);
    expect(data.sessionCap).toBeCloseTo(1.5, 6);
    expect(data.userCap).toBeCloseTo(5, 6);
  });

  it('returns 404 when a different user requests the same session', async () => {
    const { GET } = await import('../../../src/app/api/sessions/[id]/budget/route');

    asUser(userBId, EMAIL_B);
    const res = await GET(new Request(`http://test/api/sessions/${sessionAId}/budget`), {
      params: Promise.resolve({ id: String(sessionAId) }),
    });

    expect(res.status).toBe(404);
  });

  it('returns 404 for a non-existent session id', async () => {
    const { GET } = await import('../../../src/app/api/sessions/[id]/budget/route');

    asUser(userAId, EMAIL_A);
    const res = await GET(new Request('http://test/api/sessions/999999/budget'), {
      params: Promise.resolve({ id: '999999' }),
    });

    expect(res.status).toBe(404);
  });
});

describe.skipIf(runIntegration)('GET /api/sessions/:id/budget (DB unavailable — skipped)', () => {
  it('skips because DATABASE_URL is not set', () => {
    expect(true).toBe(true);
  });
});

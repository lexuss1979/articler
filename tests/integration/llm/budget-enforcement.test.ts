/**
 * End-to-end integration test for the budget-enforcement chain.
 *
 * Wires together a real DB, a real assertBudget guard, real JSONL logging,
 * and the real event bus. Only the OpenRouter HTTP layer is mocked — and
 * the test asserts that mock is *never* invoked because the pre-call guard
 * short-circuits.
 *
 * Acceptance ground truth: this test must fail if assertBudget is
 * commented out of wrapWithLogging.
 *
 * Requires: DATABASE_URL env pointing at a running Postgres instance.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { eq } from 'drizzle-orm';
import { db } from '../../../src/server/db/client';
import { events, profiles, runs, sessions, users, userSettings } from '../../../src/server/db/schema';

const openrouterMock = vi.hoisted(() => ({ chat: vi.fn() }));

vi.mock('../../../src/server/llm/openrouter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/server/llm/openrouter')>();
  return {
    ...actual,
    openrouterChat: openrouterMock.chat,
  };
});

const runIntegration = !!process.env.DATABASE_URL;

const EMAIL = `budget-enforce-${Date.now()}@test.com`;

let userId: number;
let profileId: number;
let sessionId: number;
let tmpDir: string;

beforeAll(async () => {
  if (!runIntegration) return;

  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'budget-enforce-'));

  const [user] = await db
    .insert(users)
    .values({ email: EMAIL, passwordHash: 'x' })
    .returning({ id: users.id });
  userId = user.id;

  const [profile] = await db
    .insert(profiles)
    .values({
      userId,
      name: 'enforce-test',
      format: 'long_read',
      style: 'plain',
      audience: 'general',
      targetVolumeMin: 100,
      targetVolumeMax: 200,
    })
    .returning({ id: profiles.id });
  profileId = profile.id;

  const [session] = await db
    .insert(sessions)
    .values({ userId, profileId, mode: 'new' })
    .returning({ id: sessions.id });
  sessionId = session.id;

  await db.insert(userSettings).values({
    userId,
    monthlyCapUsd: null,
    sessionCapUsd: '0.001000',
  });

  await db.insert(runs).values({
    sessionId,
    userId,
    stage: 'fixture',
    task: 'prior',
    modelClass: 'smart',
    modelName: 'm',
    promptTokens: 0,
    completionTokens: 0,
    costUsd: '0.002000',
    latencyMs: 0,
  });
});

afterAll(async () => {
  if (!runIntegration) return;
  await db.delete(events).where(eq(events.sessionId, sessionId));
  await db.delete(runs).where(eq(runs.userId, userId));
  await db.delete(userSettings).where(eq(userSettings.userId, userId));
  await db.delete(sessions).where(eq(sessions.userId, userId));
  await db.delete(profiles).where(eq(profiles.userId, userId));
  await db.delete(users).where(eq(users.id, userId));
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe.skipIf(!runIntegration)('budget enforcement end-to-end', () => {
  it('blocks before reaching OpenRouter, writes budget_blocked JSONL line, and emits budget_blocked event', async () => {
    const { routeChat } = await import('../../../src/server/llm/router');
    const { wrapWithLogging } = await import('../../../src/server/logging/wrap');
    const { BudgetExceededError } = await import('../../../src/server/llm/budget-guard');

    openrouterMock.chat.mockReset();

    await expect(
      wrapWithLogging({
        stage: 'draft_section',
        task: 'sec-1',
        userId,
        sessionId,
        baseDir: tmpDir,
        call: () => routeChat({ messages: [{ role: 'user', content: 'hi' }], class: 'fast' }),
        request: { messages: [{ role: 'user', content: 'hi' }] },
      }),
    ).rejects.toBeInstanceOf(BudgetExceededError);

    expect(openrouterMock.chat).not.toHaveBeenCalled();

    const eventRows = await db
      .select()
      .from(events)
      .where(eq(events.sessionId, sessionId));
    const blockedEvents = eventRows.filter((e) => e.kind === 'budget_blocked');
    expect(blockedEvents).toHaveLength(1);
    const payload = blockedEvents[0]!.payload as { scope: string; spent: number; cap: number };
    expect(payload.scope).toBe('session');
    expect(payload.spent).toBeCloseTo(0.002, 6);
    expect(payload.cap).toBeCloseTo(0.001, 6);

    const today = new Date().toISOString().slice(0, 10);
    const jsonlPath = path.join(tmpDir, `${today}.jsonl`);
    const raw = await fs.readFile(jsonlPath, 'utf8');
    const lines = raw.trimEnd().split('\n').filter(Boolean);
    const blockedLines = lines
      .map((l) => JSON.parse(l) as Record<string, unknown>)
      .filter((entry) => entry.error_kind === 'budget_blocked');
    expect(blockedLines).toHaveLength(1);
    const blockedLine = blockedLines[0]!;
    expect(blockedLine).toMatchObject({
      stage: 'draft_section',
      task: 'sec-1',
      user_id: userId,
      session_id: sessionId,
      error: true,
      error_kind: 'budget_blocked',
      scope: 'session',
    });
    expect(blockedLine).not.toHaveProperty('response');

    const runsRows = await db
      .select()
      .from(runs)
      .where(eq(runs.task, 'sec-1'));
    expect(runsRows).toHaveLength(0);
  });
});

describe.skipIf(runIntegration)('budget enforcement (DB unavailable — skipped)', () => {
  it('skips because DATABASE_URL is not set', () => {
    expect(true).toBe(true);
  });
});

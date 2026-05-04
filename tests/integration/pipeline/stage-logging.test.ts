/**
 * End-to-end test that proves a stage call writes a runs row.
 *
 * This is the test that would have caught the original bug (Epic 19's
 * raison d'être): wrapWithLogging was integration-tested in isolation
 * and stages were unit-tested in isolation, but nothing exercised the
 * combined path. Here we run a real stage (clarifyBrief) through real
 * router → real maybeWrap → real wrapWithLogging → real DB insert,
 * with only the OpenRouter HTTP call mocked.
 *
 * Requires: DATABASE_URL env pointing at a running Postgres instance.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../../../src/server/db/client';
import { profiles, runs, sessions, users } from '../../../src/server/db/schema';

const openrouterMock = vi.hoisted(() => ({ chat: vi.fn() }));

vi.mock('../../../src/server/llm/openrouter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/server/llm/openrouter')>();
  return {
    ...actual,
    openrouterChat: openrouterMock.chat,
  };
});

const runIntegration = !!process.env.DATABASE_URL;
const EMAIL = `stage-logging-${Date.now()}@test.com`;

let userId: number;
let profileId: number;
let sessionId: number;

beforeAll(async () => {
  if (!runIntegration) return;
  const [user] = await db
    .insert(users)
    .values({ email: EMAIL, passwordHash: 'x' })
    .returning({ id: users.id });
  userId = user.id;

  const [profile] = await db
    .insert(profiles)
    .values({
      userId,
      name: 'p',
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
});

afterAll(async () => {
  if (!runIntegration) return;
  await db.delete(runs).where(eq(runs.userId, userId));
  await db.delete(sessions).where(eq(sessions.userId, userId));
  await db.delete(profiles).where(eq(profiles.userId, userId));
  await db.delete(users).where(eq(users.id, userId));
});

describe.skipIf(!runIntegration)('stage call → runs row (LLMContext + maybeWrap + wrapWithLogging)', () => {
  it('lands one runs row with userId, stage name, and model_class when clarifyBrief runs inside a context', async () => {
    openrouterMock.chat.mockReset();
    openrouterMock.chat.mockResolvedValue({
      id: 'chat-fake',
      model: 'anthropic/claude-opus-4.7',
      choices: [
        {
          message: {
            role: 'assistant',
            content: JSON.stringify({ questions: [] }),
          },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 50,
        completion_tokens: 20,
        cost: 0.0042,
      },
    });

    const { clarifyBrief } = await import('../../../src/server/pipeline/stages/clarify-brief');
    const { runWithLLMContext } = await import('../../../src/server/llm/context');

    const fakeProfile = {
      id: profileId,
      userId,
      name: 'p',
      format: 'long_read',
      style: 'plain',
      audience: 'general',
      targetVolumeMin: 100,
      targetVolumeMax: 200,
      markupRules: {},
      extraPrompt: '',
      createdAt: new Date(),
    };
    const fakeBrief = { topic: 'x', goal: 'y', notes: '', sourceArticles: [] };
    const fakeCtx = {
      emit: async () => undefined as never,
      userInput: async () => undefined as never,
      log: { append: async () => undefined },
      llm: {
        routeChat: async () => undefined as never,
        routeSearch: async () => undefined as never,
        routeImage: async () => undefined as never,
      },
    };

    await runWithLLMContext(
      {
        userId,
        sessionId,
        stage: clarifyBrief.name,
        task: clarifyBrief.name,
      },
      () => clarifyBrief.run({ brief: fakeBrief, profile: fakeProfile }, fakeCtx as never),
    );

    expect(openrouterMock.chat).toHaveBeenCalled();

    const rows = await db.select().from(runs).where(eq(runs.userId, userId));
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.userId).toBe(userId);
    expect(row.sessionId).toBe(sessionId);
    expect(row.stage).toBe('clarify_brief');
    expect(row.task).toBe('clarify_brief');
    expect(row.modelClass).toBe('smart');
    expect(parseFloat(row.costUsd)).toBeCloseTo(0.0042, 6);
  });
});

describe.skipIf(runIntegration)('stage logging (DB unavailable — skipped)', () => {
  it('skips because DATABASE_URL is not set', () => {
    expect(true).toBe(true);
  });
});

/**
 * Integration test: wrapWithLogging → JSONL file → runs row → getUserCost.
 *
 * Requires: DATABASE_URL env pointing at a running Postgres instance.
 * Uses a temp directory for JSONL output and a real user row for FK.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { eq } from 'drizzle-orm';
import { db } from '../../src/server/db/client';
import { runs, users } from '../../src/server/db/schema';

vi.mock('../../src/server/llm/openrouter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/server/llm/openrouter')>();
  return {
    ...actual,
    openrouterChat: vi.fn().mockResolvedValue({
      id: 'test-id',
      model: 'anthropic/claude-haiku-4.5',
      choices: [{ message: { role: 'assistant', content: 'response' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 100, completion_tokens: 50 },
    }),
  };
});

let tmpDir: string;
let testUserId: number;

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'llm-integ-'));
  const [user] = await db
    .insert(users)
    .values({ email: `integ-llm-${Date.now()}@test.com`, passwordHash: 'x' })
    .returning({ id: users.id });
  testUserId = user.id;
});

afterAll(async () => {
  await db.delete(runs).where(eq(runs.userId, testUserId));
  await db.delete(users).where(eq(users.id, testUserId));
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('wrapWithLogging integration', () => {
  it('records JSONL line, runs row, and cost aggregation consistently', async () => {
    const { routeChat } = await import('../../src/server/llm/router');
    const { wrapWithLogging } = await import('../../src/server/logging/wrap');
    const { getUserCost } = await import('../../src/server/logging/aggregate');

    const result = await wrapWithLogging({
      stage: 'test',
      task: 'integ-1',
      userId: testUserId,
      call: () => routeChat({ messages: [{ role: 'user', content: 'hi' }], class: 'fast' }),
      request: { messages: [{ role: 'user', content: 'hi' }] },
    });

    // (a) JSONL file contains the line with matching fields
    const jsonlPath = result.runId
      ? path.join(tmpDir, path.basename(result.runId.toString()))
      : null;
    // wrapWithLogging uses process.cwd() by default — read the actual file from payload_path
    const [dbRow] = await db
      .select()
      .from(runs)
      .where(eq(runs.task, 'integ-1'));

    expect(dbRow).toBeDefined();
    expect(dbRow.stage).toBe('test');
    expect(dbRow.task).toBe('integ-1');
    expect(dbRow.userId).toBe(testUserId);
    expect(dbRow.payloadPath).toBeTruthy();

    const raw = await fs.readFile(dbRow.payloadPath!, 'utf8');
    const jsonlLines = raw.trimEnd().split('\n').filter(Boolean);
    const lastLine = JSON.parse(jsonlLines[jsonlLines.length - 1]) as Record<string, unknown>;
    expect(lastLine.stage).toBe('test');
    expect(lastLine.task).toBe('integ-1');
    expect(lastLine.model).toBe('anthropic/claude-haiku-4.5');
    expect(typeof lastLine.cost_usd).toBe('number');

    // (b) runs row cost matches JSONL line cost
    expect(parseFloat(dbRow.costUsd)).toBeCloseTo(lastLine.cost_usd as number, 6);

    // (c) getUserCost returns a non-zero number matching the row
    const userCost = await getUserCost(testUserId);
    expect(userCost).toBeGreaterThan(0);
    expect(userCost).toBeCloseTo(parseFloat(dbRow.costUsd), 6);
  });
});

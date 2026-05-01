import { db } from '../db/client';
import { runs } from '../db/schema';
import { costFor, IMAGE_PRICES } from '../llm/pricing';
import { appendRunLog } from './jsonl';
import type { RouterResult } from '../llm/router';

export async function wrapWithLogging<T extends RouterResult>(args: {
  stage: string;
  task: string;
  sessionId?: number;
  userId?: number;
  call: () => Promise<T>;
  request: unknown;
}): Promise<T & { runId: number }> {
  const { stage, task, sessionId, userId, call, request } = args;
  const ts = new Date();

  let result: T;
  try {
    result = await call();
  } catch (err) {
    await appendRunLog({
      ts: ts.toISOString(),
      user_id: userId,
      session_id: sessionId,
      stage,
      task,
      error: true,
      error_message: err instanceof Error ? err.message : String(err),
      request,
    }).catch(() => undefined);
    throw err;
  }

  const costUsd =
    result.modelClass === 'image'
      ? (IMAGE_PRICES[result.modelUsed]?.perImage ?? 0)
      : costFor(result.modelUsed, result.promptTokens, result.completionTokens);

  const { path: payloadPath } = await appendRunLog({
    ts: ts.toISOString(),
    user_id: userId,
    session_id: sessionId,
    stage,
    task,
    model_class: result.modelClass,
    model: result.modelUsed,
    prompt_tokens: result.promptTokens,
    completion_tokens: result.completionTokens,
    cost_usd: costUsd,
    latency_ms: result.latencyMs,
    request,
    response: result,
  });

  const [row] = await db
    .insert(runs)
    .values({
      sessionId: sessionId ?? null,
      userId: userId ?? null,
      stage,
      task,
      modelClass: result.modelClass,
      modelName: result.modelUsed,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      costUsd: String(costUsd),
      latencyMs: result.latencyMs,
      ts,
      payloadPath,
    })
    .returning({ id: runs.id });

  return { ...result, runId: row.id };
}

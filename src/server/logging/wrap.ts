import { db } from '../db/client';
import { runs } from '../db/schema';
import { emitEvent } from '../events/bus';
import { assertBudget, BudgetExceededError } from '../llm/budget-guard';
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
  baseDir?: string;
}): Promise<T & { runId: number }> {
  const { stage, task, sessionId, userId, call, request, baseDir } = args;
  const ts = new Date();

  try {
    await assertBudget({ userId, sessionId });
  } catch (err) {
    if (err instanceof BudgetExceededError) {
      await appendRunLog(
        {
          ts: ts.toISOString(),
          user_id: userId,
          session_id: sessionId,
          stage,
          task,
          error: true,
          error_kind: 'budget_blocked',
          scope: err.scope,
          spent: err.spent,
          cap: err.cap,
          request,
        },
        { baseDir },
      ).catch(() => undefined);
      if (sessionId != null) {
        await emitEvent(sessionId, 'budget_blocked', {
          scope: err.scope,
          spent: err.spent,
          cap: err.cap,
        }).catch(() => undefined);
      }
    }
    throw err;
  }

  let result: T;
  try {
    result = await call();
  } catch (err) {
    await appendRunLog(
      {
        ts: ts.toISOString(),
        user_id: userId,
        session_id: sessionId,
        stage,
        task,
        error: true,
        error_message: err instanceof Error ? err.message : String(err),
        request,
      },
      { baseDir },
    ).catch(() => undefined);
    throw err;
  }

  const costUsd =
    result.cost ??
    (result.modelClass === 'image'
      ? (IMAGE_PRICES[result.modelUsed]?.perImage ?? 0)
      : costFor(result.modelUsed, result.promptTokens, result.completionTokens));

  const { path: payloadPath } = await appendRunLog(
    {
      ts: ts.toISOString(),
      user_id: userId,
      session_id: sessionId,
      stage,
      task,
      model_class: result.modelClass,
      model: result.modelUsed,
      prompt_tokens: result.promptTokens,
      completion_tokens: result.completionTokens,
      prompt_tokens_details:
        result.cachedTokens != null || result.cacheWriteTokens != null
          ? { cached_tokens: result.cachedTokens, cache_write_tokens: result.cacheWriteTokens }
          : undefined,
      completion_tokens_details:
        result.reasoningTokens != null
          ? { reasoning_tokens: result.reasoningTokens }
          : undefined,
      cost_usd: costUsd,
      latency_ms: result.latencyMs,
      request,
      response: result,
    },
    { baseDir },
  );

  let runId = -1;
  try {
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
        cachedTokens: result.cachedTokens ?? null,
        reasoningTokens: result.reasoningTokens ?? null,
        costUsd: String(costUsd),
        latencyMs: result.latencyMs,
        ts,
        payloadPath,
      })
      .returning({ id: runs.id });
    runId = row.id;
  } catch (err) {
    await appendRunLog(
      {
        ts: ts.toISOString(),
        user_id: userId,
        session_id: sessionId,
        stage,
        task,
        error: true,
        error_kind: 'runs_insert_failed',
        error_message: err instanceof Error ? err.message : String(err),
        cost_usd: costUsd,
      },
      { baseDir },
    ).catch(() => undefined);
  }

  if (sessionId != null) {
    await emitEvent(sessionId, 'cost_updated', { delta: costUsd }).catch(() => undefined);
  }

  return { ...result, runId };
}

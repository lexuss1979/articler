import { describe, expect, it } from 'vitest';
import { withStageCtx } from '../../../src/server/pipeline/with-stage-ctx';
import { getLLMContext } from '../../../src/server/llm/context';

describe('withStageCtx', () => {
  it('runs fn inside an LLMContext built from {stage.name, sessionId, userId}', async () => {
    const captured = await withStageCtx({ name: 'extract_claims' }, 42, 7, async () =>
      getLLMContext(),
    );
    expect(captured).toEqual({
      userId: 7,
      sessionId: 42,
      stage: 'extract_claims',
      task: 'extract_claims',
    });
  });

  it('returns the value from fn', async () => {
    const result = await withStageCtx({ name: 's' }, 1, 1, async () => 'payload' as const);
    expect(result).toBe('payload');
  });

  it('does not leak ctx after fn resolves', async () => {
    await withStageCtx({ name: 's' }, 1, 1, async () => undefined);
    expect(getLLMContext()).toBeUndefined();
  });
});

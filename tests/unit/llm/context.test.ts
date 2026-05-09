import { describe, expect, it } from 'vitest';
import { getLLMContext, runWithLLMContext, type LLMContext } from '../../../src/server/llm/context';

const BASE: LLMContext = { userId: 1, sessionId: 2, stage: 'outer', task: 'outer-task' };

describe('LLM context (AsyncLocalStorage)', () => {
  it('returns undefined outside any runWithLLMContext block', () => {
    expect(getLLMContext()).toBeUndefined();
  });

  it('exposes the context inside runWithLLMContext', async () => {
    const ctx = await runWithLLMContext(BASE, async () => getLLMContext());
    expect(ctx).toBe(BASE);
  });

  it('survives an await boundary inside the wrapped fn', async () => {
    const ctx = await runWithLLMContext(BASE, async () => {
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 1));
      return getLLMContext();
    });
    expect(ctx).toEqual(BASE);
  });

  it('nests: inner ctx visible inside, outer restored on exit', async () => {
    const inner: LLMContext = { ...BASE, stage: 'inner', task: 'inner-task' };
    let seenInner: LLMContext | undefined;
    let seenAfter: LLMContext | undefined;

    await runWithLLMContext(BASE, async () => {
      await runWithLLMContext(inner, async () => {
        seenInner = getLLMContext();
      });
      seenAfter = getLLMContext();
    });

    expect(seenInner).toBe(inner);
    expect(seenAfter).toBe(BASE);
    expect(getLLMContext()).toBeUndefined();
  });

  it('does not leak ctx into a sibling async chain that started before runWithLLMContext', async () => {
    let seenInSibling: LLMContext | undefined = undefined;
    const sibling = (async () => {
      await new Promise((r) => setTimeout(r, 5));
      seenInSibling = getLLMContext();
    })();

    await runWithLLMContext(BASE, async () => {
      await new Promise((r) => setTimeout(r, 1));
    });

    await sibling;
    expect(seenInSibling).toBeUndefined();
  });
});

import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { hello } from '../../../src/server/pipeline/stages/hello';
import type { StageCtx } from '../../../src/server/pipeline/stage';

function makeCtx(overrides: Partial<StageCtx> = {}): StageCtx {
  return {
    emit: vi.fn().mockResolvedValue({}),
    userInput: vi.fn().mockResolvedValue({ text: 'world' }),
    log: { append: vi.fn().mockResolvedValue(undefined) },
    llm: {
      routeChat: vi.fn(),
      routeSearch: vi.fn(),
      routeImage: vi.fn(),
    },
    ...overrides,
  };
}

describe('hello stage', () => {
  it('emits agent_message, calls userInput, emits task_completed in order', async () => {
    const ctx = makeCtx();
    const emitOrder: string[] = [];
    (ctx.emit as ReturnType<typeof vi.fn>).mockImplementation(async (kind: string) => {
      emitOrder.push(kind);
      return {};
    });

    await hello.run({}, ctx);

    expect(emitOrder).toEqual(['agent_message', 'task_completed']);
    expect(ctx.userInput).toHaveBeenCalledOnce();
    expect(ctx.userInput).toHaveBeenCalledWith('reply', expect.any(z.ZodObject));
  });

  it('emits agent_message with the correct greeting text', async () => {
    const ctx = makeCtx();
    await hello.run({}, ctx);

    const emitCalls = (ctx.emit as ReturnType<typeof vi.fn>).mock.calls as [string, unknown][];
    const agentMsg = emitCalls.find(([kind]) => kind === 'agent_message');
    expect(agentMsg?.[1]).toMatchObject({ text: 'Hi! Type anything to continue.' });
  });

  it('emits task_completed with the received user reply', async () => {
    const ctx = makeCtx();
    await hello.run({}, ctx);

    const emitCalls = (ctx.emit as ReturnType<typeof vi.fn>).mock.calls as [string, unknown][];
    const completed = emitCalls.find(([kind]) => kind === 'task_completed');
    expect(completed?.[1]).toMatchObject({ text: 'world' });
  });

  it('returns { greeted: true }', async () => {
    const ctx = makeCtx();
    const result = await hello.run({}, ctx);
    expect(result).toEqual({ greeted: true });
  });

  it('has name "hello" and modelClass "fast"', () => {
    expect(hello.name).toBe('hello');
    expect(hello.modelClass).toBe('fast');
  });
});

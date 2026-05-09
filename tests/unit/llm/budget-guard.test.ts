import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUserSettings: vi.fn(),
  getUserCost: vi.fn(),
  getSessionCost: vi.fn(),
}));

vi.mock('../../../src/server/settings/budget', () => ({
  getUserSettings: mocks.getUserSettings,
}));

vi.mock('../../../src/server/logging/aggregate', () => ({
  getUserCost: mocks.getUserCost,
  getSessionCost: mocks.getSessionCost,
}));

afterEach(() => vi.clearAllMocks());

describe('assertBudget', () => {
  it('resolves when no userId is provided (anonymous call)', async () => {
    const { assertBudget } = await import('../../../src/server/llm/budget-guard');
    await expect(assertBudget({})).resolves.toBeUndefined();
    expect(mocks.getUserSettings).not.toHaveBeenCalled();
  });

  it('resolves when both caps are null (no settings row)', async () => {
    mocks.getUserSettings.mockResolvedValue({ monthlyCapUsd: null, sessionCapUsd: null });
    const { assertBudget } = await import('../../../src/server/llm/budget-guard');

    await expect(assertBudget({ userId: 1, sessionId: 10 })).resolves.toBeUndefined();
    expect(mocks.getUserCost).not.toHaveBeenCalled();
    expect(mocks.getSessionCost).not.toHaveBeenCalled();
  });

  it('resolves when spent is below the user cap', async () => {
    mocks.getUserSettings.mockResolvedValue({ monthlyCapUsd: 1, sessionCapUsd: null });
    mocks.getUserCost.mockResolvedValue(0.5);
    const { assertBudget } = await import('../../../src/server/llm/budget-guard');

    await expect(assertBudget({ userId: 1 })).resolves.toBeUndefined();
  });

  it('throws BudgetExceededError with scope=session when session spend reached the cap', async () => {
    mocks.getUserSettings.mockResolvedValue({ monthlyCapUsd: null, sessionCapUsd: 0.5 });
    mocks.getSessionCost.mockResolvedValue(0.6);
    const { assertBudget, BudgetExceededError } = await import(
      '../../../src/server/llm/budget-guard'
    );

    const promise = assertBudget({ userId: 1, sessionId: 10 });
    await expect(promise).rejects.toThrow(BudgetExceededError);
    await expect(promise).rejects.toMatchObject({ scope: 'session', spent: 0.6, cap: 0.5 });
  });

  it('throws BudgetExceededError with scope=session when spent exactly equals the cap', async () => {
    mocks.getUserSettings.mockResolvedValue({ monthlyCapUsd: null, sessionCapUsd: 1 });
    mocks.getSessionCost.mockResolvedValue(1);
    const { assertBudget } = await import('../../../src/server/llm/budget-guard');

    await expect(assertBudget({ userId: 1, sessionId: 10 })).rejects.toMatchObject({
      scope: 'session',
    });
  });

  it('checks the user cap before the session cap (deterministic precedence)', async () => {
    mocks.getUserSettings.mockResolvedValue({ monthlyCapUsd: 5, sessionCapUsd: 0.5 });
    mocks.getUserCost.mockResolvedValue(10);
    mocks.getSessionCost.mockResolvedValue(2);
    const { assertBudget } = await import('../../../src/server/llm/budget-guard');

    await expect(assertBudget({ userId: 1, sessionId: 10 })).rejects.toMatchObject({
      scope: 'user',
      spent: 10,
      cap: 5,
    });
    expect(mocks.getSessionCost).not.toHaveBeenCalled();
  });

  it('skips the session check when sessionId is missing even if a session cap is set', async () => {
    mocks.getUserSettings.mockResolvedValue({ monthlyCapUsd: null, sessionCapUsd: 0.5 });
    const { assertBudget } = await import('../../../src/server/llm/budget-guard');

    await expect(assertBudget({ userId: 1 })).resolves.toBeUndefined();
    expect(mocks.getSessionCost).not.toHaveBeenCalled();
  });
});

describe('BudgetExceededError', () => {
  it('exposes scope, spent, and cap as instance fields', async () => {
    const { BudgetExceededError } = await import('../../../src/server/llm/budget-guard');
    const err = new BudgetExceededError('user', 12.5, 10);
    expect(err.scope).toBe('user');
    expect(err.spent).toBe(12.5);
    expect(err.cap).toBe(10);
    expect(err.name).toBe('BudgetExceededError');
    expect(err).toBeInstanceOf(Error);
  });
});

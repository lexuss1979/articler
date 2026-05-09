import { getSessionCost, getUserCost } from '../logging/aggregate';
import { getUserSettings } from '../settings/budget';

export type BudgetScope = 'user' | 'session';

export class BudgetExceededError extends Error {
  constructor(
    public readonly scope: BudgetScope,
    public readonly spent: number,
    public readonly cap: number,
  ) {
    super(`Budget exceeded for ${scope}: spent $${spent} of $${cap} cap`);
    this.name = 'BudgetExceededError';
  }
}

export async function assertBudget(args: {
  userId?: number;
  sessionId?: number;
}): Promise<void> {
  const { userId, sessionId } = args;
  if (userId == null) return;

  const settings = await getUserSettings(userId);
  if (settings.monthlyCapUsd === null && settings.sessionCapUsd === null) return;

  if (settings.monthlyCapUsd !== null) {
    const spent = await getUserCost(userId);
    if (spent >= settings.monthlyCapUsd) {
      throw new BudgetExceededError('user', spent, settings.monthlyCapUsd);
    }
  }

  if (sessionId != null && settings.sessionCapUsd !== null) {
    const spent = await getSessionCost(sessionId);
    if (spent >= settings.sessionCapUsd) {
      throw new BudgetExceededError('session', spent, settings.sessionCapUsd);
    }
  }
}

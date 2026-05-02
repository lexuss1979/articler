import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/server/auth/require-user', () => ({
  requireUser: vi.fn().mockResolvedValue({ id: 1, email: 'u@test.com' }),
}));

vi.mock('../../../src/server/sessions/repo', () => ({
  updateSessionPlan: vi.fn().mockResolvedValue({}),
}));

import { updateSessionPlan } from '../../../src/server/sessions/repo';
import { savePlanEditsAction } from '../../../src/app/(app)/sessions/[id]/actions';

const validPlan = {
  thesis: 'Caching reduces cost and latency.',
  targetTakeaway: 'Know when and how to use prompt caching.',
  sections: [
    {
      id: 's1',
      title: 'Introduction',
      intent: 'Hook the reader.',
      expectedLength: 300,
      keyPoints: ['Cost savings', 'Latency benefits'],
    },
    {
      id: 's2',
      title: 'Deep dive',
      intent: 'Explain mechanics.',
      expectedLength: 800,
      keyPoints: ['Cache keys', 'TTL rules'],
    },
  ],
};

beforeEach(() => vi.clearAllMocks());

describe('savePlanEditsAction', () => {
  it('calls updateSessionPlan with user id, session id, and validated plan on a valid payload', async () => {
    const result = await savePlanEditsAction(42, validPlan);

    expect(result).toEqual({ ok: true });
    expect(updateSessionPlan).toHaveBeenCalledWith(1, 42, validPlan);
  });

  it('returns validation error and does not call the repo when plan is invalid', async () => {
    const invalid = { thesis: '', targetTakeaway: 'x', sections: [] };
    const result = await savePlanEditsAction(42, invalid);

    expect(result).toMatchObject({ ok: false, error: 'validation' });
    expect((result as { issues: unknown[] }).issues.length).toBeGreaterThan(0);
    expect(updateSessionPlan).not.toHaveBeenCalled();
  });
});

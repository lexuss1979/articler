import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => {
  const updateReturning = vi.fn();
  const updateWhere = vi.fn();
  const updateSet = vi.fn();
  const update = vi.fn();
  return { updateReturning, updateWhere, updateSet, update };
});

vi.mock('../../../src/server/db/client', () => ({
  db: {
    update: dbMocks.update,
  },
}));

vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm')>();
  return { ...actual, eq: vi.fn(actual.eq), and: vi.fn(actual.and) };
});

function setupMocks() {
  dbMocks.updateReturning.mockResolvedValue([]);
  dbMocks.updateWhere.mockReturnValue({ returning: dbMocks.updateReturning });
  dbMocks.updateSet.mockReturnValue({ where: dbMocks.updateWhere });
  dbMocks.update.mockReturnValue({ set: dbMocks.updateSet });
}

beforeEach(setupMocks);
afterEach(() => vi.clearAllMocks());

describe('updateSessionDraftPreReview', () => {
  it('returns the updated row when session exists and is owned by user', async () => {
    const row = { id: 42, userId: 7, draftMdPreReview: 'snapshot text' };
    dbMocks.updateReturning.mockResolvedValue([row]);

    const { updateSessionDraftPreReview } = await import('../../../src/server/sessions/repo');
    const result = await updateSessionDraftPreReview(7, 42, 'snapshot text');

    expect(result).toBe(row);
  });

  it('returns null when session is not found', async () => {
    dbMocks.updateReturning.mockResolvedValue([]);

    const { updateSessionDraftPreReview } = await import('../../../src/server/sessions/repo');
    const result = await updateSessionDraftPreReview(7, 999, 'snapshot text');

    expect(result).toBeNull();
  });

  it('sets draftMdPreReview on the session row', async () => {
    dbMocks.updateReturning.mockResolvedValue([{ id: 42 }]);

    const { updateSessionDraftPreReview } = await import('../../../src/server/sessions/repo');
    await updateSessionDraftPreReview(7, 42, 'original draft');

    const setArg = (dbMocks.updateSet.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(setArg.draftMdPreReview).toBe('original draft');
  });

  it('scopes the update to the given userId and sessionId', async () => {
    dbMocks.updateReturning.mockResolvedValue([{ id: 42 }]);

    const { updateSessionDraftPreReview } = await import('../../../src/server/sessions/repo');
    const { eq } = await import('drizzle-orm');
    const { sessions } = await import('../../../src/server/db/schema');

    await updateSessionDraftPreReview(7, 42, 'snap');

    const calls = (eq as ReturnType<typeof vi.fn>).mock.calls as [unknown, unknown][];
    expect(calls.some(([col, val]) => col === sessions.userId && val === 7)).toBe(true);
    expect(calls.some(([col, val]) => col === sessions.id && val === 42)).toBe(true);
  });
});

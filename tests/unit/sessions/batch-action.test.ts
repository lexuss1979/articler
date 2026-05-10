import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  assertBatchCaps: vi.fn(),
  createBatchWithSessions: vi.fn(),
  dispatchBatchQueue: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error('NEXT_REDIRECT');
  }),
  ProfileNotOwnedError: class ProfileNotOwnedError extends Error {
    constructor() {
      super('Profile not owned');
      this.name = 'ProfileNotOwnedError';
    }
  },
}));

vi.mock('../../../src/server/auth/require-user', () => ({ requireUser: mocks.requireUser }));
vi.mock('../../../src/server/batches/caps', () => ({ assertBatchCaps: mocks.assertBatchCaps }));
vi.mock('../../../src/server/batches/repo', () => ({
  createBatchWithSessions: mocks.createBatchWithSessions,
}));
vi.mock('../../../src/server/batches/dispatcher', () => ({
  dispatchBatchQueue: mocks.dispatchBatchQueue,
}));
vi.mock('../../../src/server/sessions/repo', () => ({
  ProfileNotOwnedError: mocks.ProfileNotOwnedError,
}));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));

afterEach(() => vi.clearAllMocks());

function makeForm(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
}

describe('createBatchAction', () => {
  it('returns no_topics for empty textarea', async () => {
    mocks.requireUser.mockResolvedValue({ id: 1, email: 'a@test.com' });

    const { createBatchAction } = await import('../../../src/app/(app)/sessions/batch/actions');
    const result = await createBatchAction(null, makeForm({ topics: '', profileId: '1' }));

    expect(result).toEqual({ ok: false, error: 'no_topics' });
    expect(mocks.createBatchWithSessions).not.toHaveBeenCalled();
  });

  it('returns too_many_topics for 51 distinct topics', async () => {
    mocks.requireUser.mockResolvedValue({ id: 1, email: 'a@test.com' });

    const topics = Array.from({ length: 51 }, (_, i) => `topic ${i}`).join('\n');
    const { createBatchAction } = await import('../../../src/app/(app)/sessions/batch/actions');
    const result = await createBatchAction(null, makeForm({ topics, profileId: '1' }));

    expect(result).toEqual({ ok: false, error: 'too_many_topics' });
    expect(mocks.createBatchWithSessions).not.toHaveBeenCalled();
  });

  it('collapses duplicates and blank lines before calling createBatchWithSessions', async () => {
    mocks.requireUser.mockResolvedValue({ id: 1, email: 'a@test.com' });
    mocks.assertBatchCaps.mockResolvedValue({ ok: true });
    mocks.createBatchWithSessions.mockResolvedValue({ batchId: 1, sessionIds: [1, 2, 3] });
    mocks.dispatchBatchQueue.mockResolvedValue(undefined);

    const { createBatchAction } = await import('../../../src/app/(app)/sessions/batch/actions');
    await expect(
      createBatchAction(null, makeForm({ topics: 'a\n\nb\nb\n  \nc', profileId: '1' })),
    ).rejects.toThrow('NEXT_REDIRECT');

    expect(mocks.createBatchWithSessions).toHaveBeenCalledWith(1, 1, ['a', 'b', 'c']);
  });

  it('returns cap error when assertBatchCaps fails', async () => {
    mocks.requireUser.mockResolvedValue({ id: 1, email: 'a@test.com' });
    mocks.assertBatchCaps.mockResolvedValue({
      ok: false,
      error: 'monthly_usd_exceeded',
      details: { current: 5, cap: 5 },
    });

    const { createBatchAction } = await import('../../../src/app/(app)/sessions/batch/actions');
    const result = await createBatchAction(null, makeForm({ topics: 'topic1', profileId: '1' }));

    expect(result).toEqual({ ok: false, error: 'monthly_usd_exceeded', details: { current: 5, cap: 5 } });
    expect(mocks.createBatchWithSessions).not.toHaveBeenCalled();
  });

  it('happy path: redirects, calls dispatchBatchQueue with userId', async () => {
    mocks.requireUser.mockResolvedValue({ id: 42, email: 'a@test.com' });
    mocks.assertBatchCaps.mockResolvedValue({ ok: true });
    mocks.createBatchWithSessions.mockResolvedValue({ batchId: 7, sessionIds: [1, 2, 3] });
    mocks.dispatchBatchQueue.mockResolvedValue(undefined);

    const { createBatchAction } = await import('../../../src/app/(app)/sessions/batch/actions');
    await expect(
      createBatchAction(null, makeForm({ topics: 't1\nt2\nt3', profileId: '5' })),
    ).rejects.toThrow('NEXT_REDIRECT');

    expect(mocks.redirect).toHaveBeenCalledWith('/sessions/batch/7');
    expect(mocks.dispatchBatchQueue).toHaveBeenCalledWith(42);
  });

  it('returns profile_not_owned when ProfileNotOwnedError is thrown', async () => {
    mocks.requireUser.mockResolvedValue({ id: 1, email: 'a@test.com' });
    mocks.assertBatchCaps.mockResolvedValue({ ok: true });
    mocks.createBatchWithSessions.mockRejectedValue(new mocks.ProfileNotOwnedError());

    const { createBatchAction } = await import('../../../src/app/(app)/sessions/batch/actions');
    const result = await createBatchAction(null, makeForm({ topics: 'topic1', profileId: '99' }));

    expect(result).toEqual({ ok: false, error: 'profile_not_owned' });
  });
});

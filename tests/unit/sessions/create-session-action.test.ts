import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  createSession: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error('NEXT_REDIRECT');
  }),
}));

vi.mock('../../../src/server/auth/require-user', () => ({ requireUser: mocks.requireUser }));
vi.mock('../../../src/server/sessions/repo', () => ({
  createSession: mocks.createSession,
  ProfileNotOwnedError: class ProfileNotOwnedError extends Error {
    constructor() {
      super('Profile not owned');
      this.name = 'ProfileNotOwnedError';
    }
  },
}));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));

afterEach(() => vi.clearAllMocks());

function makeForm(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
}

describe('createSessionAction', () => {
  it('calls createSession with mode=light when submitted', async () => {
    mocks.requireUser.mockResolvedValue({ id: 1 });
    mocks.createSession.mockResolvedValue({ id: 42 });

    const { createSessionAction } = await import('../../../src/app/(app)/sessions/actions');
    await expect(
      createSessionAction(null, makeForm({ profileId: '5', mode: 'light' })),
    ).rejects.toThrow('NEXT_REDIRECT');

    expect(mocks.createSession).toHaveBeenCalledWith(1, { profileId: 5, mode: 'light' });
  });

  it('returns validation error for unknown mode', async () => {
    mocks.requireUser.mockResolvedValue({ id: 1 });

    const { createSessionAction } = await import('../../../src/app/(app)/sessions/actions');
    const result = await createSessionAction(null, makeForm({ profileId: '5', mode: 'other' }));

    expect(result).toEqual({ ok: false, error: 'validation' });
    expect(mocks.createSession).not.toHaveBeenCalled();
  });
});

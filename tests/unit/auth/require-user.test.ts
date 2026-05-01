import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from 'next-auth';

vi.mock('../../../src/server/auth/config', () => ({
  auth: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('NEXT_REDIRECT');
  }),
}));

import { auth } from '../../../src/server/auth/config';
import { redirect } from 'next/navigation';
import { requireUser } from '../../../src/server/auth/require-user';

type AuthFn = () => Promise<Session | null>;
const mockAuth = vi.mocked(auth as unknown as AuthFn);

describe('requireUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns user when session exists', async () => {
    mockAuth.mockResolvedValue({
      user: { id: '42', email: 'test@example.com' },
      expires: '',
    });

    const user = await requireUser();
    expect(user).toEqual({ id: 42, email: 'test@example.com' });
  });

  it('redirects to /login when no session', async () => {
    mockAuth.mockResolvedValue(null);

    await expect(requireUser()).rejects.toThrow('NEXT_REDIRECT');
    expect(redirect).toHaveBeenCalledWith('/login');
  });

  it('redirects to /login when session has no user', async () => {
    mockAuth.mockResolvedValue({ user: undefined, expires: '' });

    await expect(requireUser()).rejects.toThrow('NEXT_REDIRECT');
    expect(redirect).toHaveBeenCalledWith('/login');
  });
});

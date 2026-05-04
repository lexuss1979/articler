import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/server/auth/password', () => ({
  hashPassword: vi.fn().mockResolvedValue('$argon2id$hashed'),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('NEXT_REDIRECT');
  }),
}));

const mockInsert = vi.fn();
vi.mock('../../../src/server/db/client', () => ({
  db: {
    insert: () => ({ values: mockInsert }),
  },
}));

import { redirect } from 'next/navigation';
import { registerUser } from '../../../src/app/(auth)/register/actions';

function makeForm(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
}

describe('registerUser', () => {
  const originalAllow = process.env.ALLOW_REGISTRATION;

  beforeEach(() => {
    vi.clearAllMocks();
    mockInsert.mockResolvedValue(undefined);
    process.env.ALLOW_REGISTRATION = 'true';
  });

  afterEach(() => {
    if (originalAllow === undefined) delete process.env.ALLOW_REGISTRATION;
    else process.env.ALLOW_REGISTRATION = originalAllow;
  });

  it('inserts user and redirects on success', async () => {
    await expect(
      registerUser(null, makeForm({ email: 'user@example.com', password: 'password123' })),
    ).rejects.toThrow('NEXT_REDIRECT');

    expect(mockInsert).toHaveBeenCalledWith({
      email: 'user@example.com',
      passwordHash: '$argon2id$hashed',
    });
    expect(redirect).toHaveBeenCalledWith('/login');
  });

  it('returns email_taken on duplicate', async () => {
    mockInsert.mockRejectedValue(new Error('unique constraint'));

    const result = await registerUser(
      null,
      makeForm({ email: 'user@example.com', password: 'password123' }),
    );
    expect(result).toEqual({ ok: false, error: 'email_taken' });
  });

  it('returns validation error for bad email', async () => {
    const result = await registerUser(null, makeForm({ email: 'not-an-email', password: 'password123' }));
    expect(result).toEqual({ ok: false, error: 'validation' });
  });

  it('returns validation error for short password', async () => {
    const result = await registerUser(null, makeForm({ email: 'user@example.com', password: 'short' }));
    expect(result).toEqual({ ok: false, error: 'validation' });
  });

  it('returns registration_closed when ALLOW_REGISTRATION=false', async () => {
    process.env.ALLOW_REGISTRATION = 'false';

    const result = await registerUser(
      null,
      makeForm({ email: 'user@example.com', password: 'password123' }),
    );

    expect(result).toEqual({ ok: false, error: 'registration_closed' });
    expect(mockInsert).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });
});

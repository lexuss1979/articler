import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../../../src/server/auth/password';

describe('password utilities', () => {
  it('hashPassword produces an argon2id hash', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');
    expect(hash).toMatch(/^\$argon2id\$/);
  });

  it('verifyPassword returns true for matching password', async () => {
    const plain = 'hunter2';
    const hash = await hashPassword(plain);
    expect(await verifyPassword(plain, hash)).toBe(true);
  });

  it('verifyPassword returns false for wrong password', async () => {
    const hash = await hashPassword('correct');
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });
});

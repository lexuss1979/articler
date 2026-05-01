import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/server/auth/require-user', () => ({
  requireUser: vi.fn().mockResolvedValue({ id: 1, email: 'test@example.com' }),
}));

vi.mock('../../../src/server/profiles/repo', () => ({
  deleteProfile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import { revalidatePath } from 'next/cache';
import { deleteProfile } from '../../../src/server/profiles/repo';
import { deleteProfileAction } from '../../../src/app/(app)/profiles/actions';

function makeForm(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
}

describe('deleteProfileAction', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls deleteProfile with user id and parsed id, then revalidates', async () => {
    await deleteProfileAction(makeForm({ id: '42' }));

    expect(deleteProfile).toHaveBeenCalledWith(1, 42);
    expect(revalidatePath).toHaveBeenCalledWith('/profiles');
  });

  it('does not call repo for a non-numeric id', async () => {
    await deleteProfileAction(makeForm({ id: 'abc' }));

    expect(deleteProfile).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('does not call repo for id = 0', async () => {
    await deleteProfileAction(makeForm({ id: '0' }));

    expect(deleteProfile).not.toHaveBeenCalled();
  });

  it('does not call repo for a negative id', async () => {
    await deleteProfileAction(makeForm({ id: '-1' }));

    expect(deleteProfile).not.toHaveBeenCalled();
  });
});

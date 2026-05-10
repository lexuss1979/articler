import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/server/auth/require-user', () => ({
  requireUser: vi.fn().mockResolvedValue({ id: 1, email: 'test@example.com' }),
}));

vi.mock('../../../src/server/profiles/repo', () => ({
  getProfile: vi.fn(),
  createProfile: vi.fn(),
  updateProfile: vi.fn(),
  deleteProfile: vi.fn(),
}));

vi.mock('../../../src/server/profiles/profile-assertions-repo', () => ({
  deleteAssertion: vi.fn(),
  deleteAssertionsBySource: vi.fn().mockResolvedValue(0),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import { revalidatePath } from 'next/cache';
import { getProfile } from '../../../src/server/profiles/repo';
import { deleteAssertionsBySource } from '../../../src/server/profiles/profile-assertions-repo';
import { resetSessionAssertionsAction } from '../../../src/app/(app)/profiles/actions';

function makeFormData(profileId: string | null): FormData {
  const fd = new FormData();
  if (profileId !== null) fd.set('profileId', profileId);
  return fd;
}

const ownedProfile = {
  id: 99,
  userId: 1,
  name: 'Test',
  format: 'blog',
  style: 'casual',
  audience: 'general',
  targetVolumeMin: 300,
  targetVolumeMax: 800,
  markupRules: {},
  extraPrompt: '',
  lightResearchSources: 1,
  lightMaxWords: 800,
  createdAt: new Date(),
};

describe('resetSessionAssertionsAction', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does nothing when profile is not owned by the user', async () => {
    vi.mocked(getProfile).mockResolvedValue(null as never);

    await resetSessionAssertionsAction(makeFormData('99'));

    expect(getProfile).toHaveBeenCalledWith(1, 99);
    expect(deleteAssertionsBySource).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('does nothing when profileId is missing or invalid', async () => {
    await resetSessionAssertionsAction(makeFormData(null));
    await resetSessionAssertionsAction(makeFormData('not-a-number'));
    await resetSessionAssertionsAction(makeFormData('0'));
    await resetSessionAssertionsAction(makeFormData('-5'));

    expect(getProfile).not.toHaveBeenCalled();
    expect(deleteAssertionsBySource).not.toHaveBeenCalled();
  });

  it('deletes session-source assertions and revalidates the edit page on the happy path', async () => {
    vi.mocked(getProfile).mockResolvedValue(ownedProfile);

    await resetSessionAssertionsAction(makeFormData('99'));

    expect(deleteAssertionsBySource).toHaveBeenCalledWith(99, 'session');
    expect(deleteAssertionsBySource).toHaveBeenCalledTimes(1);
    expect(revalidatePath).toHaveBeenCalledWith('/profiles/99/edit', 'page');
  });
});

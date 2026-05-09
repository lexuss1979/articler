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
  deleteAssertion: vi.fn().mockResolvedValue(true),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import { getProfile } from '../../../src/server/profiles/repo';
import { deleteAssertion } from '../../../src/server/profiles/profile-assertions-repo';
import { deleteAssertionAction } from '../../../src/app/(app)/profiles/actions';

describe('deleteAssertionAction', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not call deleteAssertion when profile is not owned by user', async () => {
    vi.mocked(getProfile).mockResolvedValue(null as never);

    await deleteAssertionAction(99, 7);

    expect(getProfile).toHaveBeenCalledWith(1, 99);
    expect(deleteAssertion).not.toHaveBeenCalled();
  });

  it('calls deleteAssertion once when ownership passes', async () => {
    vi.mocked(getProfile).mockResolvedValue({
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
    });

    await deleteAssertionAction(99, 7);

    expect(deleteAssertion).toHaveBeenCalledWith(99, 7);
    expect(deleteAssertion).toHaveBeenCalledTimes(1);
  });
});

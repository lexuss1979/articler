import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/server/auth/require-user', () => ({
  requireUser: vi.fn().mockResolvedValue({ id: 1, email: 'test@example.com' }),
}));

vi.mock('../../../src/server/profiles/repo', () => ({
  createProfile: vi.fn().mockResolvedValue({ id: 1 }),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('NEXT_REDIRECT');
  }),
}));

import { createProfile } from '../../../src/server/profiles/repo';
import { createProfileAction } from '../../../src/app/(app)/profiles/actions';

function makeForm(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
}

const validFields = {
  name: 'Tech blog',
  format: 'long_read',
  style: 'Conversational',
  audience: 'Developers',
  targetVolumeMin: '800',
  targetVolumeMax: '1200',
  markupRules: '{}',
  extraPrompt: '',
};

describe('createProfileAction', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls createProfile with user id and validated input on happy path', async () => {
    await expect(createProfileAction(null, makeForm(validFields))).rejects.toThrow('NEXT_REDIRECT');

    expect(createProfile).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        name: 'Tech blog',
        format: 'long_read',
        targetVolumeMin: 800,
        targetVolumeMax: 1200,
      }),
    );
  });

  it('returns validation error and does not call repo on missing required field', async () => {
    const { name: _, ...rest } = validFields;
    const result = await createProfileAction(null, makeForm(rest));

    expect(result).toMatchObject({ ok: false, error: 'validation' });
    expect(createProfile).not.toHaveBeenCalled();
  });

  it('returns validation error and does not call repo on invalid format', async () => {
    const result = await createProfileAction(
      null,
      makeForm({ ...validFields, format: 'unknown_format' }),
    );

    expect(result).toMatchObject({ ok: false, error: 'validation' });
    expect(createProfile).not.toHaveBeenCalled();
  });

  it('returns validation error and does not call repo on invalid JSON in markupRules', async () => {
    const result = await createProfileAction(
      null,
      makeForm({ ...validFields, markupRules: 'not-json' }),
    );

    expect(result).toMatchObject({ ok: false, error: 'validation' });
    expect(createProfile).not.toHaveBeenCalled();
  });

  it('returns validation error when max < min', async () => {
    const result = await createProfileAction(
      null,
      makeForm({ ...validFields, targetVolumeMin: '1000', targetVolumeMax: '500' }),
    );

    expect(result).toMatchObject({ ok: false, error: 'validation' });
  });
});

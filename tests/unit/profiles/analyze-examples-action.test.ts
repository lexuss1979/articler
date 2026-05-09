import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  runAnalyzeExamples: vi.fn(),
}));

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

vi.mock('../../../src/server/pipeline/run-analyze-examples', () => ({
  runAnalyzeExamples: mocks.runAnalyzeExamples,
}));

import { revalidatePath } from 'next/cache';
import { analyzeExamplesAction } from '../../../src/app/(app)/profiles/actions';

function makeForm(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
}

const validInputs = [
  { kind: 'text' as const, value: 'Content one' },
  { kind: 'text' as const, value: 'Content two' },
  { kind: 'text' as const, value: 'Content three' },
];

describe('analyzeExamplesAction', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns validation error when profileId is missing', async () => {
    const result = await analyzeExamplesAction(
      null,
      makeForm({ inputs: JSON.stringify(validInputs) }),
    );
    expect(result).toMatchObject({ ok: false, error: 'validation' });
    expect(mocks.runAnalyzeExamples).not.toHaveBeenCalled();
  });

  it('returns validation error when inputs JSON is invalid', async () => {
    const result = await analyzeExamplesAction(
      null,
      makeForm({ profileId: '10', inputs: 'not-json' }),
    );
    expect(result).toMatchObject({ ok: false, error: 'validation' });
    expect(mocks.runAnalyzeExamples).not.toHaveBeenCalled();
  });

  it('returns profile_not_found when orchestrator returns profile_not_found', async () => {
    mocks.runAnalyzeExamples.mockResolvedValue({ ok: false, error: 'profile_not_found' });

    const result = await analyzeExamplesAction(
      null,
      makeForm({ profileId: '10', inputs: JSON.stringify(validInputs) }),
    );

    expect(result).toEqual({ ok: false, error: 'profile_not_found' });
    expect(mocks.runAnalyzeExamples).toHaveBeenCalledTimes(1);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('returns ok result and calls revalidatePath on success', async () => {
    mocks.runAnalyzeExamples.mockResolvedValue({
      ok: true,
      summary: 'Style summary.',
      count: 3,
      urlErrors: [],
    });

    const result = await analyzeExamplesAction(
      null,
      makeForm({ profileId: '10', inputs: JSON.stringify(validInputs) }),
    );

    expect(result).toEqual({ ok: true, summary: 'Style summary.', urlErrors: [] });
    expect(revalidatePath).toHaveBeenCalledWith('/profiles/10/edit', 'page');
  });

  it('passes userId, profileId, and parsed inputs to the orchestrator', async () => {
    mocks.runAnalyzeExamples.mockResolvedValue({
      ok: true,
      summary: 'Summary.',
      count: 3,
      urlErrors: [],
    });

    await analyzeExamplesAction(
      null,
      makeForm({ profileId: '42', inputs: JSON.stringify(validInputs) }),
    );

    expect(mocks.runAnalyzeExamples).toHaveBeenCalledWith({
      userId: 1,
      profileId: 42,
      inputs: validInputs,
    });
  });

  it('returns too_few_examples when orchestrator returns too_few_examples and does not revalidate', async () => {
    mocks.runAnalyzeExamples.mockResolvedValue({ ok: false, error: 'too_few_examples' });

    const result = await analyzeExamplesAction(
      null,
      makeForm({ profileId: '10', inputs: JSON.stringify(validInputs) }),
    );

    expect(result).toEqual({ ok: false, error: 'too_few_examples' });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

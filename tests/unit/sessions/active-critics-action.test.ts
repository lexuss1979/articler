import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  updateSessionActiveCritics: vi.fn(),
  revalidatePath: vi.fn(),
  startRunner: vi.fn(),
  cancelPendingInput: vi.fn(),
  resolveUserInput: vi.fn(),
}));

vi.mock('../../../src/server/auth/require-user', () => ({ requireUser: mocks.requireUser }));
vi.mock('../../../src/server/sessions/repo', () => ({
  getSession: vi.fn(),
  updateSessionBrief: vi.fn(),
  updateSessionPlan: vi.fn(),
  updateSessionState: vi.fn(),
  updateSessionActiveCritics: mocks.updateSessionActiveCritics,
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('../../../src/server/pipeline/runner', () => ({
  startRunner: mocks.startRunner,
  resolveUserInput: mocks.resolveUserInput,
  cancelPendingInput: mocks.cancelPendingInput,
  hasPendingInput: vi.fn(),
}));
vi.mock('../../../src/server/sessions/sources-repo', () => ({
  setSourceStatus: vi.fn(),
  setSourceSection: vi.fn(),
}));
vi.mock('../../../src/server/pipeline/regenerate-section', () => ({
  regenerateSection: vi.fn(),
}));
vi.mock('../../../src/server/sessions/critique-repo', () => ({
  setFindingStatus: vi.fn(),
  getFindingForUser: vi.fn(),
}));
vi.mock('../../../src/server/sessions/claims-repo', () => ({
  setClaimStatus: vi.fn(),
  getClaimWithLatestVerdict: vi.fn(),
}));
vi.mock('../../../src/server/pipeline/run-review', () => ({ runReview: vi.fn() }));
vi.mock('../../../src/server/pipeline/run-fact-check', () => ({ runFactCheck: vi.fn() }));

afterEach(() => vi.clearAllMocks());

describe('setActiveCriticsAction', () => {
  it('persists a valid payload and returns ok:true', async () => {
    mocks.requireUser.mockResolvedValue({ id: 1 });
    mocks.updateSessionActiveCritics.mockResolvedValue({ id: 5 });

    const { setActiveCriticsAction } = await import(
      '../../../src/app/(app)/sessions/[id]/actions'
    );
    const result = await setActiveCriticsAction(5, {
      enabledIds: ['editorial', 'style'],
      custom: [],
    });

    expect(result).toEqual({ ok: true });
    expect(mocks.updateSessionActiveCritics).toHaveBeenCalledWith(
      1, 5,
      { enabledIds: ['editorial', 'style'], custom: [] },
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/sessions/5');
  });

  it('returns validation error for malformed enabledIds (non-string element)', async () => {
    mocks.requireUser.mockResolvedValue({ id: 1 });

    const { setActiveCriticsAction } = await import(
      '../../../src/app/(app)/sessions/[id]/actions'
    );
    const result = await setActiveCriticsAction(5, {
      enabledIds: [123],
      custom: [],
    });

    expect(result).toEqual({ ok: false, error: 'validation' });
    expect(mocks.updateSessionActiveCritics).not.toHaveBeenCalled();
  });

  it('replaces empty custom critic id with generated id before persistence', async () => {
    mocks.requireUser.mockResolvedValue({ id: 1 });
    mocks.updateSessionActiveCritics.mockResolvedValue({ id: 5 });

    const { setActiveCriticsAction } = await import(
      '../../../src/app/(app)/sessions/[id]/actions'
    );
    await setActiveCriticsAction(5, {
      enabledIds: [],
      custom: [{ id: '', label: 'My critic', promptFragment: 'Check for tone.' }],
    });

    expect(mocks.updateSessionActiveCritics).toHaveBeenCalledTimes(1);
    const callArgs = mocks.updateSessionActiveCritics.mock.calls[0] as [
      number, number, { custom: Array<{ id: string }> },
    ];
    const customId = callArgs[2].custom[0].id;
    expect(customId).toMatch(/^custom_\d+_0$/);
  });

  it('returns not_found when updateSessionActiveCritics returns null', async () => {
    mocks.requireUser.mockResolvedValue({ id: 1 });
    mocks.updateSessionActiveCritics.mockResolvedValue(null);

    const { setActiveCriticsAction } = await import(
      '../../../src/app/(app)/sessions/[id]/actions'
    );
    const result = await setActiveCriticsAction(99, { enabledIds: [], custom: [] });

    expect(result).toEqual({ ok: false, error: 'not_found' });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

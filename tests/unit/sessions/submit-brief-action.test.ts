import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('../../../src/server/auth/require-user', () => ({
  requireUser: vi.fn().mockResolvedValue({ id: 1, email: 'u@test.com' }),
}));

vi.mock('../../../src/server/sessions/repo', () => ({
  getSession: vi.fn(),
  updateSessionBrief: vi.fn().mockResolvedValue({}),
  updateSessionState: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../../src/server/pipeline/runner', () => ({
  startRunner: vi.fn().mockResolvedValue(undefined),
}));

import { updateSessionBrief, updateSessionState } from '../../../src/server/sessions/repo';
import { startRunner } from '../../../src/server/pipeline/runner';
import { submitBriefAction } from '../../../src/app/(app)/sessions/[id]/actions';

function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
}

beforeEach(() => vi.clearAllMocks());

describe('submitBriefAction', () => {
  it('calls updateSessionBrief, updateSessionState, and startRunner on a valid payload', async () => {
    (updateSessionBrief as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (updateSessionState as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const fd = makeFormData({ topic: 'Prompt caching', goal: 'Educate engineers', notes: '' });
    const result = await submitBriefAction(42, fd);

    expect(result).toBeNull();

    expect(updateSessionBrief).toHaveBeenCalledOnce();
    const [userId, sessionId, brief] = (
      updateSessionBrief as ReturnType<typeof vi.fn>
    ).mock.calls[0] as [number, number, Record<string, unknown>];
    expect(userId).toBe(1);
    expect(sessionId).toBe(42);
    expect(brief.topic).toBe('Prompt caching');

    expect(updateSessionState).toHaveBeenCalledWith(1, 42, 'planning');
    expect(startRunner).toHaveBeenCalledWith(42, 1);
  });

  it('returns validation error and calls no repo helpers when topic is missing', async () => {
    const fd = makeFormData({ goal: 'some goal' });
    const result = await submitBriefAction(42, fd);

    expect(result).toMatchObject({ ok: false, error: 'validation' });
    expect(updateSessionBrief).not.toHaveBeenCalled();
    expect(updateSessionState).not.toHaveBeenCalled();
  });
});

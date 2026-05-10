import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  countActiveLightSessions: vi.fn(),
  findQueuedLightSessions: vi.fn(),
  assertBatchCaps: vi.fn(),
  updateSessionState: vi.fn(),
  emitEvent: vi.fn(),
  startRunner: vi.fn(),
  BATCH_CONCURRENCY: 6,
}));

vi.mock('../../../src/server/batches/repo', () => ({
  countActiveLightSessions: mocks.countActiveLightSessions,
  findQueuedLightSessions: mocks.findQueuedLightSessions,
}));

vi.mock('../../../src/server/batches/caps', () => ({
  assertBatchCaps: mocks.assertBatchCaps,
  BATCH_CONCURRENCY: mocks.BATCH_CONCURRENCY,
}));

vi.mock('../../../src/server/sessions/repo', () => ({
  updateSessionState: mocks.updateSessionState,
}));

vi.mock('../../../src/server/events/bus', () => ({
  emitEvent: mocks.emitEvent,
}));

vi.mock('../../../src/server/pipeline/runner', () => ({
  startRunner: mocks.startRunner,
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe('dispatchBatchQueue', () => {
  it('does not call findQueuedLightSessions when concurrency cap is full', async () => {
    mocks.countActiveLightSessions.mockResolvedValue(6); // at cap
    const { dispatchBatchQueue } = await import('../../../src/server/batches/dispatcher');

    await dispatchBatchQueue(1);

    expect(mocks.findQueuedLightSessions).not.toHaveBeenCalled();
    expect(mocks.updateSessionState).not.toHaveBeenCalled();
  });

  it('transitions queued sessions to planning and starts runner for available slots', async () => {
    mocks.countActiveLightSessions.mockResolvedValue(4); // 2 slots available
    mocks.findQueuedLightSessions.mockResolvedValue([
      { id: 10, userId: 7 },
      { id: 11, userId: 7 },
    ]);
    mocks.assertBatchCaps.mockResolvedValue({ ok: true });
    mocks.updateSessionState.mockResolvedValue(null);
    mocks.emitEvent.mockResolvedValue(undefined);
    mocks.startRunner.mockResolvedValue(undefined);

    const { dispatchBatchQueue } = await import('../../../src/server/batches/dispatcher');
    await dispatchBatchQueue(7);

    expect(mocks.findQueuedLightSessions).toHaveBeenCalledWith(7, 2);
    expect(mocks.updateSessionState).toHaveBeenCalledWith(7, 10, 'planning');
    expect(mocks.emitEvent).toHaveBeenCalledWith(10, 'state_changed', { state: 'planning' });
    expect(mocks.updateSessionState).toHaveBeenCalledWith(7, 11, 'planning');
    expect(mocks.emitEvent).toHaveBeenCalledWith(11, 'state_changed', { state: 'planning' });
    expect(mocks.startRunner).toHaveBeenCalledTimes(2);
  });

  it('coalesces concurrent calls — findQueuedLightSessions called only once', async () => {
    mocks.countActiveLightSessions.mockResolvedValue(4);
    mocks.findQueuedLightSessions.mockResolvedValue([]);
    mocks.assertBatchCaps.mockResolvedValue({ ok: true });

    const { dispatchBatchQueue } = await import('../../../src/server/batches/dispatcher');

    const p1 = dispatchBatchQueue(7);
    const p2 = dispatchBatchQueue(7);
    await Promise.all([p1, p2]);

    expect(mocks.findQueuedLightSessions).toHaveBeenCalledTimes(1);
  });

  it('marks session failed and emits state_changed when caps exceeded; does not call startRunner; continues loop', async () => {
    mocks.countActiveLightSessions.mockResolvedValue(4);
    mocks.findQueuedLightSessions.mockResolvedValue([
      { id: 20, userId: 7 },
      { id: 21, userId: 7 },
    ]);
    mocks.assertBatchCaps
      .mockResolvedValueOnce({ ok: true }) // session 20: ok
      .mockResolvedValueOnce({ ok: false, error: 'daily_image_cap_exceeded', details: { current: 100, cap: 100 } }); // session 21: fail
    mocks.updateSessionState.mockResolvedValue(null);
    mocks.emitEvent.mockResolvedValue(undefined);
    mocks.startRunner.mockResolvedValue(undefined);

    const { dispatchBatchQueue } = await import('../../../src/server/batches/dispatcher');
    await dispatchBatchQueue(7);

    // Session 20: planning
    expect(mocks.updateSessionState).toHaveBeenCalledWith(7, 20, 'planning');
    expect(mocks.emitEvent).toHaveBeenCalledWith(20, 'state_changed', { state: 'planning' });
    // Session 21: failed with cap reason
    expect(mocks.updateSessionState).toHaveBeenCalledWith(7, 21, 'failed');
    expect(mocks.emitEvent).toHaveBeenCalledWith(21, 'state_changed', {
      state: 'failed',
      reason: 'cap_exceeded:daily_image_cap_exceeded',
    });
    // startRunner only for session 20
    expect(mocks.startRunner).toHaveBeenCalledTimes(1);
    expect(mocks.startRunner).toHaveBeenCalledWith(20, 7);
  });
});

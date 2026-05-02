import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => {
  const insertReturning = vi.fn();
  const insertValues = vi.fn();
  const insert = vi.fn();
  return { insertReturning, insertValues, insert };
});

vi.mock('../../../src/server/db/client', () => ({
  db: { insert: dbMocks.insert },
}));

const fakeRow = {
  id: 1,
  sessionId: 10,
  ts: new Date(),
  kind: 'agent_message',
  payload: { text: 'hi' },
};

function setupMocks() {
  dbMocks.insertReturning.mockResolvedValue([fakeRow]);
  dbMocks.insertValues.mockReturnValue({ returning: dbMocks.insertReturning });
  dbMocks.insert.mockReturnValue({ values: dbMocks.insertValues });
}

beforeEach(setupMocks);
afterEach(() => vi.clearAllMocks());

describe('subscribe and emitEvent', () => {
  it('delivers event to matching subscribers and not to other sessions', async () => {
    const { subscribe, emitEvent } = await import('../../../src/server/events/bus');

    const received1: unknown[] = [];
    const received2: unknown[] = [];
    const receivedOther: unknown[] = [];

    const unsub1 = subscribe(10, (e) => received1.push(e));
    const unsub2 = subscribe(10, (e) => received2.push(e));
    subscribe(99, (e) => receivedOther.push(e));

    await emitEvent(10, 'agent_message', { text: 'hi' });

    expect(received1).toHaveLength(1);
    expect(received1[0]).toBe(fakeRow);
    expect(received2).toHaveLength(1);
    expect(receivedOther).toHaveLength(0);

    unsub1();
    unsub2();
  });

  it('unsubscribe stops further deliveries', async () => {
    const { subscribe, emitEvent } = await import('../../../src/server/events/bus');

    const received: unknown[] = [];
    const unsub = subscribe(10, (e) => received.push(e));

    await emitEvent(10, 'agent_message', {});
    unsub();
    await emitEvent(10, 'task_completed', {});

    expect(received).toHaveLength(1);
  });

  it('inserts into events table with correct fields', async () => {
    const { emitEvent } = await import('../../../src/server/events/bus');

    await emitEvent(10, 'state_changed', { state: 'planning' });

    expect(dbMocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 10, kind: 'state_changed' }),
    );
  });
});

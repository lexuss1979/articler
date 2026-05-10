import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const requireUserFn = vi.fn();
  const getBatchWithSessionsFn = vi.fn();
  const selectOrderBy = vi.fn();
  const selectWhere = vi.fn();
  const selectFrom = vi.fn();
  const selectFn = vi.fn();
  const unsubA = vi.fn();
  const unsubB = vi.fn();
  const unsubs = [unsubA, unsubB];
  let subCallIndex = 0;
  const subscribeFn = vi.fn((_sessionId: number, _listener: (e: unknown) => void) => {
    const fn = unsubs[subCallIndex % unsubs.length]!;
    subCallIndex++;
    return fn;
  });
  return {
    requireUserFn,
    getBatchWithSessionsFn,
    selectOrderBy,
    selectWhere,
    selectFrom,
    selectFn,
    unsubA,
    unsubB,
    subscribeFn,
    resetSubIndex: () => { subCallIndex = 0; },
  };
});

vi.mock('../../../src/server/auth/require-user', () => ({
  requireUser: mocks.requireUserFn,
}));

vi.mock('../../../src/server/batches/repo', () => ({
  getBatchWithSessions: mocks.getBatchWithSessionsFn,
}));

vi.mock('../../../src/server/db/client', () => ({
  db: { select: mocks.selectFn },
}));

vi.mock('../../../src/server/events/bus', () => ({
  subscribe: mocks.subscribeFn,
}));

afterEach(() => {
  vi.clearAllMocks();
  mocks.resetSubIndex();
});

async function readStream(response: Response): Promise<string> {
  const reader = response.body!.getReader();
  const chunks: string[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(typeof value === 'string' ? value : new TextDecoder().decode(value as BufferSource));
  }
  return chunks.join('');
}

describe('GET /api/stream/batch/[batchId]', () => {
  it('returns 404 when batch not found', async () => {
    mocks.requireUserFn.mockResolvedValue({ id: 1 });
    mocks.getBatchWithSessionsFn.mockResolvedValue(null);

    const { GET } = await import('../../../src/app/api/stream/batch/[batchId]/route');
    const res = await GET(new Request('http://localhost/'), {
      params: Promise.resolve({ batchId: '99' }),
    });

    expect(res.status).toBe(404);
  });

  it('streams stored events with sessionId injected into payload', async () => {
    mocks.requireUserFn.mockResolvedValue({ id: 1 });
    mocks.getBatchWithSessionsFn.mockResolvedValue({
      batch: { id: 5, userId: 1, profileId: 1, createdAt: new Date() },
      sessions: [
        { id: 10, userId: 1 },
        { id: 11, userId: 1 },
      ],
    });

    const storedEvents = [
      { id: 1, sessionId: 10, kind: 'state_changed', payload: { state: 'planning' } },
      { id: 2, sessionId: 10, kind: 'state_changed', payload: { state: 'done' } },
      { id: 3, sessionId: 11, kind: 'state_changed', payload: { state: 'planning' } },
    ];
    mocks.selectOrderBy.mockResolvedValue(storedEvents);
    mocks.selectWhere.mockReturnValue({ orderBy: mocks.selectOrderBy });
    mocks.selectFrom.mockReturnValue({ where: mocks.selectWhere });
    mocks.selectFn.mockReturnValue({ from: mocks.selectFrom });

    const controller = new AbortController();
    const { GET } = await import('../../../src/app/api/stream/batch/[batchId]/route');
    const res = await GET(new Request('http://localhost/', { signal: controller.signal }), {
      params: Promise.resolve({ batchId: '5' }),
    });

    controller.abort();
    const body = await readStream(res);

    const blocks = body.split('\n\n').filter(Boolean);
    expect(blocks).toHaveLength(3);

    const payloads = blocks.map((b) => {
      const dataLine = b.split('\n').find((l) => l.startsWith('data:'))!;
      return JSON.parse(dataLine.slice(5).trim()) as { sessionId: number; state: string };
    });

    expect(payloads[0]).toMatchObject({ sessionId: 10, state: 'planning' });
    expect(payloads[1]).toMatchObject({ sessionId: 10, state: 'done' });
    expect(payloads[2]).toMatchObject({ sessionId: 11, state: 'planning' });
  });

  it('subscribes once per member sessionId', async () => {
    mocks.requireUserFn.mockResolvedValue({ id: 1 });
    mocks.getBatchWithSessionsFn.mockResolvedValue({
      batch: { id: 5, userId: 1, profileId: 1, createdAt: new Date() },
      sessions: [{ id: 10, userId: 1 }, { id: 11, userId: 1 }],
    });
    mocks.selectOrderBy.mockResolvedValue([]);
    mocks.selectWhere.mockReturnValue({ orderBy: mocks.selectOrderBy });
    mocks.selectFrom.mockReturnValue({ where: mocks.selectWhere });
    mocks.selectFn.mockReturnValue({ from: mocks.selectFrom });

    const controller = new AbortController();
    const { GET } = await import('../../../src/app/api/stream/batch/[batchId]/route');
    await GET(new Request('http://localhost/', { signal: controller.signal }), {
      params: Promise.resolve({ batchId: '5' }),
    });

    controller.abort();

    expect(mocks.subscribeFn).toHaveBeenCalledTimes(2);
    expect(mocks.subscribeFn).toHaveBeenCalledWith(10, expect.any(Function));
    expect(mocks.subscribeFn).toHaveBeenCalledWith(11, expect.any(Function));
  });

  it('calls each unsubscribe handler when request is aborted', async () => {
    mocks.requireUserFn.mockResolvedValue({ id: 1 });
    mocks.getBatchWithSessionsFn.mockResolvedValue({
      batch: { id: 5, userId: 1, profileId: 1, createdAt: new Date() },
      sessions: [{ id: 10, userId: 1 }, { id: 11, userId: 1 }],
    });
    mocks.selectOrderBy.mockResolvedValue([]);
    mocks.selectWhere.mockReturnValue({ orderBy: mocks.selectOrderBy });
    mocks.selectFrom.mockReturnValue({ where: mocks.selectWhere });
    mocks.selectFn.mockReturnValue({ from: mocks.selectFrom });

    const controller = new AbortController();
    const { GET } = await import('../../../src/app/api/stream/batch/[batchId]/route');
    await GET(new Request('http://localhost/', { signal: controller.signal }), {
      params: Promise.resolve({ batchId: '5' }),
    });

    controller.abort();
    await new Promise((r) => setTimeout(r, 0));

    expect(mocks.unsubA).toHaveBeenCalledOnce();
    expect(mocks.unsubB).toHaveBeenCalledOnce();
  });

  it('returns correct SSE headers', async () => {
    mocks.requireUserFn.mockResolvedValue({ id: 1 });
    mocks.getBatchWithSessionsFn.mockResolvedValue({
      batch: { id: 5, userId: 1, profileId: 1, createdAt: new Date() },
      sessions: [],
    });

    const controller = new AbortController();
    const { GET } = await import('../../../src/app/api/stream/batch/[batchId]/route');
    const res = await GET(new Request('http://localhost/', { signal: controller.signal }), {
      params: Promise.resolve({ batchId: '5' }),
    });

    expect(res.headers.get('Content-Type')).toBe('text/event-stream');
    expect(res.headers.get('Cache-Control')).toBe('no-cache, no-transform');
    expect(res.headers.get('Connection')).toBe('keep-alive');
    controller.abort();
  });
});

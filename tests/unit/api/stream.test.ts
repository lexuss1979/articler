import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const requireUserFn = vi.fn();
  const getSessionFn = vi.fn();
  const selectOrderBy = vi.fn();
  const selectWhere = vi.fn();
  const selectFrom = vi.fn();
  const selectFn = vi.fn();
  const unsubFn = vi.fn();
  const subscribeFn = vi.fn((_sessionId: number, _listener: (e: unknown) => void) => unsubFn);
  return {
    requireUserFn,
    getSessionFn,
    selectOrderBy,
    selectWhere,
    selectFrom,
    selectFn,
    unsubFn,
    subscribeFn,
  };
});

vi.mock('../../../src/server/auth/require-user', () => ({
  requireUser: mocks.requireUserFn,
}));

vi.mock('../../../src/server/sessions/repo', () => ({
  getSession: mocks.getSessionFn,
}));

vi.mock('../../../src/server/db/client', () => ({
  db: { select: mocks.selectFn },
}));

vi.mock('../../../src/server/events/bus', () => ({
  subscribe: mocks.subscribeFn,
}));

beforeEach(() => {
  mocks.requireUserFn.mockResolvedValue({ id: 1, email: 'u@test.com' });
  mocks.getSessionFn.mockResolvedValue({ id: 10, userId: 1, state: 'briefing' });
  mocks.selectOrderBy.mockResolvedValue([]);
  mocks.selectWhere.mockReturnValue({ orderBy: mocks.selectOrderBy });
  mocks.selectFrom.mockReturnValue({ where: mocks.selectWhere });
  mocks.selectFn.mockReturnValue({ from: mocks.selectFrom });
  mocks.unsubFn.mockReset();
  mocks.subscribeFn.mockClear();
});

afterEach(() => vi.clearAllMocks());

async function readStream(response: Response): Promise<string[]> {
  const reader = response.body!.getReader();
  const chunks: string[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(typeof value === 'string' ? value : new TextDecoder().decode(value as BufferSource));
  }
  return chunks;
}

describe('GET /api/stream/[sessionId]', () => {
  it('returns 404 when session not owned by user', async () => {
    mocks.getSessionFn.mockResolvedValue(null);
    const { GET } = await import('../../../src/app/api/stream/[sessionId]/route');
    const req = new Request('http://localhost/api/stream/10');
    const res = await GET(req, { params: Promise.resolve({ sessionId: '10' }) });
    expect(res.status).toBe(404);
  });

  it('returns correct SSE headers', async () => {
    const controller = new AbortController();
    const { GET } = await import('../../../src/app/api/stream/[sessionId]/route');
    const req = new Request('http://localhost/api/stream/10', { signal: controller.signal });
    const res = await GET(req, { params: Promise.resolve({ sessionId: '10' }) });
    expect(res.headers.get('Content-Type')).toBe('text/event-stream');
    expect(res.headers.get('Cache-Control')).toBe('no-cache, no-transform');
    expect(res.headers.get('Connection')).toBe('keep-alive');
    controller.abort();
  });

  it('replays stored events before live ones', async () => {
    const storedEvent = {
      id: 1,
      sessionId: 10,
      ts: new Date(),
      kind: 'agent_message',
      payload: { text: 'hello' },
    };
    mocks.selectOrderBy.mockResolvedValue([storedEvent]);

    const controller = new AbortController();
    const { GET } = await import('../../../src/app/api/stream/[sessionId]/route');
    const req = new Request('http://localhost/api/stream/10', { signal: controller.signal });
    const res = await GET(req, { params: Promise.resolve({ sessionId: '10' }) });

    controller.abort();

    const chunks = await readStream(res);
    const body = chunks.join('');
    expect(body).toContain('event: agent_message');
    expect(body).toContain('"text":"hello"');
  });

  it('unsubscribes when request is aborted', async () => {
    const controller = new AbortController();
    const { GET } = await import('../../../src/app/api/stream/[sessionId]/route');
    const req = new Request('http://localhost/api/stream/10', { signal: controller.signal });
    await GET(req, { params: Promise.resolve({ sessionId: '10' }) });

    controller.abort();
    await new Promise((r) => setTimeout(r, 0));

    expect(mocks.unsubFn).toHaveBeenCalledOnce();
  });
});

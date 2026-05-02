import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireUserFn: vi.fn(),
  getSessionFn: vi.fn(),
  hasPendingInputFn: vi.fn(),
  resolveUserInputFn: vi.fn(),
}));

vi.mock('../../../src/server/auth/require-user', () => ({
  requireUser: mocks.requireUserFn,
}));

vi.mock('../../../src/server/sessions/repo', () => ({
  getSession: mocks.getSessionFn,
}));

vi.mock('../../../src/server/pipeline/runner', () => ({
  hasPendingInput: mocks.hasPendingInputFn,
  resolveUserInput: mocks.resolveUserInputFn,
}));

beforeEach(() => {
  mocks.requireUserFn.mockResolvedValue({ id: 1, email: 'u@test.com' });
  mocks.getSessionFn.mockResolvedValue({ id: 10, userId: 1 });
  mocks.hasPendingInputFn.mockReturnValue(true);
  mocks.resolveUserInputFn.mockReturnValue(true);
});

afterEach(() => vi.clearAllMocks());

async function postRespond(id: string, body: unknown) {
  const { POST } = await import(
    '../../../src/app/api/sessions/[id]/respond/route'
  );
  const req = new Request(`http://localhost/api/sessions/${id}/respond`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
  return POST(req, { params: Promise.resolve({ id }) });
}

describe('POST /api/sessions/[id]/respond', () => {
  it('returns 404 when session not owned', async () => {
    mocks.getSessionFn.mockResolvedValue(null);
    const res = await postRespond('10', { value: { text: 'hi' } });
    expect(res.status).toBe(404);
  });

  it('returns 409 when no pending input', async () => {
    mocks.hasPendingInputFn.mockReturnValue(false);
    const res = await postRespond('10', { value: { text: 'hi' } });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.error).toBe('no_pending_input');
  });

  it('returns 400 when schema rejects the value', async () => {
    mocks.resolveUserInputFn.mockReturnValue(false);
    const res = await postRespond('10', { value: 'not-an-object' });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.error).toBe('invalid_value');
  });

  it('returns 200 ok when resolved', async () => {
    const res = await postRespond('10', { value: { text: 'hello' } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it('calls resolveUserInput with session id and value', async () => {
    await postRespond('10', { value: { text: 'world' } });
    expect(mocks.resolveUserInputFn).toHaveBeenCalledWith(10, { text: 'world' });
  });
});

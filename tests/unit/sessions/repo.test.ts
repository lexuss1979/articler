import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => {
  const selectWhere = vi.fn();
  const selectFrom = vi.fn();
  const select = vi.fn();
  const insertReturning = vi.fn();
  const insertValues = vi.fn();
  const insert = vi.fn();
  const updateReturning = vi.fn();
  const updateWhere = vi.fn();
  const updateSet = vi.fn();
  const update = vi.fn();
  return {
    selectWhere,
    selectFrom,
    select,
    insertReturning,
    insertValues,
    insert,
    updateReturning,
    updateWhere,
    updateSet,
    update,
  };
});

vi.mock('../../../src/server/db/client', () => ({
  db: {
    select: dbMocks.select,
    insert: dbMocks.insert,
    update: dbMocks.update,
  },
}));

vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm')>();
  return { ...actual, eq: vi.fn(actual.eq), and: vi.fn(actual.and) };
});

function setupMocks() {
  dbMocks.selectWhere.mockResolvedValue([]);
  dbMocks.selectFrom.mockReturnValue({ where: dbMocks.selectWhere });
  dbMocks.select.mockReturnValue({ from: dbMocks.selectFrom });
  dbMocks.insertReturning.mockResolvedValue([{ id: 1 }]);
  dbMocks.insertValues.mockReturnValue({ returning: dbMocks.insertReturning });
  dbMocks.insert.mockReturnValue({ values: dbMocks.insertValues });
  dbMocks.updateReturning.mockResolvedValue([]);
  dbMocks.updateWhere.mockReturnValue({ returning: dbMocks.updateReturning });
  dbMocks.updateSet.mockReturnValue({ where: dbMocks.updateWhere });
  dbMocks.update.mockReturnValue({ set: dbMocks.updateSet });
}

beforeEach(setupMocks);
afterEach(() => vi.clearAllMocks());

describe('listSessions', () => {
  it('includes user_id predicate in where clause', async () => {
    const { listSessions } = await import('../../../src/server/sessions/repo');
    const { eq } = await import('drizzle-orm');
    const { sessions } = await import('../../../src/server/db/schema');

    await listSessions(7);

    const calls = (eq as ReturnType<typeof vi.fn>).mock.calls as [unknown, unknown][];
    expect(calls.some(([col, val]) => col === sessions.userId && val === 7)).toBe(true);
  });
});

describe('getSession', () => {
  it('includes both id and user_id predicates', async () => {
    const { getSession } = await import('../../../src/server/sessions/repo');
    const { eq } = await import('drizzle-orm');
    const { sessions } = await import('../../../src/server/db/schema');

    await getSession(7, 42);

    const calls = (eq as ReturnType<typeof vi.fn>).mock.calls as [unknown, unknown][];
    expect(calls.some(([col, val]) => col === sessions.userId && val === 7)).toBe(true);
    expect(calls.some(([col, val]) => col === sessions.id && val === 42)).toBe(true);
  });

  it('returns null when no row found', async () => {
    const { getSession } = await import('../../../src/server/sessions/repo');
    dbMocks.selectWhere.mockResolvedValue([]);
    expect(await getSession(7, 42)).toBeNull();
  });

  it('returns the row when found', async () => {
    const { getSession } = await import('../../../src/server/sessions/repo');
    const row = { id: 42, userId: 7, state: 'briefing' };
    dbMocks.selectWhere.mockResolvedValue([row]);
    expect(await getSession(7, 42)).toBe(row);
  });
});

describe('createSession', () => {
  it('throws ProfileNotOwnedError when profile not owned', async () => {
    const { createSession, ProfileNotOwnedError } = await import(
      '../../../src/server/sessions/repo'
    );
    dbMocks.selectWhere.mockResolvedValue([]);
    await expect(createSession(1, { profileId: 99, mode: 'new' })).rejects.toBeInstanceOf(
      ProfileNotOwnedError,
    );
  });

  it('inserts session when profile is owned', async () => {
    const { createSession } = await import('../../../src/server/sessions/repo');
    dbMocks.selectWhere.mockResolvedValueOnce([{ id: 5 }]);
    dbMocks.insertReturning.mockResolvedValue([{ id: 10, userId: 1, profileId: 5, mode: 'new' }]);
    const result = await createSession(1, { profileId: 5, mode: 'new' });
    expect(result.id).toBe(10);
    expect(dbMocks.insertValues).toHaveBeenCalledOnce();
    const insertArg = (dbMocks.insertValues.mock.calls[0] as unknown[])[0] as Record<
      string,
      unknown
    >;
    expect(insertArg.userId).toBe(1);
  });

  it('includes user_id check when validating profile ownership', async () => {
    const { createSession } = await import('../../../src/server/sessions/repo');
    const { eq } = await import('drizzle-orm');
    const { profiles } = await import('../../../src/server/db/schema');

    dbMocks.selectWhere.mockResolvedValueOnce([{ id: 5 }]);
    dbMocks.insertReturning.mockResolvedValue([{ id: 10 }]);
    await createSession(3, { profileId: 5, mode: 'rewrite' });

    const calls = (eq as ReturnType<typeof vi.fn>).mock.calls as [unknown, unknown][];
    expect(calls.some(([col, val]) => col === profiles.userId && val === 3)).toBe(true);
  });
});

describe('updateSessionState', () => {
  it('includes user_id and id predicates in where clause', async () => {
    const { updateSessionState } = await import('../../../src/server/sessions/repo');
    const { eq } = await import('drizzle-orm');
    const { sessions } = await import('../../../src/server/db/schema');

    await updateSessionState(7, 42, 'planning');

    const calls = (eq as ReturnType<typeof vi.fn>).mock.calls as [unknown, unknown][];
    expect(calls.some(([col, val]) => col === sessions.userId && val === 7)).toBe(true);
    expect(calls.some(([col, val]) => col === sessions.id && val === 42)).toBe(true);
  });

  it('returns null when no row matched', async () => {
    const { updateSessionState } = await import('../../../src/server/sessions/repo');
    dbMocks.updateReturning.mockResolvedValue([]);
    expect(await updateSessionState(7, 42, 'done')).toBeNull();
  });
});

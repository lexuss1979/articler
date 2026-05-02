import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => {
  const selectOrderBy = vi.fn();
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
    selectOrderBy,
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
  return {
    ...actual,
    eq: vi.fn(actual.eq),
    and: vi.fn(actual.and),
    asc: vi.fn(actual.asc),
    inArray: vi.fn(),
  };
});

const sampleRow = {
  id: 1,
  sessionId: 10,
  sectionId: 'intro',
  hypothesis: 'hyp',
  query: 'q',
  url: 'https://example.com',
  title: 'title',
  rawExcerpt: 'excerpt',
  summary: 'sum',
  relevanceScore: 80,
  status: 'proposed',
  createdAt: new Date(),
};

// Returns a thenable (awaitable) that also exposes .orderBy(), so the mock
// works both for ownership-check `await` calls and for chained .orderBy() calls.
function makeSelectResult(values: unknown[]) {
  return Object.assign(Promise.resolve(values), { orderBy: dbMocks.selectOrderBy });
}

function setupMocks() {
  dbMocks.selectOrderBy.mockResolvedValue([sampleRow]);
  // Default: not owned (empty array). Tests override with mockReturnValueOnce.
  dbMocks.selectWhere.mockReturnValue(makeSelectResult([]));
  dbMocks.selectFrom.mockReturnValue({ where: dbMocks.selectWhere, orderBy: dbMocks.selectOrderBy });
  dbMocks.select.mockReturnValue({ from: dbMocks.selectFrom });

  dbMocks.insertReturning.mockResolvedValue([sampleRow]);
  dbMocks.insertValues.mockReturnValue({ returning: dbMocks.insertReturning });
  dbMocks.insert.mockReturnValue({ values: dbMocks.insertValues });

  dbMocks.updateReturning.mockResolvedValue([sampleRow]);
  dbMocks.updateWhere.mockReturnValue({ returning: dbMocks.updateReturning });
  dbMocks.updateSet.mockReturnValue({ where: dbMocks.updateWhere });
  dbMocks.update.mockReturnValue({ set: dbMocks.updateSet });
}

beforeEach(setupMocks);
afterEach(() => vi.clearAllMocks());

describe('insertSource', () => {
  it('returns null when session is not owned', async () => {
    const { insertSource } = await import('../../../src/server/sessions/sources-repo');
    const result = await insertSource(1, 10, {
      sectionId: null,
      hypothesis: 'h',
      query: 'q',
      url: 'https://x.com',
      title: 't',
      rawExcerpt: 'e',
      summary: 's',
      relevanceScore: 50,
    });
    expect(result).toBeNull();
    expect(dbMocks.insert).not.toHaveBeenCalled();
  });

  it('inserts row with status proposed when session is owned', async () => {
    const { insertSource } = await import('../../../src/server/sessions/sources-repo');
    dbMocks.selectWhere.mockReturnValueOnce(makeSelectResult([{ id: 10 }]));
    const result = await insertSource(1, 10, {
      sectionId: 'intro',
      hypothesis: 'h',
      query: 'q',
      url: 'https://x.com',
      title: 't',
      rawExcerpt: 'e',
      summary: 's',
      relevanceScore: 50,
    });
    expect(result).toBe(sampleRow);
    const insertArg = (dbMocks.insertValues.mock.calls[0] as unknown[])[0] as Record<
      string,
      unknown
    >;
    expect(insertArg.status).toBe('proposed');
    expect(insertArg.sessionId).toBe(10);
  });

  it('includes user-ownership predicate in session check', async () => {
    const { insertSource } = await import('../../../src/server/sessions/sources-repo');
    const { eq } = await import('drizzle-orm');
    const { sessions } = await import('../../../src/server/db/schema');
    dbMocks.selectWhere.mockReturnValueOnce(makeSelectResult([{ id: 10 }]));
    await insertSource(7, 10, {
      sectionId: null,
      hypothesis: 'h',
      query: 'q',
      url: 'https://x.com',
      title: 't',
      rawExcerpt: 'e',
      summary: 's',
      relevanceScore: 50,
    });
    const calls = (eq as ReturnType<typeof vi.fn>).mock.calls as [unknown, unknown][];
    expect(calls.some(([col, val]) => col === sessions.userId && val === 7)).toBe(true);
  });
});

describe('listSessionSources', () => {
  it('returns empty array when session is not owned', async () => {
    const { listSessionSources } = await import('../../../src/server/sessions/sources-repo');
    expect(await listSessionSources(1, 10)).toEqual([]);
  });

  it('includes user-ownership predicate', async () => {
    const { listSessionSources } = await import('../../../src/server/sessions/sources-repo');
    const { eq } = await import('drizzle-orm');
    const { sessions } = await import('../../../src/server/db/schema');
    dbMocks.selectWhere.mockReturnValueOnce(makeSelectResult([{ id: 10 }]));
    await listSessionSources(7, 10);
    const calls = (eq as ReturnType<typeof vi.fn>).mock.calls as [unknown, unknown][];
    expect(calls.some(([col, val]) => col === sessions.userId && val === 7)).toBe(true);
  });
});

describe('findSourceByQuery', () => {
  it('returns empty array when session is not owned', async () => {
    const { findSourceByQuery } = await import('../../../src/server/sessions/sources-repo');
    expect(await findSourceByQuery(1, 10, 'query')).toEqual([]);
  });

  it('includes user-ownership predicate', async () => {
    const { findSourceByQuery } = await import('../../../src/server/sessions/sources-repo');
    const { eq } = await import('drizzle-orm');
    const { sessions } = await import('../../../src/server/db/schema');
    dbMocks.selectWhere.mockReturnValueOnce(makeSelectResult([{ id: 10 }]));
    await findSourceByQuery(7, 10, 'query');
    const calls = (eq as ReturnType<typeof vi.fn>).mock.calls as [unknown, unknown][];
    expect(calls.some(([col, val]) => col === sessions.userId && val === 7)).toBe(true);
  });
});

describe('setSourceStatus', () => {
  it('returns null when source is unowned', async () => {
    const { setSourceStatus } = await import('../../../src/server/sessions/sources-repo');
    dbMocks.updateReturning.mockResolvedValue([]);
    expect(await setSourceStatus(1, 99, 'accepted')).toBeNull();
  });

  it('returns updated row on success', async () => {
    const { setSourceStatus } = await import('../../../src/server/sessions/sources-repo');
    dbMocks.updateReturning.mockResolvedValue([{ ...sampleRow, status: 'accepted' }]);
    const result = await setSourceStatus(1, 1, 'accepted');
    expect(result?.status).toBe('accepted');
  });

  it('includes user-ownership predicate via inArray subquery', async () => {
    const { setSourceStatus } = await import('../../../src/server/sessions/sources-repo');
    const { eq } = await import('drizzle-orm');
    const { sessions } = await import('../../../src/server/db/schema');
    await setSourceStatus(7, 1, 'rejected');
    const calls = (eq as ReturnType<typeof vi.fn>).mock.calls as [unknown, unknown][];
    expect(calls.some(([col, val]) => col === sessions.userId && val === 7)).toBe(true);
  });
});

describe('setSourceSection', () => {
  it('returns null when source is unowned', async () => {
    const { setSourceSection } = await import('../../../src/server/sessions/sources-repo');
    dbMocks.updateReturning.mockResolvedValue([]);
    expect(await setSourceSection(1, 99, 'intro')).toBeNull();
  });

  it('returns updated row on success', async () => {
    const { setSourceSection } = await import('../../../src/server/sessions/sources-repo');
    dbMocks.updateReturning.mockResolvedValue([{ ...sampleRow, sectionId: 'conclusion' }]);
    const result = await setSourceSection(1, 1, 'conclusion');
    expect(result?.sectionId).toBe('conclusion');
  });

  it('includes user-ownership predicate via inArray subquery', async () => {
    const { setSourceSection } = await import('../../../src/server/sessions/sources-repo');
    const { eq } = await import('drizzle-orm');
    const { sessions } = await import('../../../src/server/db/schema');
    await setSourceSection(7, 1, 'intro');
    const calls = (eq as ReturnType<typeof vi.fn>).mock.calls as [unknown, unknown][];
    expect(calls.some(([col, val]) => col === sessions.userId && val === 7)).toBe(true);
  });
});

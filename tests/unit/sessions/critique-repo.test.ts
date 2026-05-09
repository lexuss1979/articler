import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => {
  const selectOrderBy = vi.fn();
  const selectWhere = vi.fn();
  const selectInnerJoin = vi.fn();
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
    selectInnerJoin,
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

const sampleRound = {
  id: 1,
  sessionId: 10,
  kind: 'critique',
  draftHash: 'abc123',
  createdAt: new Date(),
};

const sampleFinding = {
  id: 5,
  roundId: 1,
  criticId: 'editorial',
  severity: 'minor',
  span: { sectionId: 'body', charStart: 0, charEnd: 50 },
  problem: 'Unsupported claim.',
  suggestedChange: 'Add citation.',
  rationale: 'No source.',
  status: 'open',
  createdAt: new Date(),
};

function makeSelectResult(values: unknown[]) {
  return Object.assign(Promise.resolve(values), { orderBy: dbMocks.selectOrderBy });
}

function setupMocks() {
  dbMocks.selectOrderBy.mockResolvedValue([sampleRound]);
  dbMocks.selectWhere.mockReturnValue(makeSelectResult([]));
  dbMocks.selectInnerJoin.mockReturnValue({ where: dbMocks.selectWhere });
  dbMocks.selectFrom.mockReturnValue({
    where: dbMocks.selectWhere,
    orderBy: dbMocks.selectOrderBy,
    innerJoin: dbMocks.selectInnerJoin,
  });
  dbMocks.select.mockReturnValue({ from: dbMocks.selectFrom });

  dbMocks.insertReturning.mockResolvedValue([sampleRound]);
  dbMocks.insertValues.mockReturnValue({ returning: dbMocks.insertReturning });
  dbMocks.insert.mockReturnValue({ values: dbMocks.insertValues });

  dbMocks.updateReturning.mockResolvedValue([sampleFinding]);
  dbMocks.updateWhere.mockReturnValue({ returning: dbMocks.updateReturning });
  dbMocks.updateSet.mockReturnValue({ where: dbMocks.updateWhere });
  dbMocks.update.mockReturnValue({ set: dbMocks.updateSet });
}

beforeEach(setupMocks);
afterEach(() => vi.clearAllMocks());

describe('createCritiqueRound', () => {
  it('returns null when session is not owned', async () => {
    const { createCritiqueRound } = await import('../../../src/server/sessions/critique-repo');
    const result = await createCritiqueRound(1, 10, 'critique', 'hash1');
    expect(result).toBeNull();
    expect(dbMocks.insert).not.toHaveBeenCalled();
  });

  it('inserts and returns row when session is owned', async () => {
    const { createCritiqueRound } = await import('../../../src/server/sessions/critique-repo');
    dbMocks.selectWhere.mockReturnValueOnce(makeSelectResult([{ id: 10 }]));
    const result = await createCritiqueRound(1, 10, 'critique', 'hash1');
    expect(result).toBe(sampleRound);
    const values = (dbMocks.insertValues.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(values.kind).toBe('critique');
    expect(values.draftHash).toBe('hash1');
    expect(values.sessionId).toBe(10);
  });

  it('includes user-ownership predicate', async () => {
    const { createCritiqueRound } = await import('../../../src/server/sessions/critique-repo');
    const { eq } = await import('drizzle-orm');
    const { sessions } = await import('../../../src/server/db/schema');
    dbMocks.selectWhere.mockReturnValueOnce(makeSelectResult([{ id: 10 }]));
    await createCritiqueRound(7, 10, 'factcheck', 'hash2');
    const calls = (eq as ReturnType<typeof vi.fn>).mock.calls as [unknown, unknown][];
    expect(calls.some(([col, val]) => col === sessions.userId && val === 7)).toBe(true);
  });
});

describe('insertFinding', () => {
  const fields = {
    criticId: 'editorial',
    severity: 'minor',
    span: { sectionId: 'body', charStart: 0, charEnd: 50 },
    problem: 'Unsupported claim.',
    suggestedChange: 'Add citation.',
    rationale: 'No source.',
  };

  it('returns null when round is not owned', async () => {
    const { insertFinding } = await import('../../../src/server/sessions/critique-repo');
    const result = await insertFinding(1, 1, fields);
    expect(result).toBeNull();
    expect(dbMocks.insert).not.toHaveBeenCalled();
  });

  it('inserts with status open when round is owned', async () => {
    const { insertFinding } = await import('../../../src/server/sessions/critique-repo');
    dbMocks.insertReturning.mockResolvedValue([sampleFinding]);
    dbMocks.selectWhere.mockReturnValueOnce(makeSelectResult([{ id: 1 }]));
    const result = await insertFinding(1, 1, fields);
    expect(result).toBe(sampleFinding);
    const values = (dbMocks.insertValues.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(values.status).toBe('open');
    expect(values.roundId).toBe(1);
  });

  it('verifies ownership via join with sessions table', async () => {
    const { insertFinding } = await import('../../../src/server/sessions/critique-repo');
    const { eq } = await import('drizzle-orm');
    const { sessions } = await import('../../../src/server/db/schema');
    dbMocks.selectWhere.mockReturnValueOnce(makeSelectResult([{ id: 1 }]));
    await insertFinding(7, 1, fields);
    const calls = (eq as ReturnType<typeof vi.fn>).mock.calls as [unknown, unknown][];
    expect(calls.some(([col, val]) => col === sessions.userId && val === 7)).toBe(true);
    expect(dbMocks.selectInnerJoin).toHaveBeenCalled();
  });
});

describe('listSessionRounds', () => {
  it('returns empty array when session is not owned', async () => {
    const { listSessionRounds } = await import('../../../src/server/sessions/critique-repo');
    expect(await listSessionRounds(1, 10)).toEqual([]);
    expect(dbMocks.selectOrderBy).not.toHaveBeenCalled();
  });

  it('returns rounds ordered by id when owned', async () => {
    const { listSessionRounds } = await import('../../../src/server/sessions/critique-repo');
    dbMocks.selectWhere.mockReturnValueOnce(makeSelectResult([{ id: 10 }]));
    dbMocks.selectOrderBy.mockResolvedValueOnce([sampleRound]);
    await listSessionRounds(1, 10);
    expect(dbMocks.selectOrderBy).toHaveBeenCalled();
  });

  it('includes kind filter when provided', async () => {
    const { listSessionRounds } = await import('../../../src/server/sessions/critique-repo');
    const { eq } = await import('drizzle-orm');
    const { critiqueRounds } = await import('../../../src/server/db/schema');
    dbMocks.selectWhere.mockReturnValueOnce(makeSelectResult([{ id: 10 }]));
    await listSessionRounds(1, 10, 'factcheck');
    const calls = (eq as ReturnType<typeof vi.fn>).mock.calls as [unknown, unknown][];
    expect(calls.some(([col, val]) => col === critiqueRounds.kind && val === 'factcheck')).toBe(true);
  });

  it('includes user-ownership predicate', async () => {
    const { listSessionRounds } = await import('../../../src/server/sessions/critique-repo');
    const { eq } = await import('drizzle-orm');
    const { sessions } = await import('../../../src/server/db/schema');
    dbMocks.selectWhere.mockReturnValueOnce(makeSelectResult([{ id: 10 }]));
    await listSessionRounds(7, 10);
    const calls = (eq as ReturnType<typeof vi.fn>).mock.calls as [unknown, unknown][];
    expect(calls.some(([col, val]) => col === sessions.userId && val === 7)).toBe(true);
  });
});

describe('listRoundFindings', () => {
  it('returns empty array when round is not owned', async () => {
    const { listRoundFindings } = await import('../../../src/server/sessions/critique-repo');
    expect(await listRoundFindings(1, 1)).toEqual([]);
    expect(dbMocks.selectOrderBy).not.toHaveBeenCalled();
  });

  it('returns findings ordered by id when owned', async () => {
    const { listRoundFindings } = await import('../../../src/server/sessions/critique-repo');
    dbMocks.selectWhere.mockReturnValueOnce(makeSelectResult([{ id: 1 }]));
    dbMocks.selectOrderBy.mockResolvedValueOnce([sampleFinding]);
    const result = await listRoundFindings(1, 1);
    expect(dbMocks.selectOrderBy).toHaveBeenCalled();
    expect(result).toEqual([sampleFinding]);
  });

  it('includes user-ownership predicate via join', async () => {
    const { listRoundFindings } = await import('../../../src/server/sessions/critique-repo');
    const { eq } = await import('drizzle-orm');
    const { sessions } = await import('../../../src/server/db/schema');
    dbMocks.selectWhere.mockReturnValueOnce(makeSelectResult([{ id: 1 }]));
    await listRoundFindings(7, 1);
    const calls = (eq as ReturnType<typeof vi.fn>).mock.calls as [unknown, unknown][];
    expect(calls.some(([col, val]) => col === sessions.userId && val === 7)).toBe(true);
    expect(dbMocks.selectInnerJoin).toHaveBeenCalled();
  });
});

describe('setFindingStatus', () => {
  it('returns null when finding is not owned', async () => {
    const { setFindingStatus } = await import('../../../src/server/sessions/critique-repo');
    dbMocks.updateReturning.mockResolvedValue([]);
    expect(await setFindingStatus(1, 99, 'dismissed')).toBeNull();
  });

  it('returns updated row on success', async () => {
    const { setFindingStatus } = await import('../../../src/server/sessions/critique-repo');
    dbMocks.updateReturning.mockResolvedValue([{ ...sampleFinding, status: 'applied' }]);
    const result = await setFindingStatus(1, 5, 'applied');
    expect(result?.status).toBe('applied');
  });

  it('includes user-ownership predicate via inArray subquery', async () => {
    const { setFindingStatus } = await import('../../../src/server/sessions/critique-repo');
    const { eq } = await import('drizzle-orm');
    const { sessions } = await import('../../../src/server/db/schema');
    await setFindingStatus(7, 5, 'dismissed');
    const calls = (eq as ReturnType<typeof vi.fn>).mock.calls as [unknown, unknown][];
    expect(calls.some(([col, val]) => col === sessions.userId && val === 7)).toBe(true);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => {
  const selectLimit = vi.fn();
  const selectOrderBy = vi.fn();
  const selectWhere = vi.fn();
  const selectLeftJoin = vi.fn();
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
    selectLimit,
    selectOrderBy,
    selectWhere,
    selectLeftJoin,
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
    desc: vi.fn(actual.desc),
    inArray: vi.fn(),
  };
});

const sampleClaim = {
  id: 1,
  sessionId: 10,
  roundId: 2,
  span: { sectionId: 'body', charStart: 0, charEnd: 50, text: 'GDP grew by 5%.' },
  spanHash: 'abc123',
  claimText: 'GDP grew by 5%.',
  claimType: 'statistic',
  checkWorthiness: 'high',
  status: 'open',
  createdAt: new Date(),
};

const sampleVerdict = {
  id: 3,
  claimId: 1,
  verdict: 'verified',
  justification: 'Source confirms claim.',
  createdAt: new Date(),
};

const sampleEvidence = {
  id: 4,
  verdictId: 3,
  sourceId: null,
  url: 'https://example.com',
  snippet: 'GDP grew...',
  supports: true,
  createdAt: new Date(),
};

function makeOrderResult(values: unknown[]) {
  return Object.assign(Promise.resolve(values), { limit: dbMocks.selectLimit });
}

function makeSelectResult(values: unknown[]) {
  return Object.assign(Promise.resolve(values), { orderBy: dbMocks.selectOrderBy });
}

function setupMocks() {
  dbMocks.selectLimit.mockResolvedValue([]);
  dbMocks.selectOrderBy.mockReturnValue(makeOrderResult([]));
  dbMocks.selectWhere.mockReturnValue(makeSelectResult([]));
  dbMocks.selectLeftJoin.mockReturnValue({ where: dbMocks.selectWhere });
  dbMocks.selectInnerJoin.mockReturnValue({ where: dbMocks.selectWhere });
  dbMocks.selectFrom.mockReturnValue({
    where: dbMocks.selectWhere,
    orderBy: dbMocks.selectOrderBy,
    leftJoin: dbMocks.selectLeftJoin,
    innerJoin: dbMocks.selectInnerJoin,
  });
  dbMocks.select.mockReturnValue({ from: dbMocks.selectFrom });

  dbMocks.insertReturning.mockResolvedValue([sampleClaim]);
  dbMocks.insertValues.mockReturnValue({ returning: dbMocks.insertReturning });
  dbMocks.insert.mockReturnValue({ values: dbMocks.insertValues });

  dbMocks.updateReturning.mockResolvedValue([sampleClaim]);
  dbMocks.updateWhere.mockReturnValue({ returning: dbMocks.updateReturning });
  dbMocks.updateSet.mockReturnValue({ where: dbMocks.updateWhere });
  dbMocks.update.mockReturnValue({ set: dbMocks.updateSet });
}

beforeEach(setupMocks);
afterEach(() => vi.clearAllMocks());

describe('insertClaim', () => {
  const fields = {
    span: { sectionId: 'body', charStart: 0, charEnd: 50, text: 'GDP grew by 5%.' },
    spanHash: 'abc123',
    claimText: 'GDP grew by 5%.',
    claimType: 'statistic' as const,
    checkWorthiness: 'high' as const,
  };

  it('returns null when session is not owned', async () => {
    const { insertClaim } = await import('../../../src/server/sessions/claims-repo');
    expect(await insertClaim(1, 10, 2, fields)).toBeNull();
    expect(dbMocks.insert).not.toHaveBeenCalled();
  });

  it('returns null when roundId does not belong to session', async () => {
    const { insertClaim } = await import('../../../src/server/sessions/claims-repo');
    dbMocks.selectWhere.mockReturnValueOnce(makeSelectResult([{ id: 10 }])); // session owned
    // round check uses default → returns []
    expect(await insertClaim(1, 10, 99, fields)).toBeNull();
    expect(dbMocks.insert).not.toHaveBeenCalled();
  });

  it('inserts with status open when session and round are owned', async () => {
    const { insertClaim } = await import('../../../src/server/sessions/claims-repo');
    dbMocks.selectWhere.mockReturnValueOnce(makeSelectResult([{ id: 10 }])); // session
    dbMocks.selectWhere.mockReturnValueOnce(makeSelectResult([{ id: 2 }])); // round
    const result = await insertClaim(1, 10, 2, fields);
    expect(result).toBe(sampleClaim);
    const values = (dbMocks.insertValues.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(values.status).toBe('open');
    expect(values.sessionId).toBe(10);
    expect(values.roundId).toBe(2);
  });

  it('includes user-ownership predicate', async () => {
    const { insertClaim } = await import('../../../src/server/sessions/claims-repo');
    const { eq } = await import('drizzle-orm');
    const { sessions } = await import('../../../src/server/db/schema');
    dbMocks.selectWhere.mockReturnValueOnce(makeSelectResult([{ id: 10 }])); // session
    dbMocks.selectWhere.mockReturnValueOnce(makeSelectResult([{ id: 2 }])); // round
    await insertClaim(7, 10, 2, fields);
    const calls = (eq as ReturnType<typeof vi.fn>).mock.calls as [unknown, unknown][];
    expect(calls.some(([col, val]) => col === sessions.userId && val === 7)).toBe(true);
  });
});

describe('listSessionClaims', () => {
  it('returns empty array when session is not owned', async () => {
    const { listSessionClaims } = await import('../../../src/server/sessions/claims-repo');
    expect(await listSessionClaims(1, 10)).toEqual([]);
    expect(dbMocks.selectOrderBy).not.toHaveBeenCalled();
  });

  it('returns claims ordered by id when owned', async () => {
    const { listSessionClaims } = await import('../../../src/server/sessions/claims-repo');
    dbMocks.selectWhere.mockReturnValueOnce(makeSelectResult([{ id: 10 }]));
    dbMocks.selectOrderBy.mockReturnValueOnce(makeOrderResult([sampleClaim]));
    await listSessionClaims(1, 10);
    expect(dbMocks.selectOrderBy).toHaveBeenCalled();
  });

  it('includes user-ownership predicate', async () => {
    const { listSessionClaims } = await import('../../../src/server/sessions/claims-repo');
    const { eq } = await import('drizzle-orm');
    const { sessions } = await import('../../../src/server/db/schema');
    dbMocks.selectWhere.mockReturnValueOnce(makeSelectResult([{ id: 10 }]));
    await listSessionClaims(7, 10);
    const calls = (eq as ReturnType<typeof vi.fn>).mock.calls as [unknown, unknown][];
    expect(calls.some(([col, val]) => col === sessions.userId && val === 7)).toBe(true);
  });
});

describe('findClaimBySpanHash', () => {
  it('returns null when session is not owned', async () => {
    const { findClaimBySpanHash } = await import('../../../src/server/sessions/claims-repo');
    expect(await findClaimBySpanHash(1, 10, 'abc123')).toBeNull();
  });

  it('returns null when no claim found', async () => {
    const { findClaimBySpanHash } = await import('../../../src/server/sessions/claims-repo');
    dbMocks.selectWhere.mockReturnValueOnce(makeSelectResult([{ id: 10 }]));
    // selectLimit default resolves to []
    const result = await findClaimBySpanHash(1, 10, 'abc123');
    expect(result).toBeNull();
  });

  it('returns claim with verdict when found', async () => {
    const { findClaimBySpanHash } = await import('../../../src/server/sessions/claims-repo');
    dbMocks.selectWhere.mockReturnValueOnce(makeSelectResult([{ id: 10 }]));
    const row = { claim: sampleClaim, verdict: sampleVerdict };
    dbMocks.selectLimit.mockResolvedValueOnce([row]);
    const result = await findClaimBySpanHash(1, 10, 'abc123');
    expect(result).toBe(row);
  });

  it('uses leftJoin for verdict lookup', async () => {
    const { findClaimBySpanHash } = await import('../../../src/server/sessions/claims-repo');
    dbMocks.selectWhere.mockReturnValueOnce(makeSelectResult([{ id: 10 }]));
    await findClaimBySpanHash(1, 10, 'abc123');
    expect(dbMocks.selectLeftJoin).toHaveBeenCalled();
  });

  it('includes user-ownership predicate', async () => {
    const { findClaimBySpanHash } = await import('../../../src/server/sessions/claims-repo');
    const { eq } = await import('drizzle-orm');
    const { sessions } = await import('../../../src/server/db/schema');
    dbMocks.selectWhere.mockReturnValueOnce(makeSelectResult([{ id: 10 }]));
    await findClaimBySpanHash(7, 10, 'abc123');
    const calls = (eq as ReturnType<typeof vi.fn>).mock.calls as [unknown, unknown][];
    expect(calls.some(([col, val]) => col === sessions.userId && val === 7)).toBe(true);
  });
});

describe('setClaimStatus', () => {
  it('returns null when claim is not owned', async () => {
    const { setClaimStatus } = await import('../../../src/server/sessions/claims-repo');
    dbMocks.updateReturning.mockResolvedValue([]);
    expect(await setClaimStatus(1, 99, 'dismissed')).toBeNull();
  });

  it('returns updated row on success', async () => {
    const { setClaimStatus } = await import('../../../src/server/sessions/claims-repo');
    dbMocks.updateReturning.mockResolvedValue([{ ...sampleClaim, status: 'dismissed' }]);
    const result = await setClaimStatus(1, 1, 'dismissed');
    expect(result?.status).toBe('dismissed');
  });

  it('includes user-ownership predicate via inArray subquery', async () => {
    const { setClaimStatus } = await import('../../../src/server/sessions/claims-repo');
    const { eq } = await import('drizzle-orm');
    const { sessions } = await import('../../../src/server/db/schema');
    await setClaimStatus(7, 1, 'opinion');
    const calls = (eq as ReturnType<typeof vi.fn>).mock.calls as [unknown, unknown][];
    expect(calls.some(([col, val]) => col === sessions.userId && val === 7)).toBe(true);
  });
});

describe('insertClaimVerdict', () => {
  const fields = { verdict: 'verified' as const, justification: 'Source confirms claim.' };

  it('returns null when claim is not owned', async () => {
    const { insertClaimVerdict } = await import('../../../src/server/sessions/claims-repo');
    expect(await insertClaimVerdict(1, 1, fields)).toBeNull();
    expect(dbMocks.insert).not.toHaveBeenCalled();
  });

  it('inserts and returns row when owned', async () => {
    const { insertClaimVerdict } = await import('../../../src/server/sessions/claims-repo');
    dbMocks.insertReturning.mockResolvedValue([sampleVerdict]);
    // ownedSessionIds subquery call + actual ownership check
    dbMocks.selectWhere.mockReturnValueOnce(makeSelectResult([])); // subquery
    dbMocks.selectWhere.mockReturnValueOnce(makeSelectResult([{ id: 1 }])); // ownership
    const result = await insertClaimVerdict(1, 1, fields);
    expect(result).toBe(sampleVerdict);
    const values = (dbMocks.insertValues.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(values.claimId).toBe(1);
    expect(values.verdict).toBe('verified');
  });

  it('includes user-ownership predicate', async () => {
    const { insertClaimVerdict } = await import('../../../src/server/sessions/claims-repo');
    const { eq } = await import('drizzle-orm');
    const { sessions } = await import('../../../src/server/db/schema');
    dbMocks.selectWhere.mockReturnValueOnce(makeSelectResult([]));
    dbMocks.selectWhere.mockReturnValueOnce(makeSelectResult([{ id: 1 }]));
    await insertClaimVerdict(7, 1, fields);
    const calls = (eq as ReturnType<typeof vi.fn>).mock.calls as [unknown, unknown][];
    expect(calls.some(([col, val]) => col === sessions.userId && val === 7)).toBe(true);
  });
});

describe('insertClaimEvidence', () => {
  const items = [{ sourceId: null, url: 'https://example.com', snippet: 'GDP grew...', supports: true }];

  it('returns empty array when verdict is not owned', async () => {
    const { insertClaimEvidence } = await import('../../../src/server/sessions/claims-repo');
    expect(await insertClaimEvidence(1, 3, items)).toEqual([]);
    expect(dbMocks.insert).not.toHaveBeenCalled();
  });

  it('returns empty array when items is empty even if owned', async () => {
    const { insertClaimEvidence } = await import('../../../src/server/sessions/claims-repo');
    // ownedSessionIds subquery + innerJoin ownership check
    dbMocks.selectWhere.mockReturnValueOnce(makeSelectResult([])); // subquery
    dbMocks.selectWhere.mockReturnValueOnce(makeSelectResult([{ id: 3 }])); // ownership via innerJoin
    expect(await insertClaimEvidence(1, 3, [])).toEqual([]);
    expect(dbMocks.insert).not.toHaveBeenCalled();
  });

  it('inserts and returns rows when owned', async () => {
    const { insertClaimEvidence } = await import('../../../src/server/sessions/claims-repo');
    dbMocks.insertReturning.mockResolvedValue([sampleEvidence]);
    dbMocks.selectWhere.mockReturnValueOnce(makeSelectResult([])); // subquery
    dbMocks.selectWhere.mockReturnValueOnce(makeSelectResult([{ id: 3 }])); // ownership
    const result = await insertClaimEvidence(1, 3, items);
    expect(result).toEqual([sampleEvidence]);
    const insertedValues = (dbMocks.insertValues.mock.calls[0] as unknown[])[0] as unknown[];
    expect(insertedValues[0]).toMatchObject({ verdictId: 3, url: 'https://example.com' });
  });

  it('includes user-ownership predicate', async () => {
    const { insertClaimEvidence } = await import('../../../src/server/sessions/claims-repo');
    const { eq } = await import('drizzle-orm');
    const { sessions } = await import('../../../src/server/db/schema');
    dbMocks.selectWhere.mockReturnValueOnce(makeSelectResult([]));
    dbMocks.selectWhere.mockReturnValueOnce(makeSelectResult([{ id: 3 }]));
    await insertClaimEvidence(7, 3, items);
    const calls = (eq as ReturnType<typeof vi.fn>).mock.calls as [unknown, unknown][];
    expect(calls.some(([col, val]) => col === sessions.userId && val === 7)).toBe(true);
  });
});

describe('listClaimVerdicts', () => {
  it('returns empty array when claim is not owned', async () => {
    const { listClaimVerdicts } = await import('../../../src/server/sessions/claims-repo');
    expect(await listClaimVerdicts(1, 1)).toEqual([]);
  });

  it('returns empty array when no verdicts exist', async () => {
    const { listClaimVerdicts } = await import('../../../src/server/sessions/claims-repo');
    // ownedSessionIds subquery + ownership check
    dbMocks.selectWhere.mockReturnValueOnce(makeSelectResult([])); // subquery
    dbMocks.selectWhere.mockReturnValueOnce(makeSelectResult([{ id: 1 }])); // ownership
    // verdicts query returns [] (default)
    expect(await listClaimVerdicts(1, 1)).toEqual([]);
  });

  it('returns verdicts with inlined evidence', async () => {
    const { listClaimVerdicts } = await import('../../../src/server/sessions/claims-repo');
    dbMocks.selectWhere.mockReturnValueOnce(makeSelectResult([])); // subquery
    dbMocks.selectWhere.mockReturnValueOnce(makeSelectResult([{ id: 1 }])); // ownership
    dbMocks.selectOrderBy.mockReturnValueOnce(makeOrderResult([sampleVerdict])); // verdicts
    dbMocks.selectOrderBy.mockReturnValueOnce(makeOrderResult([sampleEvidence])); // evidence
    const result = await listClaimVerdicts(1, 1);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ ...sampleVerdict, evidence: [sampleEvidence] });
  });

  it('includes user-ownership predicate', async () => {
    const { listClaimVerdicts } = await import('../../../src/server/sessions/claims-repo');
    const { eq } = await import('drizzle-orm');
    const { sessions } = await import('../../../src/server/db/schema');
    dbMocks.selectWhere.mockReturnValueOnce(makeSelectResult([]));
    dbMocks.selectWhere.mockReturnValueOnce(makeSelectResult([{ id: 1 }]));
    await listClaimVerdicts(7, 1);
    const calls = (eq as ReturnType<typeof vi.fn>).mock.calls as [unknown, unknown][];
    expect(calls.some(([col, val]) => col === sessions.userId && val === 7)).toBe(true);
  });
});

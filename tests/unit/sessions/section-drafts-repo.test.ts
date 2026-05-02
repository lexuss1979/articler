import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => {
  const selectOrderBy = vi.fn();
  const selectWhere = vi.fn();
  const selectFrom = vi.fn();
  const select = vi.fn();
  const insertReturning = vi.fn();
  const insertOnConflict = vi.fn();
  const insertValues = vi.fn();
  const insert = vi.fn();
  return {
    selectOrderBy,
    selectWhere,
    selectFrom,
    select,
    insertReturning,
    insertOnConflict,
    insertValues,
    insert,
  };
});

vi.mock('../../../src/server/db/client', () => ({
  db: {
    select: dbMocks.select,
    insert: dbMocks.insert,
  },
}));

vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm')>();
  return {
    ...actual,
    eq: vi.fn(actual.eq),
    and: vi.fn(actual.and),
    asc: vi.fn(actual.asc),
    sql: actual.sql,
  };
});

const sampleRow = {
  id: 1,
  sessionId: 10,
  sectionId: 'intro',
  contentMd: '# Hello',
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeSelectResult(values: unknown[]) {
  return Object.assign(Promise.resolve(values), {
    orderBy: dbMocks.selectOrderBy,
    where: dbMocks.selectWhere,
  });
}

function setupMocks() {
  dbMocks.selectOrderBy.mockResolvedValue([sampleRow]);
  dbMocks.selectWhere.mockReturnValue(makeSelectResult([]));
  dbMocks.selectFrom.mockReturnValue({ where: dbMocks.selectWhere, orderBy: dbMocks.selectOrderBy });
  dbMocks.select.mockReturnValue({ from: dbMocks.selectFrom });

  dbMocks.insertReturning.mockResolvedValue([sampleRow]);
  dbMocks.insertOnConflict.mockReturnValue({ returning: dbMocks.insertReturning });
  dbMocks.insertValues.mockReturnValue({ onConflictDoUpdate: dbMocks.insertOnConflict });
  dbMocks.insert.mockReturnValue({ values: dbMocks.insertValues });
}

beforeEach(setupMocks);
afterEach(() => vi.clearAllMocks());

describe('upsertSectionDraft', () => {
  it('returns null when session is not owned', async () => {
    const { upsertSectionDraft } = await import(
      '../../../src/server/sessions/section-drafts-repo'
    );
    const result = await upsertSectionDraft(1, 10, 'intro', '# Hello');
    expect(result).toBeNull();
    expect(dbMocks.insert).not.toHaveBeenCalled();
  });

  it('returns row on success when session is owned', async () => {
    const { upsertSectionDraft } = await import(
      '../../../src/server/sessions/section-drafts-repo'
    );
    dbMocks.selectWhere.mockReturnValueOnce(makeSelectResult([{ id: 10 }]));
    const result = await upsertSectionDraft(1, 10, 'intro', '# Hello');
    expect(result).toBe(sampleRow);
    expect(dbMocks.insertOnConflict).toHaveBeenCalled();
  });

  it('includes user-ownership predicate in session check', async () => {
    const { upsertSectionDraft } = await import(
      '../../../src/server/sessions/section-drafts-repo'
    );
    const { eq } = await import('drizzle-orm');
    const { sessions } = await import('../../../src/server/db/schema');
    dbMocks.selectWhere.mockReturnValueOnce(makeSelectResult([{ id: 10 }]));
    await upsertSectionDraft(7, 10, 'intro', '# Hello');
    const calls = (eq as ReturnType<typeof vi.fn>).mock.calls as [unknown, unknown][];
    expect(calls.some(([col, val]) => col === sessions.userId && val === 7)).toBe(true);
  });
});

describe('listSectionDrafts', () => {
  it('returns empty array when session is not owned', async () => {
    const { listSectionDrafts } = await import(
      '../../../src/server/sessions/section-drafts-repo'
    );
    expect(await listSectionDrafts(1, 10)).toEqual([]);
    expect(dbMocks.selectOrderBy).not.toHaveBeenCalled();
  });

  it('returns rows ordered by id on owned session', async () => {
    const { listSectionDrafts } = await import(
      '../../../src/server/sessions/section-drafts-repo'
    );
    dbMocks.selectWhere.mockReturnValueOnce(makeSelectResult([{ id: 10 }]));
    dbMocks.selectOrderBy.mockResolvedValue([sampleRow]);
    await listSectionDrafts(1, 10);
    expect(dbMocks.selectOrderBy).toHaveBeenCalled();
  });

  it('includes user-ownership predicate', async () => {
    const { listSectionDrafts } = await import(
      '../../../src/server/sessions/section-drafts-repo'
    );
    const { eq } = await import('drizzle-orm');
    const { sessions } = await import('../../../src/server/db/schema');
    dbMocks.selectWhere.mockReturnValueOnce(makeSelectResult([{ id: 10 }]));
    await listSectionDrafts(7, 10);
    const calls = (eq as ReturnType<typeof vi.fn>).mock.calls as [unknown, unknown][];
    expect(calls.some(([col, val]) => col === sessions.userId && val === 7)).toBe(true);
  });
});

describe('getSectionDraft', () => {
  it('returns null when session is not owned', async () => {
    const { getSectionDraft } = await import('../../../src/server/sessions/section-drafts-repo');
    expect(await getSectionDraft(1, 10, 'intro')).toBeNull();
  });

  it('returns row when found on owned session', async () => {
    const { getSectionDraft } = await import('../../../src/server/sessions/section-drafts-repo');
    dbMocks.selectWhere.mockReturnValueOnce(makeSelectResult([{ id: 10 }]));
    dbMocks.selectWhere.mockReturnValueOnce(makeSelectResult([sampleRow]));
    const result = await getSectionDraft(1, 10, 'intro');
    expect(result).toBe(sampleRow);
  });

  it('returns null when row not found on owned session', async () => {
    const { getSectionDraft } = await import('../../../src/server/sessions/section-drafts-repo');
    dbMocks.selectWhere.mockReturnValueOnce(makeSelectResult([{ id: 10 }]));
    dbMocks.selectWhere.mockReturnValueOnce(makeSelectResult([]));
    const result = await getSectionDraft(1, 10, 'missing');
    expect(result).toBeNull();
  });

  it('includes user-ownership predicate', async () => {
    const { getSectionDraft } = await import('../../../src/server/sessions/section-drafts-repo');
    const { eq } = await import('drizzle-orm');
    const { sessions } = await import('../../../src/server/db/schema');
    dbMocks.selectWhere.mockReturnValueOnce(makeSelectResult([{ id: 10 }]));
    dbMocks.selectWhere.mockReturnValueOnce(makeSelectResult([sampleRow]));
    await getSectionDraft(7, 10, 'intro');
    const calls = (eq as ReturnType<typeof vi.fn>).mock.calls as [unknown, unknown][];
    expect(calls.some(([col, val]) => col === sessions.userId && val === 7)).toBe(true);
  });
});

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

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
  const deleteWhere = vi.fn();
  const deleteFn = vi.fn();
  return { selectWhere, selectFrom, select, insertReturning, insertValues, insert, updateReturning, updateWhere, updateSet, update, deleteWhere, deleteFn };
});

vi.mock('../../../src/server/db/client', () => ({
  db: {
    select: dbMocks.select,
    insert: dbMocks.insert,
    update: dbMocks.update,
    delete: dbMocks.deleteFn,
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
  dbMocks.deleteWhere.mockResolvedValue([]);
  dbMocks.deleteFn.mockReturnValue({ where: dbMocks.deleteWhere });
}

beforeEach(setupMocks);
afterEach(() => vi.clearAllMocks());

const validInput = {
  name: 'My Profile',
  format: 'long_read' as const,
  style: 'Conversational',
  audience: 'General readers',
  targetVolumeMin: 800,
  targetVolumeMax: 1200,
  markupRules: { flavor: 'standard' as const, headingShift: 0 },
  extraPrompt: '',
};

describe('listProfiles', () => {
  it('includes user_id predicate in where clause', async () => {
    const { listProfiles } = await import('../../../src/server/profiles/repo');
    const { eq } = await import('drizzle-orm');
    const { profiles } = await import('../../../src/server/db/schema');

    await listProfiles(7);

    const calls = (eq as ReturnType<typeof vi.fn>).mock.calls as [unknown, unknown][];
    expect(calls.some(([col, val]) => col === profiles.userId && val === 7)).toBe(true);
  });
});

describe('getProfile', () => {
  it('includes both id and user_id predicates', async () => {
    const { getProfile } = await import('../../../src/server/profiles/repo');
    const { eq } = await import('drizzle-orm');
    const { profiles } = await import('../../../src/server/db/schema');

    await getProfile(7, 42);

    const calls = (eq as ReturnType<typeof vi.fn>).mock.calls as [unknown, unknown][];
    expect(calls.some(([col, val]) => col === profiles.userId && val === 7)).toBe(true);
    expect(calls.some(([col, val]) => col === profiles.id && val === 42)).toBe(true);
  });

  it('returns null when no row found', async () => {
    const { getProfile } = await import('../../../src/server/profiles/repo');
    dbMocks.selectWhere.mockResolvedValue([]);
    const result = await getProfile(7, 42);
    expect(result).toBeNull();
  });

  it('returns the first row when found', async () => {
    const { getProfile } = await import('../../../src/server/profiles/repo');
    const row = { id: 42, userId: 7, name: 'x' };
    dbMocks.selectWhere.mockResolvedValue([row]);
    const result = await getProfile(7, 42);
    expect(result).toBe(row);
  });
});

describe('createProfile', () => {
  it('binds userId from argument, not from input', async () => {
    const { createProfile } = await import('../../../src/server/profiles/repo');

    await createProfile(1, { ...validInput, userId: 999 } as never);

    const valuesSpy = dbMocks.insertValues as ReturnType<typeof vi.fn>;
    const row = (valuesSpy.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(row.userId).toBe(1);
  });

  it('passes all input fields to insert', async () => {
    const { createProfile } = await import('../../../src/server/profiles/repo');

    await createProfile(5, validInput);

    const valuesSpy = dbMocks.insertValues as ReturnType<typeof vi.fn>;
    const row = (valuesSpy.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(row.name).toBe('My Profile');
    expect(row.userId).toBe(5);
  });
});

describe('updateProfile', () => {
  it('includes user_id and id predicates in where clause', async () => {
    const { updateProfile } = await import('../../../src/server/profiles/repo');
    const { eq } = await import('drizzle-orm');
    const { profiles } = await import('../../../src/server/db/schema');

    await updateProfile(7, 42, validInput);

    const calls = (eq as ReturnType<typeof vi.fn>).mock.calls as [unknown, unknown][];
    expect(calls.some(([col, val]) => col === profiles.userId && val === 7)).toBe(true);
    expect(calls.some(([col, val]) => col === profiles.id && val === 42)).toBe(true);
  });

  it('returns null when no row matched', async () => {
    const { updateProfile } = await import('../../../src/server/profiles/repo');
    dbMocks.updateReturning.mockResolvedValue([]);
    const result = await updateProfile(7, 42, validInput);
    expect(result).toBeNull();
  });
});

describe('deleteProfile', () => {
  it('includes user_id and id predicates in where clause', async () => {
    const { deleteProfile } = await import('../../../src/server/profiles/repo');
    const { eq } = await import('drizzle-orm');
    const { profiles } = await import('../../../src/server/db/schema');

    await deleteProfile(7, 42);

    const calls = (eq as ReturnType<typeof vi.fn>).mock.calls as [unknown, unknown][];
    expect(calls.some(([col, val]) => col === profiles.userId && val === 7)).toBe(true);
    expect(calls.some(([col, val]) => col === profiles.id && val === 42)).toBe(true);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => {
  const selectWhere = vi.fn();
  const selectFrom = vi.fn();
  const select = vi.fn();
  const insertOnConflict = vi.fn();
  const insertValues = vi.fn();
  const insert = vi.fn();
  return { selectWhere, selectFrom, select, insertOnConflict, insertValues, insert };
});

vi.mock('../../../src/server/db/client', () => ({
  db: {
    select: dbMocks.select,
    insert: dbMocks.insert,
  },
}));

function setupMocks() {
  dbMocks.selectWhere.mockResolvedValue([]);
  dbMocks.selectFrom.mockReturnValue({ where: dbMocks.selectWhere });
  dbMocks.select.mockReturnValue({ from: dbMocks.selectFrom });

  dbMocks.insertOnConflict.mockResolvedValue(undefined);
  dbMocks.insertValues.mockReturnValue({ onConflictDoUpdate: dbMocks.insertOnConflict });
  dbMocks.insert.mockReturnValue({ values: dbMocks.insertValues });
}

beforeEach(setupMocks);
afterEach(() => vi.clearAllMocks());

describe('getUserSettings', () => {
  it('returns empty defaults when no row exists', async () => {
    dbMocks.selectWhere.mockResolvedValue([]);
    const { getUserSettings } = await import('../../../src/server/settings/budget');

    const result = await getUserSettings(1);

    expect(result).toEqual({ monthlyCapUsd: null, sessionCapUsd: null });
  });

  it('parses numeric strings into numbers', async () => {
    dbMocks.selectWhere.mockResolvedValue([
      { monthlyCapUsd: '12.500000', sessionCapUsd: '0.750000' },
    ]);
    const { getUserSettings } = await import('../../../src/server/settings/budget');

    const result = await getUserSettings(1);

    expect(result.monthlyCapUsd).toBeCloseTo(12.5, 6);
    expect(result.sessionCapUsd).toBeCloseTo(0.75, 6);
  });

  it('passes null caps through unchanged', async () => {
    dbMocks.selectWhere.mockResolvedValue([
      { monthlyCapUsd: '5.000000', sessionCapUsd: null },
    ]);
    const { getUserSettings } = await import('../../../src/server/settings/budget');

    const result = await getUserSettings(1);

    expect(result.monthlyCapUsd).toBeCloseTo(5, 6);
    expect(result.sessionCapUsd).toBeNull();
  });
});

describe('upsertUserSettings', () => {
  it('writes both caps as strings on insert and on conflict update', async () => {
    const { upsertUserSettings } = await import('../../../src/server/settings/budget');

    await upsertUserSettings(7, { monthlyCapUsd: 100, sessionCapUsd: 1.5 });

    const insertedRow = (dbMocks.insertValues.mock.calls[0] as unknown[])[0] as Record<
      string,
      unknown
    >;
    expect(insertedRow).toMatchObject({
      userId: 7,
      monthlyCapUsd: '100',
      sessionCapUsd: '1.5',
    });

    const conflictArg = (dbMocks.insertOnConflict.mock.calls[0] as unknown[])[0] as {
      set: Record<string, unknown>;
    };
    expect(conflictArg.set.monthlyCapUsd).toBe('100');
    expect(conflictArg.set.sessionCapUsd).toBe('1.5');
  });

  it('passes explicit nulls through to clear caps', async () => {
    const { upsertUserSettings } = await import('../../../src/server/settings/budget');

    await upsertUserSettings(7, { monthlyCapUsd: null, sessionCapUsd: null });

    const insertedRow = (dbMocks.insertValues.mock.calls[0] as unknown[])[0] as Record<
      string,
      unknown
    >;
    expect(insertedRow.monthlyCapUsd).toBeNull();
    expect(insertedRow.sessionCapUsd).toBeNull();

    const conflictArg = (dbMocks.insertOnConflict.mock.calls[0] as unknown[])[0] as {
      set: Record<string, unknown>;
    };
    expect(conflictArg.set.monthlyCapUsd).toBeNull();
    expect(conflictArg.set.sessionCapUsd).toBeNull();
  });

  it('round-trips one null and one numeric value independently', async () => {
    const { upsertUserSettings } = await import('../../../src/server/settings/budget');

    await upsertUserSettings(7, { monthlyCapUsd: 50, sessionCapUsd: null });

    const insertedRow = (dbMocks.insertValues.mock.calls[0] as unknown[])[0] as Record<
      string,
      unknown
    >;
    expect(insertedRow.monthlyCapUsd).toBe('50');
    expect(insertedRow.sessionCapUsd).toBeNull();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => {
  const queries: Array<unknown[]> = [];
  function makeQuery(rows: unknown[]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q: any = { __rows: rows };
    q.from = () => q;
    q.innerJoin = () => q;
    q.where = () => q;
    q.orderBy = () => q;
    q.limit = () => Promise.resolve(q.__rows);
    q.then = (resolve: (v: unknown) => unknown) => resolve(q.__rows);
    return q;
  }
  return {
    queries,
    select: vi.fn(),
    makeQuery,
  };
});

vi.mock('../../../src/server/db/client', () => ({
  db: { select: dbMocks.select },
}));

vi.mock('../../../src/server/logging/aggregate', () => ({
  getUserCost: vi.fn(),
}));

vi.mock('../../../src/server/settings/budget', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/server/settings/budget')>();
  return { ...actual, getUserSettings: vi.fn() };
});

beforeEach(() => {
  dbMocks.queries.length = 0;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('loadDashboardData', () => {
  it('returns parallel results assembled into the expected shape', async () => {
    const updatedAt = new Date('2026-05-01T00:00:00Z');
    const activeRows = [
      {
        id: 10,
        state: 'planning',
        mode: 'new',
        brief: { topic: 'A' },
        updatedAt,
        profileName: 'Habr',
      },
    ];
    const doneRows = [
      { id: 5, brief: { topic: 'B' }, updatedAt, profileName: 'Medium' },
    ];
    const profileRows = [{ id: 1, name: 'Habr', format: 'long_read' }];
    const allSessions = [
      {
        id: 7,
        images: {
          slots: [
            {
              id: 's_hero_1',
              kind: 'hero',
              brief: 'b',
              mode: 'generate',
              chosenCandidateId: 'c1',
              candidates: [
                {
                  id: 'c1',
                  source: 'generated',
                  localPath: 's_hero_1/c1.png',
                  model: 'nb',
                  createdAt: '2026-05-01T10:00:00Z',
                },
                {
                  id: 'c2',
                  source: 'generated',
                  localPath: 's_hero_1/c2.png',
                  createdAt: '2026-05-01T11:00:00Z',
                },
              ],
            },
            {
              // skipped: no chosenCandidateId
              id: 's_in_1',
              kind: 'inline',
              sectionId: 's',
              paragraphIndex: 0,
              brief: 'b',
              mode: 'generate',
              candidates: [],
            },
          ],
        },
      },
      {
        id: 8,
        images: {
          slots: [
            {
              id: 's_hero_2',
              kind: 'hero',
              brief: 'b',
              mode: 'generate',
              chosenCandidateId: 'c3',
              candidates: [
                {
                  id: 'c3',
                  source: 'generated',
                  localPath: 's_hero_2/c3.png',
                  createdAt: '2026-05-02T09:00:00Z',
                },
              ],
            },
          ],
        },
      },
    ];

    const calls: Array<unknown[]> = [activeRows, doneRows, profileRows, allSessions];
    let callIdx = 0;
    dbMocks.select.mockImplementation(() => {
      const rows = calls[callIdx++];
      return dbMocks.makeQuery(rows!);
    });

    const aggregate = await import('../../../src/server/logging/aggregate');
    vi.mocked(aggregate.getUserCost).mockResolvedValue(12.34);

    const settingsMod = await import('../../../src/server/settings/budget');
    vi.mocked(settingsMod.getUserSettings).mockResolvedValue({
      monthlyCapUsd: 50,
      sessionCapUsd: 1.5,
    });

    const { loadDashboardData } = await import('../../../src/server/dashboard/data');
    const data = await loadDashboardData(99);

    expect(data.active).toHaveLength(1);
    expect(data.active[0]!.briefTopic).toBe('A');
    expect(data.active[0]!.profileName).toBe('Habr');

    expect(data.done).toHaveLength(1);
    expect(data.done[0]!.briefTopic).toBe('B');

    expect(data.profiles).toEqual(profileRows);

    expect(data.images).toHaveLength(2);
    expect(data.images[0]!.localPath).toBe('s_hero_2/c3.png');
    expect(data.images[1]!.localPath).toBe('s_hero_1/c1.png');

    expect(data.spend.lifetime).toBe(12.34);
    expect(data.settings).toEqual({ monthlyCapUsd: 50, sessionCapUsd: 1.5 });
  });

  it('returns empty arrays and zero spend when the user has no rows', async () => {
    const calls: Array<unknown[]> = [[], [], [], []];
    let callIdx = 0;
    dbMocks.select.mockImplementation(() => {
      const rows = calls[callIdx++];
      return dbMocks.makeQuery(rows!);
    });

    const aggregate = await import('../../../src/server/logging/aggregate');
    vi.mocked(aggregate.getUserCost).mockResolvedValue(0);
    const settingsMod = await import('../../../src/server/settings/budget');
    vi.mocked(settingsMod.getUserSettings).mockResolvedValue({
      monthlyCapUsd: null,
      sessionCapUsd: null,
    });

    const { loadDashboardData } = await import('../../../src/server/dashboard/data');
    const data = await loadDashboardData(99);

    expect(data.active).toEqual([]);
    expect(data.done).toEqual([]);
    expect(data.profiles).toEqual([]);
    expect(data.images).toEqual([]);
    expect(data.spend.lifetime).toBe(0);
  });

  it('skips slots without a chosenCandidateId or with mismatched candidate ids', async () => {
    const allSessions = [
      {
        id: 1,
        images: {
          slots: [
            { id: 'a', kind: 'hero', brief: 'x', mode: 'undecided', candidates: [] },
            {
              id: 'b',
              kind: 'hero',
              brief: 'x',
              mode: 'generate',
              chosenCandidateId: 'missing',
              candidates: [
                {
                  id: 'real',
                  source: 'generated',
                  localPath: 'real.png',
                  createdAt: '2026-01-01',
                },
              ],
            },
          ],
        },
      },
    ];
    const calls: Array<unknown[]> = [[], [], [], allSessions];
    let callIdx = 0;
    dbMocks.select.mockImplementation(() => {
      const rows = calls[callIdx++];
      return dbMocks.makeQuery(rows!);
    });

    const aggregate = await import('../../../src/server/logging/aggregate');
    vi.mocked(aggregate.getUserCost).mockResolvedValue(0);
    const settingsMod = await import('../../../src/server/settings/budget');
    vi.mocked(settingsMod.getUserSettings).mockResolvedValue({
      monthlyCapUsd: null,
      sessionCapUsd: null,
    });

    const { loadDashboardData } = await import('../../../src/server/dashboard/data');
    const data = await loadDashboardData(1);

    expect(data.images).toEqual([]);
  });
});

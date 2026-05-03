import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => {
  const selectWhere = vi.fn();
  const selectFrom = vi.fn();
  const select = vi.fn();
  const updateReturning = vi.fn();
  const updateWhere = vi.fn();
  const updateSet = vi.fn();
  const update = vi.fn();
  return { selectWhere, selectFrom, select, updateReturning, updateWhere, updateSet, update };
});

vi.mock('../../../src/server/db/client', () => ({
  db: {
    select: dbMocks.select,
    update: dbMocks.update,
  },
}));

vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm')>();
  return { ...actual, eq: vi.fn(actual.eq), and: vi.fn(actual.and) };
});

const baseSession = {
  id: 10,
  userId: 1,
  profileId: 2,
  mode: 'new',
  state: 'decoration',
  brief: null,
  plan: null,
  draftMd: 'draft',
  revisedDraftMd: null,
  revisionStatus: null,
  activeCritics: null,
  decoration: null as unknown,
  images: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function setupMocks(sessionRow: unknown, updateRows: unknown[] = [{ id: 10 }]) {
  dbMocks.selectWhere.mockResolvedValue(sessionRow ? [sessionRow] : []);
  dbMocks.selectFrom.mockReturnValue({ where: dbMocks.selectWhere });
  dbMocks.select.mockReturnValue({ from: dbMocks.selectFrom });

  dbMocks.updateReturning.mockResolvedValue(updateRows);
  dbMocks.updateWhere.mockReturnValue({ returning: dbMocks.updateReturning });
  dbMocks.updateSet.mockReturnValue({ where: dbMocks.updateWhere });
  dbMocks.update.mockReturnValue({ set: dbMocks.updateSet });
}

beforeEach(() => setupMocks(baseSession));
afterEach(() => vi.clearAllMocks());

describe('getDecorationState', () => {
  it('returns { rounds: [] } for foreign / missing session', async () => {
    setupMocks(null);
    const { getDecorationState } = await import('../../../src/server/sessions/decoration-repo');
    expect(await getDecorationState(1, 10)).toEqual({ rounds: [] });
  });

  it('parses persisted state', async () => {
    const round = {
      id: 'r_1',
      draftHash: 'h',
      createdAt: '2026-05-03T10:00:00.000Z',
      suggestions: [],
    };
    setupMocks({ ...baseSession, decoration: { rounds: [round] } });
    const { getDecorationState } = await import('../../../src/server/sessions/decoration-repo');
    expect(await getDecorationState(1, 10)).toEqual({ rounds: [round] });
  });

  it('falls back to empty rounds on malformed JSON', async () => {
    setupMocks({ ...baseSession, decoration: { rounds: 'broken' } });
    const { getDecorationState } = await import('../../../src/server/sessions/decoration-repo');
    expect(await getDecorationState(1, 10)).toEqual({ rounds: [] });
  });
});

describe('appendDecorationRound', () => {
  const newRoundInput = {
    draftHash: 'hash1',
    suggestions: [
      {
        kind: 'pull_quote' as const,
        sectionId: 'intro',
        paragraphIndex: 0,
        contentMd: 'Quote A',
        rationale: 'Hook',
      },
      {
        kind: 'callout' as const,
        sectionId: 'body',
        paragraphIndex: 1,
        contentMd: 'Note B',
        rationale: 'Emphasis',
      },
    ],
  };

  it('returns null for foreign session', async () => {
    setupMocks(null);
    const { appendDecorationRound } = await import('../../../src/server/sessions/decoration-repo');
    expect(await appendDecorationRound(1, 10, newRoundInput)).toBeNull();
    expect(dbMocks.update).not.toHaveBeenCalled();
  });

  it('returns null when update affected zero rows', async () => {
    setupMocks(baseSession, []);
    const { appendDecorationRound } = await import('../../../src/server/sessions/decoration-repo');
    expect(await appendDecorationRound(1, 10, newRoundInput)).toBeNull();
  });

  it('assigns deterministic per-index suggestion ids', async () => {
    setupMocks(baseSession);
    const { appendDecorationRound } = await import('../../../src/server/sessions/decoration-repo');
    const round = await appendDecorationRound(1, 10, newRoundInput);
    expect(round).not.toBeNull();
    expect(round!.suggestions).toHaveLength(2);
    expect(round!.suggestions[0].id).toBe('s_' + round!.id + '_0');
    expect(round!.suggestions[1].id).toBe('s_' + round!.id + '_1');
    expect(round!.suggestions.every((s) => s.status === 'proposed')).toBe(true);
  });

  it('persists previous rounds plus the new one', async () => {
    const prev = {
      id: 'r_old',
      draftHash: 'old',
      createdAt: '2026-05-01T00:00:00.000Z',
      suggestions: [],
    };
    setupMocks({ ...baseSession, decoration: { rounds: [prev] } });
    const { appendDecorationRound } = await import('../../../src/server/sessions/decoration-repo');
    const round = await appendDecorationRound(1, 10, newRoundInput);
    expect(round).not.toBeNull();
    const setCall = dbMocks.updateSet.mock.calls[0]?.[0] as { decoration: { rounds: unknown[] } };
    expect(setCall.decoration.rounds).toHaveLength(2);
    expect((setCall.decoration.rounds[0] as { id: string }).id).toBe('r_old');
    expect((setCall.decoration.rounds[1] as { id: string }).id).toBe(round!.id);
  });
});

describe('setSuggestionStatus', () => {
  const seededRound = {
    id: 'r_1',
    draftHash: 'h',
    createdAt: '2026-05-03T10:00:00.000Z',
    suggestions: [
      {
        id: 's_r_1_0',
        kind: 'pull_quote',
        sectionId: 'intro',
        paragraphIndex: 0,
        contentMd: 'Quote',
        rationale: 'Hook',
        status: 'proposed',
      },
    ],
  };

  it('returns null for foreign session', async () => {
    setupMocks(null);
    const { setSuggestionStatus } = await import(
      '../../../src/server/sessions/decoration-repo'
    );
    expect(await setSuggestionStatus(1, 10, 's_r_1_0', 'accepted')).toBeNull();
    expect(dbMocks.update).not.toHaveBeenCalled();
  });

  it('returns null for unknown suggestion id', async () => {
    setupMocks({ ...baseSession, decoration: { rounds: [seededRound] } });
    const { setSuggestionStatus } = await import(
      '../../../src/server/sessions/decoration-repo'
    );
    expect(await setSuggestionStatus(1, 10, 's_missing', 'accepted')).toBeNull();
    expect(dbMocks.update).not.toHaveBeenCalled();
  });

  it('flips matching suggestion status and persists state', async () => {
    setupMocks({ ...baseSession, decoration: { rounds: [seededRound] } });
    const { setSuggestionStatus } = await import(
      '../../../src/server/sessions/decoration-repo'
    );
    const updated = await setSuggestionStatus(1, 10, 's_r_1_0', 'rejected');
    expect(updated?.status).toBe('rejected');
    const setCall = dbMocks.updateSet.mock.calls[0]?.[0] as {
      decoration: { rounds: Array<{ suggestions: Array<{ status: string }> }> };
    };
    expect(setCall.decoration.rounds[0].suggestions[0].status).toBe('rejected');
  });

  it('returns null when update affected zero rows', async () => {
    setupMocks({ ...baseSession, decoration: { rounds: [seededRound] } }, []);
    const { setSuggestionStatus } = await import(
      '../../../src/server/sessions/decoration-repo'
    );
    expect(await setSuggestionStatus(1, 10, 's_r_1_0', 'accepted')).toBeNull();
  });
});

describe('findSuggestion', () => {
  const seededRound = {
    id: 'r_1',
    draftHash: 'h',
    createdAt: '2026-05-03T10:00:00.000Z',
    suggestions: [
      {
        id: 's_r_1_0',
        kind: 'callout',
        sectionId: 'intro',
        paragraphIndex: 0,
        contentMd: 'Note',
        rationale: 'Why',
        status: 'proposed',
      },
    ],
  };

  it('returns null for foreign session', async () => {
    setupMocks(null);
    const { findSuggestion } = await import('../../../src/server/sessions/decoration-repo');
    expect(await findSuggestion(1, 10, 's_r_1_0')).toBeNull();
  });

  it('returns matching round + suggestion', async () => {
    setupMocks({ ...baseSession, decoration: { rounds: [seededRound] } });
    const { findSuggestion } = await import('../../../src/server/sessions/decoration-repo');
    const result = await findSuggestion(1, 10, 's_r_1_0');
    expect(result?.round.id).toBe('r_1');
    expect(result?.suggestion.id).toBe('s_r_1_0');
  });

  it('returns null when id is missing', async () => {
    setupMocks({ ...baseSession, decoration: { rounds: [seededRound] } });
    const { findSuggestion } = await import('../../../src/server/sessions/decoration-repo');
    expect(await findSuggestion(1, 10, 's_missing')).toBeNull();
  });
});

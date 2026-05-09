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
  state: 'illustration',
  brief: null,
  plan: null,
  draftMd: 'draft',
  revisedDraftMd: null,
  revisionStatus: null,
  activeCritics: null,
  decoration: null,
  images: null as unknown,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const heroSlot = {
  id: 'slot_hero',
  kind: 'hero' as const,
  brief: 'Hero shot',
  mode: 'undecided' as const,
  candidates: [],
};

const inlineSlot = {
  id: 'slot_a',
  kind: 'inline' as const,
  sectionId: 'intro',
  paragraphIndex: 0,
  brief: 'Diagram',
  mode: 'undecided' as const,
  candidates: [],
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

describe('getImageState', () => {
  it('returns { slots: [] } for foreign / missing session', async () => {
    setupMocks(null);
    const { getImageState } = await import('../../../src/server/sessions/images-repo');
    expect(await getImageState(1, 10)).toEqual({ slots: [] });
  });
  it('parses persisted state', async () => {
    setupMocks({ ...baseSession, images: { slots: [heroSlot] } });
    const { getImageState } = await import('../../../src/server/sessions/images-repo');
    const state = await getImageState(1, 10);
    expect(state.slots).toHaveLength(1);
    expect(state.slots[0]!.id).toBe('slot_hero');
  });
  it('falls back to empty slots on malformed JSON', async () => {
    setupMocks({ ...baseSession, images: { slots: 'broken' } });
    const { getImageState } = await import('../../../src/server/sessions/images-repo');
    expect(await getImageState(1, 10)).toEqual({ slots: [] });
  });
});

describe('setImageSlots', () => {
  it('returns null when update affected zero rows', async () => {
    setupMocks(baseSession, []);
    const { setImageSlots } = await import('../../../src/server/sessions/images-repo');
    expect(await setImageSlots(1, 10, [heroSlot])).toBeNull();
  });
  it('persists the supplied slot list', async () => {
    setupMocks(baseSession);
    const { setImageSlots } = await import('../../../src/server/sessions/images-repo');
    const out = await setImageSlots(1, 10, [heroSlot, inlineSlot]);
    expect(out).toHaveLength(2);
    const setCall = dbMocks.updateSet.mock.calls[0]?.[0] as {
      images: { slots: Array<{ id: string }> };
    };
    expect(setCall.images.slots.map((s) => s.id)).toEqual(['slot_hero', 'slot_a']);
  });
});

describe('findSlot', () => {
  it('returns null for foreign session', async () => {
    setupMocks(null);
    const { findSlot } = await import('../../../src/server/sessions/images-repo');
    expect(await findSlot(1, 10, 'slot_hero')).toBeNull();
  });
  it('returns the matching slot', async () => {
    setupMocks({ ...baseSession, images: { slots: [heroSlot, inlineSlot] } });
    const { findSlot } = await import('../../../src/server/sessions/images-repo');
    const slot = await findSlot(1, 10, 'slot_a');
    expect(slot?.id).toBe('slot_a');
    expect(slot?.kind).toBe('inline');
  });
  it('returns null when slot id is missing', async () => {
    setupMocks({ ...baseSession, images: { slots: [heroSlot] } });
    const { findSlot } = await import('../../../src/server/sessions/images-repo');
    expect(await findSlot(1, 10, 'slot_missing')).toBeNull();
  });
});

describe('updateSlot', () => {
  it('returns null for foreign session', async () => {
    setupMocks(null);
    const { updateSlot } = await import('../../../src/server/sessions/images-repo');
    expect(await updateSlot(1, 10, 'slot_a', (s) => s)).toBeNull();
    expect(dbMocks.update).not.toHaveBeenCalled();
  });
  it('returns null when slot is missing', async () => {
    setupMocks({ ...baseSession, images: { slots: [heroSlot] } });
    const { updateSlot } = await import('../../../src/server/sessions/images-repo');
    expect(await updateSlot(1, 10, 'slot_missing', (s) => s)).toBeNull();
    expect(dbMocks.update).not.toHaveBeenCalled();
  });
});

describe('setSlotMode', () => {
  it('flips mode', async () => {
    setupMocks({ ...baseSession, images: { slots: [heroSlot] } });
    const { setSlotMode } = await import('../../../src/server/sessions/images-repo');
    const slot = await setSlotMode(1, 10, 'slot_hero', 'generate');
    expect(slot?.mode).toBe('generate');
    const setCall = dbMocks.updateSet.mock.calls[0]?.[0] as {
      images: { slots: Array<{ mode: string }> };
    };
    expect(setCall.images.slots[0]!.mode).toBe('generate');
  });
});

describe('setSlotPrompt', () => {
  it('persists the prompt', async () => {
    setupMocks({ ...baseSession, images: { slots: [heroSlot] } });
    const { setSlotPrompt } = await import('../../../src/server/sessions/images-repo');
    const prompt = {
      subject: 'A laptop on a desk',
      style: 'editorial photo',
      composition: 'centered',
      palette: ['indigo'],
      lighting: 'soft',
      mood: 'focused',
      aspect: '16:9' as const,
    };
    const slot = await setSlotPrompt(1, 10, 'slot_hero', prompt);
    expect(slot?.prompt).toMatchObject(prompt);
  });
});

describe('appendSlotCandidates', () => {
  it('appends to the existing candidate list', async () => {
    const seeded = {
      ...heroSlot,
      candidates: [
        {
          id: 'c_existing',
          source: 'generated' as const,
          localPath: '/p.png',
          createdAt: '2026-05-03T10:00:00.000Z',
        },
      ],
    };
    setupMocks({ ...baseSession, images: { slots: [seeded] } });
    const { appendSlotCandidates } = await import('../../../src/server/sessions/images-repo');
    const slot = await appendSlotCandidates(1, 10, 'slot_hero', [
      {
        id: 'c_new',
        source: 'generated',
        localPath: '/q.png',
        createdAt: '2026-05-03T10:01:00.000Z',
      },
    ]);
    expect(slot?.candidates.map((c) => c.id)).toEqual(['c_existing', 'c_new']);
  });
});

describe('setSlotChoice', () => {
  const seededSlot = {
    ...heroSlot,
    candidates: [
      {
        id: 'c1',
        source: 'generated' as const,
        localPath: '/p.png',
        createdAt: '2026-05-03T10:00:00.000Z',
      },
    ],
  };

  it('returns null for foreign session', async () => {
    setupMocks(null);
    const { setSlotChoice } = await import('../../../src/server/sessions/images-repo');
    expect(await setSlotChoice(1, 10, 'slot_hero', 'c1')).toBeNull();
    expect(dbMocks.update).not.toHaveBeenCalled();
  });
  it('returns null for unknown candidate id', async () => {
    setupMocks({ ...baseSession, images: { slots: [seededSlot] } });
    const { setSlotChoice } = await import('../../../src/server/sessions/images-repo');
    expect(await setSlotChoice(1, 10, 'slot_hero', 'c_missing')).toBeNull();
    expect(dbMocks.update).not.toHaveBeenCalled();
  });
  it('stamps chosenCandidateId when candidate exists', async () => {
    setupMocks({ ...baseSession, images: { slots: [seededSlot] } });
    const { setSlotChoice } = await import('../../../src/server/sessions/images-repo');
    const slot = await setSlotChoice(1, 10, 'slot_hero', 'c1');
    expect(slot?.chosenCandidateId).toBe('c1');
  });
});

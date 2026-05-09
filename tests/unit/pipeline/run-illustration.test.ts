import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getProfile: vi.fn(),
  listSectionDrafts: vi.fn(),
  setImageSlots: vi.fn(),
  emitEvent: vi.fn(),
  proposeImageSlotsRun: vi.fn(),
}));

vi.mock('../../../src/server/sessions/repo', () => ({ getSession: mocks.getSession }));
vi.mock('../../../src/server/profiles/repo', () => ({ getProfile: mocks.getProfile }));
vi.mock('../../../src/server/sessions/section-drafts-repo', () => ({
  listSectionDrafts: mocks.listSectionDrafts,
}));
vi.mock('../../../src/server/sessions/images-repo', () => ({
  setImageSlots: mocks.setImageSlots,
}));
vi.mock('../../../src/server/events/bus', () => ({ emitEvent: mocks.emitEvent }));
vi.mock('../../../src/server/pipeline/stages/propose-image-slots', () => ({
  proposeImageSlots: { run: mocks.proposeImageSlotsRun },
}));

const validPlan = {
  thesis: 'thesis',
  targetTakeaway: 'takeaway',
  sections: [
    { id: 'intro', title: 'Intro', intent: 'open', keyPoints: ['k'], expectedLength: 100 },
    { id: 'body', title: 'Body', intent: 'detail', keyPoints: ['k'], expectedLength: 500 },
  ],
};

const validProfile = { id: 7, userId: 1, name: 'P' };
const validSession = { id: 10, userId: 1, profileId: 7, plan: validPlan, draftMd: '# draft' };

afterEach(() => vi.clearAllMocks());

describe('runIllustration', () => {
  it('returns session_invalid when session missing', async () => {
    mocks.getSession.mockResolvedValue(null);
    const { runIllustration } = await import(
      '../../../src/server/pipeline/run-illustration'
    );
    expect(await runIllustration({ sessionId: 10, userId: 1 })).toEqual({
      ok: false,
      error: 'session_invalid',
    });
  });

  it('returns session_invalid when plan is malformed', async () => {
    mocks.getSession.mockResolvedValue({ ...validSession, plan: { broken: true } });
    const { runIllustration } = await import(
      '../../../src/server/pipeline/run-illustration'
    );
    expect(await runIllustration({ sessionId: 10, userId: 1 })).toEqual({
      ok: false,
      error: 'session_invalid',
    });
  });

  it('short-circuits to no_draft before calling the stage', async () => {
    mocks.getSession.mockResolvedValue({ ...validSession, draftMd: null });
    mocks.getProfile.mockResolvedValue(validProfile);
    const { runIllustration } = await import(
      '../../../src/server/pipeline/run-illustration'
    );
    expect(await runIllustration({ sessionId: 10, userId: 1 })).toEqual({
      ok: false,
      error: 'no_draft',
    });
    expect(mocks.proposeImageSlotsRun).not.toHaveBeenCalled();
    expect(mocks.setImageSlots).not.toHaveBeenCalled();
  });

  it('returns session_invalid when setImageSlots returns null', async () => {
    mocks.getSession.mockResolvedValue(validSession);
    mocks.getProfile.mockResolvedValue(validProfile);
    mocks.listSectionDrafts.mockResolvedValue([]);
    mocks.proposeImageSlotsRun.mockResolvedValue({
      heroBrief: 'Hero shot',
      inlineSlots: [],
    });
    mocks.setImageSlots.mockResolvedValue(null);
    const { runIllustration } = await import(
      '../../../src/server/pipeline/run-illustration'
    );
    expect(await runIllustration({ sessionId: 10, userId: 1 })).toEqual({
      ok: false,
      error: 'session_invalid',
    });
  });

  it('emits image_slot per slot then image_slots_round, returns slot count', async () => {
    const persistedSlots = [
      {
        id: 's_hero_1',
        kind: 'hero',
        brief: 'Hero shot',
        mode: 'undecided',
        candidates: [],
      },
      {
        id: 's_in_1_0',
        kind: 'inline',
        sectionId: 'intro',
        paragraphIndex: 1,
        brief: 'Diagram',
        mode: 'undecided',
        candidates: [],
      },
    ];

    mocks.getSession.mockResolvedValue(validSession);
    mocks.getProfile.mockResolvedValue(validProfile);
    mocks.listSectionDrafts.mockResolvedValue([
      { sectionId: 'intro', contentMd: 'A' },
      { sectionId: 'body', contentMd: 'B' },
    ]);
    mocks.proposeImageSlotsRun.mockResolvedValue({
      heroBrief: 'Hero shot',
      inlineSlots: [
        { sectionId: 'intro', paragraphIndex: 1, brief: 'Diagram' },
      ],
    });
    mocks.setImageSlots.mockResolvedValue(persistedSlots);

    const { runIllustration } = await import(
      '../../../src/server/pipeline/run-illustration'
    );
    const result = await runIllustration({ sessionId: 10, userId: 1 });

    expect(result).toEqual({ ok: true, slotCount: 2 });

    const setCallSlots = mocks.setImageSlots.mock.calls[0]![2] as Array<{ kind: string }>;
    expect(setCallSlots).toHaveLength(2);
    expect(setCallSlots[0]!.kind).toBe('hero');
    expect(setCallSlots[1]!.kind).toBe('inline');

    const kinds = mocks.emitEvent.mock.calls.map((c: unknown[]) => {
      const payload = c[2] as { kind: string };
      return payload.kind;
    });
    expect(kinds).toEqual(['image_slot', 'image_slot', 'image_slots_round']);

    const lastCall = mocks.emitEvent.mock.calls.at(-1)!;
    expect(lastCall[2]).toMatchObject({ kind: 'image_slots_round', slotCount: 2 });
  });

  it('overwrites the slot list (single round) on subsequent invocations', async () => {
    mocks.getSession.mockResolvedValue(validSession);
    mocks.getProfile.mockResolvedValue(validProfile);
    mocks.listSectionDrafts.mockResolvedValue([]);
    mocks.proposeImageSlotsRun.mockResolvedValue({
      heroBrief: 'fresh hero',
      inlineSlots: [],
    });
    mocks.setImageSlots.mockResolvedValue([
      { id: 's_hero_2', kind: 'hero', brief: 'fresh hero', mode: 'undecided', candidates: [] },
    ]);
    const { runIllustration } = await import(
      '../../../src/server/pipeline/run-illustration'
    );
    await runIllustration({ sessionId: 10, userId: 1 });
    const setCallSlots = mocks.setImageSlots.mock.calls[0]![2] as Array<{ brief: string }>;
    expect(setCallSlots[0]!.brief).toBe('fresh hero');
    expect(mocks.setImageSlots).toHaveBeenCalledTimes(1);
  });
});

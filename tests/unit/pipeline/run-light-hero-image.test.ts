import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BudgetExceededError } from '../../../src/server/llm/budget-guard';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getProfile: vi.fn(),
  emitEvent: vi.fn(),
  setImageSlots: vi.fn(),
  updateSessionDraft: vi.fn(),
  composeImagePromptRun: vi.fn(),
  prerenderImagesRun: vi.fn(),
  withStageCtx: vi.fn(),
}));

vi.mock('../../../src/server/sessions/repo', () => ({
  getSession: mocks.getSession,
  updateSessionDraft: mocks.updateSessionDraft,
}));
vi.mock('../../../src/server/profiles/repo', () => ({ getProfile: mocks.getProfile }));
vi.mock('../../../src/server/events/bus', () => ({ emitEvent: mocks.emitEvent }));
vi.mock('../../../src/server/sessions/images-repo', () => ({ setImageSlots: mocks.setImageSlots }));
vi.mock('../../../src/server/pipeline/stages/compose-image-prompt', () => ({
  composeImagePrompt: { name: 'compose_image_prompt', run: mocks.composeImagePromptRun },
}));
vi.mock('../../../src/server/pipeline/stages/prerender-images', () => ({
  prerenderImages: { name: 'prerender_images', run: mocks.prerenderImagesRun },
}));
vi.mock('../../../src/server/pipeline/with-stage-ctx', () => ({
  withStageCtx: mocks.withStageCtx,
}));

const plan = {
  thesis: 'Test thesis.',
  targetTakeaway: 'Test takeaway.',
  sections: [
    { id: 'intro', title: 'Introduction', intent: 'Hook the reader.', keyPoints: ['x'], expectedLength: 200 },
    { id: 'body', title: 'Main Content', intent: 'Explain the topic.', keyPoints: ['y'], expectedLength: 800 },
  ],
};

const baseSession = {
  id: 10,
  userId: 1,
  profileId: 2,
  plan,
  draftMd: 'Some draft content here.',
  images: null,
  state: 'done',
  mode: 'light',
};

const profile = {
  id: 2,
  userId: 1,
  name: 'Test Platform',
  format: 'article',
  style: 'editorial',
  audience: 'general',
  targetVolumeMin: 500,
  targetVolumeMax: 1000,
  markupRules: null,
  extraPrompt: '',
  lightResearchSources: 3,
  lightMaxWords: 800,
  createdAt: new Date('2025-01-01'),
};

const imagePrompt = {
  subject: 'A test subject',
  style: 'editorial photo',
  composition: 'centered',
  palette: ['blue', 'white'],
  lighting: 'soft window light',
  mood: 'calm',
  aspect: '16:9' as const,
};

const candidate = {
  id: 'c_1',
  source: 'generated' as const,
  localPath: '/api/images/1/s/c_1.png',
  createdAt: 'x',
};

const persistedSlot = {
  id: expect.stringContaining('s_hero_10_'),
  kind: 'hero',
  brief: expect.any(String),
  altText: 'Test thesis.',
  mode: 'generate',
  prompt: imagePrompt,
  candidates: [candidate],
  chosenCandidateId: 'c_1',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue(baseSession);
  mocks.getProfile.mockResolvedValue(profile);
  mocks.emitEvent.mockResolvedValue(undefined);
  mocks.setImageSlots.mockResolvedValue([persistedSlot]);
  mocks.updateSessionDraft.mockResolvedValue({ id: 10 });
  mocks.withStageCtx.mockImplementation(
    (_stage: unknown, _sid: unknown, _uid: unknown, fn: () => unknown) => fn(),
  );
  mocks.composeImagePromptRun.mockResolvedValue(imagePrompt);
  mocks.prerenderImagesRun.mockResolvedValue({ candidates: [candidate] });
});

afterEach(() => vi.clearAllMocks());

describe('runLightHeroImage', () => {
  it('returns session_invalid when getSession returns null; stages not called', async () => {
    mocks.getSession.mockResolvedValue(null);
    const { runLightHeroImage } = await import(
      '../../../src/server/pipeline/run-light-hero-image'
    );
    const result = await runLightHeroImage({ sessionId: 10, userId: 1 });
    expect(result).toEqual({ ok: false, error: 'session_invalid' });
    expect(mocks.composeImagePromptRun).not.toHaveBeenCalled();
    expect(mocks.prerenderImagesRun).not.toHaveBeenCalled();
  });

  it('returns no_plan when session.plan fails planSchema.safeParse', async () => {
    mocks.getSession.mockResolvedValue({ ...baseSession, plan: null });
    const { runLightHeroImage } = await import(
      '../../../src/server/pipeline/run-light-hero-image'
    );
    const result = await runLightHeroImage({ sessionId: 10, userId: 1 });
    expect(result).toEqual({ ok: false, error: 'no_plan' });
    expect(mocks.composeImagePromptRun).not.toHaveBeenCalled();
  });

  it('returns no_draft when session.draftMd is empty string', async () => {
    mocks.getSession.mockResolvedValue({ ...baseSession, draftMd: '' });
    const { runLightHeroImage } = await import(
      '../../../src/server/pipeline/run-light-hero-image'
    );
    const result = await runLightHeroImage({ sessionId: 10, userId: 1 });
    expect(result).toEqual({ ok: false, error: 'no_draft' });
  });

  it('returns no_draft when session.draftMd is null', async () => {
    mocks.getSession.mockResolvedValue({ ...baseSession, draftMd: null });
    const { runLightHeroImage } = await import(
      '../../../src/server/pipeline/run-light-hero-image'
    );
    const result = await runLightHeroImage({ sessionId: 10, userId: 1 });
    expect(result).toEqual({ ok: false, error: 'no_draft' });
  });

  it('returns already_generated when existing images has a hero slot with chosenCandidateId; no stages called', async () => {
    const existingImages = {
      slots: [
        {
          id: 's_hero_existing',
          kind: 'hero',
          brief: 'existing brief',
          mode: 'generate',
          candidates: [candidate],
          chosenCandidateId: 'c_1',
        },
      ],
    };
    mocks.getSession.mockResolvedValue({ ...baseSession, images: existingImages });
    const { runLightHeroImage } = await import(
      '../../../src/server/pipeline/run-light-hero-image'
    );
    const result = await runLightHeroImage({ sessionId: 10, userId: 1 });
    expect(result).toEqual({ ok: false, error: 'already_generated' });
    expect(mocks.composeImagePromptRun).not.toHaveBeenCalled();
    expect(mocks.prerenderImagesRun).not.toHaveBeenCalled();
  });

  it('full success path', async () => {
    const { runLightHeroImage } = await import(
      '../../../src/server/pipeline/run-light-hero-image'
    );
    const result = await runLightHeroImage({ sessionId: 10, userId: 1 });

    expect(result).toEqual({ ok: true, candidateId: 'c_1', localPath: '/api/images/1/s/c_1.png' });

    expect(mocks.setImageSlots).toHaveBeenCalledOnce();
    const [uid, sid, slots] = mocks.setImageSlots.mock.calls[0] as [number, number, unknown[]];
    expect(uid).toBe(1);
    expect(sid).toBe(10);
    expect(slots).toHaveLength(1);
    const slot = slots[0] as Record<string, unknown>;
    expect(slot.kind).toBe('hero');
    expect(slot.mode).toBe('generate');
    expect(slot.chosenCandidateId).toBe('c_1');

    expect(mocks.updateSessionDraft).toHaveBeenCalledOnce();
    const [, , draftArg] = mocks.updateSessionDraft.mock.calls[0] as [number, number, string];
    expect(draftArg).toMatch(/^!\[Test thesis\.\]\(\/api\/images\/1\/s\/c_1\.png\)\n\n/);

    const emitCalls = mocks.emitEvent.mock.calls as Array<[number, string, unknown]>;
    const heroEmit = emitCalls.find(
      ([, kind, p]) =>
        kind === 'artifact_updated' && (p as { kind: string }).kind === 'hero_image',
    );
    expect(heroEmit).toBeDefined();
    expect(heroEmit![2]).toMatchObject({ kind: 'hero_image', url: '/api/images/1/s/c_1.png', candidateId: 'c_1' });
  });

  it('does not call updateSessionDraft again when draftMd already starts with hero markdown', async () => {
    const heroMd = '![Test thesis.](/api/images/1/s/c_1.png)';
    mocks.getSession.mockResolvedValue({
      ...baseSession,
      draftMd: heroMd + '\n\nExisting body.',
    });
    const { runLightHeroImage } = await import(
      '../../../src/server/pipeline/run-light-hero-image'
    );
    const result = await runLightHeroImage({ sessionId: 10, userId: 1 });
    expect(result).toEqual({ ok: true, candidateId: 'c_1', localPath: '/api/images/1/s/c_1.png' });
    expect(mocks.updateSessionDraft).not.toHaveBeenCalled();
    const emitCalls = mocks.emitEvent.mock.calls as Array<[number, string, unknown]>;
    const heroEmit = emitCalls.find(
      ([, kind, p]) =>
        kind === 'artifact_updated' && (p as { kind: string }).kind === 'hero_image',
    );
    expect(heroEmit).toBeDefined();
  });

  it('emits hero_image_failed with budget_exceeded and returns budget_exceeded when composeImagePrompt throws BudgetExceededError', async () => {
    mocks.withStageCtx.mockImplementationOnce(() => {
      throw new BudgetExceededError('user', 1, 1);
    });
    const { runLightHeroImage } = await import(
      '../../../src/server/pipeline/run-light-hero-image'
    );
    const result = await runLightHeroImage({ sessionId: 10, userId: 1 });
    expect(result).toEqual({ ok: false, error: 'budget_exceeded' });
    const emitCalls = mocks.emitEvent.mock.calls as Array<[number, string, unknown]>;
    const failEmit = emitCalls.find(
      ([, kind, p]) =>
        kind === 'artifact_updated' && (p as { kind: string }).kind === 'hero_image_failed',
    );
    expect(failEmit).toBeDefined();
    expect(failEmit![2]).toMatchObject({ kind: 'hero_image_failed', reason: 'budget_exceeded' });
    expect(mocks.prerenderImagesRun).not.toHaveBeenCalled();
  });

  it('emits hero_image_failed with render_failed and returns image_failed when prerenderImages throws a non-budget error', async () => {
    mocks.withStageCtx
      .mockImplementationOnce((_s: unknown, _sid: unknown, _uid: unknown, fn: () => unknown) => fn())
      .mockImplementationOnce(() => {
        throw new Error('render boom');
      });
    const { runLightHeroImage } = await import(
      '../../../src/server/pipeline/run-light-hero-image'
    );
    const result = await runLightHeroImage({ sessionId: 10, userId: 1 });
    expect(result).toEqual({ ok: false, error: 'image_failed' });
    const emitCalls = mocks.emitEvent.mock.calls as Array<[number, string, unknown]>;
    const failEmit = emitCalls.find(
      ([, kind, p]) =>
        kind === 'artifact_updated' && (p as { kind: string }).kind === 'hero_image_failed',
    );
    expect(failEmit).toBeDefined();
    expect(failEmit![2]).toMatchObject({ kind: 'hero_image_failed', reason: 'render_failed' });
    expect(mocks.setImageSlots).not.toHaveBeenCalled();
    expect(mocks.updateSessionDraft).not.toHaveBeenCalled();
  });

  it('wraps both stages via withStageCtx with correct stage references and ids', async () => {
    const { runLightHeroImage } = await import(
      '../../../src/server/pipeline/run-light-hero-image'
    );
    await runLightHeroImage({ sessionId: 10, userId: 1 });
    expect(mocks.withStageCtx).toHaveBeenCalledTimes(2);
    const calls = mocks.withStageCtx.mock.calls as Array<[{ name: string }, number, number, unknown]>;
    expect(calls[0]![0].name).toBe('compose_image_prompt');
    expect(calls[0]![1]).toBe(10);
    expect(calls[0]![2]).toBe(1);
    expect(calls[1]![0].name).toBe('prerender_images');
    expect(calls[1]![1]).toBe(10);
    expect(calls[1]![2]).toBe(1);
  });
});

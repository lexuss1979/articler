import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetProfile = vi.fn();
const mockListAssertions = vi.fn();
const mockRecordAgreement = vi.fn();
const mockRecordContradiction = vi.fn();
const mockUpsertAssertion = vi.fn();
const mockFindSimilarKey = vi.fn();
const mockClassifyAnswersRun = vi.fn();
const mockValidateAssertionGeneralityRun = vi.fn();

vi.mock('../../../src/server/profiles/repo', () => ({
  getProfile: mockGetProfile,
}));

vi.mock('../../../src/server/profiles/profile-assertions-repo', () => ({
  listAssertions: mockListAssertions,
  recordAgreement: mockRecordAgreement,
  recordContradiction: mockRecordContradiction,
  upsertAssertion: mockUpsertAssertion,
}));

vi.mock('../../../src/server/pipeline/stages/classify-answers', () => ({
  classifyAnswers: { name: 'classify_answers', run: mockClassifyAnswersRun },
}));

vi.mock('../../../src/server/pipeline/stages/validate-assertion-generality', () => ({
  validateAssertionGenerality: {
    name: 'validate_assertion_generality',
    run: mockValidateAssertionGeneralityRun,
  },
}));

vi.mock('../../../src/server/pipeline/with-stage-ctx', () => ({
  withStageCtx: (_s: unknown, _sid: unknown, _uid: unknown, fn: () => unknown) => fn(),
}));

vi.mock('../../../src/server/profiles/key-similarity', () => ({
  findSimilarKey: mockFindSimilarKey,
}));

const profile = {
  id: 1,
  userId: 42,
  name: 'Tech Blog',
  format: 'longread',
  style: 'conversational',
  audience: 'developers',
  targetVolumeMin: 1000,
  targetVolumeMax: 3000,
  markupRules: {},
  extraPrompt: '',
  lightResearchSources: 1,
  lightMaxWords: 800,
  createdAt: new Date('2024-01-01'),
};

const qa = [{ question: 'What tone?', answer: 'Casual.' }];
const brief = { topic: 'Prompt caching with code blocks', goal: '', notes: '' };

beforeEach(() => {
  vi.clearAllMocks();
  mockGetProfile.mockResolvedValue(profile);
  mockListAssertions.mockResolvedValue([]);
  mockClassifyAnswersRun.mockResolvedValue({ delta: [] });
  mockFindSimilarKey.mockReturnValue(null);
  mockValidateAssertionGeneralityRun.mockResolvedValue({ results: [] });
});

describe('runClassifyAnswers', () => {
  it('throws profile_not_found when getProfile returns null', async () => {
    mockGetProfile.mockResolvedValue(null);
    const { runClassifyAnswers } = await import(
      '../../../src/server/pipeline/run-classify-answers'
    );
    await expect(
      runClassifyAnswers({ userId: 42, sessionId: 1, profileId: 1, qa, brief }),
    ).rejects.toThrow('profile_not_found');
  });

  it('calls recordAgreement for agree delta item and increments applied', async () => {
    mockClassifyAnswersRun.mockResolvedValue({ delta: [{ kind: 'agree', key: 'tone_formal' }] });
    mockRecordAgreement.mockResolvedValue({ id: 1, key: 'tone_formal' });
    const { runClassifyAnswers } = await import(
      '../../../src/server/pipeline/run-classify-answers'
    );
    const result = await runClassifyAnswers({ userId: 42, sessionId: 1, profileId: 1, qa, brief });
    expect(mockRecordAgreement).toHaveBeenCalledWith(1, 'tone_formal');
    expect(result).toEqual({ applied: 1, skipped: 0, droppedAsTopicBound: 0 });
  });

  it('calls recordContradiction for contradict delta item', async () => {
    mockClassifyAnswersRun.mockResolvedValue({
      delta: [{ kind: 'contradict', key: 'tone_formal' }],
    });
    mockRecordContradiction.mockResolvedValue({ id: 1 });
    const { runClassifyAnswers } = await import(
      '../../../src/server/pipeline/run-classify-answers'
    );
    const result = await runClassifyAnswers({ userId: 42, sessionId: 1, profileId: 1, qa, brief });
    expect(mockRecordContradiction).toHaveBeenCalledWith(1, 'tone_formal');
    expect(result).toEqual({ applied: 1, skipped: 0, droppedAsTopicBound: 0 });
  });

  it('calls upsertAssertion for new item with no similar existing key', async () => {
    mockClassifyAnswersRun.mockResolvedValue({
      delta: [
        {
          kind: 'new',
          key: 'format_uses_code',
          category: 'format',
          assertion: 'Uses code blocks.',
        },
      ],
    });
    mockValidateAssertionGeneralityRun.mockResolvedValue({
      results: [{ key: 'format_uses_code', passes: true, reason: 'general' }],
    });
    mockUpsertAssertion.mockResolvedValue({ id: 2 });
    const { runClassifyAnswers } = await import(
      '../../../src/server/pipeline/run-classify-answers'
    );
    const result = await runClassifyAnswers({ userId: 42, sessionId: 1, profileId: 1, qa, brief });
    expect(mockUpsertAssertion).toHaveBeenCalledWith({
      profileId: 1,
      key: 'format_uses_code',
      category: 'format',
      assertion: 'Uses code blocks.',
      source: 'session',
    });
    expect(mockRecordAgreement).not.toHaveBeenCalled();
    expect(result).toEqual({ applied: 1, skipped: 0, droppedAsTopicBound: 0 });
  });

  it('calls recordAgreement with matched key for new item with similar existing key', async () => {
    mockListAssertions.mockResolvedValue([
      {
        key: 'code_blocks_format',
        category: 'format',
        assertion: 'Uses code blocks.',
        confidence: 0.8,
        evidenceCount: 2,
      },
    ]);
    mockClassifyAnswersRun.mockResolvedValue({
      delta: [
        {
          kind: 'new',
          key: 'format_uses_code',
          category: 'format',
          assertion: 'Uses code blocks.',
        },
      ],
    });
    mockValidateAssertionGeneralityRun.mockResolvedValue({
      results: [{ key: 'format_uses_code', passes: true, reason: 'general' }],
    });
    mockFindSimilarKey.mockReturnValue({ key: 'code_blocks_format', similarity: 0.9 });
    mockRecordAgreement.mockResolvedValue({ id: 1 });
    const { runClassifyAnswers } = await import(
      '../../../src/server/pipeline/run-classify-answers'
    );
    const result = await runClassifyAnswers({ userId: 42, sessionId: 1, profileId: 1, qa, brief });
    expect(mockRecordAgreement).toHaveBeenCalledWith(1, 'code_blocks_format');
    expect(mockUpsertAssertion).not.toHaveBeenCalled();
    expect(result).toEqual({ applied: 1, skipped: 0, droppedAsTopicBound: 0 });
  });

  it('increments skipped when recordAgreement returns null for missing key', async () => {
    mockClassifyAnswersRun.mockResolvedValue({
      delta: [{ kind: 'agree', key: 'nonexistent_key' }],
    });
    mockRecordAgreement.mockResolvedValue(null);
    const { runClassifyAnswers } = await import(
      '../../../src/server/pipeline/run-classify-answers'
    );
    const result = await runClassifyAnswers({ userId: 42, sessionId: 1, profileId: 1, qa, brief });
    expect(result).toEqual({ applied: 0, skipped: 1, droppedAsTopicBound: 0 });
  });

  it('drops a new item that fails generality validation and never calls upsertAssertion', async () => {
    mockClassifyAnswersRun.mockResolvedValue({
      delta: [
        {
          kind: 'new',
          key: 'scope_ladder_safety',
          category: 'scope',
          assertion: 'user wants ladder safety section',
        },
      ],
    });
    mockValidateAssertionGeneralityRun.mockResolvedValue({
      results: [{ key: 'scope_ladder_safety', passes: false, reason: 'topic-bound' }],
    });
    const { runClassifyAnswers } = await import(
      '../../../src/server/pipeline/run-classify-answers'
    );
    const result = await runClassifyAnswers({ userId: 42, sessionId: 1, profileId: 1, qa, brief });
    expect(mockUpsertAssertion).not.toHaveBeenCalled();
    expect(mockRecordAgreement).not.toHaveBeenCalled();
    expect(result).toEqual({ applied: 0, skipped: 0, droppedAsTopicBound: 1 });
  });

  it('applies a new item that passes validation alongside an agree item', async () => {
    mockClassifyAnswersRun.mockResolvedValue({
      delta: [
        {
          kind: 'new',
          key: 'structure_historical_intro',
          category: 'structure',
          assertion: 'author opens with historical context',
        },
        { kind: 'agree', key: 'tone_formal' },
      ],
    });
    mockValidateAssertionGeneralityRun.mockResolvedValue({
      results: [
        { key: 'structure_historical_intro', passes: true, reason: 'general' },
      ],
    });
    mockUpsertAssertion.mockResolvedValue({ id: 3 });
    mockRecordAgreement.mockResolvedValue({ id: 1, key: 'tone_formal' });

    const { runClassifyAnswers } = await import(
      '../../../src/server/pipeline/run-classify-answers'
    );
    const result = await runClassifyAnswers({ userId: 42, sessionId: 1, profileId: 1, qa, brief });

    expect(mockUpsertAssertion).toHaveBeenCalledTimes(1);
    expect(mockRecordAgreement).toHaveBeenCalledWith(1, 'tone_formal');
    expect(result).toEqual({ applied: 2, skipped: 0, droppedAsTopicBound: 0 });
  });

  it('skips the validator entirely when there are no new items', async () => {
    mockClassifyAnswersRun.mockResolvedValue({
      delta: [{ kind: 'agree', key: 'tone_formal' }],
    });
    mockRecordAgreement.mockResolvedValue({ id: 1, key: 'tone_formal' });

    const { runClassifyAnswers } = await import(
      '../../../src/server/pipeline/run-classify-answers'
    );
    const result = await runClassifyAnswers({ userId: 42, sessionId: 1, profileId: 1, qa, brief });

    expect(mockValidateAssertionGeneralityRun).not.toHaveBeenCalled();
    expect(result).toEqual({ applied: 1, skipped: 0, droppedAsTopicBound: 0 });
  });

  it('drops a new item whose nouns leak (passes generality but fails noun-overlap guard)', async () => {
    const narrowBrief = { topic: 'firefighter equipment', goal: '', notes: '' };
    mockClassifyAnswersRun.mockResolvedValue({
      delta: [
        {
          kind: 'new',
          key: 'scope_includes_safety',
          category: 'scope',
          assertion: 'covers ladder considerations',
        },
      ],
    });
    mockValidateAssertionGeneralityRun.mockResolvedValue({
      results: [{ key: 'scope_includes_safety', passes: true, reason: 'sounds general' }],
    });

    const { runClassifyAnswers } = await import(
      '../../../src/server/pipeline/run-classify-answers'
    );
    const result = await runClassifyAnswers({
      userId: 42,
      sessionId: 1,
      profileId: 1,
      qa,
      brief: narrowBrief,
    });

    expect(mockUpsertAssertion).not.toHaveBeenCalled();
    expect(mockRecordAgreement).not.toHaveBeenCalled();
    expect(result).toEqual({ applied: 0, skipped: 0, droppedAsTopicBound: 1 });
  });
});

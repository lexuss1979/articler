import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getProfile: vi.fn(),
  fetchExampleUrl: vi.fn(),
  analyzeExamplesRun: vi.fn(),
  replaceAssertionsBySource: vi.fn(),
}));

vi.mock('../../../src/server/profiles/repo', () => ({
  getProfile: mocks.getProfile,
}));

vi.mock('../../../src/server/profiles/fetch-example-url', () => ({
  fetchExampleUrl: mocks.fetchExampleUrl,
}));

vi.mock('../../../src/server/pipeline/stages/analyze-examples', () => ({
  analyzeExamples: { run: mocks.analyzeExamplesRun, name: 'analyze_examples' },
}));

vi.mock('../../../src/server/profiles/profile-assertions-repo', () => ({
  replaceAssertionsBySource: mocks.replaceAssertionsBySource,
}));

const profile = {
  id: 10,
  userId: 1,
  name: 'Test Profile',
  format: 'blog',
  style: 'casual',
  audience: 'general',
  targetVolumeMin: 300,
  targetVolumeMax: 800,
  markupRules: {},
  extraPrompt: '',
  createdAt: new Date(),
};

const sampleItems = [
  { key: 'tone_casual', category: 'tone', assertion: 'Articles use a casual tone.' },
  { key: 'scope_broad', category: 'scope', assertion: 'Topics cover a broad range.' },
  { key: 'format_lists', category: 'format', assertion: 'Lists are used frequently.' },
];

afterEach(() => vi.clearAllMocks());

describe('runAnalyzeExamples', () => {
  it('returns profile_not_found when getProfile returns null', async () => {
    mocks.getProfile.mockResolvedValue(null);

    const { runAnalyzeExamples } = await import('../../../src/server/pipeline/run-analyze-examples');
    const result = await runAnalyzeExamples({
      userId: 1,
      profileId: 10,
      inputs: [
        { kind: 'text', value: 'Content one' },
        { kind: 'text', value: 'Content two' },
        { kind: 'text', value: 'Content three' },
      ],
    });

    expect(result).toEqual({ ok: false, error: 'profile_not_found' });
    expect(mocks.analyzeExamplesRun).not.toHaveBeenCalled();
  });

  it('runs stage over 3 text contents and collects urlErrors for failed URL', async () => {
    mocks.getProfile.mockResolvedValue(profile);
    mocks.fetchExampleUrl.mockResolvedValue({ ok: false, error: 'HTTP 404' });
    mocks.analyzeExamplesRun.mockResolvedValue({
      summary: 'Test summary.',
      items: sampleItems,
    });
    mocks.replaceAssertionsBySource.mockResolvedValue(undefined);

    const { runAnalyzeExamples } = await import('../../../src/server/pipeline/run-analyze-examples');
    const result = await runAnalyzeExamples({
      userId: 1,
      profileId: 10,
      inputs: [
        { kind: 'text', value: 'Content one' },
        { kind: 'text', value: 'Content two' },
        { kind: 'text', value: 'Content three' },
        { kind: 'url', value: 'https://example.com/bad' },
      ],
    });

    expect(result).toMatchObject({ ok: true, summary: 'Test summary.', count: 3 });
    expect((result as { ok: true; urlErrors: Array<{ index: number; error: string }> }).urlErrors).toEqual([
      { index: 3, error: 'HTTP 404' },
    ]);

    // Stage should be called with the 3 text contents
    const stageInput = mocks.analyzeExamplesRun.mock.calls[0][0] as {
      examples: Array<{ content: string }>;
    };
    expect(stageInput.examples).toHaveLength(3);
    expect(stageInput.examples.map((e) => e.content)).toEqual([
      'Content one',
      'Content two',
      'Content three',
    ]);
  });

  it('returns too_few_examples when only 2 text inputs survive (2 URL failures)', async () => {
    mocks.getProfile.mockResolvedValue(profile);
    mocks.fetchExampleUrl.mockResolvedValue({ ok: false, error: 'Network error: timeout' });

    const { runAnalyzeExamples } = await import('../../../src/server/pipeline/run-analyze-examples');
    const result = await runAnalyzeExamples({
      userId: 1,
      profileId: 10,
      inputs: [
        { kind: 'text', value: 'Content one' },
        { kind: 'text', value: 'Content two' },
        { kind: 'url', value: 'https://example.com/bad1' },
        { kind: 'url', value: 'https://example.com/bad2' },
      ],
    });

    expect(result).toEqual({ ok: false, error: 'too_few_examples' });
    expect(mocks.analyzeExamplesRun).not.toHaveBeenCalled();
  });

  it('calls replaceAssertionsBySource with "examples" and the items returned by stage', async () => {
    mocks.getProfile.mockResolvedValue(profile);
    mocks.analyzeExamplesRun.mockResolvedValue({
      summary: 'Style summary.',
      items: sampleItems,
    });
    mocks.replaceAssertionsBySource.mockResolvedValue(undefined);

    const { runAnalyzeExamples } = await import('../../../src/server/pipeline/run-analyze-examples');
    await runAnalyzeExamples({
      userId: 1,
      profileId: 10,
      inputs: [
        { kind: 'text', value: 'Content one' },
        { kind: 'text', value: 'Content two' },
        { kind: 'text', value: 'Content three' },
      ],
    });

    expect(mocks.replaceAssertionsBySource).toHaveBeenCalledTimes(1);
    expect(mocks.replaceAssertionsBySource).toHaveBeenCalledWith(10, 'examples', sampleItems);
  });

  it('returns analyze_failed when the stage throws', async () => {
    mocks.getProfile.mockResolvedValue(profile);
    mocks.analyzeExamplesRun.mockRejectedValue(new Error('LLM error'));

    const { runAnalyzeExamples } = await import('../../../src/server/pipeline/run-analyze-examples');
    const result = await runAnalyzeExamples({
      userId: 1,
      profileId: 10,
      inputs: [
        { kind: 'text', value: 'Content one' },
        { kind: 'text', value: 'Content two' },
        { kind: 'text', value: 'Content three' },
      ],
    });

    expect(result).toEqual({ ok: false, error: 'analyze_failed' });
    expect(mocks.replaceAssertionsBySource).not.toHaveBeenCalled();
  });
});

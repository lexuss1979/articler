import { describe, expect, it } from 'vitest';
import { keySimilarity, findSimilarKey } from '../../../src/server/profiles/key-similarity';

describe('keySimilarity', () => {
  it('identical keys return 1.0', () => {
    expect(keySimilarity('tone_clickbait', 'tone_clickbait')).toBe(1.0);
  });

  it('tone_clickbait vs clickbait_tone is ≥ 0.85', () => {
    expect(keySimilarity('tone_clickbait', 'clickbait_tone')).toBeGreaterThanOrEqual(0.85);
  });

  it('tone_formal vs tone_casual is < 0.85', () => {
    expect(keySimilarity('tone_formal', 'tone_casual')).toBeLessThan(0.85);
  });

  it('completely unrelated keys return low similarity', () => {
    expect(keySimilarity('scope_news', 'tone_clickbait')).toBeLessThan(0.85);
  });
});

describe('findSimilarKey', () => {
  it('finds the best match above threshold', () => {
    const result = findSimilarKey('tone_clickbait', ['tone_formal', 'clickbait_tone', 'scope_news']);
    expect(result).not.toBeNull();
    expect(result!.key).toBe('clickbait_tone');
    expect(result!.similarity).toBeGreaterThanOrEqual(0.85);
  });

  it('returns null for empty candidates', () => {
    expect(findSimilarKey('foo', [])).toBeNull();
  });

  it('returns null when no candidate meets threshold', () => {
    expect(findSimilarKey('tone_formal', ['scope_news', 'audience_expert'])).toBeNull();
  });
});

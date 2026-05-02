import { describe, expect, it } from 'vitest';
import {
  searchHitSchema,
  searchHypothesisSchema,
  searchQuerySchema,
  sourceSummarySchema,
  sourceStatusSchema,
} from '../../../src/server/sessions/sources';

describe('searchHypothesisSchema', () => {
  it('accepts a valid hypothesis', () => {
    expect(
      searchHypothesisSchema.safeParse({
        id: 'hyp-1',
        sectionId: 'intro',
        text: 'Expert opinion on climate policy',
        evidenceKind: 'expert_quote',
      }).success,
    ).toBe(true);
  });

  it('rejects missing id', () => {
    expect(
      searchHypothesisSchema.safeParse({
        sectionId: 'intro',
        text: 'text',
        evidenceKind: 'statistic',
      }).success,
    ).toBe(false);
  });
});

describe('searchQuerySchema', () => {
  it('accepts a valid query', () => {
    expect(searchQuerySchema.safeParse({ text: 'climate policy 2024' }).success).toBe(true);
  });

  it('rejects empty text', () => {
    expect(searchQuerySchema.safeParse({ text: '' }).success).toBe(false);
  });
});

describe('searchHitSchema', () => {
  it('accepts a valid hit', () => {
    expect(
      searchHitSchema.safeParse({
        url: 'https://example.com/article',
        title: 'Climate Policy Overview',
        snippet: 'A comprehensive look at recent climate policy changes.',
      }).success,
    ).toBe(true);
  });

  it('rejects malformed url', () => {
    expect(
      searchHitSchema.safeParse({ url: 'not-a-url', title: 'title', snippet: 'text' }).success,
    ).toBe(false);
  });
});

describe('sourceSummarySchema', () => {
  it('accepts a valid summary', () => {
    expect(
      sourceSummarySchema.safeParse({ summary: 'Relevant findings on policy.', relevanceScore: 85 })
        .success,
    ).toBe(true);
  });

  it('rejects score above 100', () => {
    expect(
      sourceSummarySchema.safeParse({ summary: 'text', relevanceScore: 150 }).success,
    ).toBe(false);
  });

  it('rejects score below 0', () => {
    expect(
      sourceSummarySchema.safeParse({ summary: 'text', relevanceScore: -1 }).success,
    ).toBe(false);
  });
});

describe('sourceStatusSchema', () => {
  it('accepts valid statuses', () => {
    expect(sourceStatusSchema.safeParse('proposed').success).toBe(true);
    expect(sourceStatusSchema.safeParse('accepted').success).toBe(true);
    expect(sourceStatusSchema.safeParse('rejected').success).toBe(true);
  });

  it('rejects unknown status', () => {
    expect(sourceStatusSchema.safeParse('pending').success).toBe(false);
  });
});

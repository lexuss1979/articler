import { describe, expect, it } from 'vitest';
import {
  assertionLeaksTopic,
  extractSalientNouns,
} from '../../../src/server/profiles/topic-noun-guard';

describe('extractSalientNouns', () => {
  it('keeps salient content tokens of length >= 4 and drops short stopwords', () => {
    const result = extractSalientNouns('Firefighter ladders are tall');
    expect(result.has('firefighter')).toBe(true);
    expect(result.has('ladders')).toBe(true);
    expect(result.has('tall')).toBe(true);
    expect(result.has('are')).toBe(false);
  });

  it('lowercases tokens and splits on non-letter characters', () => {
    const result = extractSalientNouns('Hello, World!  hello-world');
    expect(result.has('hello')).toBe(true);
    expect(result.has('world')).toBe(true);
  });

  it('returns an empty set for empty input', () => {
    const result = extractSalientNouns('');
    expect(result.size).toBe(0);
  });
});

describe('assertionLeaksTopic', () => {
  it('returns true when assertion mentions a token alien to both brief and profile', () => {
    const result = assertionLeaksTopic({
      assertion: 'user wants ladder safety section',
      brief: { topic: 'firefighter equipment', goal: '', notes: '' },
      profileGeneralText: 'firefighter blog for practitioners',
    });
    expect(result).toBe(true);
  });

  it('returns false when the alien token is part of the current brief', () => {
    const result = assertionLeaksTopic({
      assertion: 'user wants ladder safety section',
      brief: { topic: 'ladder safety standards', goal: '', notes: '' },
      profileGeneralText: 'firefighter blog for practitioners',
    });
    expect(result).toBe(false);
  });

  it('returns false for a generic assertion regardless of brief or profile', () => {
    const generic = 'author opens with historical context';
    expect(
      assertionLeaksTopic({
        assertion: generic,
        brief: { topic: 'apples', goal: '', notes: '' },
        profileGeneralText: 'oranges',
      }),
    ).toBe(false);
    expect(
      assertionLeaksTopic({
        assertion: generic,
        brief: { topic: 'firefighter ladders', goal: '', notes: '' },
        profileGeneralText: 'firefighter blog',
      }),
    ).toBe(false);
  });

  it('returns false when the assertion noun appears in profile general text', () => {
    const result = assertionLeaksTopic({
      assertion: 'user is a firefighter',
      brief: { topic: 'ladders', goal: '', notes: '' },
      profileGeneralText: 'firefighter blog',
    });
    expect(result).toBe(false);
  });

  it('joins topic, goal, and notes into a single brief vocabulary', () => {
    const result = assertionLeaksTopic({
      assertion: 'covers ladders thoroughly',
      brief: {
        topic: 'firefighter equipment',
        goal: 'covers thoroughly',
        notes: 'mentions ladders',
      },
      profileGeneralText: 'firefighter blog',
    });
    expect(result).toBe(false);
  });
});

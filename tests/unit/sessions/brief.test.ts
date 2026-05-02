import { describe, expect, it } from 'vitest';
import { briefSchema } from '../../../src/server/sessions/brief';

describe('briefSchema', () => {
  it('parses a payload with only the required topic and fills defaults', () => {
    const result = briefSchema.parse({ topic: 'Prompt caching deep-dive' });
    expect(result).toEqual({
      topic: 'Prompt caching deep-dive',
      goal: '',
      notes: '',
      sourceArticles: [],
    });
  });

  it('parses a fully populated payload verbatim', () => {
    const input = {
      topic: 'Prompt caching',
      goal: 'Educate engineers on cache TTLs',
      notes: 'Mention the 5-minute window',
      sourceArticles: [
        { url: 'https://example.com/a', content: 'snippet a' },
        { url: 'https://example.com/b', content: 'snippet b' },
      ],
    };
    expect(briefSchema.parse(input)).toEqual(input);
  });

  it('rejects an empty payload because topic is required', () => {
    const result = briefSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.join('.') === 'topic')).toBe(true);
    }
  });

  it('rejects a sourceArticles entry whose url is malformed', () => {
    const result = briefSchema.safeParse({
      topic: 'X',
      sourceArticles: [{ url: 'not-a-url', content: 'hi' }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.path.join('.') === 'sourceArticles.0.url'),
      ).toBe(true);
    }
  });

  it('rejects a topic longer than 200 chars', () => {
    const result = briefSchema.safeParse({ topic: 'a'.repeat(201) });
    expect(result.success).toBe(false);
  });
});

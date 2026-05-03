import { describe, expect, it } from 'vitest';
import { markupRulesSchema, parseMarkupRules } from '../../../src/server/profiles/markup';

describe('markupRulesSchema', () => {
  it('parses an empty object as defaults', () => {
    const result = markupRulesSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ flavor: 'standard', headingShift: 0 });
    }
  });

  it('round-trips a fully specified object', () => {
    const input = { flavor: 'habr' as const, headingShift: 1 };
    const result = markupRulesSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(input);
    }
  });

  it('rejects an unknown flavor in strict parse', () => {
    const result = markupRulesSchema.safeParse({ flavor: 'martian', headingShift: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects headingShift outside the allowed range in strict parse', () => {
    expect(
      markupRulesSchema.safeParse({ flavor: 'standard', headingShift: 99 }).success,
    ).toBe(false);
    expect(
      markupRulesSchema.safeParse({ flavor: 'standard', headingShift: -3 }).success,
    ).toBe(false);
    expect(
      markupRulesSchema.safeParse({ flavor: 'standard', headingShift: 1.5 }).success,
    ).toBe(false);
  });
});

describe('parseMarkupRules', () => {
  it('returns defaults for an empty object', () => {
    expect(parseMarkupRules({})).toEqual({ flavor: 'standard', headingShift: 0 });
  });

  it('returns defaults for null and undefined', () => {
    expect(parseMarkupRules(null)).toEqual({ flavor: 'standard', headingShift: 0 });
    expect(parseMarkupRules(undefined)).toEqual({ flavor: 'standard', headingShift: 0 });
  });

  it('returns defaults when flavor is invalid', () => {
    expect(parseMarkupRules({ flavor: 'martian' })).toEqual({
      flavor: 'standard',
      headingShift: 0,
    });
  });

  it('returns defaults when headingShift is outside the allowed range', () => {
    expect(parseMarkupRules({ flavor: 'standard', headingShift: 99 })).toEqual({
      flavor: 'standard',
      headingShift: 0,
    });
  });

  it('returns the parsed value when valid', () => {
    expect(parseMarkupRules({ flavor: 'habr', headingShift: -1 })).toEqual({
      flavor: 'habr',
      headingShift: -1,
    });
  });
});

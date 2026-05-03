import { describe, expect, it } from 'vitest';
import {
  adjudicationSchema,
  checkWorthinessSchema,
  claimSchema,
  claimSpanSchema,
  claimTypeSchema,
  claimsResponseSchema,
  evidenceItemSchema,
  evidenceResponseSchema,
  spanHash,
  verdictSchema,
} from '@/server/sessions/claims';

describe('claimTypeSchema', () => {
  it('accepts valid values', () => {
    expect(claimTypeSchema.parse('statistic')).toBe('statistic');
    expect(claimTypeSchema.parse('other')).toBe('other');
  });
  it('rejects invalid value', () => {
    expect(() => claimTypeSchema.parse('rumor')).toThrow();
  });
});

describe('checkWorthinessSchema', () => {
  it('accepts valid values', () => {
    expect(checkWorthinessSchema.parse('low')).toBe('low');
    expect(checkWorthinessSchema.parse('high')).toBe('high');
  });
  it('rejects invalid value', () => {
    expect(() => checkWorthinessSchema.parse('critical')).toThrow();
  });
});

describe('verdictSchema', () => {
  it('accepts valid values', () => {
    expect(verdictSchema.parse('verified')).toBe('verified');
    expect(verdictSchema.parse('needs_caveat')).toBe('needs_caveat');
  });
  it('rejects invalid value', () => {
    expect(() => verdictSchema.parse('maybe')).toThrow();
  });
});

describe('claimSpanSchema', () => {
  const valid = { sectionId: 'intro', charStart: 0, charEnd: 100, text: 'Some claim text.' };
  it('accepts valid span', () => {
    expect(claimSpanSchema.parse(valid)).toEqual(valid);
  });
  it('rejects empty sectionId', () => {
    expect(() => claimSpanSchema.parse({ ...valid, sectionId: '' })).toThrow();
  });
  it('rejects negative charStart', () => {
    expect(() => claimSpanSchema.parse({ ...valid, charStart: -1 })).toThrow();
  });
  it('rejects empty text', () => {
    expect(() => claimSpanSchema.parse({ ...valid, text: '' })).toThrow();
  });
});

describe('claimSchema', () => {
  const valid = {
    span: { sectionId: 'body', charStart: 5, charEnd: 50, text: 'GDP grew by 5%.' },
    claimType: 'statistic' as const,
    checkWorthiness: 'high' as const,
  };
  it('accepts a valid claim', () => {
    expect(claimSchema.parse(valid)).toMatchObject(valid);
  });
  it('rejects invalid claimType', () => {
    expect(() => claimSchema.parse({ ...valid, claimType: 'rumor' })).toThrow();
  });
});

describe('claimsResponseSchema', () => {
  it('accepts empty claims array', () => {
    expect(claimsResponseSchema.parse({ claims: [] })).toEqual({ claims: [] });
  });
  it('rejects more than 60 claims', () => {
    const claim = {
      span: { sectionId: 's', charStart: 0, charEnd: 1, text: 'x' },
      claimType: 'other',
      checkWorthiness: 'low',
    };
    expect(() => claimsResponseSchema.parse({ claims: Array(61).fill(claim) })).toThrow();
  });
});

describe('evidenceItemSchema', () => {
  const valid = { url: 'https://example.com', snippet: 'Some evidence.', supports: true };
  it('accepts valid evidence item', () => {
    expect(evidenceItemSchema.parse(valid)).toEqual(valid);
  });
  it('rejects malformed url', () => {
    expect(() => evidenceItemSchema.parse({ ...valid, url: 'not-a-url' })).toThrow();
  });
  it('rejects empty snippet', () => {
    expect(() => evidenceItemSchema.parse({ ...valid, snippet: '' })).toThrow();
  });
});

describe('evidenceResponseSchema', () => {
  it('accepts empty evidence array', () => {
    expect(evidenceResponseSchema.parse({ evidence: [] })).toEqual({ evidence: [] });
  });
  it('rejects more than 8 items', () => {
    const item = { url: 'https://example.com', snippet: 'x', supports: false };
    expect(() => evidenceResponseSchema.parse({ evidence: Array(9).fill(item) })).toThrow();
  });
});

describe('adjudicationSchema', () => {
  const valid = {
    verdict: 'verified' as const,
    justification: 'Source confirms the claim.',
    citationUrls: ['https://example.com'],
  };
  it('accepts valid adjudication', () => {
    expect(adjudicationSchema.parse(valid)).toMatchObject(valid);
  });
  it('rejects invalid verdict', () => {
    expect(() => adjudicationSchema.parse({ ...valid, verdict: 'maybe' })).toThrow();
  });
  it('rejects empty justification', () => {
    expect(() => adjudicationSchema.parse({ ...valid, justification: '' })).toThrow();
  });
});

describe('spanHash', () => {
  it('is deterministic', () => {
    expect(spanHash('hello')).toBe(spanHash('hello'));
  });
  it('is case-sensitive', () => {
    expect(spanHash('hello')).not.toBe(spanHash('Hello'));
  });
  it('returns a lowercase hex string', () => {
    const hash = spanHash('test');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

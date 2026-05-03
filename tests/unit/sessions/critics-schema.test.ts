import { describe, expect, it } from 'vitest';
import {
  BUILTIN_CRITICS,
  BUILTIN_DEFAULTS,
  activeCriticsSchema,
  criticDefSchema,
  findingSpanSchema,
  parseActiveCritics,
  reviewFindingSchema,
  reviewResponseSchema,
  severitySchema,
} from '@/server/sessions/critics';

describe('severitySchema', () => {
  it('accepts valid values', () => {
    expect(severitySchema.parse('critical')).toBe('critical');
    expect(severitySchema.parse('medium')).toBe('medium');
    expect(severitySchema.parse('minor')).toBe('minor');
  });
  it('rejects invalid value', () => {
    expect(() => severitySchema.parse('fatal')).toThrow();
    expect(() => severitySchema.parse('info')).toThrow();
  });
});

describe('findingSpanSchema', () => {
  it('accepts valid span', () => {
    const span = { sectionId: 'intro', charStart: 0, charEnd: 50 };
    expect(findingSpanSchema.parse(span)).toEqual(span);
  });
  it('rejects empty sectionId', () => {
    expect(() => findingSpanSchema.parse({ sectionId: '', charStart: 0, charEnd: 10 })).toThrow();
  });
});

describe('reviewFindingSchema', () => {
  const valid = {
    severity: 'medium' as const,
    problem: 'Unsupported claim.',
    suggestedChange: 'Add citation.',
    span: { sectionId: 'body', charStart: 10, charEnd: 40 },
  };
  it('accepts a valid finding', () => {
    expect(reviewFindingSchema.parse(valid)).toMatchObject(valid);
  });
  it('accepts a finding without span', () => {
    const noSpan = { severity: 'minor' as const, problem: 'p', suggestedChange: 'c' };
    expect(reviewFindingSchema.parse(noSpan)).toMatchObject(noSpan);
  });
  it('rejects empty problem', () => {
    expect(() => reviewFindingSchema.parse({ ...valid, problem: '' })).toThrow();
  });
  it('rejects invalid severity', () => {
    expect(() => reviewFindingSchema.parse({ ...valid, severity: 'fatal' })).toThrow();
  });
});

describe('reviewResponseSchema', () => {
  it('accepts empty findings array', () => {
    expect(reviewResponseSchema.parse({ findings: [] })).toEqual({ findings: [] });
  });
  it('rejects more than 60 findings', () => {
    const finding = { severity: 'minor', problem: 'p', suggestedChange: 'c' };
    expect(() => reviewResponseSchema.parse({ findings: Array(61).fill(finding) })).toThrow();
  });
});

describe('criticDefSchema', () => {
  it('accepts a valid critic def', () => {
    const def = { id: 'style', label: 'Style', systemPrompt: 'You are...', defaultEnabled: true };
    expect(criticDefSchema.parse(def)).toMatchObject(def);
  });
  it('rejects empty id', () => {
    expect(() =>
      criticDefSchema.parse({ id: '', label: 'X', systemPrompt: 'Y', defaultEnabled: false }),
    ).toThrow();
  });
});

describe('activeCriticsSchema', () => {
  it('accepts valid active critics', () => {
    const val = { enabledIds: ['editorial'], custom: [] };
    expect(activeCriticsSchema.parse(val)).toMatchObject(val);
  });
  it('defaults missing fields', () => {
    const result = activeCriticsSchema.parse({});
    expect(result.enabledIds).toEqual([]);
    expect(result.custom).toEqual([]);
  });
});

describe('BUILTIN_CRITICS', () => {
  it('has exactly 7 built-in critics', () => {
    expect(BUILTIN_CRITICS.length).toBe(7);
  });
  it('all built-ins appear in BUILTIN_DEFAULTS', () => {
    for (const critic of BUILTIN_CRITICS) {
      expect(BUILTIN_DEFAULTS).toContain(critic.id);
    }
  });
  it('all built-ins have defaultEnabled true', () => {
    for (const critic of BUILTIN_CRITICS) {
      expect(critic.defaultEnabled).toBe(true);
    }
  });
});

describe('parseActiveCritics', () => {
  it('returns defaults for null', () => {
    const result = parseActiveCritics(null);
    expect(result.enabledIds).toEqual(BUILTIN_DEFAULTS);
    expect(result.custom).toEqual([]);
  });
  it('returns defaults for undefined', () => {
    const result = parseActiveCritics(undefined);
    expect(result.enabledIds).toEqual(BUILTIN_DEFAULTS);
    expect(result.custom).toEqual([]);
  });
  it('returns defaults for invalid shape', () => {
    const result = parseActiveCritics({ enabledIds: 'not-an-array' });
    expect(result.enabledIds).toEqual(BUILTIN_DEFAULTS);
  });
  it('returns parsed value for valid input', () => {
    const val = { enabledIds: ['editorial', 'style'], custom: [] };
    const result = parseActiveCritics(val);
    expect(result.enabledIds).toEqual(['editorial', 'style']);
  });
});

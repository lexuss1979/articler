import { describe, expect, it } from 'vitest';
import {
  BUILTIN_CRITICS,
  BUILTIN_DEFAULTS,
  activeCriticsSchema,
  criticDefSchema,
  findingSchema,
  findingSpanSchema,
  findingsResponseSchema,
  parseActiveCritics,
  severitySchema,
} from '@/server/sessions/critics';

describe('severitySchema', () => {
  it('accepts valid values', () => {
    expect(severitySchema.parse('info')).toBe('info');
    expect(severitySchema.parse('minor')).toBe('minor');
    expect(severitySchema.parse('major')).toBe('major');
  });
  it('rejects invalid value', () => {
    expect(() => severitySchema.parse('fatal')).toThrow();
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
  it('allows charEnd < charStart (no schema constraint)', () => {
    expect(() => findingSpanSchema.parse({ sectionId: 'x', charStart: 10, charEnd: 5 })).not.toThrow();
  });
});

describe('findingSchema', () => {
  const valid = {
    criticId: 'editorial',
    severity: 'minor' as const,
    span: { sectionId: 'body', charStart: 10, charEnd: 40 },
    problem: 'Unsupported claim.',
    suggestedChange: 'Add citation.',
    rationale: 'No source provided.',
  };
  it('accepts a valid finding', () => {
    expect(findingSchema.parse(valid)).toMatchObject(valid);
  });
  it('rejects empty problem', () => {
    expect(() => findingSchema.parse({ ...valid, problem: '' })).toThrow();
  });
  it('rejects invalid severity', () => {
    expect(() => findingSchema.parse({ ...valid, severity: 'fatal' })).toThrow();
  });
});

describe('findingsResponseSchema', () => {
  it('accepts empty findings array', () => {
    expect(findingsResponseSchema.parse({ findings: [] })).toEqual({ findings: [] });
  });
  it('rejects more than 20 findings', () => {
    const finding = {
      criticId: 'editorial',
      severity: 'info',
      span: { sectionId: 's', charStart: 0, charEnd: 1 },
      problem: 'p',
      suggestedChange: 'c',
      rationale: 'r',
    };
    expect(() => findingsResponseSchema.parse({ findings: Array(21).fill(finding) })).toThrow();
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
  it('all built-in system prompts end with JSON instruction', () => {
    for (const critic of BUILTIN_CRITICS) {
      expect(critic.systemPrompt).toContain('{ findings: [...] }');
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

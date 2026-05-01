import { describe, expect, it } from 'vitest';
import { profileInputSchema } from '../../../src/server/profiles/schema';

const valid = {
  name: 'My Profile',
  format: 'long_read' as const,
  style: 'Conversational',
  audience: 'General readers',
  targetVolumeMin: 800,
  targetVolumeMax: 1200,
  markupRules: {},
  extraPrompt: '',
};

describe('profileInputSchema', () => {
  it('parses a valid payload', () => {
    const result = profileInputSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('defaults extraPrompt to empty string when omitted', () => {
    const { extraPrompt: _, ...rest } = valid;
    const result = profileInputSchema.safeParse(rest);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.extraPrompt).toBe('');
  });

  it('fails when targetVolumeMax < targetVolumeMin with error on targetVolumeMax', () => {
    const result = profileInputSchema.safeParse({ ...valid, targetVolumeMin: 1000, targetVolumeMax: 500 });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('targetVolumeMax');
    }
  });

  it('fails when a required field is missing', () => {
    const { name: _, ...rest } = valid;
    const result = profileInputSchema.safeParse(rest);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('name');
    }
  });

  it('fails when format is not a known value', () => {
    const result = profileInputSchema.safeParse({ ...valid, format: 'unknown_format' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('format');
    }
  });
});

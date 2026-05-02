import { describe, expect, it } from 'vitest';
import {
  regenerateInstructionSchema,
  sectionDraftOutputSchema,
} from '../../../src/server/sessions/draft';

describe('sectionDraftOutputSchema', () => {
  it('accepts valid contentMd', () => {
    expect(sectionDraftOutputSchema.safeParse({ contentMd: '# Hello' }).success).toBe(true);
  });

  it('rejects empty contentMd', () => {
    expect(sectionDraftOutputSchema.safeParse({ contentMd: '' }).success).toBe(false);
  });

  it('rejects contentMd exceeding 40000 chars', () => {
    expect(
      sectionDraftOutputSchema.safeParse({ contentMd: 'a'.repeat(40001) }).success,
    ).toBe(false);
  });
});

describe('regenerateInstructionSchema', () => {
  it('accepts a valid instruction', () => {
    expect(regenerateInstructionSchema.safeParse('Make it shorter').success).toBe(true);
  });

  it('rejects empty string', () => {
    expect(regenerateInstructionSchema.safeParse('').success).toBe(false);
  });

  it('rejects instruction longer than 1000 chars', () => {
    expect(regenerateInstructionSchema.safeParse('a'.repeat(1001)).success).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { angleSchema, planSchema, planSectionSchema } from '../../../src/server/sessions/plan';

const validSection = {
  id: 'intro',
  title: 'Introduction',
  intent: 'Hook the reader with the problem.',
  expectedLength: 300,
  keyPoints: ['Cache TTLs matter', 'Common pitfall explained'],
};

const validPlan = {
  thesis: 'Prompt caching cuts cost by 90% when done right.',
  targetTakeaway: 'Readers will know exactly when and how to cache.',
  sections: [validSection, { ...validSection, id: 'deep-dive', title: 'Deep Dive' }],
};

describe('angleSchema', () => {
  it('parses a valid angle', () => {
    const result = angleSchema.parse({ title: 'AIDA deep-dive', methodology: 'aida', rationale: 'Great for conversion.' });
    expect(result.title).toBe('AIDA deep-dive');
  });

  it('rejects an empty title', () => {
    const r = angleSchema.safeParse({ title: '', methodology: 'aida', rationale: 'x' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.some((i) => i.path[0] === 'title')).toBe(true);
  });
});

describe('planSectionSchema', () => {
  it('parses a valid section', () => {
    expect(planSectionSchema.parse(validSection)).toMatchObject({ id: 'intro' });
  });

  it('rejects an empty keyPoints array', () => {
    const r = planSectionSchema.safeParse({ ...validSection, keyPoints: [] });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.some((i) => i.path[0] === 'keyPoints')).toBe(true);
  });
});

describe('planSchema', () => {
  it('parses a valid plan', () => {
    const result = planSchema.parse(validPlan);
    expect(result.sections).toHaveLength(2);
  });

  it('rejects a plan with only one section', () => {
    const r = planSchema.safeParse({ ...validPlan, sections: [validSection] });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.some((i) => i.path[0] === 'sections')).toBe(true);
  });

  it('rejects a section with an empty keyPoints array inside a plan', () => {
    const badSection = { ...validSection, id: 's2', keyPoints: [] };
    const r = planSchema.safeParse({ ...validPlan, sections: [validSection, badSection] });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes('keyPoints'))).toBe(true);
    }
  });
});

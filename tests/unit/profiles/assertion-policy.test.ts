import { describe, it, expect } from 'vitest';
import {
  applyAgreement,
  applyContradiction,
  applyDecay,
  shouldSkipQuestion,
} from '../../../src/server/profiles/assertion-policy';

describe('applyAgreement', () => {
  it('adds 0.10', () => {
    expect(applyAgreement(0.5)).toBeCloseTo(0.6);
  });

  it('clamps at 1.0', () => {
    expect(applyAgreement(0.95)).toBe(1.0);
    expect(applyAgreement(1.0)).toBe(1.0);
  });
});

describe('applyContradiction', () => {
  it('subtracts 0.25', () => {
    expect(applyContradiction(0.5)).toBeCloseTo(0.25);
  });

  it('clamps at 0.0', () => {
    expect(applyContradiction(0.1)).toBe(0.0);
    expect(applyContradiction(0.0)).toBe(0.0);
  });
});

describe('applyDecay', () => {
  it('returns input unchanged when elapsed < 30 days', () => {
    const now = new Date('2026-01-31T00:00:00Z');
    const updatedAt29 = new Date('2026-01-02T00:00:00Z'); // 29 days before now
    expect(applyDecay(0.5, updatedAt29, now)).toBeCloseTo(0.5);
  });

  it('subtracts 0.04 at exactly 61 days', () => {
    const now = new Date('2026-03-05T00:00:00Z');
    const updatedAt = new Date('2026-01-03T00:00:00Z'); // 61 days prior
    // floor(61/30) = 2 periods → 0.5 - 2*0.02 = 0.46
    expect(applyDecay(0.5, updatedAt, now)).toBeCloseTo(0.46);
  });

  it('subtracts 0.02 at exactly 30 days', () => {
    const now = new Date('2026-02-01T00:00:00Z');
    const updatedAt = new Date('2026-01-02T00:00:00Z'); // 30 days prior
    expect(applyDecay(0.5, updatedAt, now)).toBeCloseTo(0.48);
  });

  it('clamps at 0 for very old rows', () => {
    const now = new Date('2030-01-01T00:00:00Z');
    const updatedAt = new Date('2020-01-01T00:00:00Z'); // ~3650 days
    expect(applyDecay(0.5, updatedAt, now)).toBe(0);
  });
});

describe('shouldSkipQuestion', () => {
  it('returns true at exactly 0.85 / 3', () => {
    expect(shouldSkipQuestion({ confidence: 0.85, evidenceCount: 3 })).toBe(true);
  });

  it('returns false at 0.85 / 2 (evidence too low)', () => {
    expect(shouldSkipQuestion({ confidence: 0.85, evidenceCount: 2 })).toBe(false);
  });

  it('returns false at 0.84 / 3 (confidence too low)', () => {
    expect(shouldSkipQuestion({ confidence: 0.84, evidenceCount: 3 })).toBe(false);
  });

  it('returns true at 1.0 / 10', () => {
    expect(shouldSkipQuestion({ confidence: 1.0, evidenceCount: 10 })).toBe(true);
  });
});

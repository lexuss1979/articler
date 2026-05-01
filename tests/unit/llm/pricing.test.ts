import { describe, it, expect, vi, afterEach } from 'vitest';
import { costFor, MODEL_PRICES } from '../../../src/server/llm/pricing';

describe('costFor', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a non-zero cost matching hand-computed value for a known model', () => {
    // claude-opus-4.7: $15/MTok prompt, $75/MTok completion
    // 1000 prompt + 500 completion = (15*1000 + 75*500) / 1_000_000 = 52500/1_000_000 = 0.0525
    const cost = costFor('anthropic/claude-opus-4.7', 1000, 500);
    expect(cost).toBe(0.0525);
  });

  it('returns correct cost for haiku', () => {
    // $1/MTok prompt, $5/MTok completion
    // 2000 prompt + 400 completion = (1*2000 + 5*400) / 1_000_000 = 4000/1_000_000 = 0.004
    const cost = costFor('anthropic/claude-haiku-4.5', 2000, 400);
    expect(cost).toBe(0.004);
  });

  it('returns 0 for an unknown model without throwing', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => costFor('unknown/model', 1000, 1000)).not.toThrow();
    expect(costFor('unknown/model', 1000, 1000)).toBe(0);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('unknown model'));
  });

  it('covers every model in MODEL_PRICES with a defined entry', () => {
    for (const model of Object.keys(MODEL_PRICES)) {
      expect(costFor(model, 1000, 1000)).toBeGreaterThanOrEqual(0);
    }
  });
});

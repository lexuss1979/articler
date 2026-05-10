import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUserSettings: vi.fn(),
  getUserCost: vi.fn(),
}));

vi.mock('../../../src/server/settings/budget', () => ({ getUserSettings: mocks.getUserSettings }));
vi.mock('../../../src/server/logging/aggregate', () => ({ getUserCost: mocks.getUserCost }));

const mockWhere = vi.fn();
const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

vi.mock('../../../src/server/db/client', () => ({
  db: { select: mockSelect },
}));

afterEach(() => {
  vi.clearAllMocks();
  mockFrom.mockReturnValue({ where: mockWhere });
  mockSelect.mockReturnValue({ from: mockFrom });
  mocks.getUserSettings.mockResolvedValue({ monthlyCapUsd: null, sessionCapUsd: null });
});

describe('BATCH constants', () => {
  it('resolve to defaults when env unset', async () => {
    vi.resetModules();
    delete process.env.BATCH_CONCURRENCY;
    delete process.env.BATCH_DAILY_SESSION_CAP;
    delete process.env.BATCH_DAILY_IMAGE_CAP;
    const { BATCH_CONCURRENCY, BATCH_DAILY_SESSION_CAP, BATCH_DAILY_IMAGE_CAP } = await import(
      '../../../src/server/batches/caps'
    );
    expect(BATCH_CONCURRENCY).toBe(6);
    expect(BATCH_DAILY_SESSION_CAP).toBe(100);
    expect(BATCH_DAILY_IMAGE_CAP).toBe(100);
  });

  it('falls back to defaults for invalid env values (NaN, negative, zero)', async () => {
    vi.resetModules();
    process.env.BATCH_CONCURRENCY = 'foo';
    process.env.BATCH_DAILY_SESSION_CAP = '-1';
    process.env.BATCH_DAILY_IMAGE_CAP = '0';
    const { BATCH_CONCURRENCY, BATCH_DAILY_SESSION_CAP, BATCH_DAILY_IMAGE_CAP } = await import(
      '../../../src/server/batches/caps'
    );
    expect(BATCH_CONCURRENCY).toBe(6);
    expect(BATCH_DAILY_SESSION_CAP).toBe(100);
    expect(BATCH_DAILY_IMAGE_CAP).toBe(100);
    delete process.env.BATCH_CONCURRENCY;
    delete process.env.BATCH_DAILY_SESSION_CAP;
    delete process.env.BATCH_DAILY_IMAGE_CAP;
  });
});

describe('assertBatchCaps', () => {
  it('returns monthly_usd_exceeded when cost >= cap', async () => {
    mocks.getUserSettings.mockResolvedValue({ monthlyCapUsd: 5, sessionCapUsd: null });
    mocks.getUserCost.mockResolvedValue(5);

    const { assertBatchCaps } = await import('../../../src/server/batches/caps');
    const result = await assertBatchCaps(1, 3);

    expect(result).toEqual({ ok: false, error: 'monthly_usd_exceeded', details: { current: 5, cap: 5 } });
  });

  it('returns daily_session_cap_exceeded when session count + requested exceeds cap', async () => {
    mocks.getUserSettings.mockResolvedValue({ monthlyCapUsd: null, sessionCapUsd: null });
    mockWhere.mockResolvedValueOnce([{ count: 99 }]); // session count

    const { assertBatchCaps } = await import('../../../src/server/batches/caps');
    const result = await assertBatchCaps(1, 2);

    expect(result).toEqual({
      ok: false,
      error: 'daily_session_cap_exceeded',
      details: { current: 99, cap: 100, requested: 2 },
    });
  });

  it('returns daily_image_cap_exceeded when only image cap is breached', async () => {
    mocks.getUserSettings.mockResolvedValue({ monthlyCapUsd: null, sessionCapUsd: null });
    mockWhere.mockResolvedValueOnce([{ count: 0 }]); // session count fine
    mockWhere.mockResolvedValueOnce([{ count: 101 }]); // image count exceeds cap

    const { assertBatchCaps } = await import('../../../src/server/batches/caps');
    const result = await assertBatchCaps(1, 0);

    expect(result).toEqual({
      ok: false,
      error: 'daily_image_cap_exceeded',
      details: { current: 101, cap: 100, requested: 0 },
    });
  });

  it('returns ok: true when all caps are under limit', async () => {
    mocks.getUserSettings.mockResolvedValue({ monthlyCapUsd: null, sessionCapUsd: null });
    mockWhere.mockResolvedValueOnce([{ count: 5 }]); // session count
    mockWhere.mockResolvedValueOnce([{ count: 10 }]); // image count

    const { assertBatchCaps } = await import('../../../src/server/batches/caps');
    const result = await assertBatchCaps(1, 3);

    expect(result).toEqual({ ok: true });
  });
});

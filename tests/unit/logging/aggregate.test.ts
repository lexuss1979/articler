import { describe, it, expect, vi, afterEach } from 'vitest';

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
});

describe('getSessionCost', () => {
  it('returns the sum as a plain number for a known session', async () => {
    mockWhere.mockResolvedValue([{ total: '0.052500' }]);
    const { getSessionCost } = await import('../../../src/server/logging/aggregate');
    const cost = await getSessionCost(1);
    expect(cost).toBeCloseTo(0.0525, 6);
  });

  it('returns 0 when no rows exist (null sum)', async () => {
    mockWhere.mockResolvedValue([{ total: null }]);
    const { getSessionCost } = await import('../../../src/server/logging/aggregate');
    const cost = await getSessionCost(99);
    expect(cost).toBe(0);
  });
});

describe('getUserCost', () => {
  it('returns the sum as a plain number for a known user', async () => {
    mockWhere.mockResolvedValue([{ total: '1.234567' }]);
    const { getUserCost } = await import('../../../src/server/logging/aggregate');
    const cost = await getUserCost(5);
    expect(cost).toBeCloseTo(1.234567, 6);
  });

  it('returns 0 when no rows exist (null sum)', async () => {
    mockWhere.mockResolvedValue([{ total: null }]);
    const { getUserCost } = await import('../../../src/server/logging/aggregate');
    const cost = await getUserCost(99);
    expect(cost).toBe(0);
  });
});

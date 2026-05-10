import { describe, expect, it, vi } from 'vitest';
import { auditProfile, parseArgs } from '../../../scripts/audit-assertions.mjs';

type Row = {
  id: number;
  profileId: number;
  category: string;
  key: string;
  assertion: string;
  confidence: number;
  evidenceCount: number;
  source: string;
  createdAt: Date;
  updatedAt: Date;
};

function row(partial: Partial<Row> & Pick<Row, 'id' | 'key' | 'source'>): Row {
  return {
    profileId: 99,
    category: 'tone',
    assertion: `text ${partial.id}`,
    confidence: 0.7,
    evidenceCount: 2,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...partial,
  } as Row;
}

describe('auditProfile (dry run)', () => {
  it('flags rows whose validator verdict is passes:false and does not call delete', async () => {
    const rows = [
      row({ id: 1, key: 'good_one', source: 'session' }),
      row({ id: 2, key: 'bad_one', source: 'session', assertion: 'user wants ladder safety section' }),
    ];
    const listAssertionsFn = vi.fn().mockResolvedValue(rows);
    const validateGeneralityFn = vi.fn().mockResolvedValue({
      results: [
        { key: 'good_one', passes: true, reason: 'general' },
        { key: 'bad_one', passes: false, reason: 'topic-bound' },
      ],
    });
    const deleteAssertionFn = vi.fn();
    const log = vi.fn();

    const out = await auditProfile({
      profileId: 99,
      apply: false,
      listAssertionsFn,
      validateGeneralityFn,
      deleteAssertionFn,
      log,
    });

    expect(out.flagged).toHaveLength(1);
    expect(out.flagged[0].row.id).toBe(2);
    expect(out.flagged[0].reason).toBe('topic-bound');
    expect(out.kept).toHaveLength(1);
    expect(out.kept[0].id).toBe(1);
    expect(deleteAssertionFn).not.toHaveBeenCalled();

    const logged = log.mock.calls.map((c) => c[0]).join('\n');
    expect(logged).toContain('1 kept, 1 flagged');
    expect(logged).toContain('FLAG bad_one');
  });
});

describe('auditProfile (--apply)', () => {
  it('calls deleteAssertion for each flagged row exactly once', async () => {
    const rows = [
      row({ id: 1, key: 'good_one', source: 'session' }),
      row({ id: 2, key: 'bad_one', source: 'session' }),
    ];
    const listAssertionsFn = vi.fn().mockResolvedValue(rows);
    const validateGeneralityFn = vi.fn().mockResolvedValue({
      results: [
        { key: 'good_one', passes: true, reason: 'general' },
        { key: 'bad_one', passes: false, reason: 'topic-bound' },
      ],
    });
    const deleteAssertionFn = vi.fn().mockResolvedValue(true);

    const out = await auditProfile({
      profileId: 99,
      apply: true,
      listAssertionsFn,
      validateGeneralityFn,
      deleteAssertionFn,
      log: vi.fn(),
    });

    expect(out.flagged).toHaveLength(1);
    expect(deleteAssertionFn).toHaveBeenCalledTimes(1);
    expect(deleteAssertionFn).toHaveBeenCalledWith(99, 2);
  });
});

describe('auditProfile only audits source=session rows', () => {
  it('skips examples-source rows entirely (not passed to validator, not deleted)', async () => {
    const rows = [
      row({ id: 1, key: 'session_one', source: 'session' }),
      row({ id: 2, key: 'examples_one', source: 'examples' }),
    ];
    const listAssertionsFn = vi.fn().mockResolvedValue(rows);
    const validateGeneralityFn = vi.fn().mockResolvedValue({
      results: [{ key: 'session_one', passes: false, reason: 'topic-bound' }],
    });
    const deleteAssertionFn = vi.fn();

    await auditProfile({
      profileId: 99,
      apply: true,
      listAssertionsFn,
      validateGeneralityFn,
      deleteAssertionFn,
      log: vi.fn(),
    });

    expect(validateGeneralityFn).toHaveBeenCalledTimes(1);
    const items = validateGeneralityFn.mock.calls[0][0].items as Array<{ key: string }>;
    expect(items.map((i) => i.key)).toEqual(['session_one']);
    expect(deleteAssertionFn).toHaveBeenCalledTimes(1);
    expect(deleteAssertionFn).toHaveBeenCalledWith(99, 1);
  });
});

describe('auditProfile batches at 5 items per validator call', () => {
  it('calls the validator twice for 7 session rows', async () => {
    const rows = Array.from({ length: 7 }, (_, i) =>
      row({ id: i + 1, key: `k${i + 1}`, source: 'session' }),
    );
    const listAssertionsFn = vi.fn().mockResolvedValue(rows);
    const validateGeneralityFn = vi
      .fn()
      .mockResolvedValueOnce({
        results: rows.slice(0, 5).map((r) => ({ key: r.key, passes: true, reason: '' })),
      })
      .mockResolvedValueOnce({
        results: rows.slice(5).map((r) => ({ key: r.key, passes: true, reason: '' })),
      });

    await auditProfile({
      profileId: 99,
      apply: false,
      listAssertionsFn,
      validateGeneralityFn,
      deleteAssertionFn: vi.fn(),
      log: vi.fn(),
    });

    expect(validateGeneralityFn).toHaveBeenCalledTimes(2);
    expect(validateGeneralityFn.mock.calls[0][0].items).toHaveLength(5);
    expect(validateGeneralityFn.mock.calls[1][0].items).toHaveLength(2);
  });
});

describe('parseArgs', () => {
  it('parses --profile <id>', () => {
    expect(parseArgs(['--profile', '5'])).toEqual({
      profileId: 5,
      all: false,
      apply: false,
      help: false,
    });
  });

  it('parses --profile=<id>', () => {
    expect(parseArgs(['--profile=7'])).toEqual({
      profileId: 7,
      all: false,
      apply: false,
      help: false,
    });
  });

  it('parses --all and --apply combined', () => {
    expect(parseArgs(['--all', '--apply'])).toEqual({
      profileId: null,
      all: true,
      apply: true,
      help: false,
    });
  });

  it('parses --help short form', () => {
    expect(parseArgs(['-h'])).toMatchObject({ help: true });
  });

  it('rejects unknown flags', () => {
    expect(() => parseArgs(['--bogus'])).toThrow(/Unknown argument/);
  });

  it('treats invalid --profile values as null (so the CLI prints help)', () => {
    expect(parseArgs(['--profile', 'abc'])).toMatchObject({ profileId: null });
    expect(parseArgs(['--profile=0'])).toMatchObject({ profileId: null });
    expect(parseArgs(['--profile=-3'])).toMatchObject({ profileId: null });
  });
});

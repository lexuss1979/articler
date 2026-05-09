import { describe, expect, it } from 'vitest';
import {
  decorationKindSchema,
  decorationRoundSchema,
  decorationStateSchema,
  decorationSuggestionSchema,
  insertParagraph,
  joinParagraphs,
  parseDecorationState,
  proposeDecorationResponseSchema,
  splitParagraphs,
  suggestionStatusSchema,
} from '@/server/sessions/decoration';

describe('decorationKindSchema', () => {
  it('accepts a valid value', () => {
    expect(decorationKindSchema.parse('pull_quote')).toBe('pull_quote');
  });
  it('rejects invalid kind', () => {
    expect(() => decorationKindSchema.parse('banner')).toThrow();
  });
});

describe('suggestionStatusSchema', () => {
  it('accepts a valid value', () => {
    expect(suggestionStatusSchema.parse('accepted')).toBe('accepted');
  });
  it('rejects invalid status', () => {
    expect(() => suggestionStatusSchema.parse('queued')).toThrow();
  });
});

describe('decorationSuggestionSchema', () => {
  const valid = {
    id: 'sug_1',
    kind: 'callout' as const,
    sectionId: 'intro',
    paragraphIndex: 2,
    contentMd: '> Important callout.',
    rationale: 'Highlights the key takeaway.',
    status: 'proposed' as const,
  };
  it('accepts a valid suggestion', () => {
    expect(decorationSuggestionSchema.parse(valid)).toMatchObject(valid);
  });
  it('rejects negative paragraphIndex', () => {
    expect(() =>
      decorationSuggestionSchema.parse({ ...valid, paragraphIndex: -1 }),
    ).toThrow();
  });
  it('defaults status to proposed', () => {
    const { status: _drop, ...withoutStatus } = valid;
    expect(decorationSuggestionSchema.parse(withoutStatus).status).toBe('proposed');
  });
});

describe('proposeDecorationResponseSchema', () => {
  const valid = {
    suggestions: [
      {
        kind: 'pull_quote' as const,
        sectionId: 'body',
        paragraphIndex: 0,
        contentMd: '"A memorable quote."',
        rationale: 'Adds visual anchor.',
      },
    ],
  };
  it('accepts a valid response', () => {
    expect(proposeDecorationResponseSchema.parse(valid)).toMatchObject(valid);
  });
  it('rejects empty contentMd', () => {
    expect(() =>
      proposeDecorationResponseSchema.parse({
        suggestions: [{ ...valid.suggestions[0], contentMd: '' }],
      }),
    ).toThrow();
  });
  it('rejects more than 30 suggestions', () => {
    const item = valid.suggestions[0];
    expect(() =>
      proposeDecorationResponseSchema.parse({ suggestions: Array(31).fill(item) }),
    ).toThrow();
  });
});

describe('decorationRoundSchema', () => {
  const valid = {
    id: 'round_1',
    draftHash: 'abc123',
    createdAt: '2026-05-03T10:00:00.000Z',
    suggestions: [],
  };
  it('accepts a valid round', () => {
    expect(decorationRoundSchema.parse(valid)).toEqual(valid);
  });
  it('rejects empty draftHash', () => {
    expect(() => decorationRoundSchema.parse({ ...valid, draftHash: '' })).toThrow();
  });
});

describe('decorationStateSchema', () => {
  it('accepts state with rounds', () => {
    const value = {
      rounds: [
        {
          id: 'r1',
          draftHash: 'h',
          createdAt: '2026-05-03T10:00:00.000Z',
          suggestions: [],
        },
      ],
    };
    expect(decorationStateSchema.parse(value)).toEqual(value);
  });
  it('rejects rounds with wrong shape', () => {
    expect(() => decorationStateSchema.parse({ rounds: [{ id: '' }] })).toThrow();
  });
});

describe('parseDecorationState', () => {
  it('returns { rounds: [] } on null', () => {
    expect(parseDecorationState(null)).toEqual({ rounds: [] });
  });
  it('returns { rounds: [] } on invalid input', () => {
    expect(parseDecorationState({ rounds: 'nope' })).toEqual({ rounds: [] });
  });
  it('preserves valid state', () => {
    const value = {
      rounds: [
        {
          id: 'r1',
          draftHash: 'h',
          createdAt: '2026-05-03T10:00:00.000Z',
          suggestions: [],
        },
      ],
    };
    expect(parseDecorationState(value)).toEqual(value);
  });
});

describe('splitParagraphs / joinParagraphs', () => {
  it('returns empty array for empty string', () => {
    expect(splitParagraphs('')).toEqual([]);
  });
  it('splits on two or more newlines', () => {
    expect(splitParagraphs('a\n\nb\n\n\nc')).toHaveLength(3);
  });
  it('rejoins with two newlines', () => {
    expect(joinParagraphs(['a', 'b', 'c'])).toBe('a\n\nb\n\nc');
  });
});

describe('insertParagraph', () => {
  it('inserts at the given index', () => {
    expect(insertParagraph('a\n\nb', 1, 'X')).toBe('a\n\nX\n\nb');
  });
  it('clamps oversized index to end', () => {
    expect(insertParagraph('a', 99, 'X')).toBe('a\n\nX');
  });
  it('clamps negative index to start', () => {
    expect(insertParagraph('a\n\nb', -5, 'X')).toBe('X\n\na\n\nb');
  });
  it('trims the inserted content', () => {
    expect(insertParagraph('a\n\nb', 1, '  X  ')).toBe('a\n\nX\n\nb');
  });
});

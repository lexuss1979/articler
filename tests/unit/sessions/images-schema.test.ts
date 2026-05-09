import { describe, expect, it } from 'vitest';
import {
  imageAspectSchema,
  imageCandidateSchema,
  imageModeSchema,
  imagePromptSchema,
  imageSlotKindSchema,
  imageSlotSchema,
  imageStateSchema,
  parseImageState,
  proposeImageSlotsResponseSchema,
  renderImageMarkdown,
  stockKeywordsResponseSchema,
  type ImageCandidate,
} from '@/server/sessions/images';

describe('imageSlotKindSchema', () => {
  it('accepts hero and inline', () => {
    expect(imageSlotKindSchema.parse('hero')).toBe('hero');
    expect(imageSlotKindSchema.parse('inline')).toBe('inline');
  });
  it('rejects unknown kind', () => {
    expect(() => imageSlotKindSchema.parse('banner')).toThrow();
  });
});

describe('imageAspectSchema', () => {
  it('accepts a known aspect', () => {
    expect(imageAspectSchema.parse('16:9')).toBe('16:9');
  });
  it('rejects an unknown aspect', () => {
    expect(() => imageAspectSchema.parse('21:9')).toThrow();
  });
});

describe('imageModeSchema', () => {
  it('accepts known modes', () => {
    expect(imageModeSchema.parse('undecided')).toBe('undecided');
    expect(imageModeSchema.parse('generate')).toBe('generate');
    expect(imageModeSchema.parse('stock')).toBe('stock');
  });
  it('rejects unknown mode', () => {
    expect(() => imageModeSchema.parse('skip')).toThrow();
  });
});

describe('imagePromptSchema', () => {
  const valid = {
    subject: 'A laptop on a desk with code',
    style: 'editorial photo',
    composition: 'centered, shallow depth of field',
    palette: ['indigo', 'amber'],
    lighting: 'soft window light',
    mood: 'focused',
    aspect: '16:9' as const,
  };
  it('accepts a valid prompt', () => {
    expect(imagePromptSchema.parse(valid)).toMatchObject(valid);
  });
  it('rejects empty palette', () => {
    expect(() => imagePromptSchema.parse({ ...valid, palette: [] })).toThrow();
  });
  it('accepts optional fields', () => {
    const parsed = imagePromptSchema.parse({
      ...valid,
      camera: '35mm',
      negative: 'no text',
    });
    expect(parsed.camera).toBe('35mm');
    expect(parsed.negative).toBe('no text');
  });
});

describe('imageCandidateSchema', () => {
  const valid: ImageCandidate = {
    id: 'c_1',
    source: 'generated',
    localPath: '/api/images/1/slot_a/c1.png',
    createdAt: '2026-05-03T10:00:00.000Z',
  };
  it('accepts a valid candidate', () => {
    expect(imageCandidateSchema.parse(valid)).toMatchObject(valid);
  });
  it('rejects empty localPath', () => {
    expect(() => imageCandidateSchema.parse({ ...valid, localPath: '' })).toThrow();
  });
});

describe('imageSlotSchema', () => {
  const baseInline = {
    id: 'slot_a',
    kind: 'inline' as const,
    sectionId: 'intro',
    paragraphIndex: 0,
    brief: 'Diagram of cache mechanics',
  };
  const baseHero = {
    id: 'slot_hero',
    kind: 'hero' as const,
    brief: 'Hero shot for the article',
  };
  it('accepts a valid inline slot', () => {
    const parsed = imageSlotSchema.parse(baseInline);
    expect(parsed.mode).toBe('undecided');
    expect(parsed.candidates).toEqual([]);
  });
  it('accepts a valid hero slot', () => {
    expect(imageSlotSchema.parse(baseHero).kind).toBe('hero');
  });
  it('rejects inline slot without sectionId', () => {
    const { sectionId: _drop, ...rest } = baseInline;
    expect(() => imageSlotSchema.parse(rest)).toThrow();
  });
  it('rejects hero slot with sectionId', () => {
    expect(() =>
      imageSlotSchema.parse({ ...baseHero, sectionId: 'intro' }),
    ).toThrow();
  });
});

describe('imageStateSchema', () => {
  it('accepts empty slots', () => {
    expect(imageStateSchema.parse({})).toEqual({ slots: [] });
  });
  it('rejects slots with wrong shape', () => {
    expect(() => imageStateSchema.parse({ slots: [{ id: '' }] })).toThrow();
  });
});

describe('proposeImageSlotsResponseSchema', () => {
  const valid = {
    heroBrief: 'Hero image showing a developer at a desk',
    inlineSlots: [
      { sectionId: 'intro', paragraphIndex: 1, brief: 'Diagram' },
    ],
  };
  it('accepts a valid response', () => {
    expect(proposeImageSlotsResponseSchema.parse(valid)).toMatchObject(valid);
  });
  it('rejects empty heroBrief', () => {
    expect(() =>
      proposeImageSlotsResponseSchema.parse({ ...valid, heroBrief: '' }),
    ).toThrow();
  });
  it('rejects more than 8 inline slots', () => {
    const item = valid.inlineSlots[0]!;
    expect(() =>
      proposeImageSlotsResponseSchema.parse({
        ...valid,
        inlineSlots: Array(9).fill(item),
      }),
    ).toThrow();
  });
});

describe('stockKeywordsResponseSchema', () => {
  it('accepts a valid response', () => {
    expect(stockKeywordsResponseSchema.parse({ keywords: ['cache', 'memory'] })).toMatchObject({
      keywords: ['cache', 'memory'],
    });
  });
  it('rejects empty keywords array', () => {
    expect(() => stockKeywordsResponseSchema.parse({ keywords: [] })).toThrow();
  });
});

describe('parseImageState', () => {
  it('returns { slots: [] } on null', () => {
    expect(parseImageState(null)).toEqual({ slots: [] });
  });
  it('returns { slots: [] } on invalid input', () => {
    expect(parseImageState({ slots: 'nope' })).toEqual({ slots: [] });
  });
  it('preserves valid state', () => {
    const value = {
      slots: [
        {
          id: 'slot_hero',
          kind: 'hero' as const,
          brief: 'Hero',
          mode: 'undecided' as const,
          candidates: [],
        },
      ],
    };
    expect(parseImageState(value)).toMatchObject(value);
  });
});

describe('renderImageMarkdown', () => {
  it('renders generated candidate', () => {
    const c: ImageCandidate = {
      id: 'c1',
      source: 'generated',
      localPath: '/api/images/1/slot_a/c1.png',
      createdAt: '2026-05-03T10:00:00.000Z',
    };
    expect(renderImageMarkdown(c, 'Hero')).toBe('![Hero](/api/images/1/slot_a/c1.png)');
  });
  it('renders stock candidate with attribution', () => {
    const c: ImageCandidate = {
      id: 'c2',
      source: 'stock',
      localPath: '/api/images/1/slot_a/c2.jpg',
      sourceUrl: 'https://images.unsplash.com/photo-x',
      attribution: 'Photo by Jane Doe on Unsplash',
      createdAt: '2026-05-03T10:00:00.000Z',
    };
    const out = renderImageMarkdown(c, 'Inline');
    expect(out).toContain('![Inline](https://images.unsplash.com/photo-x)');
    expect(out).toContain('<sub>Photo by Jane Doe on Unsplash</sub>');
  });
  it('omits <sub> when attribution missing', () => {
    const c: ImageCandidate = {
      id: 'c3',
      source: 'stock',
      localPath: '/api/images/1/slot_a/c3.jpg',
      sourceUrl: 'https://example.com/x.jpg',
      createdAt: '2026-05-03T10:00:00.000Z',
    };
    expect(renderImageMarkdown(c, 'X')).toBe('![X](https://example.com/x.jpg)');
  });
  it('escapes brackets in alt', () => {
    const c: ImageCandidate = {
      id: 'c4',
      source: 'generated',
      localPath: '/p.png',
      createdAt: '2026-05-03T10:00:00.000Z',
    };
    expect(renderImageMarkdown(c, 'a [b]')).toBe('![a \\[b\\]](/p.png)');
  });
});

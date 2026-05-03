import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderMarkdownArticle } from '../../../src/server/export/markdown';
import { IMAGES_ROOT } from '../../../src/server/images/storage';
import type { ImageState } from '../../../src/server/sessions/images';

describe('renderMarkdownArticle', () => {
  it('returns empty content and no attachments when draftMd is empty', async () => {
    const result = await renderMarkdownArticle({
      session: { id: 1, draftMd: '' },
      imageState: { slots: [] },
    });
    expect(result).toEqual({ contentMd: '', attachments: [] });
  });

  it('returns empty content and no attachments when draftMd is null', async () => {
    const result = await renderMarkdownArticle({
      session: { id: 1, draftMd: null },
      imageState: { slots: [] },
    });
    expect(result).toEqual({ contentMd: '', attachments: [] });
  });

  it('rewrites generated and stock image refs and emits matching attachments', async () => {
    const heroLocal = '/api/images/42/hero/cand-1.png';
    const inlineLocal = '/api/images/42/sec1-img/cand-2.jpg';
    const inlineStockUrl = 'https://images.unsplash.com/photo-xyz?w=800';

    const draftMd = [
      `![Hero alt](${heroLocal})`,
      ``,
      `# Section 1`,
      ``,
      `Some prose here.`,
      ``,
      `![Inline alt](${inlineStockUrl}) <sub>Photo by Jane / Unsplash</sub>`,
      ``,
      `More prose.`,
    ].join('\n');

    const imageState: ImageState = {
      slots: [
        {
          id: 'hero',
          kind: 'hero',
          brief: 'h',
          mode: 'generate',
          candidates: [
            {
              id: 'cand-1',
              source: 'generated',
              localPath: heroLocal,
              createdAt: '2026-05-03T00:00:00Z',
            },
          ],
          chosenCandidateId: 'cand-1',
        },
        {
          id: 'sec1-img',
          kind: 'inline',
          sectionId: 'section-1',
          paragraphIndex: 0,
          brief: 'i',
          mode: 'stock',
          candidates: [
            {
              id: 'cand-2',
              source: 'stock',
              localPath: inlineLocal,
              sourceUrl: inlineStockUrl,
              attribution: 'Photo by Jane / Unsplash',
              createdAt: '2026-05-03T00:00:00Z',
            },
          ],
          chosenCandidateId: 'cand-2',
        },
      ],
    };

    const { contentMd, attachments } = await renderMarkdownArticle({
      session: { id: 42, draftMd },
      imageState,
    });

    expect(contentMd).toContain('![Hero alt](images/hero.png)');
    expect(contentMd).toContain(
      '![Inline alt](images/sec1-img.jpg) <sub>Photo by Jane / Unsplash</sub>',
    );
    expect(contentMd).not.toContain(heroLocal);
    expect(contentMd).not.toContain(inlineStockUrl);

    expect(attachments).toEqual([
      {
        bundlePath: 'images/hero.png',
        absSourcePath: path.join(IMAGES_ROOT, '42/hero/cand-1.png'),
        mime: 'image/png',
      },
      {
        bundlePath: 'images/sec1-img.jpg',
        absSourcePath: path.join(IMAGES_ROOT, '42/sec1-img/cand-2.jpg'),
        mime: 'image/jpeg',
      },
    ]);
  });

  it('leaves image refs untouched when no chosen candidate matches', async () => {
    const draftMd = `![Other](https://example.com/other.png)`;
    const imageState: ImageState = { slots: [] };
    const { contentMd, attachments } = await renderMarkdownArticle({
      session: { id: 1, draftMd },
      imageState,
    });
    expect(contentMd).toBe(draftMd);
    expect(attachments).toEqual([]);
  });

  it('skips slots whose chosen candidate URL is no longer in the draft', async () => {
    const removedLocal = '/api/images/7/hero/old.png';
    const draftMd = `# Just text, no image refs.`;
    const imageState: ImageState = {
      slots: [
        {
          id: 'hero',
          kind: 'hero',
          brief: 'h',
          mode: 'generate',
          candidates: [
            {
              id: 'old',
              source: 'generated',
              localPath: removedLocal,
              createdAt: '2026-05-03T00:00:00Z',
            },
          ],
          chosenCandidateId: 'old',
        },
      ],
    };
    const { contentMd, attachments } = await renderMarkdownArticle({
      session: { id: 7, draftMd },
      imageState,
    });
    expect(contentMd).toBe(draftMd);
    expect(attachments).toEqual([]);
  });
});

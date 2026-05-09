import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { buildAttributionsReadme, buildZipBundle } from '../../../src/server/export/bundle';
import type { ImageAttachment } from '../../../src/server/export/markdown';
import type { ImageState } from '../../../src/server/sessions/images';

describe('buildZipBundle', () => {
  it('packs all entries with their payloads', async () => {
    const heroPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const articleMd = '# Title\n\nBody.';
    const readme = 'No external attributions.\n';

    const buf = await buildZipBundle([
      { path: 'article.md', bytes: articleMd },
      { path: 'images/hero.png', bytes: heroPng },
      { path: 'README.txt', bytes: readme },
    ]);

    expect(buf.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));

    const zip = await JSZip.loadAsync(buf);
    expect(await zip.file('article.md')!.async('string')).toBe(articleMd);
    expect(await zip.file('README.txt')!.async('string')).toBe(readme);
    const heroBytes = await zip.file('images/hero.png')!.async('nodebuffer');
    expect(Buffer.compare(heroBytes, heroPng)).toBe(0);
  });
});

describe('buildAttributionsReadme', () => {
  const stockAttachment: ImageAttachment = {
    bundlePath: 'images/hero.jpg',
    absSourcePath: '/data/images/1/hero/cand-1.jpg',
    mime: 'image/jpeg',
  };
  const generatedAttachment: ImageAttachment = {
    bundlePath: 'images/inline.png',
    absSourcePath: '/data/images/1/inline/cand-2.png',
    mime: 'image/png',
  };
  const imageState: ImageState = {
    slots: [
      {
        id: 'hero',
        kind: 'hero',
        brief: 'h',
        mode: 'stock',
        candidates: [
          {
            id: 'cand-1',
            source: 'stock',
            localPath: '/api/images/1/hero/cand-1.jpg',
            sourceUrl: 'https://images.unsplash.com/photo-abc',
            attribution: 'Photo by Jane / Unsplash',
            createdAt: '2026-05-03T00:00:00Z',
          },
        ],
        chosenCandidateId: 'cand-1',
      },
      {
        id: 'inline',
        kind: 'inline',
        sectionId: 'sec-1',
        paragraphIndex: 0,
        brief: 'i',
        mode: 'generate',
        candidates: [
          {
            id: 'cand-2',
            source: 'generated',
            localPath: '/api/images/1/inline/cand-2.png',
            createdAt: '2026-05-03T00:00:00Z',
          },
        ],
        chosenCandidateId: 'cand-2',
      },
    ],
  };

  it('lists only stock attributions', () => {
    const out = buildAttributionsReadme(
      [stockAttachment, generatedAttachment],
      imageState,
    );
    expect(out).toContain('images/hero.jpg');
    expect(out).toContain('Photo by Jane / Unsplash');
    expect(out).toContain('https://images.unsplash.com/photo-abc');
    expect(out).not.toContain('images/inline.png');
    expect(out.endsWith('\n')).toBe(true);
  });

  it('returns the no-attributions sentinel when nothing applies', () => {
    expect(buildAttributionsReadme([], { slots: [] })).toBe('No external attributions.\n');
    expect(buildAttributionsReadme([generatedAttachment], imageState)).toBe(
      'No external attributions.\n',
    );
  });
});

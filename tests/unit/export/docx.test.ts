import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { renderDocxArticle } from '../../../src/server/export/docx';

const ONE_BY_ONE_PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);

describe('renderDocxArticle', () => {
  let tmpDir: string;
  let imagePath: string;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'articler-docx-'));
    imagePath = path.join(tmpDir, 'hero.png');
    await fs.writeFile(imagePath, ONE_BY_ONE_PNG);
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('produces a valid docx zip with embedded image media', async () => {
    const contentMd = [
      '# Title',
      '',
      'Some intro paragraph.',
      '',
      '- one',
      '- two',
      '',
      '![Hero](images/hero.png)',
    ].join('\n');

    const buf = await renderDocxArticle({
      contentMd,
      attachments: [
        { bundlePath: 'images/hero.png', absSourcePath: imagePath, mime: 'image/png' },
      ],
      rules: { flavor: 'standard', headingShift: 0 },
    });

    expect(buf.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));

    const zip = await JSZip.loadAsync(buf);
    expect(zip.file('word/document.xml')).toBeTruthy();

    const mediaEntries = Object.keys(zip.files).filter((p) => /^word\/media\/.+\.png$/.test(p));
    expect(mediaEntries.length).toBeGreaterThanOrEqual(1);

    const docXml = await zip.file('word/document.xml')!.async('string');
    expect(docXml).toContain('Title');
    expect(docXml).toContain('Some intro paragraph.');
    expect(docXml).toContain('one');
    expect(docXml).toContain('two');
  });

  it('emits an "unsupported" placeholder for raw HTML blocks', async () => {
    const contentMd = '<div>raw html block</div>\n\nNormal paragraph.';
    const buf = await renderDocxArticle({
      contentMd,
      attachments: [],
      rules: { flavor: 'standard', headingShift: 0 },
    });
    const zip = await JSZip.loadAsync(buf);
    const docXml = await zip.file('word/document.xml')!.async('string');
    expect(docXml).toContain('[unsupported: html]');
    expect(docXml).toContain('Normal paragraph.');
  });

  it('shifts heading levels per rules.headingShift with clamping', async () => {
    const buf = await renderDocxArticle({
      contentMd: '# A\n\n## B',
      attachments: [],
      rules: { flavor: 'standard', headingShift: 1 },
    });
    const zip = await JSZip.loadAsync(buf);
    const docXml = await zip.file('word/document.xml')!.async('string');
    expect(docXml).toContain('Heading2');
    expect(docXml).toContain('Heading3');
  });
});

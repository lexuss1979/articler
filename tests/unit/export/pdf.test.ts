import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  goto: vi.fn(),
  pdf: vi.fn(),
  close: vi.fn(),
  newPage: vi.fn(),
  launch: vi.fn(),
}));

vi.mock('playwright', () => ({
  chromium: { launch: mocks.launch },
}));

import { renderPdfArticle } from '../../../src/server/export/pdf';

beforeEach(() => {
  mocks.goto.mockReset().mockResolvedValue(undefined);
  mocks.pdf.mockReset().mockResolvedValue(Buffer.from('%PDF-1.7\nfake'));
  mocks.close.mockReset().mockResolvedValue(undefined);
  mocks.newPage.mockReset().mockResolvedValue({
    goto: mocks.goto,
    pdf: mocks.pdf,
  });
  mocks.launch.mockReset().mockResolvedValue({
    newPage: mocks.newPage,
    close: mocks.close,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('renderPdfArticle', () => {
  it('returns the PDF buffer produced by Chromium', async () => {
    const buf = await renderPdfArticle({
      html: '<!doctype html><html><head></head><body>x</body></html>',
      attachments: [],
    });
    expect(buf.subarray(0, 5)).toEqual(Buffer.from('%PDF-'));
    expect(mocks.launch).toHaveBeenCalledWith({ headless: true });
    expect(mocks.pdf).toHaveBeenCalledWith({
      format: 'A4',
      margin: { top: '20mm', right: '15mm', bottom: '20mm', left: '15mm' },
    });
    expect(mocks.close).toHaveBeenCalled();
  });

  it('navigates to a file:// URL inside the os tmpdir tree', async () => {
    await renderPdfArticle({
      html: '<!doctype html><html><head></head><body>x</body></html>',
      attachments: [],
    });
    const url = mocks.goto.mock.calls[0]![0] as string;
    expect(url.startsWith('file://')).toBe(true);
    const filePath = url.slice('file://'.length);
    expect(filePath.startsWith(os.tmpdir())).toBe(true);
    expect(filePath.endsWith('index.html')).toBe(true);
  });

  it('cleans up the tmp dir afterwards', async () => {
    await renderPdfArticle({
      html: '<!doctype html><html><head></head><body>x</body></html>',
      attachments: [],
    });
    const url = mocks.goto.mock.calls[0]![0] as string;
    const tmpDir = url.slice('file://'.length).replace(/\/index\.html$/, '');
    await expect(fs.access(tmpDir)).rejects.toThrow();
  });

  it('copies attachments into the tmp dir before navigation', async () => {
    const srcDir = await fs.mkdtemp(`${os.tmpdir()}/articler-pdf-fixture-`);
    const srcImage = `${srcDir}/hero.png`;
    await fs.writeFile(srcImage, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    let tmpDirSnapshot: string[] = [];
    mocks.goto.mockImplementationOnce(async (url: string) => {
      const dir = url.slice('file://'.length).replace(/\/index\.html$/, '');
      tmpDirSnapshot = await fs.readdir(`${dir}/images`);
    });

    await renderPdfArticle({
      html: '<!doctype html><html><head></head><body>x</body></html>',
      attachments: [
        { bundlePath: 'images/hero.png', absSourcePath: srcImage, mime: 'image/png' },
      ],
    });

    expect(tmpDirSnapshot).toContain('hero.png');
    await fs.rm(srcDir, { recursive: true, force: true });
  });

  it('cleans up the tmp dir even if Chromium throws', async () => {
    mocks.launch.mockRejectedValueOnce(new Error('boom'));
    await expect(
      renderPdfArticle({
        html: '<!doctype html><html><head></head><body>x</body></html>',
        attachments: [],
      }),
    ).rejects.toThrow('boom');
    expect(mocks.close).not.toHaveBeenCalled();
  });
});

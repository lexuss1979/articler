import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { chromium } from 'playwright';
import type { ImageAttachment } from './markdown';
import { ARTICLE_STYLESHEET } from './styles';

function injectPrintStyle(html: string): string {
  const styleTag = `<style>${ARTICLE_STYLESHEET}</style>`;
  if (html.includes('</head>')) return html.replace('</head>', `${styleTag}</head>`);
  return styleTag + html;
}

export async function renderPdfArticle({
  html,
  attachments,
}: {
  html: string;
  attachments: ImageAttachment[];
}): Promise<Buffer> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'articler-pdf-'));
  try {
    const indexPath = path.join(tmpDir, 'index.html');
    await fs.writeFile(indexPath, injectPrintStyle(html));

    for (const att of attachments) {
      const dst = path.join(tmpDir, att.bundlePath);
      await fs.mkdir(path.dirname(dst), { recursive: true });
      await fs.copyFile(att.absSourcePath, dst);
    }

    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.goto('file://' + indexPath);
      const pdf = await page.pdf({
        format: 'A4',
        margin: { top: '20mm', right: '15mm', bottom: '20mm', left: '15mm' },
      });
      return pdf;
    } finally {
      await browser.close();
    }
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

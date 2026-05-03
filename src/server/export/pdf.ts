import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { chromium } from 'playwright';
import type { ImageAttachment } from './markdown';

const PRINT_STYLESHEET = `
  body { font-family: system-ui, -apple-system, sans-serif; max-width: 42rem; margin: 0 auto; padding: 2rem; line-height: 1.55; }
  img { max-width: 100%; height: auto; }
  pre { background: #f6f8fa; padding: 0.75rem; overflow: auto; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  blockquote { border-left: 3px solid #d0d7de; margin: 0; padding: 0 0 0 1rem; color: #57606a; }
`;

function injectPrintStyle(html: string): string {
  const styleTag = `<style>${PRINT_STYLESHEET}</style>`;
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

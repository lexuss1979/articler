import * as fs from 'node:fs/promises';
import { z } from 'zod';
import { requireUser } from '../../../../../server/auth/require-user';
import { getSession } from '../../../../../server/sessions/repo';
import { getProfile } from '../../../../../server/profiles/repo';
import { parseImageState } from '../../../../../server/sessions/images';
import { parseMarkupRules } from '../../../../../server/profiles/markup';
import {
  renderMarkdownArticle,
  type ImageAttachment,
} from '../../../../../server/export/markdown';
import { renderHtmlArticle } from '../../../../../server/export/html';
import { renderDocxArticle } from '../../../../../server/export/docx';
import { renderPdfArticle } from '../../../../../server/export/pdf';
import {
  buildAttributionsReadme,
  buildZipBundle,
} from '../../../../../server/export/bundle';

const formatSchema = z.enum(['md', 'html', 'docx', 'pdf']);

async function readAttachmentBytes(
  attachments: ImageAttachment[],
): Promise<Array<{ path: string; bytes: Buffer }>> {
  return Promise.all(
    attachments.map(async (att) => ({
      path: att.bundlePath,
      bytes: await fs.readFile(att.absSourcePath),
    })),
  );
}

const PDF_LAUNCH_PATTERNS = [
  /browserType\.launch/i,
  /Executable doesn't exist/i,
  /libnspr4/i,
  /error while loading shared libraries/i,
  /missing dependencies/i,
];

function isPdfLaunchFailure(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return PDF_LAUNCH_PATTERNS.some((pattern) => pattern.test(message));
}

function renderError(format: 'md' | 'html' | 'docx' | 'pdf', err: unknown): Response {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[export] ${format} render failed:`, err);
  if (format === 'pdf' && isPdfLaunchFailure(err)) {
    return Response.json({ error: 'pdf_unavailable', message }, { status: 503 });
  }
  return Response.json({ error: 'render_failed', format, message }, { status: 500 });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  const { id: idStr } = await params;
  const id = Number(idStr);

  const session = await getSession(user.id, id);
  if (!session) {
    return Response.json({ error: 'not_found' }, { status: 404 });
  }
  if (session.state !== 'export' && session.state !== 'done') {
    return Response.json({ error: 'wrong_state' }, { status: 409 });
  }

  const url = new URL(request.url);
  const formatParsed = formatSchema.safeParse(url.searchParams.get('format'));
  if (!formatParsed.success) {
    return Response.json({ error: 'bad_format' }, { status: 400 });
  }
  const format = formatParsed.data;

  const profile = await getProfile(user.id, session.profileId);
  if (!profile) {
    return Response.json({ error: 'not_found' }, { status: 404 });
  }

  const rules = parseMarkupRules(profile.markupRules);
  const imageState = parseImageState(session.images);
  const { contentMd, attachments } = await renderMarkdownArticle({
    session: { id: session.id, draftMd: session.draftMd },
    imageState,
  });

  const filenameBase = `article-${id}`;

  if (format === 'md') {
    try {
      const imageBytes = await readAttachmentBytes(attachments);
      const zip = await buildZipBundle([
        { path: 'article.md', bytes: contentMd },
        ...imageBytes,
        { path: 'README.txt', bytes: buildAttributionsReadme(attachments, imageState) },
      ]);
      return new Response(new Uint8Array(zip), {
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="${filenameBase}-md.zip"`,
        },
      });
    } catch (err) {
      return renderError('md', err);
    }
  }

  if (format === 'html') {
    try {
      const html = await renderHtmlArticle(contentMd, rules);
      const imageBytes = await readAttachmentBytes(attachments);
      const zip = await buildZipBundle([
        { path: 'article.html', bytes: html },
        ...imageBytes,
        { path: 'README.txt', bytes: buildAttributionsReadme(attachments, imageState) },
      ]);
      return new Response(new Uint8Array(zip), {
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="${filenameBase}-html.zip"`,
        },
      });
    } catch (err) {
      return renderError('html', err);
    }
  }

  if (format === 'docx') {
    try {
      const buf = await renderDocxArticle({ contentMd, attachments, rules });
      return new Response(new Uint8Array(buf), {
        headers: {
          'Content-Type':
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': `attachment; filename="${filenameBase}.docx"`,
        },
      });
    } catch (err) {
      return renderError('docx', err);
    }
  }

  try {
    const html = await renderHtmlArticle(contentMd, rules);
    const buf = await renderPdfArticle({ html, attachments });
    return new Response(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filenameBase}.pdf"`,
      },
    });
  } catch (err) {
    return renderError('pdf', err);
  }
}

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { IMAGES_ROOT } from '../../../../server/images/storage';

const EXT_TO_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await params;
  if (!Array.isArray(segments) || segments.length === 0) {
    return new Response('Bad request', { status: 400 });
  }
  for (const seg of segments) {
    if (
      !seg ||
      seg.startsWith('.') ||
      seg.includes('..') ||
      seg.includes('/') ||
      seg.includes('\\')
    ) {
      return new Response('Bad request', { status: 400 });
    }
  }
  const relPath = segments.join('/');
  const resolved = path.resolve(IMAGES_ROOT, relPath);
  if (resolved !== IMAGES_ROOT && !resolved.startsWith(IMAGES_ROOT + path.sep)) {
    return new Response('Bad request', { status: 400 });
  }

  let bytes: Buffer;
  try {
    bytes = await fs.readFile(resolved);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return new Response('Not found', { status: 404 });
    }
    throw err;
  }

  const ext = path.extname(resolved).toLowerCase();
  const mime = EXT_TO_MIME[ext] ?? 'application/octet-stream';
  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': mime,
      'Cache-Control': 'private, max-age=3600',
    },
  });
}

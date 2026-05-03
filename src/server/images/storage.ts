import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fetch as undiciFetch, ProxyAgent, type Dispatcher } from 'undici';

export const IMAGES_ROOT = path.resolve(process.cwd(), 'data', 'images');

const ALLOWED_MIMES = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
} as const;

type AllowedMime = keyof typeof ALLOWED_MIMES;

function getDispatcher(): Dispatcher | undefined {
  const proxy = process.env.HTTP_PROXY || process.env.HTTPS_PROXY;
  return proxy ? new ProxyAgent(proxy) : undefined;
}

function extFromMime(mime: string | null | undefined): string {
  if (mime && mime in ALLOWED_MIMES) {
    return ALLOWED_MIMES[mime as AllowedMime];
  }
  return 'png';
}

function buildPaths(
  root: string,
  sessionId: number,
  slotId: string,
  candidateId: string,
  ext: string,
) {
  const filename = `${candidateId}.${ext}`;
  const absDir = path.join(root, String(sessionId), slotId);
  const absPath = path.join(absDir, filename);
  const localPath = `/api/images/${sessionId}/${slotId}/${filename}`;
  return { absDir, absPath, localPath };
}

export async function saveImageFromB64(args: {
  sessionId: number;
  slotId: string;
  candidateId: string;
  mime: string;
  b64: string;
  root?: string;
}): Promise<{ localPath: string; absPath: string }> {
  const root = args.root ?? IMAGES_ROOT;
  const ext = extFromMime(args.mime);
  const { absDir, absPath, localPath } = buildPaths(
    root,
    args.sessionId,
    args.slotId,
    args.candidateId,
    ext,
  );
  await fs.mkdir(absDir, { recursive: true });
  const buffer = Buffer.from(args.b64, 'base64');
  await fs.writeFile(absPath, buffer);
  return { localPath, absPath };
}

export async function saveImageFromUrl(args: {
  sessionId: number;
  slotId: string;
  candidateId: string;
  url: string;
  root?: string;
}): Promise<{ localPath: string; absPath: string }> {
  const root = args.root ?? IMAGES_ROOT;
  const res = await undiciFetch(args.url, {
    dispatcher: getDispatcher(),
  } as Parameters<typeof undiciFetch>[1]);
  if (!res.ok) {
    throw new Error(`saveImageFromUrl: HTTP ${res.status}`);
  }
  const contentType = res.headers.get('content-type') ?? '';
  const mime = contentType.split(';')[0]!.trim().toLowerCase();
  if (!(mime in ALLOWED_MIMES)) {
    throw new Error(`saveImageFromUrl: unsupported content-type "${contentType}"`);
  }
  const ext = ALLOWED_MIMES[mime as AllowedMime];
  const { absDir, absPath, localPath } = buildPaths(
    root,
    args.sessionId,
    args.slotId,
    args.candidateId,
    ext,
  );
  await fs.mkdir(absDir, { recursive: true });
  const buffer = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(absPath, buffer);
  return { localPath, absPath };
}

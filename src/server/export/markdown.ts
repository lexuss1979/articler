import * as path from 'node:path';
import { IMAGES_ROOT } from '../images/storage';
import type { ImageCandidate, ImageState } from '../sessions/images';

export type AttachmentMime = 'image/png' | 'image/jpeg' | 'image/webp';

export type ImageAttachment = {
  bundlePath: string;
  absSourcePath: string;
  mime: AttachmentMime;
};

const EXT_TO_MIME: Record<string, AttachmentMime> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

function candidateUrl(candidate: ImageCandidate): string {
  if (candidate.source === 'generated') return candidate.localPath;
  return candidate.sourceUrl ?? candidate.localPath;
}

function absSourcePathFromLocal(localPath: string): string {
  const rel = localPath.replace(/^\/api\/images\//, '');
  return path.join(IMAGES_ROOT, rel);
}

export async function renderMarkdownArticle({
  session,
  imageState,
}: {
  session: { draftMd: string | null; id: number };
  imageState: ImageState;
}): Promise<{ contentMd: string; attachments: ImageAttachment[] }> {
  const initial = session.draftMd ?? '';
  if (initial.length === 0) return { contentMd: '', attachments: [] };

  let contentMd = initial;
  const attachments: ImageAttachment[] = [];

  for (const slot of imageState.slots) {
    if (!slot.chosenCandidateId) continue;
    const candidate = slot.candidates.find((c) => c.id === slot.chosenCandidateId);
    if (!candidate) continue;

    const ext = path.extname(candidate.localPath).toLowerCase();
    const mime = EXT_TO_MIME[ext];
    if (!mime) continue;

    const url = candidateUrl(candidate);
    if (!contentMd.includes(url)) continue;

    const bundlePath = `images/${slot.id}${ext}`;
    contentMd = contentMd.split(url).join(bundlePath);
    attachments.push({
      bundlePath,
      absSourcePath: absSourcePathFromLocal(candidate.localPath),
      mime,
    });
  }

  return { contentMd, attachments };
}

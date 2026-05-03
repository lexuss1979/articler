import JSZip from 'jszip';
import type { ImageState } from '../sessions/images';
import type { ImageAttachment } from './markdown';

export async function buildZipBundle(
  files: Array<{ path: string; bytes: Buffer | string }>,
): Promise<Buffer> {
  const zip = new JSZip();
  for (const f of files) {
    zip.file(f.path, f.bytes);
  }
  return zip.generateAsync({ type: 'nodebuffer' });
}

export function buildAttributionsReadme(
  attachments: ImageAttachment[],
  imageState: ImageState,
): string {
  const slotById = new Map(imageState.slots.map((s) => [s.id, s]));
  const lines: string[] = [];
  for (const att of attachments) {
    const match = att.bundlePath.match(/^images\/([^/.]+)\./);
    if (!match) continue;
    const slot = slotById.get(match[1]!);
    if (!slot?.chosenCandidateId) continue;
    const candidate = slot.candidates.find((c) => c.id === slot.chosenCandidateId);
    if (!candidate || candidate.source !== 'stock') continue;
    const attribution = candidate.attribution?.trim();
    if (!attribution) continue;
    const sourceUrl = candidate.sourceUrl ? ` (${candidate.sourceUrl})` : '';
    lines.push(`${att.bundlePath} — ${attribution}${sourceUrl}`);
  }
  if (lines.length === 0) return 'No external attributions.\n';
  return lines.join('\n') + '\n';
}

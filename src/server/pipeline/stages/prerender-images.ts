import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import {
  imageCandidateSchema,
  imagePromptSchema,
  type ImageCandidate,
  type ImagePrompt,
} from '../../sessions/images';
import { saveImageFromB64, saveImageFromUrl } from '../../images/storage';
import type { Stage } from '../stage';

const inputSchema = z.object({
  sessionId: z.number().int().positive(),
  slotId: z.string().min(1),
  prompt: imagePromptSchema,
  count: z.number().int().min(1).max(4).optional(),
});

const outputSchema = z.object({
  candidates: z.array(imageCandidateSchema).min(1).max(4),
});

function buildTextPrompt(prompt: ImagePrompt): string {
  const palette = prompt.palette.join(', ');
  const negative = prompt.negative ?? 'none';
  return (
    `${prompt.subject} — ${prompt.style}, ${prompt.composition}, ${prompt.lighting},` +
    ` mood: ${prompt.mood}; palette: ${palette}; aspect ${prompt.aspect}; negative: ${negative}`
  );
}

function makeCandidateId(index: number): string {
  return 'c_' + Date.now() + '_' + randomBytes(3).toString('hex') + '_' + index;
}

const VARIATION_HINTS = [
  'tight close-up framing, asymmetric composition, dramatic side lighting',
  'wide establishing shot, balanced symmetry, soft diffused light',
  'medium shot from a low angle, dynamic perspective, warm golden-hour light',
  'over-the-shoulder framing, leading lines, cool ambient light',
];

export const prerenderImages: Stage<
  {
    sessionId: number;
    slotId: string;
    prompt: ImagePrompt;
    count?: number;
  },
  { candidates: ImageCandidate[] }
> = {
  name: 'prerender_images',
  modelClass: 'image',
  inputSchema,
  outputSchema,
  async run(input, ctx) {
    const { sessionId, slotId, prompt } = input;
    const count = input.count ?? 3;

    await ctx.emit('task_started', { stage: 'prerender_images', slotId });

    const text = buildTextPrompt(prompt);
    const calls = Array.from({ length: count }, (_, i) => {
      const hint = VARIATION_HINTS[i % VARIATION_HINTS.length];
      return ctx.llm.routeImage({ prompt: `${text} | variation: ${hint}` });
    });
    const settled = await Promise.allSettled(calls);

    const candidates: ImageCandidate[] = [];
    for (let i = 0; i < settled.length; i++) {
      const settledCall = settled[i]!;
      if (settledCall.status !== 'fulfilled') continue;
      const response = settledCall.value;
      const first = response.data[0];
      if (!first) continue;
      const candidateId = makeCandidateId(i);
      try {
        let saved: { localPath: string; absPath: string };
        if (first.b64_json) {
          saved = await saveImageFromB64({
            sessionId,
            slotId,
            candidateId,
            mime: 'image/png',
            b64: first.b64_json,
          });
        } else if (first.url) {
          saved = await saveImageFromUrl({
            sessionId,
            slotId,
            candidateId,
            url: first.url,
          });
        } else {
          continue;
        }
        candidates.push({
          id: candidateId,
          source: 'generated',
          localPath: saved.localPath,
          model: response.modelUsed,
          createdAt: new Date().toISOString(),
        });
      } catch {
        continue;
      }
    }

    if (candidates.length === 0) {
      throw new Error('prerender_images: all calls failed');
    }

    await ctx.emit('task_completed', {
      stage: 'prerender_images',
      slotId,
      count: candidates.length,
    });

    return { candidates };
  },
};

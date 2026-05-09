import { z } from 'zod';

export const imageSlotKindSchema = z.enum(['hero', 'inline']);

export const imageAspectSchema = z.enum(['16:9', '4:3', '1:1', '3:4']);

export const imageModeSchema = z.enum(['undecided', 'generate', 'stock']);

export const imageCandidateSourceSchema = z.enum(['generated', 'stock']);

export const imagePromptSchema = z.object({
  subject: z.string().min(1).max(600),
  style: z.string().min(1).max(200),
  composition: z.string().min(1).max(400),
  palette: z.array(z.string().min(1).max(60)).min(1).max(8),
  lighting: z.string().min(1).max(200),
  camera: z.string().max(200).optional(),
  mood: z.string().min(1).max(200),
  negative: z.string().max(400).optional(),
  aspect: imageAspectSchema,
});

export const imageCandidateSchema = z.object({
  id: z.string().min(1).max(80),
  source: imageCandidateSourceSchema,
  localPath: z.string().min(1).max(400),
  sourceUrl: z.url().optional(),
  thumbUrl: z.url().optional(),
  attribution: z.string().max(400).optional(),
  model: z.string().max(120).optional(),
  createdAt: z.string(),
});

export const imageSlotSchema = z
  .object({
    id: z.string().min(1).max(60),
    kind: imageSlotKindSchema,
    sectionId: z.string().min(1).max(120).optional(),
    paragraphIndex: z.number().int().min(0).max(500).optional(),
    brief: z.string().min(1).max(1000),
    altText: z.string().max(300).optional(),
    mode: imageModeSchema.default('undecided'),
    prompt: imagePromptSchema.optional(),
    candidates: z.array(imageCandidateSchema).default([]),
    chosenCandidateId: z.string().max(80).optional(),
  })
  .superRefine((slot, ctx) => {
    if (slot.kind === 'inline') {
      if (slot.sectionId === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['sectionId'],
          message: 'inline slots require sectionId',
        });
      }
      if (slot.paragraphIndex === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['paragraphIndex'],
          message: 'inline slots require paragraphIndex',
        });
      }
    } else {
      if (slot.sectionId !== undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['sectionId'],
          message: 'hero slots must not set sectionId',
        });
      }
      if (slot.paragraphIndex !== undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['paragraphIndex'],
          message: 'hero slots must not set paragraphIndex',
        });
      }
    }
  });

export const imageStateSchema = z.object({
  slots: z.array(imageSlotSchema).max(20).default([]),
});

export const proposeImageSlotsResponseSchema = z.object({
  heroBrief: z.string().min(1).max(1000),
  inlineSlots: z
    .array(
      z.object({
        sectionId: z.string().min(1).max(120),
        paragraphIndex: z.number().int().min(0).max(500),
        brief: z.string().min(1).max(1000),
      }),
    )
    .max(8),
});

export const stockKeywordsResponseSchema = z.object({
  keywords: z.array(z.string().min(1).max(60)).min(1).max(8),
});

export type ImageSlotKind = z.infer<typeof imageSlotKindSchema>;
export type ImageAspect = z.infer<typeof imageAspectSchema>;
export type ImageMode = z.infer<typeof imageModeSchema>;
export type ImagePrompt = z.infer<typeof imagePromptSchema>;
export type ImageCandidate = z.infer<typeof imageCandidateSchema>;
export type ImageSlot = z.infer<typeof imageSlotSchema>;
export type ImageState = z.infer<typeof imageStateSchema>;
export type ProposeImageSlotsResponse = z.infer<typeof proposeImageSlotsResponseSchema>;
export type StockKeywordsResponse = z.infer<typeof stockKeywordsResponseSchema>;

export function parseImageState(value: unknown): ImageState {
  const result = imageStateSchema.safeParse(value);
  if (result.success) return result.data;
  return { slots: [] };
}

function escapeAlt(alt: string): string {
  return alt.replace(/&/g, '&amp;').replace(/\[/g, '\\[').replace(/\]/g, '\\]');
}

export function renderImageMarkdown(candidate: ImageCandidate, alt: string): string {
  const safeAlt = escapeAlt(alt);
  if (candidate.source === 'generated') {
    return `![${safeAlt}](${candidate.localPath})`;
  }
  const url = candidate.sourceUrl ?? candidate.localPath;
  const base = `![${safeAlt}](${url})`;
  const attribution = candidate.attribution?.trim();
  if (!attribution) return base;
  return `${base} <sub>${attribution}</sub>`;
}

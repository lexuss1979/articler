import { z } from 'zod';
import { routeJsonChat } from '../../llm/structured';
import { planSchema, type Plan } from '../../sessions/plan';
import {
  imagePromptSchema,
  imageSlotKindSchema,
  type ImagePrompt,
  type ImageSlotKind,
} from '../../sessions/images';
import type { Stage } from '../stage';
import type { profiles } from '../../db/schema';
import type { InferSelectModel } from 'drizzle-orm';

type ProfileRow = InferSelectModel<typeof profiles>;

const inputSchema = z.object({
  profile: z.object({
    id: z.number(),
    userId: z.number(),
    name: z.string(),
    format: z.string(),
    style: z.string(),
    audience: z.string(),
    targetVolumeMin: z.number(),
    targetVolumeMax: z.number(),
    markupRules: z.unknown(),
    extraPrompt: z.string(),
    createdAt: z.date(),
  }),
  plan: planSchema,
  slot: z.object({
    id: z.string(),
    kind: imageSlotKindSchema,
    sectionId: z.string().optional(),
    paragraphIndex: z.number().int().optional(),
    brief: z.string(),
  }),
  surroundingMd: z.string().optional(),
});

const COMPOSE_INTRO = `You are an art-direction assistant turning a brief into a structured image prompt for a downstream image generator. Fill EVERY required field of the JSON below.

Required output shape:
- "subject": concrete description of what the image depicts.
- "style": e.g. "editorial photo", "isometric vector", "watercolor", "3D render".
- "composition": framing and layout (e.g. "centered, shallow depth of field", "rule of thirds, subject left").
- "palette": array of 1–8 colour names or short colour phrases.
- "lighting": e.g. "soft window light", "dramatic side-lit".
- "camera": optional camera/lens hint (e.g. "35mm prime").
- "mood": one or two words for the emotional tone.
- "negative": optional comma-separated list of things to avoid.
- "aspect": one of "16:9", "4:3", "1:1", "3:4". Default to "16:9" for hero slots and "4:3" for inline slots.

Banned content: brand logos, watermarks, recognizable real people unless the brief explicitly names them. Stay clear of any content that would be unsafe for the platform's audience.

Image text language: prefer scenes without legible writing. If the image must include any visible text (signage, screen content, UI elements, labels, captions, headlines), it MUST be written in the SAME language as the "Article thesis" given below — detect the language from the thesis. Do NOT default to English when the thesis is in another language.

Respond ONLY with valid JSON matching the schema. No prose, no fences.`;

export const composeImagePrompt: Stage<
  {
    profile: ProfileRow;
    plan: Plan;
    slot: {
      id: string;
      kind: ImageSlotKind;
      sectionId?: string;
      paragraphIndex?: number;
      brief: string;
    };
    surroundingMd?: string;
  },
  ImagePrompt
> = {
  name: 'compose_image_prompt',
  modelClass: 'smart',
  inputSchema,
  outputSchema: imagePromptSchema,
  async run(input, ctx) {
    const { profile, plan, slot, surroundingMd } = input;

    await ctx.emit('task_started', { stage: 'compose_image_prompt', slotId: slot.id });

    const systemPrompt = [
      COMPOSE_INTRO,
      `Platform: ${profile.name}`,
      `Audience: ${profile.audience}`,
      `Style: ${profile.style}`,
      `Article thesis: ${plan.thesis}`,
    ].join('\n\n');

    const userPromptParts: string[] = [
      `Slot kind: ${slot.kind}`,
      `Slot brief: ${slot.brief}`,
    ];
    if (slot.sectionId) {
      userPromptParts.push(`Section: ${slot.sectionId}`);
    }
    if (surroundingMd && surroundingMd.trim().length > 0) {
      userPromptParts.push(`Surrounding paragraphs:\n${surroundingMd}`);
    }
    const userPrompt = userPromptParts.join('\n\n');

    const { result } = await routeJsonChat({
      system: systemPrompt,
      user: userPrompt,
      schema: imagePromptSchema,
      class: 'smart',
    });

    await ctx.emit('task_completed', { stage: 'compose_image_prompt', slotId: slot.id });

    return result;
  },
};

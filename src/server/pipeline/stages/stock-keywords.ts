import { z } from 'zod';
import { routeJsonChat } from '../../llm/structured';
import {
  imageSlotKindSchema,
  stockKeywordsResponseSchema,
  type ImageSlotKind,
  type StockKeywordsResponse,
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
  slot: z.object({
    brief: z.string(),
    kind: imageSlotKindSchema,
  }),
});

const KEYWORDS_INTRO = `You are a stock-photo search assistant. Given a brief for an image slot, emit 3–6 short English search keywords or phrases suitable for Unsplash.

Rules:
- 3–6 entries.
- Single word or 2–3 word phrase per entry. No hashtags, no quotes, no punctuation.
- Lowercase preferred.
- Reflect the brief's subject and tone.
- Avoid brand names and trademarked terms.
- Respond ONLY with valid JSON of shape { "keywords": ["...", "..."] }, no prose, no fences.`;

export const stockKeywords: Stage<
  {
    profile: ProfileRow;
    slot: { brief: string; kind: ImageSlotKind };
  },
  StockKeywordsResponse
> = {
  name: 'stock_keywords',
  modelClass: 'fast',
  inputSchema,
  outputSchema: stockKeywordsResponseSchema,
  async run(input, ctx) {
    const { profile, slot } = input;

    await ctx.emit('task_started', { stage: 'stock_keywords' });

    const systemPrompt = [
      KEYWORDS_INTRO,
      `Audience: ${profile.audience}`,
      `Style: ${profile.style}`,
    ].join('\n\n');

    const userPrompt = [
      `Slot kind: ${slot.kind}`,
      `Slot brief: ${slot.brief}`,
    ].join('\n\n');

    const { result } = await routeJsonChat({
      system: systemPrompt,
      user: userPrompt,
      schema: stockKeywordsResponseSchema,
      class: 'fast',
    });

    await ctx.emit('task_completed', { stage: 'stock_keywords' });

    return result;
  },
};

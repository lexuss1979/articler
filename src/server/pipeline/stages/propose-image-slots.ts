import { z } from 'zod';
import { routeJsonChat } from '../../llm/structured';
import { planSchema, type Plan } from '../../sessions/plan';
import {
  proposeImageSlotsResponseSchema,
  type ProposeImageSlotsResponse,
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
    lightResearchSources: z.number(),
    lightMaxWords: z.number(),
    createdAt: z.date(),
  }),
  plan: planSchema,
  sectionDrafts: z.array(z.object({ sectionId: z.string(), contentMd: z.string() })),
});

const SLOTS_INTRO = `You are a publication art director planning the illustrations for a finished article draft. Your job is to propose ONE hero image (covering the article's central subject) plus zero to four inline images that introduce a new technical concept or a key contrast inside the body.

Output contract:
- "heroBrief": 1–2 sentences describing the central image subject and tone for the hero spot. Required, never empty.
- "inlineSlots": at most 4 entries, each with:
  - "sectionId": the id of the section the image belongs to (use the [sectionId=...] tags in the user message),
  - "paragraphIndex": which paragraph slot inside that section the image should appear at (sections are split on blank lines; index 0 means BEFORE the first paragraph, index N means AFTER the last paragraph),
  - "brief": a concrete subject + tone description for an image generator. Do NOT specify camera, composition, or palette — those are picked later by the prompt-composer stage.

Prefer slots that introduce a new technical concept or a key contrast. Skip decorative spots that the body already handles in prose. Respond ONLY with valid JSON of shape { "heroBrief": "...", "inlineSlots": [...] }, no prose, no fences.`;

export const proposeImageSlots: Stage<
  {
    profile: ProfileRow;
    plan: Plan;
    sectionDrafts: Array<{ sectionId: string; contentMd: string }>;
  },
  ProposeImageSlotsResponse
> = {
  name: 'propose_image_slots',
  modelClass: 'smart',
  inputSchema,
  outputSchema: proposeImageSlotsResponseSchema,
  async run(input, ctx) {
    const { profile, plan, sectionDrafts } = input;

    await ctx.emit('task_started', { stage: 'propose_image_slots' });

    const systemPrompt = [
      SLOTS_INTRO,
      `Platform: ${profile.name}`,
      `Audience: ${profile.audience}`,
      `Style: ${profile.style}`,
      `Thesis: ${plan.thesis}`,
      `Target takeaway: ${plan.targetTakeaway}`,
    ].join('\n\n');

    const sectionTitleMap = new Map(plan.sections.map((s) => [s.id, s.title]));
    const userPrompt = sectionDrafts
      .map((d) => {
        const title = sectionTitleMap.get(d.sectionId) ?? d.sectionId;
        return `## ${title} [sectionId=${d.sectionId}]\n${d.contentMd}`;
      })
      .join('\n\n');

    const { result } = await routeJsonChat({
      system: systemPrompt,
      user: userPrompt,
      schema: proposeImageSlotsResponseSchema,
      class: 'smart',
    });

    await ctx.emit('task_completed', {
      stage: 'propose_image_slots',
      count: 1 + result.inlineSlots.length,
    });

    return result;
  },
};

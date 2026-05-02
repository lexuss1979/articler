import { z } from 'zod';
import type { InferSelectModel } from 'drizzle-orm';
import { routeJsonChat } from '../../llm/structured';
import { searchHypothesisSchema, type Hypothesis } from '../../sessions/sources';
import type { Plan } from '../../sessions/plan';
import type { profiles } from '../../db/schema';
import type { Stage } from '../stage';

type ProfileRow = InferSelectModel<typeof profiles>;

export class OrphanHypothesisError extends Error {
  constructor(public readonly sectionId: string) {
    super(`Hypothesis references unknown section id: "${sectionId}"`);
    this.name = 'OrphanHypothesisError';
  }
}

const inputSchema = z.object({
  plan: z.object({
    thesis: z.string(),
    targetTakeaway: z.string(),
    sections: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        intent: z.string(),
        expectedLength: z.number(),
        keyPoints: z.array(z.string()),
      }),
    ),
  }),
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
});

const outputSchema = z.object({
  hypotheses: z.array(searchHypothesisSchema).min(1).max(8),
});

export const planSearchHypotheses: Stage<
  { plan: Plan; profile: ProfileRow },
  { hypotheses: Hypothesis[] }
> = {
  name: 'plan_search_hypotheses',
  modelClass: 'smart',
  inputSchema,
  outputSchema,
  async run(input, ctx) {
    await ctx.emit('task_started', { stage: 'plan_search_hypotheses' });

    const sectionList = input.plan.sections
      .map(
        (s) =>
          `- id="${s.id}" title="${s.title}" intent="${s.intent}" keyPoints=[${s.keyPoints.join(', ')}]`,
      )
      .join('\n');

    const systemPrompt = [
      `You are a research strategist preparing a search plan for an article.`,
      `Article thesis: ${input.plan.thesis}`,
      `Target takeaway for readers: ${input.plan.targetTakeaway}`,
      `Platform: ${input.profile.name} (${input.profile.format}).`,
      `Audience: ${input.profile.audience}. Tone: ${input.profile.style}.`,
      `Produce a focused set of up to 8 search hypotheses in total across all sections.`,
      `Assign at most 1 hypothesis per section; only the most evidence-heavy sections get 2.`,
      `Each hypothesis identifies a specific claim to verify or evidence type to find.`,
      `Be selective — fewer, high-value hypotheses beat exhaustive coverage.`,
      `Use exactly the section ids listed — do not invent new ids.`,
      `Respond ONLY with valid JSON: { "hypotheses": [ { "id": "h-1", "sectionId": "<one of the ids below>", "text": "...", "evidenceKind": "statistic|expert_quote|case_study|..." } ] }`,
      `Sections:\n${sectionList}`,
    ].join('\n');

    const { result } = await routeJsonChat({
      system: systemPrompt,
      user: `Produce search hypotheses for the ${input.plan.sections.length} sections above.`,
      schema: outputSchema,
      class: 'smart',
    });

    const validSectionIds = new Set(input.plan.sections.map((s) => s.id));
    for (const hyp of result.hypotheses) {
      if (!validSectionIds.has(hyp.sectionId)) {
        throw new OrphanHypothesisError(hyp.sectionId);
      }
    }

    await ctx.emit('task_completed', {
      stage: 'plan_search_hypotheses',
      count: result.hypotheses.length,
    });
    return result;
  },
};

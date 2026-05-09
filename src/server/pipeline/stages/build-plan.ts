import { z } from 'zod';
import { routeJsonChat } from '../../llm/structured';
import { planSchema, type Plan, type Angle } from '../../sessions/plan';
import type { BriefInput } from '../../sessions/brief';
import type { Stage } from '../stage';
import type { profiles } from '../../db/schema';
import type { InferSelectModel } from 'drizzle-orm';

type ProfileRow = InferSelectModel<typeof profiles>;

const inputSchema = z.object({
  brief: z.object({
    topic: z.string(),
    goal: z.string(),
    notes: z.string(),
    sourceArticles: z.array(z.object({ url: z.string(), content: z.string() })),
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
    lightResearchSources: z.number(),
    lightMaxWords: z.number(),
    createdAt: z.date(),
  }),
  angle: z.object({
    title: z.string(),
    methodology: z.string(),
    rationale: z.string(),
  }),
  clarifications: z
    .array(z.object({ question: z.string(), answer: z.string() }))
    .optional(),
});

export const buildPlan: Stage<
  {
    brief: BriefInput;
    profile: ProfileRow;
    angle: Angle;
    clarifications?: Array<{ question: string; answer: string }>;
  },
  Plan
> = {
  name: 'build_plan',
  modelClass: 'smart',
  inputSchema,
  outputSchema: planSchema,
  async run(input, ctx) {
    await ctx.emit('task_started', { stage: 'build_plan' });

    const wordTarget = `${input.profile.targetVolumeMin}–${input.profile.targetVolumeMax} words`;

    const systemPrompt = [
      `You are a senior editor building a structured article plan.`,
      `Platform: ${input.profile.name} (${input.profile.format}).`,
      `Audience: ${input.profile.audience}. Tone: ${input.profile.style}.`,
      `Target length: ${wordTarget} total across all sections.`,
      `Chosen angle: "${input.angle.title}" using the ${input.angle.methodology} methodology.`,
      `Methodology rationale: ${input.angle.rationale}`,
      input.profile.extraPrompt ? `Constraints: ${input.profile.extraPrompt}` : '',
      'Produce a structured plan with 3–8 sections that faithfully executes the methodology.',
      'Section expectedLength values (in words) should sum to roughly the target word count.',
      'Respond ONLY with valid JSON matching this schema:',
      '{ "thesis": "...", "targetTakeaway": "...", "sections": [{ "id": "slug", "title": "...", "intent": "...", "expectedLength": 400, "keyPoints": ["..."] }] }',
    ]
      .filter(Boolean)
      .join('\n');

    const clarificationLines =
      input.clarifications && input.clarifications.length > 0
        ? '\nClarifications:\n' +
          input.clarifications.map((c) => `Q: ${c.question}\nA: ${c.answer}`).join('\n')
        : '';

    const userPrompt = [
      `Topic: ${input.brief.topic}`,
      input.brief.goal ? `Goal: ${input.brief.goal}` : '',
      input.brief.notes ? `Notes: ${input.brief.notes}` : '',
      clarificationLines,
    ]
      .filter(Boolean)
      .join('\n');

    const { result: plan } = await routeJsonChat({
      system: systemPrompt,
      user: userPrompt,
      schema: planSchema,
      class: 'smart',
    });

    await ctx.emit('task_completed', { stage: 'build_plan', sections: plan.sections.length });
    return plan;
  },
};

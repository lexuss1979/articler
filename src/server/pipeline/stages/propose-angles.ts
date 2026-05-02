import { z } from 'zod';
import { routeJsonChat } from '../../llm/structured';
import { angleSchema, type Angle } from '../../sessions/plan';
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
    createdAt: z.date(),
  }),
  clarifications: z
    .array(z.object({ question: z.string(), answer: z.string() }))
    .optional(),
});

const outputSchema = z.object({
  angles: z.array(angleSchema).min(2).max(6).describe('2-4 distinct angles'),
});

export const proposeAngles: Stage<
  { brief: BriefInput; profile: ProfileRow; clarifications?: Array<{ question: string; answer: string }> },
  { angles: Angle[] }
> = {
  name: 'propose_angles',
  modelClass: 'smart',
  inputSchema,
  outputSchema,
  async run(input, ctx) {
    await ctx.emit('task_started', { stage: 'propose_angles' });

    const systemPrompt = [
      `You are a writing strategist. Propose 2–4 distinct angle/methodology pairs for an article.`,
      `Platform: ${input.profile.name} (${input.profile.format}).`,
      `Audience: ${input.profile.audience}.`,
      `Tone: ${input.profile.style}.`,
      `Target length: ${input.profile.targetVolumeMin}–${input.profile.targetVolumeMax} words.`,
      input.profile.extraPrompt ? `Constraints: ${input.profile.extraPrompt}` : '',
      'Each angle must have a distinct methodology (e.g. aida, pas, how_to, deep_dive, listicle, case_study, inverted_pyramid).',
      'Respond ONLY with valid JSON: { "angles": [ { "title": "...", "methodology": "...", "rationale": "..." } ] }',
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

    const { result } = await routeJsonChat({
      system: systemPrompt,
      user: userPrompt,
      schema: outputSchema,
      class: 'smart',
    });

    await ctx.emit('task_completed', { stage: 'propose_angles', count: result.angles.length });
    return result;
  },
};

import { z } from 'zod';
import { routeJsonChat } from '../../llm/structured';
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
});

const outputSchema = z.object({
  questions: z.array(z.string().min(1)).max(8),
});

export const clarifyBrief: Stage<
  { brief: BriefInput; profile: ProfileRow },
  { questions: string[] }
> = {
  name: 'clarify_brief',
  modelClass: 'smart',
  inputSchema,
  outputSchema,
  async run(input, ctx) {
    await ctx.emit('task_started', { stage: 'clarify_brief' });

    const systemPrompt = [
      `You are a writing coach helping an author produce a ${input.profile.format} article.`,
      `Target audience: ${input.profile.audience}.`,
      `Tone: ${input.profile.style}.`,
      `Target length: ${input.profile.targetVolumeMin}–${input.profile.targetVolumeMax} words.`,
      input.profile.extraPrompt ? `Additional constraints: ${input.profile.extraPrompt}` : '',
      'If the brief is clear and specific enough to begin planning, return an empty questions array.',
      'Otherwise return up to 8 concise clarifying questions that would materially improve the output.',
      'Respond ONLY with valid JSON: { "questions": ["..."] }',
    ]
      .filter(Boolean)
      .join('\n');

    const userPrompt = [
      `Topic: ${input.brief.topic}`,
      input.brief.goal ? `Goal: ${input.brief.goal}` : '',
      input.brief.notes ? `Notes: ${input.brief.notes}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const { result } = await routeJsonChat({
      system: systemPrompt,
      user: userPrompt,
      schema: outputSchema,
      class: 'smart',
    });

    await ctx.emit('task_completed', { stage: 'clarify_brief', count: result.questions.length });
    return result;
  },
};

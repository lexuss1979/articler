import { z } from 'zod';
import { routeJsonChat } from '../../llm/structured';
import type { BriefInput } from '../../sessions/brief';
import type { Stage } from '../stage';
import type { profiles } from '../../db/schema';
import type { InferSelectModel } from 'drizzle-orm';
import { CLARIFY_INJECT_MIN_CONFIDENCE } from '../../profiles/assertion-policy';
import { assertionLeaksTopic } from '../../profiles/topic-noun-guard';

type ProfileRow = InferSelectModel<typeof profiles>;

const knownAssertionSchema = z.object({
  key: z.string(),
  category: z.string(),
  assertion: z.string(),
  confidence: z.number(),
  evidenceCount: z.number(),
});

type KnownAssertion = z.infer<typeof knownAssertionSchema>;

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
  knownAssertions: z.array(knownAssertionSchema).optional(),
});

const clarifyQuestionSchema = z.object({
  question: z.string().min(1).describe('the clarifying question'),
  suggestions: z.array(z.string().min(1)).min(1).max(5).describe('2-4 short answer suggestions'),
});

const outputSchema = z.object({
  questions: z.array(clarifyQuestionSchema).max(8).describe('up to 8 clarifying questions'),
});

export type ClarifyQuestion = z.infer<typeof clarifyQuestionSchema>;

export const clarifyBrief: Stage<
  { brief: BriefInput; profile: ProfileRow; knownAssertions?: KnownAssertion[] },
  { questions: ClarifyQuestion[] }
> = {
  name: 'clarify_brief',
  modelClass: 'smart',
  inputSchema,
  outputSchema,
  async run(input, ctx) {
    await ctx.emit('task_started', { stage: 'clarify_brief' });

    const rawAssertions = input.knownAssertions ?? [];
    const profileGeneralText = [
      input.profile.audience,
      input.profile.style,
      input.profile.format,
      input.profile.extraPrompt,
    ]
      .filter((s) => typeof s === 'string' && s.length > 0)
      .join(' ');
    const assertions = rawAssertions
      .filter((a) => a.confidence >= CLARIFY_INJECT_MIN_CONFIDENCE)
      .filter(
        (a) =>
          !assertionLeaksTopic({
            assertion: a.assertion,
            brief: {
              topic: input.brief.topic,
              goal: input.brief.goal,
              notes: input.brief.notes,
            },
            profileGeneralText,
          }),
      );

    const assertionsBlock =
      assertions.length > 0
        ? [
            'Known assertions about this user:',
            ...assertions.map(
              (a) =>
                `  ${a.key} (${a.category}) — "${a.assertion}" [confidence ${a.confidence.toFixed(2)} × evidence ${a.evidenceCount}]`,
            ),
            'Critical: assertions describe stable preferences of the author. They are NOT facts about the current topic. Never ask the author to confirm whether a topic from a different article should be covered here. If an assertion appears to reference a subject unrelated to the current brief, ignore it entirely.',
            'Skip a question entirely if its answer is already implied by an assertion with confidence ≥ 0.85 AND evidenceCount ≥ 3.',
            'For matching assertions below that threshold, bias the question wording toward confirming or contradicting the assertion.',
          ].join('\n')
        : '';

    const systemPrompt = [
      `You are a writing coach helping an author produce a ${input.profile.format} article.`,
      `Target audience: ${input.profile.audience}.`,
      `Tone: ${input.profile.style}.`,
      `Target length: ${input.profile.targetVolumeMin}–${input.profile.targetVolumeMax} words.`,
      input.profile.extraPrompt ? `Additional constraints: ${input.profile.extraPrompt}` : '',
      assertionsBlock,
      'If the brief is clear and specific enough to begin planning, return an empty questions array.',
      'Otherwise return up to 8 concise clarifying questions.',
      'For each question also provide 2–3 short, concrete answer suggestions that cover the most likely choices.',
      'Respond ONLY with valid JSON: { "questions": [{ "question": "...", "suggestions": ["...", "..."] }] }',
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

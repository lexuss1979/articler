import { z } from 'zod';
import { routeJsonChat } from '../../llm/structured';
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
  draftMd: z.string(),
});

const changeSchema = z.object({
  kind: z.enum(['humanize', 'clarify', 'cut']),
  before: z.string(),
  after: z.string(),
  note: z.string().optional(),
});

export const outputSchema = z.object({
  revisedMd: z.string(),
  changes: z.array(changeSchema),
});

export type AutoReviewInput = { profile: ProfileRow; draftMd: string };
export type AutoReviewOutput = z.infer<typeof outputSchema>;

function buildSystemPrompt(profile: ProfileRow): string {
  return [
    'You are a final human editor for a publication called',
    `"${profile.name}" (${profile.format}).`,
    `Target audience: ${profile.audience}. Tone/style: ${profile.style}.`,
    profile.extraPrompt ? `Additional constraints: ${profile.extraPrompt}` : '',
    '',
    'Your task:',
    '1. Read the draft article below.',
    '2. Identify passages that sound AI-generated, are logically unclear, or are redundant.',
    '3. Rewrite the COMPLETE article addressing those issues — output the full revised text as `revisedMd`.',
    '4. For each edit, emit a change object with:',
    '   - kind: "humanize" (AI-sounding → natural), "clarify" (unclear → logical), or "cut" (redundant removed)',
    '   - before: short excerpt from the original (≤200 chars)',
    '   - after: corresponding short excerpt from the revision (≤200 chars)',
    '   - note: optional brief explanation',
    '',
    'Return ONLY valid JSON of shape { revisedMd: string, changes: [...] }, no prose, no fences.',
  ]
    .filter((l) => l !== undefined)
    .join('\n');
}

export const autoReview: Stage<AutoReviewInput, AutoReviewOutput> = {
  name: 'auto_review',
  modelClass: 'smart',
  inputSchema,
  outputSchema,
  async run(input, ctx) {
    const { profile, draftMd } = input;

    await ctx.emit('task_started', { stage: 'auto_review' });

    const { result } = await routeJsonChat({
      system: buildSystemPrompt(profile),
      user: draftMd,
      schema: outputSchema,
      class: 'smart',
    });

    await ctx.emit('task_completed', { stage: 'auto_review', changeCount: result.changes.length });

    return result;
  },
};

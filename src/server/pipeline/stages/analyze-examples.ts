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
    createdAt: z.date(),
  }),
  examples: z.array(z.object({ content: z.string() })),
});

export const analyzeExamplesOutputSchema = z.object({
  summary: z.string(),
  items: z.array(
    z.object({
      key: z.string(),
      category: z.enum(['scope', 'tone', 'format', 'structure', 'audience', 'custom']),
      assertion: z.string(),
    }),
  ),
});

export type AnalyzeExamplesInput = {
  profile: ProfileRow;
  examples: Array<{ content: string }>;
};

export type AnalyzeExamplesOutput = z.infer<typeof analyzeExamplesOutputSchema>;

const SYSTEM_PROMPT = `You are a writing-style analyst. You will be given one or more example articles \
and the profile of the publication they belong to. Your job is to detect recurring style characteristics \
and express them as concise, actionable assertions.

## Key vocabulary stability

Assign a stable key to each assertion using the following prefix conventions. Reuse these exact prefixes \
so that keys can be merged with existing profile assertions:

- scope_*      — what topics, depth, or breadth the articles cover
- tone_*       — voice, register, formality, emotional quality
- format_*     — structural or visual conventions (headings, lists, code blocks, etc.)
- structure_*  — how content is organised and sequenced at the section level
- audience_*   — assumptions about reader expertise, background, or goals
- custom_*     — any other distinctive characteristic that does not fit the above categories

Choose short, descriptive suffixes (e.g. scope_technical_depth, tone_conversational, format_uses_headers).

## Output

Return ONLY valid JSON of the following shape, no prose, no fences:

{
  "summary": "<one short paragraph summarising detected style characteristics>",
  "items": [
    { "key": "<prefix_suffix>", "category": "<scope|tone|format|structure|audience|custom>", "assertion": "<concise factual assertion>" }
  ]
}

Emit up to 12 items. Each assertion must be a direct, third-person statement about the writing style \
(e.g. "Articles use a conversational tone with occasional humour."). Do not include vague items.`;

export const analyzeExamples: Stage<AnalyzeExamplesInput, AnalyzeExamplesOutput> = {
  name: 'analyze_examples',
  modelClass: 'smart',
  inputSchema,
  outputSchema: analyzeExamplesOutputSchema,
  async run(input, ctx) {
    const { profile, examples } = input;

    await ctx.emit('task_started', { stage: 'analyze_examples' });

    const profileContext = [
      `Profile name: ${profile.name}`,
      `Format: ${profile.format}`,
      `Style: ${profile.style}`,
      `Audience: ${profile.audience}`,
      profile.extraPrompt ? `Extra guidance: ${profile.extraPrompt}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    const examplesText = examples
      .map((ex, i) => `## Example ${i + 1}\n\n${ex.content}`)
      .join('\n\n---\n\n');

    const userPrompt = `${profileContext}\n\n---\n\n${examplesText}`;

    const { result } = await routeJsonChat({
      system: SYSTEM_PROMPT,
      user: userPrompt,
      schema: analyzeExamplesOutputSchema,
      class: 'smart',
    });

    await ctx.emit('task_completed', { stage: 'analyze_examples', count: result.items.length });

    return result;
  },
};

import { z } from 'zod';
import { routeJsonChat } from '../../llm/structured';
import type { Stage } from '../stage';
import type { profiles } from '../../db/schema';
import type { InferSelectModel } from 'drizzle-orm';

type ProfileRow = InferSelectModel<typeof profiles>;

const existingAssertionSchema = z.object({
  key: z.string(),
  category: z.string(),
  assertion: z.string(),
  confidence: z.number(),
  evidenceCount: z.number(),
});

type ExistingAssertion = z.infer<typeof existingAssertionSchema>;

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
  qa: z.array(z.object({ question: z.string(), answer: z.string() })),
  existingAssertions: z.array(existingAssertionSchema),
});

const deltaItemSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('agree'), key: z.string().min(1) }),
  z.object({ kind: z.literal('contradict'), key: z.string().min(1) }),
  z.object({
    kind: z.literal('new'),
    key: z.string().min(1),
    category: z.enum(['scope', 'tone', 'format', 'structure', 'audience', 'custom']),
    assertion: z.string().min(1),
  }),
]);

export const classifyAnswersOutputSchema = z.object({
  delta: z.array(deltaItemSchema),
});

export type ClassifyAnswersInput = {
  profile: ProfileRow;
  qa: Array<{ question: string; answer: string }>;
  existingAssertions: ExistingAssertion[];
};

export type ClassifyAnswersOutput = z.infer<typeof classifyAnswersOutputSchema>;

const VOCAB_BLOCK = `## Key vocabulary

Use these prefixes when assigning keys to new assertions. Reuse existing keys for agree/contradict items.

- scope_*      — topics, depth, or breadth the content covers
- tone_*       — voice, register, formality, emotional quality
- format_*     — structural or visual conventions (headings, lists, code blocks, etc.)
- structure_*  — how content is organised at the section level
- audience_*   — assumptions about reader expertise, background, or goals
- custom_*     — any other characteristic that does not fit the above`;

function buildSystemPrompt(existingAssertions: ExistingAssertion[]): string {
  const assertionsBlock =
    existingAssertions.length > 0
      ? existingAssertions
          .map(
            (a) =>
              `  ${a.key} (${a.category}): "${a.assertion}" [confidence ${a.confidence.toFixed(2)}, evidence ${a.evidenceCount}]`,
          )
          .join('\n')
      : '  (none)';

  return `You are a writing-style classifier that updates a user's preference profile based on their answers to clarification questions.

${VOCAB_BLOCK}

## Existing assertions about this user

${assertionsBlock}

## Instructions

For each Q&A pair, decide whether the answer:
- **agree**: reaffirms an existing assertion → emit \`{ "kind": "agree", "key": "<existing_key>" }\`
- **contradict**: explicitly negates an existing assertion → emit \`{ "kind": "contradict", "key": "<existing_key>" }\`
- **new**: reveals a genuinely new writing preference not covered by any existing assertion → emit \`{ "kind": "new", "key": "<prefix_suffix>", "category": "<scope|tone|format|structure|audience|custom>", "assertion": "<concise factual statement>" }\`

Emit "new" sparingly — only for traits not already captured. If no preference is revealed, emit nothing for that answer.

Return ONLY valid JSON of the following shape, no prose, no fences:
{ "delta": [ ... ] }`;
}

export const classifyAnswers: Stage<ClassifyAnswersInput, ClassifyAnswersOutput> = {
  name: 'classify_answers',
  modelClass: 'fast',
  inputSchema,
  outputSchema: classifyAnswersOutputSchema,
  async run(input, ctx) {
    await ctx.emit('task_started', { stage: 'classify_answers' });

    const system = buildSystemPrompt(input.existingAssertions);

    const userPrompt = input.qa
      .map((pair, i) => `Q${i + 1}: ${pair.question}\nA${i + 1}: ${pair.answer}`)
      .join('\n\n');

    const { result } = await routeJsonChat({
      system,
      user: userPrompt,
      schema: classifyAnswersOutputSchema,
      class: 'fast',
    });

    await ctx.emit('task_completed', { stage: 'classify_answers', count: result.delta.length });

    return result;
  },
};

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

const CROSS_TOPIC_INVARIANT_BLOCK = `## Cross-topic invariant

An assertion is a stable preference of the author that holds across any future article they write under this profile. A subject-matter fact about a particular article is **not** an assertion. If the assertion text would be wrong or nonsensical applied to a different topic from the same author, it must not be stored.

An assertion text must not name specific entities from the current Q&A that would be wrong applied to other topics. In doubt — emit nothing.`;

const EXAMPLES_BLOCK = `## Examples

scope:
Bad:  { "key": "scope_ladder_safety", "category": "scope", "assertion": "user wants ladder safety section" }
Good: { "key": "scope_includes_safety", "category": "scope", "assertion": "author tends to include safety considerations when relevant" }

custom:
Bad:  { "key": "custom_mustache_history", "category": "custom", "assertion": "user wants mustache history" }
Good: { "key": "structure_historical_intro", "category": "structure", "assertion": "author opens articles with a short historical context" }

tone:
Bad:  { "key": "tone_dry_about_lasers", "category": "tone", "assertion": "user wants a dry tone for laser articles" }
Good: { "key": "tone_dry_humour", "category": "tone", "assertion": "author favours dry humour throughout" }

audience:
Bad:  { "key": "audience_assumes_firefighters", "category": "audience", "assertion": "user assumes readers are firefighters" }
Good: { "key": "audience_assumes_practitioners", "category": "audience", "assertion": "author writes for hands-on practitioners rather than novices" }`;

const INSTRUCTIONS_BLOCK = `## Instructions

For each Q&A pair, decide whether the answer:
- **agree**: reaffirms an existing assertion → emit \`{ "kind": "agree", "key": "<existing_key>" }\`
- **contradict**: explicitly negates an existing assertion → emit \`{ "kind": "contradict", "key": "<existing_key>" }\`
- **new**: reveals a genuinely new writing preference not covered by any existing assertion → emit \`{ "kind": "new", "key": "<prefix_suffix>", "category": "<scope|tone|format|structure|audience|custom>", "assertion": "<concise factual statement>" }\`

Emit at most 2 "new" items per call. Only emit "new" for cross-topic preferences not already captured. If unsure, emit nothing.

Return ONLY valid JSON of the following shape, no prose, no fences:
{ "delta": [ ... ] }`;

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

${CROSS_TOPIC_INVARIANT_BLOCK}

${EXAMPLES_BLOCK}

## Existing assertions about this user

${assertionsBlock}

${INSTRUCTIONS_BLOCK}`;
}

function capNewItems(delta: ClassifyAnswersOutput['delta']): ClassifyAnswersOutput['delta'] {
  let kept = 0;
  return delta.filter((item) => {
    if (item.kind !== 'new') return true;
    if (kept < 2) {
      kept++;
      return true;
    }
    return false;
  });
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

    const capped: ClassifyAnswersOutput = { delta: capNewItems(result.delta) };

    await ctx.emit('task_completed', { stage: 'classify_answers', count: capped.delta.length });

    return capped;
  },
};

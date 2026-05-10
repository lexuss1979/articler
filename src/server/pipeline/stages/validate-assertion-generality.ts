import { z } from 'zod';
import { routeJsonChat } from '../../llm/structured';
import type { Stage } from '../stage';

const itemSchema = z.object({
  key: z.string().min(1),
  category: z.string().min(1),
  assertion: z.string().min(1),
});

const inputSchema = z.object({
  items: z.array(itemSchema),
});

export const validateAssertionGeneralityOutputSchema = z.object({
  results: z.array(
    z.object({
      key: z.string().min(1),
      passes: z.boolean(),
      reason: z.string(),
    }),
  ),
});

export type ValidateAssertionGeneralityInput = z.infer<typeof inputSchema>;
export type ValidateAssertionGeneralityOutput = z.infer<typeof validateAssertionGeneralityOutputSchema>;

const SYSTEM_PROMPT = `You are an assertion generality auditor for a writing-style preference profile.

For each candidate assertion you receive, decide:

> Would this assertion still hold if this author writes a future article on a completely different topic? Answer \`passes: true\` only if the statement is about the author's general writing preferences (style, structure, tone, audience treatment, coverage pattern). Answer \`passes: false\` if it references a specific subject, entity, named thing, or is otherwise tied to a particular article's topic.

## Examples

scope:
{ "key": "scope_ladder_safety", "category": "scope", "assertion": "user wants ladder safety section" } → passes: false (names a specific topic — ladder safety — that would not generalise to other articles)
{ "key": "scope_includes_safety", "category": "scope", "assertion": "author tends to include safety considerations when relevant" } → passes: true (general coverage pattern)

custom:
{ "key": "custom_mustache_history", "category": "custom", "assertion": "user wants mustache history" } → passes: false (specific subject — mustaches)
{ "key": "structure_historical_intro", "category": "structure", "assertion": "author opens articles with a short historical context" } → passes: true (general structural preference)

tone:
{ "key": "tone_dry_about_lasers", "category": "tone", "assertion": "user wants a dry tone for laser articles" } → passes: false (tone is tied to a specific topic — lasers)
{ "key": "tone_dry_humour", "category": "tone", "assertion": "author favours dry humour throughout" } → passes: true (general tone preference)

audience:
{ "key": "audience_assumes_firefighters", "category": "audience", "assertion": "user assumes readers are firefighters" } → passes: false (named reader identity bound to one topic)
{ "key": "audience_assumes_practitioners", "category": "audience", "assertion": "author writes for hands-on practitioners rather than novices" } → passes: true (general audience treatment)

## Output

Return ONLY valid JSON of the following shape, no prose, no fences. Emit one entry per input item, in the same order, keyed by \`key\`:
{ "results": [ { "key": "...", "passes": true | false, "reason": "<short justification>" } ] }`;

export const validateAssertionGenerality: Stage<
  ValidateAssertionGeneralityInput,
  ValidateAssertionGeneralityOutput
> = {
  name: 'validate_assertion_generality',
  modelClass: 'fast',
  inputSchema,
  outputSchema: validateAssertionGeneralityOutputSchema,
  async run(input, ctx) {
    await ctx.emit('task_started', { stage: 'validate_assertion_generality' });

    const userPrompt = `Validate these candidate assertions:

${JSON.stringify({ items: input.items }, null, 2)}`;

    const { result } = await routeJsonChat({
      system: SYSTEM_PROMPT,
      user: userPrompt,
      schema: validateAssertionGeneralityOutputSchema,
      class: 'fast',
    });

    await ctx.emit('task_completed', {
      stage: 'validate_assertion_generality',
      count: result.results.length,
    });

    return result;
  },
};

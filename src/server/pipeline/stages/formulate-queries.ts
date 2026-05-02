import { z } from 'zod';
import { routeJsonChat } from '../../llm/structured';
import { searchHypothesisSchema, searchQuerySchema, type Hypothesis, type SearchQuery } from '../../sessions/sources';
import type { Stage } from '../stage';

const inputSchema = z.object({
  hypothesis: searchHypothesisSchema,
});

const outputSchema = z.object({
  queries: z.array(searchQuerySchema).min(1).max(3),
});

export const formulateQueries: Stage<{ hypothesis: Hypothesis }, { queries: SearchQuery[] }> = {
  name: 'formulate_queries',
  modelClass: 'fast',
  inputSchema,
  outputSchema,
  async run(input, ctx) {
    await ctx.emit('task_started', { stage: 'formulate_queries' });

    const systemPrompt = [
      `You are a research assistant turning a search hypothesis into concrete web search queries.`,
      `Produce 1–3 distinct search queries that would find evidence for the hypothesis.`,
      `Queries should be specific and use search-engine-friendly phrasing.`,
      `Respond ONLY with valid JSON: { "queries": [ { "text": "..." } ] }`,
    ].join('\n');

    const userPrompt = [
      `Hypothesis: ${input.hypothesis.text}`,
      `Evidence kind needed: ${input.hypothesis.evidenceKind}`,
    ].join('\n');

    const { result } = await routeJsonChat({
      system: systemPrompt,
      user: userPrompt,
      schema: outputSchema,
      class: 'fast',
    });

    await ctx.emit('task_completed', { stage: 'formulate_queries', count: result.queries.length });
    return result;
  },
};

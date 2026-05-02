import { z } from 'zod';
import { routeJsonChat } from '../../llm/structured';
import {
  searchHypothesisSchema,
  searchQuerySchema,
  searchHitSchema,
  sourceSummarySchema,
  type Hypothesis,
  type SearchQuery,
  type SearchHit,
  type SourceSummary,
} from '../../sessions/sources';
import type { Stage } from '../stage';

const inputSchema = z.object({
  hypothesis: searchHypothesisSchema,
  query: searchQuerySchema,
  hit: searchHitSchema,
});

export const summarizeSource: Stage<
  { hypothesis: Hypothesis; query: SearchQuery; hit: SearchHit },
  SourceSummary
> = {
  name: 'summarize_source',
  modelClass: 'fast',
  inputSchema,
  outputSchema: sourceSummarySchema,
  async run(input, ctx) {
    await ctx.emit('task_started', { stage: 'summarize_source' });

    const systemPrompt = [
      `You are a research assistant evaluating the relevance of a web source to a hypothesis.`,
      `Provide a 1–2 sentence summary of what the source says about the hypothesis,`,
      `and a relevance score from 0 (not relevant) to 100 (highly relevant).`,
      `Respond ONLY with valid JSON: { "summary": "...", "relevanceScore": 0-100 }`,
    ].join('\n');

    const userPrompt = [
      `Hypothesis: ${input.hypothesis.text}`,
      `Evidence kind sought: ${input.hypothesis.evidenceKind}`,
      `Search query used: ${input.query.text}`,
      `Source URL: ${input.hit.url}`,
      `Source title: ${input.hit.title}`,
      `Snippet: ${input.hit.snippet}`,
    ].join('\n');

    const { result } = await routeJsonChat({
      system: systemPrompt,
      user: userPrompt,
      schema: sourceSummarySchema,
      class: 'fast',
    });

    await ctx.emit('task_completed', { stage: 'summarize_source', relevanceScore: result.relevanceScore });
    return result;
  },
};

import { z } from 'zod';
import { routeJsonChat } from '../../llm/structured';
import { findSourceByQuery } from '../../sessions/sources-repo';
import {
  searchHypothesisSchema,
  searchQuerySchema,
  searchHitSchema,
  type Hypothesis,
  type SearchQuery,
  type SearchHit,
} from '../../sessions/sources';
import type { Stage } from '../stage';

const inputSchema = z.object({
  sessionId: z.number(),
  userId: z.number(),
  hypothesis: searchHypothesisSchema,
  query: searchQuerySchema,
});

const outputSchema = z.object({
  hits: z.array(searchHitSchema).max(3),
  cached: z.boolean(),
});

const hitsSchema = z.object({
  hits: z.array(searchHitSchema).max(3),
});

export const webSearch: Stage<
  { sessionId: number; userId: number; hypothesis: Hypothesis; query: SearchQuery },
  { hits: SearchHit[]; cached: boolean }
> = {
  name: 'web_search',
  modelClass: 'search',
  inputSchema,
  outputSchema,
  async run(input, ctx) {
    await ctx.emit('task_started', { stage: 'web_search' });

    const cached = await findSourceByQuery(input.userId, input.sessionId, input.query.text);
    if (cached.length > 0) {
      const hits: SearchHit[] = cached.map((row) => ({
        url: row.url,
        title: row.title,
        snippet: row.rawExcerpt,
      }));
      await ctx.emit('task_completed', { stage: 'web_search', count: hits.length, cached: true });
      return { hits, cached: true };
    }

    const systemPrompt = [
      `You are a web search assistant. Search for up to 5 relevant web pages for the given query.`,
      `Hypothesis context: ${input.hypothesis.text} (evidence kind: ${input.hypothesis.evidenceKind})`,
      // TODO: domain filtering
      `Return ONLY valid JSON: { "hits": [ { "url": "https://...", "title": "...", "snippet": "..." } ] }`,
      `Include at most 3 hits. Use real, credible sources.`,
    ].join('\n');

    const { result } = await routeJsonChat({
      system: systemPrompt,
      user: `Search query: ${input.query.text}`,
      schema: hitsSchema,
      class: 'search',
    });

    await ctx.emit('task_completed', {
      stage: 'web_search',
      count: result.hits.length,
      cached: false,
    });
    return { hits: result.hits, cached: false };
  },
};

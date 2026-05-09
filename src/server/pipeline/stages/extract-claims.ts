import { z } from 'zod';
import { routeJsonChat } from '../../llm/structured';
import { planSchema, type Plan } from '../../sessions/plan';
import { claimsResponseSchema, type ClaimsResponse } from '../../sessions/claims';
import type { Stage } from '../stage';

const inputSchema = z.object({
  plan: planSchema,
  sectionDrafts: z.array(z.object({ sectionId: z.string(), contentMd: z.string() })),
});

const SYSTEM_PROMPT = `You are a fact-checking assistant. Extract factual claims from the article sections below.

Claim types:
- statistic: numerical or quantitative assertion
- named_entity: specific person, company, product, place, or organisation
- event: historical or current occurrence with a specific date, cause, or outcome
- attribution: a position or quote attributed to a specific entity
- definition: a declarative statement about what something is
- other: any other verifiable factual assertion

Check-worthiness guide:
- low: opinions, hedged statements ("may", "could"), widely-known trivia, or style observations
- medium: specific but not critical verifiable claims (founding year, common statistics)
- high: precise numbers, specific causal claims, controversial attributions, or policy claims

Return ONLY valid JSON of shape { claims: [...] }, no prose, no fences.`;

export const extractClaims: Stage<
  {
    plan: Plan;
    sectionDrafts: Array<{ sectionId: string; contentMd: string }>;
  },
  ClaimsResponse
> = {
  name: 'extract_claims',
  modelClass: 'smart',
  inputSchema,
  outputSchema: claimsResponseSchema,
  async run(input, ctx) {
    const { plan, sectionDrafts } = input;

    await ctx.emit('task_started', { stage: 'extract_claims' });

    const sectionTitleMap = new Map(plan.sections.map((s) => [s.id, s.title]));

    const userPrompt = sectionDrafts
      .map((d) => {
        const title = sectionTitleMap.get(d.sectionId) ?? d.sectionId;
        return `## ${title} [sectionId=${d.sectionId}]\n${d.contentMd}`;
      })
      .join('\n\n');

    const { result } = await routeJsonChat({
      system: SYSTEM_PROMPT,
      user: userPrompt,
      schema: claimsResponseSchema,
      class: 'smart',
    });

    await ctx.emit('task_completed', { stage: 'extract_claims', count: result.claims.length });

    return result;
  },
};

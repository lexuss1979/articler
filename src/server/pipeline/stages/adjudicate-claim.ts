import { z } from 'zod';
import { routeJsonChat } from '../../llm/structured';
import {
  claimSchema,
  evidenceItemSchema,
  adjudicationSchema,
  type Claim,
  type EvidenceItem,
  type Adjudication,
} from '../../sessions/claims';
import type { Stage } from '../stage';

const inputSchema = z.object({
  claim: claimSchema,
  evidence: z.array(evidenceItemSchema),
});

const SYSTEM_PROMPT = `You are a fact-checking adjudicator. Given a claim and a pool of evidence, emit a verdict.

Verdict definitions:
- verified: the evidence clearly supports the claim
- contradicted: the evidence clearly refutes the claim
- unverifiable: no evidence is available or evidence is too inconclusive to decide
- needs_caveat: the claim is partially true but requires important qualification

Rules:
- Choose at most 3 citation URLs drawn from the evidence pool
- Justify your verdict in 1-3 sentences
- Respond ONLY with valid JSON of shape { verdict, justification, citationUrls }, no prose, no fences`;

export const adjudicateClaim: Stage<{ claim: Claim; evidence: EvidenceItem[] }, Adjudication> = {
  name: 'adjudicate_claim',
  modelClass: 'smart',
  inputSchema,
  outputSchema: adjudicationSchema,
  async run(input, ctx) {
    const { claim, evidence } = input;

    await ctx.emit('task_started', { stage: 'adjudicate_claim' });

    if (evidence.length === 0) {
      const result: Adjudication = {
        verdict: 'unverifiable',
        justification: 'No evidence available.',
        citationUrls: [],
      };
      await ctx.emit('task_completed', { stage: 'adjudicate_claim', verdict: result.verdict });
      return result;
    }

    const evidenceLines = evidence
      .map((e) => `- [supports=${e.supports}] ${e.url} — ${e.snippet}`)
      .join('\n');

    const userPrompt = [
      `Claim: "${claim.span.text}"`,
      `Type: ${claim.claimType}`,
      `Section: ${claim.span.sectionId}`,
      ``,
      `Evidence:`,
      evidenceLines,
    ].join('\n');

    const { result } = await routeJsonChat({
      system: SYSTEM_PROMPT,
      user: userPrompt,
      schema: adjudicationSchema,
      class: 'smart',
    });

    await ctx.emit('task_completed', { stage: 'adjudicate_claim', verdict: result.verdict });

    return result;
  },
};

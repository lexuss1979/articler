import { z } from 'zod';
import { routeJsonChat } from '../../llm/structured';
import { claimSchema, evidenceItemSchema, evidenceResponseSchema, type Claim, type EvidenceItem } from '../../sessions/claims';
import type { Stage } from '../stage';

type AcceptedSource = {
  id: number;
  url: string;
  title: string;
  summary: string;
  rawExcerpt: string;
};

type EvidenceWithSource = EvidenceItem & { sourceId: number | null };

const outputSchema = z.object({
  evidence: z.array(evidenceItemSchema.extend({ sourceId: z.number().int().nullable() })).max(8),
  cached: z.boolean(),
});

const inputSchema = z.object({
  claim: claimSchema,
  acceptedSources: z.array(
    z.object({
      id: z.number(),
      url: z.string(),
      title: z.string(),
      summary: z.string(),
      rawExcerpt: z.string(),
    }),
  ),
});

function tokenBag(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/\W+/)
      .filter((t) => t.length > 3),
  );
}

// TODO: replace with embedding similarity
function scoreSource(claimTokens: Set<string>, source: AcceptedSource): number {
  const haystack = (source.rawExcerpt + ' ' + source.summary).toLowerCase();
  let count = 0;
  for (const token of claimTokens) {
    if (haystack.includes(token)) count++;
  }
  return count;
}

export const verifyClaim: Stage<
  { claim: Claim; acceptedSources: AcceptedSource[] },
  { evidence: EvidenceWithSource[]; cached: boolean }
> = {
  name: 'verify_claim',
  modelClass: 'search',
  inputSchema,
  outputSchema,
  async run(input, ctx) {
    const { claim, acceptedSources } = input;

    await ctx.emit('task_started', { stage: 'verify_claim' });

    const claimTokens = tokenBag(claim.span.text);

    const cached: EvidenceWithSource[] = [];
    for (const source of acceptedSources) {
      if (scoreSource(claimTokens, source) >= 2) {
        cached.push({
          url: source.url,
          snippet: source.rawExcerpt.slice(0, 600),
          supports: true,
          sourceId: source.id,
        });
      }
    }

    if (cached.length >= 1) {
      await ctx.emit('task_completed', { stage: 'verify_claim', count: cached.length, cached: true });
      return { evidence: cached, cached: true };
    }

    const { result } = await routeJsonChat({
      system: `You are a fact-checking research assistant. For the given claim, find up to 5 short snippets from web sources that bear on whether the claim is true or false. For each snippet, set supports:true if it supports the claim, supports:false if it contradicts it.
Return ONLY valid JSON of shape { evidence: [...] }, no prose, no fences.`,
      user: `Claim: "${claim.span.text}"\nClaim type: ${claim.claimType}`,
      schema: evidenceResponseSchema,
      class: 'search',
    });

    const evidence: EvidenceWithSource[] = result.evidence.map((item) => ({
      ...item,
      sourceId: null,
    }));

    await ctx.emit('task_completed', { stage: 'verify_claim', count: evidence.length, cached: false });

    return { evidence, cached: false };
  },
};

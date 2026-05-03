import { createHash } from 'node:crypto';
import { z } from 'zod';

export const claimTypeSchema = z.enum([
  'statistic',
  'named_entity',
  'event',
  'attribution',
  'definition',
  'other',
]);

export const checkWorthinessSchema = z.enum(['low', 'medium', 'high']);

export const verdictSchema = z.enum(['verified', 'contradicted', 'unverifiable', 'needs_caveat']);

export const claimSpanSchema = z.object({
  sectionId: z.string().min(1).max(120),
  charStart: z.number().int().min(0),
  charEnd: z.number().int().min(0),
  text: z.string().min(1).max(2000),
});

export const claimSchema = z.object({
  span: claimSpanSchema,
  claimType: claimTypeSchema,
  checkWorthiness: checkWorthinessSchema,
});

export const claimsResponseSchema = z.object({
  claims: z.array(claimSchema).max(60),
});

export const evidenceItemSchema = z.object({
  url: z.string().url(),
  snippet: z.string().min(1).max(2000),
  supports: z.boolean(),
});

export const evidenceResponseSchema = z.object({
  evidence: z.array(evidenceItemSchema).max(8),
});

export const adjudicationSchema = z.object({
  verdict: verdictSchema,
  justification: z.string().min(1).max(1000),
  citationUrls: z.array(z.string().url()).max(8),
});

export type ClaimType = z.infer<typeof claimTypeSchema>;
export type CheckWorthiness = z.infer<typeof checkWorthinessSchema>;
export type Verdict = z.infer<typeof verdictSchema>;
export type ClaimSpan = z.infer<typeof claimSpanSchema>;
export type Claim = z.infer<typeof claimSchema>;
export type ClaimsResponse = z.infer<typeof claimsResponseSchema>;
export type EvidenceItem = z.infer<typeof evidenceItemSchema>;
export type EvidenceResponse = z.infer<typeof evidenceResponseSchema>;
export type Adjudication = z.infer<typeof adjudicationSchema>;

export function spanHash(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

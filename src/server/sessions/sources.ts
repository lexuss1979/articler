import { z } from 'zod';

const slug = (max: number) => z.string().min(1).max(max);

export const searchHypothesisSchema = z.object({
  id: slug(40),
  sectionId: slug(40),
  text: z.string().min(1).max(400),
  evidenceKind: z.string().min(1).max(40),
});

export const searchQuerySchema = z.object({
  text: z.string().min(1).max(200),
});

export const searchHitSchema = z.object({
  url: z.string().url(),
  title: z.string().min(1).max(400),
  snippet: z.string().min(1).max(2000),
});

export const sourceSummarySchema = z.object({
  summary: z.string().min(1).max(600),
  relevanceScore: z.number().int().min(0).max(100),
});

export const sourceStatusSchema = z.enum(['proposed', 'accepted', 'rejected']);

export type Hypothesis = z.infer<typeof searchHypothesisSchema>;
export type SearchQuery = z.infer<typeof searchQuerySchema>;
export type SearchHit = z.infer<typeof searchHitSchema>;
export type SourceSummary = z.infer<typeof sourceSummarySchema>;
export type SourceStatus = z.infer<typeof sourceStatusSchema>;

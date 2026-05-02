import { z } from 'zod';

const slug = (max: number) => z.string().min(1).max(max);

export const searchHypothesisSchema = z.object({
  id: slug(40).describe('short slug id, e.g. h-1'),
  sectionId: slug(80).describe('must exactly match a section id from the plan'),
  text: z.string().min(1).max(800).describe('specific claim to verify or evidence to find, max 800 chars'),
  evidenceKind: z.string().min(1).max(80).describe('e.g. statistic, expert_quote, case_study, survey_data'),
});

export const searchQuerySchema = z.object({
  text: z.string().min(1).max(300).describe('web search query, max 300 chars'),
});

export const searchHitSchema = z.object({
  url: z.string().url(),
  title: z.string().min(1).max(400),
  snippet: z.string().min(1).max(2000),
});

export const sourceSummarySchema = z.object({
  summary: z.string().min(1).max(1000).describe('1-2 sentence summary, max 1000 chars'),
  relevanceScore: z.number().int().min(0).max(100).describe('0 = not relevant, 100 = highly relevant'),
});

export const sourceStatusSchema = z.enum(['proposed', 'accepted', 'rejected']);

export type Hypothesis = z.infer<typeof searchHypothesisSchema>;
export type SearchQuery = z.infer<typeof searchQuerySchema>;
export type SearchHit = z.infer<typeof searchHitSchema>;
export type SourceSummary = z.infer<typeof sourceSummarySchema>;
export type SourceStatus = z.infer<typeof sourceStatusSchema>;

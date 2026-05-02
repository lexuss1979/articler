import { z } from 'zod';

export const sourceArticleSchema = z.object({
  url: z.string().url(),
  content: z.string().min(1),
});

export const briefSchema = z.object({
  topic: z.string().min(1).max(200),
  goal: z.string().max(500).default(''),
  notes: z.string().max(2000).default(''),
  sourceArticles: z.array(sourceArticleSchema).default([]),
});

export type SourceArticle = z.infer<typeof sourceArticleSchema>;
export type BriefInput = z.infer<typeof briefSchema>;

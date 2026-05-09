import { z } from 'zod';

export const decorationKindSchema = z.enum([
  'pull_quote',
  'callout',
  'code_block',
  'comparison_table',
  'info_box',
]);

export const suggestionStatusSchema = z.enum(['proposed', 'accepted', 'rejected']);

export const decorationSuggestionSchema = z.object({
  id: z.string().min(1).max(60),
  kind: decorationKindSchema,
  sectionId: z.string().min(1).max(120),
  paragraphIndex: z.number().int().min(0).max(500),
  contentMd: z.string().min(1).max(4000),
  rationale: z.string().min(1).max(800),
  status: suggestionStatusSchema.default('proposed'),
});

export const proposeDecorationResponseSchema = z.object({
  suggestions: z
    .array(decorationSuggestionSchema.omit({ id: true, status: true }))
    .max(30),
});

export const decorationRoundSchema = z.object({
  id: z.string().min(1),
  draftHash: z.string().min(1),
  createdAt: z.string(),
  suggestions: z.array(decorationSuggestionSchema),
});

export const decorationStateSchema = z.object({
  rounds: z.array(decorationRoundSchema).default([]),
});

export type DecorationKind = z.infer<typeof decorationKindSchema>;
export type SuggestionStatus = z.infer<typeof suggestionStatusSchema>;
export type DecorationSuggestion = z.infer<typeof decorationSuggestionSchema>;
export type ProposeDecorationResponse = z.infer<typeof proposeDecorationResponseSchema>;
export type DecorationRound = z.infer<typeof decorationRoundSchema>;
export type DecorationState = z.infer<typeof decorationStateSchema>;

export function parseDecorationState(value: unknown): DecorationState {
  const result = decorationStateSchema.safeParse(value);
  if (result.success) return result.data;
  return { rounds: [] };
}

export function splitParagraphs(md: string): string[] {
  if (md === '') return [];
  return md.split(/\n{2,}/).map((chunk) => chunk.replace(/\s+$/, ''));
}

export function joinParagraphs(paragraphs: string[]): string {
  return paragraphs.join('\n\n');
}

export function insertParagraph(md: string, index: number, contentMd: string): string {
  const paragraphs = splitParagraphs(md);
  const clamped = Math.max(0, Math.min(index, paragraphs.length));
  paragraphs.splice(clamped, 0, contentMd.trim());
  return joinParagraphs(paragraphs);
}

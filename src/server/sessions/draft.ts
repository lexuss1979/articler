import { z } from 'zod';

export const sectionDraftOutputSchema = z.object({
  contentMd: z.string().min(1).max(40000),
});

export const regenerateInstructionSchema = z.string().min(1).max(1000);

export type SectionDraftOutput = z.infer<typeof sectionDraftOutputSchema>;
export type RegenerateInstruction = z.infer<typeof regenerateInstructionSchema>;

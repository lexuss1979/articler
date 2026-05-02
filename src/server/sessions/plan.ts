import { z } from 'zod';

export const angleSchema = z.object({
  title: z.string().min(1).max(160),
  methodology: z.string().min(1).max(80),
  rationale: z.string().min(1).max(600),
});

export const planSectionSchema = z.object({
  id: z.string().min(1).max(40),
  title: z.string().min(1).max(160),
  intent: z.string().min(1).max(400),
  expectedLength: z.number().int().positive(),
  keyPoints: z.array(z.string().min(1).max(200)).min(1).max(10),
});

export const planSchema = z.object({
  thesis: z.string().min(1).max(400),
  targetTakeaway: z.string().min(1).max(400),
  sections: z.array(planSectionSchema).min(2).max(20),
});

export type Angle = z.infer<typeof angleSchema>;
export type PlanSection = z.infer<typeof planSectionSchema>;
export type Plan = z.infer<typeof planSchema>;

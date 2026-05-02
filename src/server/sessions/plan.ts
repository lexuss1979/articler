import { z } from 'zod';

export const angleSchema = z.object({
  title: z.string().min(1).max(300).describe('angle title, max 300 chars'),
  methodology: z.string().min(1).max(200).describe('research approach, max 200 chars'),
  rationale: z.string().min(1).max(1000).describe('why this angle, max 1000 chars'),
});

export const planSectionSchema = z.object({
  id: z.string().min(1).max(120).describe('unique slug id for this section'),
  title: z.string().min(1).max(400).describe('section title'),
  intent: z.string().min(1).max(1500).describe('what this section covers'),
  expectedLength: z.number().int().positive().describe('expected word count'),
  keyPoints: z.array(z.string().min(1).max(600)).min(1).max(15).describe('3-7 key points'),
});

export const planSchema = z.object({
  thesis: z.string().min(1).max(1500).describe('central argument of the article'),
  targetTakeaway: z.string().min(1).max(1500).describe('what readers should take away'),
  sections: z.array(planSectionSchema).min(2).max(25).describe('article sections in order'),
});

export type Angle = z.infer<typeof angleSchema>;
export type PlanSection = z.infer<typeof planSectionSchema>;
export type Plan = z.infer<typeof planSchema>;

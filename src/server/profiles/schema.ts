import { z } from 'zod';
import { markupRulesSchema } from './markup';

export const PROFILE_FORMATS = ['long_read', 'listicle', 'news', 'tutorial'] as const;
export type ProfileFormat = (typeof PROFILE_FORMATS)[number];

export const profileInputSchema = z
  .object({
    name: z.string().min(1).max(120),
    format: z.enum(PROFILE_FORMATS),
    style: z.string().min(1).max(200),
    audience: z.string().min(1).max(500),
    targetVolumeMin: z.number().int().positive(),
    targetVolumeMax: z.number().int().positive(),
    markupRules: markupRulesSchema.default({ flavor: 'standard', headingShift: 0 }),
    extraPrompt: z.string().default(''),
  })
  .superRefine((data, ctx) => {
    if (data.targetVolumeMax < data.targetVolumeMin) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'targetVolumeMax must be >= targetVolumeMin',
        path: ['targetVolumeMax'],
      });
    }
  });

export type ProfileInput = z.infer<typeof profileInputSchema>;

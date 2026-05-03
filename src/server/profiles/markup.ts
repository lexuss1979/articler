import { z } from 'zod';

export const MARKUP_FLAVORS = ['standard', 'habr'] as const;
export type MarkupFlavor = (typeof MARKUP_FLAVORS)[number];

export const markupRulesSchema = z.object({
  flavor: z.enum(MARKUP_FLAVORS).default('standard'),
  headingShift: z.number().int().min(-2).max(3).default(0),
});

export type MarkupRules = z.infer<typeof markupRulesSchema>;

export function parseMarkupRules(value: unknown): MarkupRules {
  const result = markupRulesSchema.safeParse(value ?? {});
  if (result.success) return result.data;
  return { flavor: 'standard', headingShift: 0 };
}

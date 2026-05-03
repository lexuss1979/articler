import { z } from 'zod';

export const severitySchema = z.enum(['critical', 'medium', 'minor']);

export const findingSpanSchema = z.object({
  sectionId: z.string().min(1).max(120),
  charStart: z.number().int().min(0),
  charEnd: z.number().int().min(0),
});

export const reviewFindingSchema = z.object({
  severity: severitySchema,
  problem: z.string().min(1).max(2000),
  suggestedChange: z.string().min(1).max(2000),
  span: findingSpanSchema.optional(),
});

export const reviewResponseSchema = z.object({
  findings: z.array(reviewFindingSchema).max(60),
});

export const criticDefSchema = z.object({
  id: z.string().min(1).max(60),
  label: z.string().min(1).max(120),
  systemPrompt: z.string().min(1).max(4000),
  defaultEnabled: z.boolean(),
});

export const activeCriticsSchema = z.object({
  enabledIds: z.array(z.string().min(1).max(60)).default([]),
  custom: z
    .array(
      z.object({
        id: z.string().min(1).max(60),
        label: z.string().min(1).max(120),
        promptFragment: z.string().min(1).max(4000),
      }),
    )
    .default([]),
});

export type Severity = z.infer<typeof severitySchema>;
export type FindingSpan = z.infer<typeof findingSpanSchema>;
export type ReviewFinding = z.infer<typeof reviewFindingSchema>;
export type ReviewResponse = z.infer<typeof reviewResponseSchema>;
export type CriticDef = z.infer<typeof criticDefSchema>;
export type ActiveCritics = z.infer<typeof activeCriticsSchema>;

export const BUILTIN_CRITICS: readonly CriticDef[] = [
  {
    id: 'editorial',
    label: 'Editorial',
    defaultEnabled: true,
    systemPrompt: `Editorial lens — identify factual errors, logical gaps, unsupported claims, and structural inconsistencies.`,
  },
  {
    id: 'audience_fit',
    label: 'Audience Fit',
    defaultEnabled: true,
    systemPrompt: `Audience-fit lens — assess whether the content matches its stated target audience in vocabulary, assumed knowledge, and relevance.`,
  },
  {
    id: 'methodology',
    label: 'Methodology',
    defaultEnabled: true,
    systemPrompt: `Methodology lens — scrutinise research quality, sample sizes, causation vs. correlation claims, and citation reliability.`,
  },
  {
    id: 'style',
    label: 'Style',
    defaultEnabled: true,
    systemPrompt: `Prose-style lens — flag passive voice overuse, jargon, weak verbs, clichés, and inconsistent tone.`,
  },
  {
    id: 'structure',
    label: 'Structure',
    defaultEnabled: true,
    systemPrompt: `Structure lens — evaluate narrative flow, section transitions, argument progression, and whether the conclusion follows from the body.`,
  },
  {
    id: 'headline',
    label: 'Headline',
    defaultEnabled: true,
    systemPrompt: `Headline & hook lens — judge whether the title, lede, and subheads accurately represent the content and compel the reader to continue.`,
  },
  {
    id: 'seo_discoverability',
    label: 'SEO & Discoverability',
    defaultEnabled: true,
    systemPrompt: `SEO & discoverability lens — identify missing keywords, thin sections, poor meta-description candidates, and internal-link opportunities.`,
  },
];

export const BUILTIN_DEFAULTS: string[] = BUILTIN_CRITICS.map((c) => c.id);

export function parseActiveCritics(value: unknown): ActiveCritics {
  const result = activeCriticsSchema.safeParse(value);
  if (result.success) return result.data;
  return { enabledIds: BUILTIN_DEFAULTS, custom: [] };
}

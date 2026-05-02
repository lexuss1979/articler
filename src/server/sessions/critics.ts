import { z } from 'zod';

export const severitySchema = z.enum(['info', 'minor', 'major']);

export const findingSpanSchema = z.object({
  sectionId: z.string().min(1).max(120),
  charStart: z.number().int().min(0),
  charEnd: z.number().int().min(0),
});

export const findingSchema = z.object({
  criticId: z.string().min(1).max(60),
  severity: severitySchema,
  span: findingSpanSchema,
  problem: z.string().min(1).max(2000),
  suggestedChange: z.string().min(1).max(2000),
  rationale: z.string().min(1).max(2000),
});

export const findingsResponseSchema = z.object({
  findings: z.array(findingSchema).max(20),
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
export type Finding = z.infer<typeof findingSchema>;
export type FindingsResponse = z.infer<typeof findingsResponseSchema>;
export type CriticDef = z.infer<typeof criticDefSchema>;
export type ActiveCritics = z.infer<typeof activeCriticsSchema>;

export const BUILTIN_CRITICS: readonly CriticDef[] = [
  {
    id: 'editorial',
    label: 'Editorial',
    defaultEnabled: true,
    systemPrompt: `You are a senior editor. Identify factual errors, logical gaps, unsupported claims, and structural inconsistencies.
Respond ONLY with valid JSON of shape { findings: [...] }`,
  },
  {
    id: 'audience_fit',
    label: 'Audience Fit',
    defaultEnabled: true,
    systemPrompt: `You are an audience-fit reviewer. Assess whether the content matches its stated target audience in vocabulary, assumed knowledge, and relevance.
Respond ONLY with valid JSON of shape { findings: [...] }`,
  },
  {
    id: 'methodology',
    label: 'Methodology',
    defaultEnabled: true,
    systemPrompt: `You are a methodology critic. Scrutinise research quality, sample sizes, causation vs. correlation claims, and citation reliability.
Respond ONLY with valid JSON of shape { findings: [...] }`,
  },
  {
    id: 'style',
    label: 'Style',
    defaultEnabled: true,
    systemPrompt: `You are a prose-style critic. Flag passive voice overuse, jargon, weak verbs, clichés, and inconsistent tone.
Respond ONLY with valid JSON of shape { findings: [...] }`,
  },
  {
    id: 'structure',
    label: 'Structure',
    defaultEnabled: true,
    systemPrompt: `You are a structure critic. Evaluate narrative flow, section transitions, argument progression, and whether the conclusion follows from the body.
Respond ONLY with valid JSON of shape { findings: [...] }`,
  },
  {
    id: 'headline',
    label: 'Headline',
    defaultEnabled: true,
    systemPrompt: `You are a headline and hook specialist. Judge whether the title, lede, and subheads accurately represent the content and compel the reader to continue.
Respond ONLY with valid JSON of shape { findings: [...] }`,
  },
  {
    id: 'seo_discoverability',
    label: 'SEO & Discoverability',
    defaultEnabled: true,
    systemPrompt: `You are an SEO and discoverability expert. Identify missing keywords, thin sections, poor meta-description candidates, and internal-link opportunities.
Respond ONLY with valid JSON of shape { findings: [...] }`,
  },
];

export const BUILTIN_DEFAULTS: string[] = BUILTIN_CRITICS.map((c) => c.id);

export function parseActiveCritics(value: unknown): ActiveCritics {
  const result = activeCriticsSchema.safeParse(value);
  if (result.success) return result.data;
  return { enabledIds: BUILTIN_DEFAULTS, custom: [] };
}

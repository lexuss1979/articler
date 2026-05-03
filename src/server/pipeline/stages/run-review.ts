import { z } from 'zod';
import { routeJsonChat } from '../../llm/structured';
import { planSchema, type Plan } from '../../sessions/plan';
import {
  BUILTIN_CRITICS,
  reviewResponseSchema,
  type ReviewResponse,
} from '../../sessions/critics';
import type { Stage } from '../stage';
import type { profiles } from '../../db/schema';
import type { InferSelectModel } from 'drizzle-orm';

type ProfileRow = InferSelectModel<typeof profiles>;

const inputSchema = z.object({
  enabledCriticIds: z.array(z.string().min(1)),
  plan: planSchema,
  profile: z.object({
    id: z.number(),
    userId: z.number(),
    name: z.string(),
    format: z.string(),
    style: z.string(),
    audience: z.string(),
    targetVolumeMin: z.number(),
    targetVolumeMax: z.number(),
    markupRules: z.unknown(),
    extraPrompt: z.string(),
    createdAt: z.date(),
  }),
  sectionDrafts: z.array(z.object({ sectionId: z.string(), contentMd: z.string() })),
});

const REVIEW_INTRO = `You are reviewing an article through several expert lenses simultaneously. Read the full draft below and produce a single consolidated list of findings — deduplicate observations that arise from multiple lenses, prioritise impact over volume.

Severity rules (STRICT):
- "critical": factual errors, broken logic, audience mismatch, claims that mislead the reader.
- "medium": significant issues with structure, style, methodology, headlines, or SEO that materially weaken the article.
- "minor": small polish — minor wording, light style nits, cosmetic improvements. Use sparingly.

Each finding must include:
- "severity"
- "problem": what is wrong (1-2 sentences)
- "suggestedChange": what should be changed (1-2 sentences, actionable)
- "span" (optional): { sectionId, charStart, charEnd } if the finding anchors to a specific section
Return at most 30 findings total. Quality over quantity. Respond ONLY with valid JSON of shape { findings: [...] }, no prose, no fences.`;

export const runReview: Stage<
  {
    enabledCriticIds: string[];
    plan: Plan;
    profile: ProfileRow;
    sectionDrafts: Array<{ sectionId: string; contentMd: string }>;
  },
  ReviewResponse
> = {
  name: 'run_review',
  modelClass: 'smart',
  inputSchema,
  outputSchema: reviewResponseSchema,
  async run(input, ctx) {
    const { enabledCriticIds, plan, profile, sectionDrafts } = input;

    await ctx.emit('task_started', { stage: 'run_review' });

    const enabled = BUILTIN_CRITICS.filter((c) => enabledCriticIds.includes(c.id));
    const lensesBlock = enabled.length
      ? 'Active lenses:\n' + enabled.map((c) => `- ${c.label}: ${c.systemPrompt}`).join('\n')
      : 'Active lenses: (none — fall back to general editorial review)';

    const systemPrompt = [
      REVIEW_INTRO,
      lensesBlock,
      `Platform: ${profile.name}`,
      `Audience: ${profile.audience}`,
      `Style: ${profile.style}`,
      `Thesis: ${plan.thesis}`,
      `Target takeaway: ${plan.targetTakeaway}`,
    ].join('\n\n');

    const sectionTitleMap = new Map(plan.sections.map((s) => [s.id, s.title]));
    const userPrompt = sectionDrafts
      .map((d) => {
        const title = sectionTitleMap.get(d.sectionId) ?? d.sectionId;
        return `## ${title} [sectionId=${d.sectionId}]\n${d.contentMd}`;
      })
      .join('\n\n');

    const { result } = await routeJsonChat({
      system: systemPrompt,
      user: userPrompt,
      schema: reviewResponseSchema,
      class: 'smart',
    });

    await ctx.emit('task_completed', {
      stage: 'run_review',
      count: result.findings.length,
    });

    return result;
  },
};

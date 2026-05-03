import { z } from 'zod';
import { routeJsonChat } from '../../llm/structured';
import { planSchema, type Plan } from '../../sessions/plan';
import {
  criticDefSchema,
  findingsResponseSchema,
  type CriticDef,
  type FindingsResponse,
} from '../../sessions/critics';
import type { Stage } from '../stage';
import type { profiles } from '../../db/schema';
import type { InferSelectModel } from 'drizzle-orm';

type ProfileRow = InferSelectModel<typeof profiles>;

const inputSchema = z.object({
  critic: criticDefSchema,
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

export const runCritic: Stage<
  {
    critic: CriticDef;
    plan: Plan;
    profile: ProfileRow;
    sectionDrafts: Array<{ sectionId: string; contentMd: string }>;
  },
  FindingsResponse
> = {
  name: 'run_critic',
  modelClass: 'smart',
  inputSchema,
  outputSchema: findingsResponseSchema,
  async run(input, ctx) {
    const { critic, plan, profile, sectionDrafts } = input;

    await ctx.emit('task_started', { stage: 'run_critic', criticId: critic.id });

    const validSectionIds = new Set(plan.sections.map((s) => s.id));

    const systemPrompt = [
      critic.systemPrompt,
      `Platform: ${profile.name}`,
      `Audience: ${profile.audience}`,
      `Style: ${profile.style}`,
      `Thesis: ${plan.thesis}`,
      `Target takeaway: ${plan.targetTakeaway}`,
      `Respond ONLY with valid JSON of shape { findings: [...] }, no prose, no fences.`,
    ].join('\n');

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
      schema: findingsResponseSchema,
      class: 'smart',
    });

    const findings = result.findings.filter((f) => validSectionIds.has(f.span.sectionId));

    await ctx.emit('task_completed', { stage: 'run_critic', criticId: critic.id, count: findings.length });

    return { findings };
  },
};

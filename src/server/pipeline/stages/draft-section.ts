import { z } from 'zod';
import { routeChat } from '../../llm/router';
import { planSchema, planSectionSchema, type Plan, type PlanSection } from '../../sessions/plan';
import { sourceArticleSchema, type SourceArticle } from '../../sessions/brief';
import { sectionDraftOutputSchema, type SectionDraftOutput } from '../../sessions/draft';
import type { Stage } from '../stage';
import type { profiles } from '../../db/schema';
import type { InferSelectModel } from 'drizzle-orm';

type ProfileRow = InferSelectModel<typeof profiles>;

const inputSchema = z.object({
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
  plan: planSchema,
  section: planSectionSchema,
  acceptedSources: z.array(
    z.object({
      url: z.string(),
      title: z.string(),
      summary: z.string(),
      rawExcerpt: z.string(),
    }),
  ),
  prevSections: z.array(z.object({ id: z.string(), contentMd: z.string() })),
  instruction: z.string().optional(),
  rewriteSourceArticles: z.array(sourceArticleSchema).optional(),
});

export const draftSection: Stage<
  {
    profile: ProfileRow;
    plan: Plan;
    section: PlanSection;
    acceptedSources: Array<{ url: string; title: string; summary: string; rawExcerpt: string }>;
    prevSections: Array<{ id: string; contentMd: string }>;
    instruction?: string;
    rewriteSourceArticles?: SourceArticle[];
  },
  SectionDraftOutput
> = {
  name: 'draft_section',
  modelClass: 'smart',
  inputSchema,
  outputSchema: sectionDraftOutputSchema,
  async run(input, ctx) {
    const { profile, plan, section, acceptedSources, prevSections, instruction, rewriteSourceArticles } =
      input;

    await ctx.emit('task_started', { stage: 'draft_section', sectionId: section.id });

    const systemPrompt = [
      `You are a professional writer producing a section of a ${profile.format} article.`,
      `Platform: ${profile.name}`,
      `Audience: ${profile.audience}`,
      `Style: ${profile.style}`,
      `Article thesis: ${plan.thesis}`,
      `Target takeaway: ${plan.targetTakeaway}`,
      `Target word count for this section: approximately ${section.expectedLength} words.`,
      `Write ONLY the section content in Markdown. No preamble, no "Section:" labels, no JSON.`,
      profile.extraPrompt ? `Additional constraints: ${profile.extraPrompt}` : '',
    ].filter(Boolean).join('\n');

    const sourcesBlock =
      acceptedSources.length > 0
        ? [
            'Accepted sources:',
            ...acceptedSources.map((s) => `- ${s.title} (${s.url}): ${s.summary}`),
          ].join('\n')
        : '';

    // Keep only titles for older sections, full text for the most recent two
    const PREV_FULL = 2;
    const prevBlock =
      prevSections.length > 0
        ? [
            'Previously drafted sections (titles only for older ones, full text for recent):',
            ...prevSections.map((ps, i) => {
              const matched = plan.sections.find((s) => s.id === ps.id);
              const title = matched?.title ?? ps.id;
              if (i < prevSections.length - PREV_FULL) return `## ${title} [already written]`;
              return `## ${title}\n${ps.contentMd}`;
            }),
          ].join('\n\n')
        : '';

    const rewriteBlock =
      rewriteSourceArticles && rewriteSourceArticles.length > 0
        ? [
            'Rewrite source material (base the section on this, applying the new profile and style):',
            ...rewriteSourceArticles.map((a) => `- URL: ${a.url}\n  Content: ${a.content}`),
          ].join('\n')
        : '';

    const overrideBlock = instruction ? `Instruction: ${instruction}` : '';

    const userParts = [
      `Write the following section:`,
      `Title: ${section.title}`,
      `Intent: ${section.intent}`,
      `Key points:\n${section.keyPoints.map((p) => `- ${p}`).join('\n')}`,
    ];
    if (sourcesBlock) userParts.push(sourcesBlock);
    if (prevBlock) userParts.push(prevBlock);
    if (rewriteBlock) userParts.push(rewriteBlock);
    if (overrideBlock) userParts.push(overrideBlock);

    const userPrompt = userParts.join('\n\n');

    const chatResult = await routeChat({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      class: 'smart',
    });

    const contentMd = chatResult.content.trim();

    await ctx.emit('task_completed', {
      stage: 'draft_section',
      sectionId: section.id,
      length: contentMd.length,
    });

    return { contentMd };
  },
};

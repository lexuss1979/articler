import { z } from 'zod';
import { routeJsonChat } from '../../llm/structured';
import { planSchema, type Plan } from '../../sessions/plan';
import {
  proposeDecorationResponseSchema,
  type ProposeDecorationResponse,
} from '../../sessions/decoration';
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
    lightResearchSources: z.number(),
    lightMaxWords: z.number(),
    createdAt: z.date(),
  }),
  plan: planSchema,
  sectionDrafts: z.array(z.object({ sectionId: z.string(), contentMd: z.string() })),
});

const DECORATION_INTRO = `You are a publication editor proposing visual decorations for a finished article draft. Your job is to identify the highest-impact spots where a decoration would help readers — pull-quotes that surface a memorable line, callouts that spotlight a warning or tip, code blocks for technical snippets, comparison tables for trade-offs, info boxes for context. Quality over quantity: propose at most ~12 suggestions across the entire article.

Allowed "kind" values:
- "pull_quote": a memorable sentence lifted from the prose, formatted as Markdown blockquote (\`> ...\`).
- "callout": a short attention block (warning, tip, note). Use a fenced or HTML callout per the platform's markupRules.
- "code_block": a runnable snippet, formatted as a fenced code block (\`\`\`lang ... \`\`\`).
- "comparison_table": a GFM Markdown table comparing two or more options.
- "info_box": a sidebar of context (definitions, background) — fenced or HTML per the platform's markupRules.

Each suggestion MUST include:
- "kind": one of the allowed values above.
- "sectionId": the id of the section it belongs to (use the [sectionId=...] tags in the user message).
- "paragraphIndex": which paragraph slot inside that section the decoration should appear at. Sections are split on blank lines into paragraphs; index 0 means BEFORE the first paragraph, index N means AFTER the last paragraph.
- "contentMd": ready-to-paste Markdown for the chosen kind. Do not include the surrounding paragraphs — only the decoration itself.
- "rationale": one sentence explaining why this decoration helps the reader at this spot.

Respond ONLY with valid JSON of shape { "suggestions": [...] }, no prose, no fences.`;

export const proposeDecoration: Stage<
  {
    profile: ProfileRow;
    plan: Plan;
    sectionDrafts: Array<{ sectionId: string; contentMd: string }>;
  },
  ProposeDecorationResponse
> = {
  name: 'propose_decoration',
  modelClass: 'smart',
  inputSchema,
  outputSchema: proposeDecorationResponseSchema,
  async run(input, ctx) {
    const { profile, plan, sectionDrafts } = input;

    await ctx.emit('task_started', { stage: 'propose_decoration' });

    const systemPrompt = [
      DECORATION_INTRO,
      `Platform: ${profile.name}`,
      `Audience: ${profile.audience}`,
      `Style: ${profile.style}`,
      `markupRules: ${JSON.stringify(profile.markupRules ?? {})}`,
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
      schema: proposeDecorationResponseSchema,
      class: 'smart',
    });

    await ctx.emit('task_completed', {
      stage: 'propose_decoration',
      count: result.suggestions.length,
    });

    return result;
  },
};

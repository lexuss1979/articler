import { z } from 'zod';
import { routeJsonChat } from '../../llm/structured';
import { planSchema, type Plan } from '../../sessions/plan';
import type { BriefInput } from '../../sessions/brief';
import type { Stage } from '../stage';
import type { profiles } from '../../db/schema';
import type { InferSelectModel } from 'drizzle-orm';

type ProfileRow = InferSelectModel<typeof profiles>;

const sourceSchema = z.object({
  url: z.string(),
  title: z.string(),
  summary: z.string(),
  rawExcerpt: z.string(),
});

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
  brief: z.object({
    topic: z.string(),
    goal: z.string(),
    notes: z.string(),
    sourceArticles: z.array(z.object({ url: z.string(), content: z.string() })),
  }),
  plan: planSchema,
  sources: z.array(sourceSchema),
  lightMaxWords: z.number().int().min(200).max(2500),
});

export type DraftFullInput = {
  profile: ProfileRow;
  brief: BriefInput;
  plan: Plan;
  sources: Array<{ url: string; title: string; summary: string; rawExcerpt: string }>;
  lightMaxWords: number;
};

export type DraftFullOutput = { contentMd: string; wordCount: number };

const llmOutputSchema = z.object({ contentMd: z.string() });

function countWords(text: string): number {
  return text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
}

function truncateAtParagraphBoundary(text: string, cap: number): string {
  const paragraphs = text.split(/\n\n/);
  const kept: string[] = [];
  let accumulated = 0;
  for (const para of paragraphs) {
    const paraWords = countWords(para);
    if (accumulated + paraWords > cap) break;
    kept.push(para);
    accumulated += paraWords;
  }
  return kept.join('\n\n');
}

export const draftFull: Stage<DraftFullInput, DraftFullOutput> = {
  name: 'draft_full',
  modelClass: 'smart',
  inputSchema,
  outputSchema: z.object({ contentMd: z.string(), wordCount: z.number() }),
  async run(input, ctx) {
    await ctx.emit('task_started', { stage: 'draft_full' });

    const sectionOutline = input.plan.sections
      .map((s) => `## ${s.title}\n${s.intent}`)
      .join('\n\n');

    const sourceLines =
      input.sources.length > 0
        ? '\nAvailable sources (cite by URL inline only when directly relevant):\n' +
          input.sources.map((s) => `- ${s.url}: ${s.title} — ${s.summary}`).join('\n')
        : '';

    const systemPrompt = [
      `You are a professional writer. Write a complete article in one shot.`,
      `Platform: ${input.profile.name} (${input.profile.format}).`,
      `Audience: ${input.profile.audience}.`,
      `Tone and style: ${input.profile.style}.`,
      `Target length: ${input.lightMaxWords} words ±10%.`,
      input.profile.extraPrompt ? `Additional constraints: ${input.profile.extraPrompt}` : '',
      'Use clean Markdown headings (##, ###). Do not include a top-level title (# ...).',
      'Follow the section outline below exactly. You may expand key points but must not skip sections.',
      'Cite sources by URL inline (e.g. "[source](url)") only when directly relevant.',
      'Respond ONLY with valid JSON: { "contentMd": "<full article in Markdown>" }',
    ]
      .filter(Boolean)
      .join('\n');

    const userPrompt = [
      `Topic: ${input.brief.topic}`,
      input.brief.goal ? `Goal: ${input.brief.goal}` : '',
      input.brief.notes ? `Notes: ${input.brief.notes}` : '',
      `Thesis: ${input.plan.thesis}`,
      `Target takeaway: ${input.plan.targetTakeaway}`,
      `Section outline:\n${sectionOutline}`,
      sourceLines,
    ]
      .filter(Boolean)
      .join('\n');

    const { result } = await routeJsonChat({
      system: systemPrompt,
      user: userPrompt,
      schema: llmOutputSchema,
      class: 'smart',
    });

    let { contentMd } = result;
    const rawWordCount = countWords(contentMd);
    const cap = Math.floor(input.lightMaxWords * 1.15);

    if (rawWordCount > cap) {
      contentMd = truncateAtParagraphBoundary(contentMd, input.lightMaxWords);
      const finalWords = countWords(contentMd);
      await ctx.log.append({
        event: 'draft_full_truncated',
        originalWords: rawWordCount,
        finalWords,
        cap,
      });
      const wordCount = finalWords;
      await ctx.emit('task_completed', { stage: 'draft_full', wordCount });
      return { contentMd, wordCount };
    }

    const wordCount = rawWordCount;
    await ctx.emit('task_completed', { stage: 'draft_full', wordCount });
    return { contentMd, wordCount };
  },
};

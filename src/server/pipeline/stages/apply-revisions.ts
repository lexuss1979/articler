import { z } from 'zod';
import { routeChat } from '../../llm/router';
import type { Stage } from '../stage';

const findingForRewriteSchema = z.object({
  severity: z.enum(['critical', 'medium']),
  problem: z.string(),
  suggestedChange: z.string(),
  sectionId: z.string().optional(),
});

const inputSchema = z.object({
  draftMd: z.string().min(1),
  findings: z.array(findingForRewriteSchema).min(1),
});

const outputSchema = z.object({
  revisedDraftMd: z.string().min(1),
});

const APPLY_SYSTEM_PROMPT = `You are revising an article based on a list of review findings. Apply EVERY finding listed below: rewrite the relevant passages so the issue is fixed and the suggestedChange is reflected.

Rules:
- Output the FULL revised article as markdown — every section, in order.
- Preserve the author's voice, structure, and any content NOT addressed by a finding.
- Do not add headers, fences, or commentary around the article. No "Here is the revised article:" preamble.
- Maintain section markers if present in the original (## headings).
- If two findings conflict, prefer the higher-severity one (critical > medium).`;

export const applyRevisions: Stage<
  z.infer<typeof inputSchema>,
  z.infer<typeof outputSchema>
> = {
  name: 'apply_revisions',
  modelClass: 'smart',
  inputSchema,
  outputSchema,
  async run(input, ctx) {
    const { draftMd, findings } = input;

    await ctx.emit('task_started', { stage: 'apply_revisions', findingCount: findings.length });

    const findingsList = findings
      .map((f, i) => {
        const anchor = f.sectionId ? ` [section=${f.sectionId}]` : '';
        return `${i + 1}. [${f.severity}]${anchor} ${f.problem}\n   → ${f.suggestedChange}`;
      })
      .join('\n');

    const userPrompt = [
      'ORIGINAL ARTICLE:',
      '',
      draftMd,
      '',
      '---',
      '',
      'FINDINGS TO APPLY:',
      '',
      findingsList,
      '',
      '---',
      '',
      'Output the full revised article as markdown.',
    ].join('\n');

    const result = await routeChat({
      class: 'smart',
      messages: [
        { role: 'system', content: APPLY_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
    });

    const revisedDraftMd = result.content.trim();
    if (!revisedDraftMd) {
      throw new Error('Apply revisions returned empty content');
    }

    await ctx.emit('task_completed', { stage: 'apply_revisions' });

    return { revisedDraftMd };
  },
};
